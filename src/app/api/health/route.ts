import { modelLabel, ping, provider } from "@/lib/llm";

export async function GET() {
  const model = await ping();
  return Response.json({ ok: true, provider, model: modelLabel, modelReady: model });
}
