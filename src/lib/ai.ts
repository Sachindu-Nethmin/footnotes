"use client";

/**
 * One door to the open model, wherever it runs:
 *   "server"  → /api/ai → Ollama on this laptop (or any open-weight host you point it at)
 *   "browser" → WebLLM, Gemma inside this tab
 * Every call has a deterministic fallback, so a missing model never leaves a blank page.
 */
import { BROWSER_MODEL_LABEL, browserComplete, browserStream } from "./browser-ai";
import {
  detailsPrompt,
  diaryPrompt,
  fallbackDetails,
  fallbackDiary,
  fallbackNext,
  fallbackQuestion,
  interviewPrompt,
  nextPrompt,
  parseDetails,
  parseNext,
  tidyQuestion,
  type DiaryContext,
  type InterviewPlan,
  type NextInput,
  type PlaceFacts,
} from "./prompts";
import type { ChatMsg, Details, NextPick, Settings } from "./types";

type Engine = Settings["engine"];

export async function fillDetails(engine: Engine, p: PlaceFacts): Promise<Details> {
  try {
    if (engine === "browser") {
      const text = await browserComplete(detailsPrompt(p), { maxTokens: 650 });
      const d = parseDetails(text, p, BROWSER_MODEL_LABEL);
      if (d) return d;
    } else {
      const res = await fetch("/api/ai", { method: "POST", body: JSON.stringify({ task: "details", input: p }) });
      if (res.ok) return (await res.json()).result;
    }
  } catch (err) {
    console.warn("details fell back:", err);
  }
  return fallbackDetails(p);
}

export async function pickNext(engine: Engine, input: NextInput): Promise<NextPick | null> {
  if (!input.places.length) return null;
  try {
    if (engine === "browser") {
      const d = parseNext(await browserComplete(nextPrompt(input), { maxTokens: 450, temperature: 0.6 }), input, BROWSER_MODEL_LABEL);
      if (d) return d;
    } else {
      const res = await fetch("/api/ai", { method: "POST", body: JSON.stringify({ task: "next", input }) });
      if (res.ok) return (await res.json()).result;
    }
  } catch (err) {
    console.warn("next fell back:", err);
  }
  return fallbackNext(input);
}

/**
 * Streams the interviewer's next question for the topic the plan picked. Returns the tidied
 * question and which model wrote it. With no model, a hand-written question for the topic.
 */
export async function askMargin(engine: Engine, ctx: DiaryContext, chat: ChatMsg[], plan: InterviewPlan, onToken: (t: string) => void) {
  try {
    const raw =
      engine === "browser"
        ? { text: await browserStream(interviewPrompt(ctx, chat, plan), onToken, { maxTokens: 90 }), by: BROWSER_MODEL_LABEL }
        : await streamFromServer("interview", { ctx, chat, plan }, onToken);
    const text = tidyQuestion(raw.text, plan.mode);
    if (!text) throw new Error("empty question");
    return { text, by: raw.by };
  } catch (err) {
    console.warn("interview fell back:", err);
    const q = fallbackQuestion(plan);
    onToken(q);
    return { text: q, by: "notebook prompts" };
  }
}

export async function writePage(engine: Engine, ctx: DiaryContext, chat: ChatMsg[], onToken: (t: string) => void) {
  try {
    if (engine === "browser") {
      return { text: await browserStream(diaryPrompt(ctx, chat), onToken, { maxTokens: 520 }), by: BROWSER_MODEL_LABEL };
    }
    return await streamFromServer("diary", { ctx, chat }, onToken);
  } catch (err) {
    console.warn("diary fell back:", err);
    const text = fallbackDiary(ctx, chat);
    onToken(text);
    return { text, by: "your own words, stitched" };
  }
}

async function streamFromServer(task: string, input: unknown, onToken: (t: string) => void) {
  const res = await fetch("/api/ai", { method: "POST", body: JSON.stringify({ task, input }) });
  if (!res.ok || !res.body) throw new Error(`ai ${res.status}`);
  const by = decodeURIComponent(res.headers.get("x-model") ?? "open%20model");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const t = decoder.decode(value, { stream: true });
    text += t;
    onToken(t);
  }
  if (!text.trim()) throw new Error("empty answer");
  return { text, by };
}

export type Health = { provider: string; model: string; modelReady: boolean };

export async function health(): Promise<Health | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
