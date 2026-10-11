import type { Family } from "./types";

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Two decimals is about 1 km. That is all the open-data services ever see of where you are:
 * enough to find waterfalls nearby, not enough to find your front door.
 */
export const fuzz = (n: number) => Math.round(n * 100) / 100;

export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);

/**
 * The kinds of places worth a page in the notebook, as Wikidata classes.
 * Exact classes, not subclass walks, so the query stays fast on the public endpoint.
 */
export const KINDS: Record<string, { kind: string; family: Family; weight: number }> = {
  Q34038: { kind: "waterfall", family: "water", weight: 1.6 },
  Q8502: { kind: "mountain", family: "heights", weight: 1.4 },
  Q207326: { kind: "summit", family: "heights", weight: 1.3 },
  Q54050: { kind: "hill", family: "heights", weight: 1.1 },
  Q133056: { kind: "mountain pass", family: "heights", weight: 1.2 },
  Q6017969: { kind: "viewpoint", family: "heights", weight: 1.6 },
  Q1440300: { kind: "observation tower", family: "heights", weight: 1.0 },
  Q40080: { kind: "beach", family: "water", weight: 1.5 },
  Q23397: { kind: "lake", family: "water", weight: 1.3 },
  Q131681: { kind: "reservoir", family: "water", weight: 1.0 },
  Q185113: { kind: "cape", family: "water", weight: 1.2 },
  Q39594: { kind: "bay", family: "water", weight: 1.2 },
  Q35666: { kind: "glacier", family: "water", weight: 1.5 },
  Q39715: { kind: "lighthouse", family: "water", weight: 1.3 },
  Q12323: { kind: "dam", family: "water", weight: 0.7 },
  Q46169: { kind: "national park", family: "nature", weight: 1.6 },
  Q179049: { kind: "nature reserve", family: "nature", weight: 1.4 },
  Q473972: { kind: "protected area", family: "nature", weight: 1.3 },
  Q4421: { kind: "forest", family: "nature", weight: 1.3 },
  Q39816: { kind: "valley", family: "nature", weight: 1.2 },
  Q35509: { kind: "cave", family: "nature", weight: 1.3 },
  Q2143825: { kind: "hiking trail", family: "nature", weight: 1.5 },
  Q167346: { kind: "botanical garden", family: "nature", weight: 1.3 },
  Q1107656: { kind: "garden", family: "nature", weight: 1.1 },
  Q22698: { kind: "park", family: "nature", weight: 0.9 },
  Q43501: { kind: "zoo", family: "nature", weight: 0.8 },
  Q5393308: { kind: "Buddhist temple", family: "sacred", weight: 1.0 },
  Q842402: { kind: "Hindu temple", family: "sacred", weight: 1.0 },
  Q44613: { kind: "monastery", family: "sacred", weight: 1.0 },
  Q697295: { kind: "shrine", family: "sacred", weight: 0.9 },
  Q32815: { kind: "mosque", family: "sacred", weight: 0.9 },
  Q16970: { kind: "church", family: "sacred", weight: 0.8 },
  Q23413: { kind: "castle", family: "heritage", weight: 1.3 },
  Q57821: { kind: "fortification", family: "heritage", weight: 1.1 },
  Q1785071: { kind: "fort", family: "heritage", weight: 1.1 },
  Q16560: { kind: "palace", family: "heritage", weight: 1.1 },
  Q839954: { kind: "archaeological site", family: "heritage", weight: 1.2 },
  Q1081138: { kind: "historic site", family: "heritage", weight: 1.0 },
  Q4989906: { kind: "monument", family: "heritage", weight: 0.8 },
  Q2319498: { kind: "landmark", family: "heritage", weight: 0.9 },
  Q12280: { kind: "bridge", family: "curious", weight: 0.8 },
  Q33506: { kind: "museum", family: "curious", weight: 0.6 },
  Q570116: { kind: "attraction", family: "curious", weight: 0.9 },
};

export const FAMILY_LABEL: Record<Family, string> = {
  nature: "green & wild",
  water: "water",
  heights: "high places",
  heritage: "old stones",
  sacred: "quiet & sacred",
  curious: "curiosities",
};
