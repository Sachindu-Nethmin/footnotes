export type Status = "dream" | "visited";

/** What kind of page a place gets in the notebook (drives the doodle + colour of its tab). */
export type Family = "nature" | "water" | "heights" | "heritage" | "sacred" | "curious";

/** A place as it comes back from the open-data search (Wikidata + Wikipedia). */
export type Candidate = {
  id: string; // Wikidata QID
  name: string;
  kind: string; // e.g. "waterfall"
  family: Family;
  description?: string;
  lat: number;
  lon: number;
  distanceKm: number;
  image?: string;
  wiki?: string; // English Wikipedia title
  fame: number; // Wikidata sitelinks: how many Wikipedias bothered to write about it
  score: number;
};

/** What the open model writes into a place's page. Grounded in the Wikipedia extract. */
export type Details = {
  hook: string;
  why: string;
  lookFor: string[];
  bestTime: string;
  tips: string[];
  funFact: string;
  by: string; // "gemma4:E4B (local)", "notes from Wikipedia" ...
  at: number;
};

export type Visit = { at: number; verified: boolean; distanceM?: number; weather?: string };

/** A place that made it into the bucket list. Lives only in this browser's IndexedDB. */
export type Place = Candidate & {
  addedAt: number;
  status: Status;
  extract?: string;
  details?: Details;
  visit?: Visit;
};

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string; topic?: string };

/** A diary page: the chat that drew the memory out, and the page the model wrote from it. */
export type Entry = {
  id: string;
  placeId: string;
  createdAt: number;
  chat: ChatMsg[];
  title?: string;
  text?: string;
  forWhom?: string;
  skipped?: string[]; // interview topics they chose to skip
  weather?: string;
  photo?: string; // small JPEG data URL, kept on-device
  by?: string;
};

export type Home = { lat: number; lon: number; label: string };

export type Settings = {
  name: string;
  home?: Home;
  radiusKm: number;
  engine: "server" | "browser";
};

export type WeatherDay = {
  date: string;
  code: number;
  label: string;
  tMax: number;
  tMin: number;
  rainMm: number;
  rainProb: number;
};

/** Gemma's pick for where to go next. */
export type NextPick = {
  placeId: string;
  headline: string;
  reason: string;
  bestDay: string;
  bring: string[];
  challenge: string;
  by: string;
  at: number;
};
