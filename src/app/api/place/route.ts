import { summary } from "@/lib/wiki";

/** GET /api/place?title=Ravana_Falls — the Wikipedia summary a page's notes are grounded in. */
export async function GET(req: Request) {
  const title = new URL(req.url).searchParams.get("title");
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  try {
    return Response.json(await summary(title));
  } catch {
    return Response.json({});
  }
}
