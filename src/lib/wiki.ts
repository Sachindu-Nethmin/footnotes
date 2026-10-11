import { KINDS, distanceKm } from "./geo";
import type { Candidate } from "./types";

/**
 * Open data only: Wikidata knows what is near you and how many Wikipedias have written about
 * it; Wikipedia knows what it is like. Neither needs a key, and both are edited by people who
 * actually went there.
 */

const UA = process.env.WIKI_USER_AGENT ?? "Footnotes/0.1 (bucket-list notebook; https://github.com/)";
const SPARQL = process.env.WIKIDATA_ENDPOINT ?? "https://query.wikidata.org/sparql";

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 1000 * 60 * 60 * 12;

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const thumb = (commonsUrl: string, width = 480) =>
  `${commonsUrl.replace(/^http:/, "https:")}?width=${width}`;

type Binding = Record<string, { value: string } | undefined>;

export function nearby(lat: number, lon: number, radiusKm: number) {
  return cached(`near:${lat}:${lon}:${radiusKm}`, async () => {
    try {
      const found = await fromWikidata(lat, lon, radiusKm);
      if (found.length >= 5) return found;
      const extra = await fromWikipedia(lat, lon).catch(() => []);
      const seen = new Set(found.map((c) => c.name));
      return [...found, ...extra.filter((c) => !seen.has(c.name))];
    } catch (err) {
      console.warn("[places] Wikidata failed, falling back to Wikipedia geosearch:", err);
      return fromWikipedia(lat, lon);
    }
  });
}

async function query(lat: number, lon: number, radiusKm: number, limit: number): Promise<Binding[]> {
  const types = Object.keys(KINDS).map((q) => `wd:${q}`).join(" ");
  const sparql = `
SELECT ?place ?placeLabel ?placeDescription ?type ?lat ?lon ?image ?sitelinks ?article WHERE {
  SERVICE wikibase:around {
    ?place wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  VALUES ?type { ${types} }
  ?place wdt:P31 ?type ; wikibase:sitelinks ?sitelinks .
  BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lon)
  OPTIONAL { ?place wdt:P18 ?image }
  OPTIONAL { ?article schema:about ?place ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?sitelinks) LIMIT ${limit}`;
  const res = await fetch(`${SPARQL}?query=${encodeURIComponent(sparql)}`, {
    headers: { accept: "application/sparql-results+json", "user-agent": UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  return (await res.json()).results.bindings;
}

async function fromWikidata(lat: number, lon: number, radiusKm: number): Promise<Candidate[]> {
  // Two asks at once: the most-written-about places in the whole circle, and the ones close
  // by. The first alone would drop the viewpoint down the road for a famous park 30 km away.
  const [wide, close] = await Promise.all([
    query(lat, lon, radiusKm, 150),
    radiusKm > 8 ? query(lat, lon, 8, 80).catch(() => [] as Binding[]) : Promise.resolve([] as Binding[]),
  ]);
  const rows = [...wide, ...close];

  const byId = new Map<string, Candidate>();
  for (const b of rows) {
    const id = b.place!.value.split("/").pop()!;
    const name = b.placeLabel?.value ?? id;
    const type = KINDS[b.type!.value.split("/").pop()!];
    if (!type || /^Q\d+$/.test(name)) continue;
    const pLat = Number(b.lat!.value);
    const pLon = Number(b.lon!.value);
    const d = distanceKm(lat, lon, pLat, pLon);
    const fame = Number(b.sitelinks?.value ?? 0);
    const image = b.image?.value ? thumb(b.image.value) : undefined;
    const score =
      Math.log2(2 + fame) * type.weight * (image ? 1.2 : 0.9) * (b.article ? 1.1 : 0.9) * (1 - 0.45 * Math.min(1, d / radiusKm));
    const prev = byId.get(id);
    if (prev && prev.score >= score) continue;
    byId.set(id, {
      id,
      name,
      kind: type.kind,
      family: type.family,
      description: b.placeDescription?.value,
      lat: pLat,
      lon: pLon,
      distanceKm: Math.round(d * 10) / 10,
      image: image ?? prev?.image,
      wiki: b.article?.value ? decodeURIComponent(b.article.value.split("/wiki/")[1]).replace(/_/g, " ") : prev?.wiki,
      fame,
      score: Math.round(score * 100) / 100,
    });
  }
  // Fame alone would let a famous park 30 km away push out the viewpoint at the end of your
  // street, so the closest places always get a page too.
  const all = [...byId.values()].sort((a, b) => b.score - a.score);
  const top = all.slice(0, 32);
  const near = all
    .slice(32)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 8);
  return [...top, ...near].sort((a, b) => b.score - a.score);
}

/** Wikipedia's own geosearch: faster and fewer kinds, used when Wikidata is slow or empty. */
async function fromWikipedia(lat: number, lon: number): Promise<Candidate[]> {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&generator=geosearch&ggslimit=40&ggsradius=10000" +
    `&ggscoord=${lat}|${lon}&prop=coordinates|pageimages|description|pageprops&piprop=thumbnail&pithumbsize=480&ppprop=wikibase_item`;
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const pages = Object.values((await res.json()).query?.pages ?? {}) as {
    title: string;
    description?: string;
    coordinates?: { lat: number; lon: number }[];
    thumbnail?: { source: string };
    pageprops?: { wikibase_item?: string };
  }[];
  return pages
    .filter((p) => p.coordinates?.[0])
    .map((p) => {
      const c = p.coordinates![0];
      const d = distanceKm(lat, lon, c.lat, c.lon);
      return {
        id: p.pageprops?.wikibase_item ?? `wp:${p.title}`,
        name: p.title,
        kind: "spot",
        family: "curious" as const,
        description: p.description,
        lat: c.lat,
        lon: c.lon,
        distanceKm: Math.round(d * 10) / 10,
        image: p.thumbnail?.source,
        wiki: p.title,
        fame: 1,
        score: Math.round((p.thumbnail ? 1.2 : 0.8) * (1 - 0.45 * Math.min(1, d / 10)) * 100) / 100,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export type Summary = { extract?: string; image?: string; description?: string; url?: string };

export function summary(title: string): Promise<Summary> {
  return cached(`sum:${title}`, async () => {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return {};
    const d = await res.json();
    return {
      extract: d.extract,
      image: d.thumbnail?.source,
      description: d.description,
      url: d.content_urls?.desktop?.page,
    };
  });
}
