import { fuzz } from "@/lib/geo";
import type { WeatherDay } from "@/lib/types";

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers", 81: "Heavy showers", 82: "Violent showers",
  95: "Thunderstorms", 96: "Thunderstorms with hail", 99: "Severe thunderstorms",
};

/** GET /api/weather?lat=&lon= — the next four days from Open-Meteo (open data, no key). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = fuzz(Number(q.get("lat")));
  const lon = fuzz(Number(q.get("lon")));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Response.json({ days: [] }, { status: 400 });
  const url =
    `${process.env.WEATHER_ENDPOINT ?? "https://api.open-meteo.com/v1/forecast"}?latitude=${lat}&longitude=${lon}` +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&forecast_days=4&timezone=auto";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const d = (await res.json()).daily;
    const days: WeatherDay[] = d.time.map((t: string, i: number) => ({
      date: new Date(`${t}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
      code: d.weather_code[i],
      label: WMO[d.weather_code[i]] ?? "Mixed",
      tMax: d.temperature_2m_max[i],
      tMin: d.temperature_2m_min[i],
      rainMm: Math.round(d.precipitation_sum[i] * 10) / 10,
      rainProb: d.precipitation_probability_max[i] ?? 0,
    }));
    return Response.json({ days });
  } catch {
    return Response.json({ days: [] });
  }
}
