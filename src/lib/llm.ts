/**
 * Thin client for an open-weight model.
 *
 * - LLM_PROVIDER=ollama (default): a local Ollama server on this laptop, e.g. `gemma4:e4b`.
 *   Your diary goes from the browser to localhost and back. Nothing else sees it.
 * - LLM_PROVIDER=openai: any OpenAI-compatible endpoint serving an open model
 *   (llama.cpp server, vLLM, LM Studio, Gemma on Google AI Studio, ...).
 * - LLM_PROVIDER=browser: no model on the server at all; the browser runs Gemma with WebLLM.
 */
import type { ChatMsg } from "./types";

export const provider = process.env.LLM_PROVIDER ?? "ollama";
const baseUrl = (process.env.LLM_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const model = process.env.LLM_MODEL ?? "gemma4:e4b";
const apiKey = process.env.LLM_API_KEY ?? "";

export const modelLabel = `${model}${provider === "ollama" ? " · local" : ""}`;
export const serverModelConfigured = () => provider !== "browser";

type Opts = { json?: boolean; maxTokens?: number; temperature?: number };

function body(messages: ChatMsg[], opts: Opts, stream: boolean) {
  if (provider === "ollama") {
    return {
      model,
      stream,
      think: false,
      format: opts.json ? "json" : undefined,
      options: { temperature: opts.temperature ?? 0.4, num_predict: opts.maxTokens ?? 700 },
      messages,
    };
  }
  return {
    model,
    stream,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 700,
    response_format: opts.json ? { type: "json_object" } : undefined,
    messages,
  };
}

async function call(messages: ChatMsg[], opts: Opts, stream: boolean) {
  const url = provider === "ollama" ? `${baseUrl}/api/chat` : `${baseUrl}/chat/completions`;
  const send = (msgs: ChatMsg[]) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify(body(msgs, opts, stream)),
    });

  let res = await send(messages);
  // Some hosts serve Gemma without a system role: fold the instructions into the first user turn.
  if (res.status === 400 && messages[0]?.role === "system" && messages.length > 1) {
    const [sys, first, ...rest] = messages;
    res = await send([{ ...first, content: `${sys.content}\n\n${first.content}` }, ...rest]);
  }
  if (!res.ok) throw new Error(`model ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

export async function complete(messages: ChatMsg[], opts: Opts = {}) {
  const res = await call(messages, opts, false);
  const data = await res.json();
  const text = provider === "ollama" ? data.message?.content : data.choices?.[0]?.message?.content;
  return stripThinking(text ?? "");
}

/** Streams plain text tokens, whichever wire format the model server speaks. */
export async function stream(messages: ChatMsg[], opts: Opts = {}): Promise<ReadableStream<Uint8Array>> {
  const res = await call(messages, opts, true);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let inThought = false;

  const pick = (line: string): string => {
    const raw = line.replace(/^data:\s*/, "").trim();
    if (!raw || raw === "[DONE]") return "";
    try {
      const d = JSON.parse(raw);
      return (provider === "ollama" ? d.message?.content : d.choices?.[0]?.delta?.content) ?? "";
    } catch {
      return "";
    }
  };

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = pick(buffer);
        if (tail) controller.enqueue(encoder.encode(tail));
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      let out = "";
      for (const line of lines) {
        let token = pick(line);
        // Drop any reasoning block a model emits before its answer.
        if (/<(think|thought)>/i.test(token)) inThought = true;
        if (inThought) {
          if (/<\/(think|thought)>/i.test(token)) {
            inThought = false;
            token = token.split(/<\/(?:think|thought)>/i).pop() ?? "";
          } else continue;
        }
        out += token;
      }
      if (out) controller.enqueue(encoder.encode(out));
    },
    cancel() {
      reader.cancel();
    },
  });
}

export async function ping() {
  if (!serverModelConfigured()) return false;
  try {
    if (provider === "ollama") {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return false;
      const { models } = await res.json();
      return (models as { name: string }[]).some((m) => m.name.toLowerCase() === model.toLowerCase() || m.name.toLowerCase() === `${model.toLowerCase()}:latest`);
    }
    return Boolean(apiKey || baseUrl);
  } catch {
    return false;
  }
}

function stripThinking(text: string) {
  return text.replace(/<(think|thought)>[\s\S]*?<\/\1>/gi, "").trim();
}
