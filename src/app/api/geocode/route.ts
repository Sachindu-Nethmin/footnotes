import { fuzz } from "@/lib/geo";

const UA = process.env.WIKI_USER_AGENT ?? "Footnotes/0.1 (bucket-list notebook)";

/**
 * GET /api/geocode?q=Ella        — type a town instead of sharing GPS.
 * GET /api/geocode?lat=..&lon=.. — name the town you're in ("near Kandy").
 * Both use OpenStreetMap's Nominatim, and the reverse lookup only ever sees a ~1 km blurred point.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));

  const url = q
    ? `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`
    : Number.isFinite(lat) && Number.isFinite(lon) && params.has("lat")
      ? `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${fuzz(lat)}&lon=${fuzz(lon)}`
      : null;
  if (!url) return Response.json({ results: [] });

  try {
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const rows = (Array.isArray(data) ? data : [data]) as { lat: string; lon: string; display_name: string; name?: string; address?: Record<string, string> }[];
    return Response.json({
      results: rows
        .filter((r) => r.lat)
        .map((r) => ({
          lat: Number(r.lat),
          lon: Number(r.lon),
          label: r.address?.city || r.address?.town || r.address?.village || r.name || r.display_name.split(",")[0],
          full: r.display_name,
        })),
    });
  } catch {
    return Response.json({ results: [], error: "Couldn't reach the map search." }, { status: 502 });
  }
}
