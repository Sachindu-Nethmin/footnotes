import { complete, modelLabel, serverModelConfigured, stream } from "@/lib/llm";
import {
  detailsPrompt,
  diaryPrompt,
  interviewPrompt,
  nextPrompt,
  parseDetails,
  parseNext,
  TOPICS,
  type DiaryContext,
  type InterviewMode,
  type InterviewPlan,
  type NextInput,
  type PlaceFacts,
} from "@/lib/prompts";
import type { ChatMsg } from "@/lib/types";

/**
 * POST /api/ai { task, input }
 *
 * The server never keeps anything: no database, no logs of what you wrote. It builds the
 * prompt, hands it to the open model (on this same machine by default) and passes the answer
 * straight back to the notebook, which stores it in your browser.
 */
export async function POST(req: Request) {
  if (!serverModelConfigured()) return Response.json({ error: "no server model; use the in-browser one" }, { status: 503 });
  const { task, input } = (await req.json()) as { task: string; input: unknown };

  try {
    switch (task) {
      case "details": {
        const p = input as PlaceFacts;
        const text = await complete(detailsPrompt(p), { json: true, maxTokens: 650 });
        const result = parseDetails(text, p, modelLabel);
        if (!result) throw new Error(`unparseable details: ${text.slice(0, 200)}`);
        return Response.json({ result });
      }
      case "next": {
        const n = input as NextInput;
        n.places = n.places.slice(0, 25);
        const text = await complete(nextPrompt(n), { json: true, maxTokens: 450, temperature: 0.6 });
        const result = parseNext(text, n, modelLabel);
        if (!result) throw new Error(`unparseable pick: ${text.slice(0, 200)}`);
        return Response.json({ result });
      }
      case "interview": {
        const { ctx, chat, plan } = input as { ctx: DiaryContext; chat: ChatMsg[]; plan: InterviewPlan };
        const safe: InterviewPlan = {
          topic: TOPICS.some((t) => t.id === plan?.topic) ? plan.topic : "arrival",
          mode: MODES.includes(plan?.mode) ? plan.mode : "next",
          previous: plan?.previous ? String(plan.previous).slice(0, 300) : undefined,
        };
        return textStream(await stream(interviewPrompt(ctx, trimChat(chat), safe), { maxTokens: 90, temperature: 0.75 }));
      }
      case "diary": {
        const { ctx, chat } = input as { ctx: DiaryContext; chat: ChatMsg[] };
        return textStream(await stream(diaryPrompt(ctx, trimChat(chat)), { maxTokens: 520, temperature: 0.7 }));
      }
      default:
        return Response.json({ error: `unknown task ${task}` }, { status: 400 });
    }
  } catch (err) {
    console.error(`[ai:${task}]`, err);
    return Response.json({ error: "The model didn't answer. Is Ollama running?" }, { status: 503 });
  }
}

const MODES: InterviewMode[] = ["next", "followup", "again", "jump", "wrapup"];

const textStream = (body: ReadableStream<Uint8Array>) =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "x-model": encodeURIComponent(modelLabel), "cache-control": "no-store" } });

const trimChat = (chat: ChatMsg[]) =>
  chat.slice(-24).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content).slice(0, 1500) }) as ChatMsg);
