"use client";

/**
 * The most private mode: Gemma 2 2B running inside this browser tab with WebLLM (WebGPU).
 * After a one-time download the weights are cached, and no word of your diary leaves the device,
 * not even to localhost.
 */
import type { InitProgressReport, MLCEngineInterface } from "@mlc-ai/web-llm";
import type { ChatMsg } from "./types";

const MODEL_F16 = "gemma-2-2b-it-q4f16_1-MLC";
const MODEL_F32 = "gemma-2-2b-it-q4f32_1-MLC";
export const BROWSER_MODEL_LABEL = "Gemma 2 2B · in this browser";

type GPUAdapterLike = { features: Set<string> };
type NavigatorGPU = { gpu?: { requestAdapter(): Promise<GPUAdapterLike | null> } };

export type Support = { ok: true; modelId: string } | { ok: false; reason: string };

export async function checkSupport(): Promise<Support> {
  const gpu = (navigator as unknown as NavigatorGPU).gpu;
  if (!gpu) return { ok: false, reason: "This browser has no WebGPU." };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "No compatible GPU found." };
    return { ok: true, modelId: adapter.features.has("shader-f16") ? MODEL_F16 : MODEL_F32 };
  } catch {
    return { ok: false, reason: "WebGPU is blocked on this device." };
  }
}

let engine: Promise<MLCEngineInterface> | null = null;
let loaded = false;

export const browserModelLoaded = () => loaded;

export function loadEngine(modelId: string, onProgress?: (r: InitProgressReport) => void) {
  engine ??= import("@mlc-ai/web-llm")
    .then(({ CreateMLCEngine }) => CreateMLCEngine(modelId, { initProgressCallback: onProgress }))
    .then((e) => {
      loaded = true;
      return e;
    })
    .catch((err) => {
      engine = null;
      throw err;
    });
  return engine;
}

/** Gemma's chat template has no system role: fold the instructions into the first user turn. */
function fold(messages: ChatMsg[]) {
  const [first, ...rest] = messages;
  if (first?.role !== "system") return messages;
  const firstUser = rest.findIndex((m) => m.role === "user");
  if (firstUser < 0) return [{ role: "user" as const, content: first.content }, ...rest];
  return rest.map((m, i) => (i === firstUser ? { ...m, content: `${first.content}\n\n${m.content}` } : m));
}

/**
 * Never starts a 1.5 GB download on its own: the weights load here only if they're already in
 * the browser cache (the inside cover is where you choose to download them).
 */
async function ready() {
  if (!engine) {
    const s = await checkSupport();
    if (!s.ok) throw new Error(s.reason);
    const { hasModelInCache } = await import("@mlc-ai/web-llm");
    if (!(await hasModelInCache(s.modelId).catch(() => false))) throw new Error("Gemma isn't downloaded in this browser yet");
    loadEngine(s.modelId);
  }
  return engine!;
}

export async function browserComplete(messages: ChatMsg[], opts: { maxTokens?: number; temperature?: number } = {}) {
  const e = await ready();
  const res = await e.chat.completions.create({
    messages: fold(messages),
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 700,
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function browserStream(
  messages: ChatMsg[],
  onToken: (t: string) => void,
  opts: { maxTokens?: number; temperature?: number } = {},
) {
  const e = await ready();
  const chunks = await e.chat.completions.create({
    messages: fold(messages),
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 500,
    stream: true,
  });
  let out = "";
  for await (const c of chunks) {
    const t = c.choices[0]?.delta?.content ?? "";
    out += t;
    if (t) onToken(t);
  }
  return out;
}
