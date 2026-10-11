import { fuzz } from "@/lib/geo";
import { nearby } from "@/lib/wiki";

/** GET /api/places?lat=7.29&lon=80.63&r=40 — beautiful places near a (deliberately blurred) point. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const radius = Math.min(80, Math.max(5, Number(q.get("r") ?? 35)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat and lon are required" }, { status: 400 });
  }
  try {
    const places = await nearby(fuzz(lat), fuzz(lon), Math.round(radius));
    return Response.json({ places, source: "Wikidata + Wikipedia (CC0 / CC BY-SA)" });
  } catch (err) {
    console.error("[places]", err);
    return Response.json({ error: "The open map is slow to answer right now. Try again in a minute." }, { status: 502 });
  }
}
