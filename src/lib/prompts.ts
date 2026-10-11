/**
 * Every prompt Footnotes sends, in one place. The same builders run on the server (Ollama /
 * any OpenAI-compatible host) and in the browser (WebLLM), so swapping models never changes
 * what the model is asked to do. And every output has a deterministic fallback, so the
 * notebook still works with no model at all.
 */
import { fmtKm } from "./geo";
import type { ChatMsg, Details, NextPick, Place, WeatherDay } from "./types";

export type PlaceFacts = Pick<Place, "id" | "name" | "kind" | "description" | "distanceKm" | "extract" | "lat" | "lon">;

const today = (d = new Date()) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ───────────────────────────── place details ─────────────────────────────

export function detailsPrompt(p: PlaceFacts): ChatMsg[] {
  return [
    {
      role: "system",
      content:
        "You fill in one page of someone's paper bucket-list notebook about a place they want to visit. " +
        "Write like a well-travelled friend scribbling notes: warm, concrete, sensory, short. " +
        "Use the source notes plus what is widely known about this place, its region and its climate (rainy seasons, festivals, light). " +
        "Never invent opening hours, prices, or exact distances, and never contradict the source notes. No emoji, no generic filler like 'enjoy the view'.",
    },
    {
      role: "user",
      content: `Place: ${p.name} (${p.kind})
Short description: ${p.description ?? "none"}
Roughly ${fmtKm(p.distanceKm)} from the reader.
Source notes (Wikipedia): ${p.extract?.slice(0, 1800) ?? "none available"}
Today is ${today()}.

Return JSON only, with these keys:
"hook": one line that makes someone want to go (max 14 words),
"why": 2-3 sentences on what makes it special,
"lookFor": array of 3 specific things to notice when you are there (one sound, one view, one small detail most visitors miss),
"bestTime": the season and time of day to go, and why, in one sentence,
"tips": array of 2-3 practical tips (what to wear or bring, how to be respectful),
"funFact": one surprising true fact from the source notes.`,
    },
  ];
}

export function parseDetails(text: string, p: PlaceFacts, by: string): Details | null {
  const d = parseJson(text);
  if (!d || typeof d.hook !== "string" || typeof d.why !== "string") return null;
  return {
    hook: clean(d.hook),
    why: clean(d.why),
    lookFor: strings(d.lookFor).slice(0, 4),
    bestTime: clean(d.bestTime ?? ""),
    tips: strings(d.tips).slice(0, 4),
    funFact: clean(d.funFact ?? "") || firstSentence(p.extract) || "",
    by,
    at: Date.now(),
  };
}

/** No model? The notebook still gets a page, written from the Wikipedia extract alone. */
export function fallbackDetails(p: PlaceFacts): Details {
  const sentences = (p.extract ?? "").split(/(?<=\.)\s+/).filter(Boolean);
  return {
    hook: p.description ? cap(p.description) : `A ${p.kind} ${fmtKm(p.distanceKm)} from you.`,
    why: sentences.slice(0, 2).join(" ") || `It's a ${p.kind}, it's ${fmtKm(p.distanceKm)} away, and you haven't been yet.`,
    lookFor: ["the view on the way in, before you reach it", "what the locals are doing there", "one detail nobody photographs"],
    bestTime: "Early morning: softer light, fewer people, cooler walking.",
    tips: ["Carry water and something for the sun or rain.", "Leave it as you found it."],
    funFact: sentences[2] ?? sentences[0] ?? "",
    by: "notes from Wikipedia",
    at: Date.now(),
  };
}

// ───────────────────────────── where next ─────────────────────────────

export type NextInput = {
  now: string;
  places: Pick<Place, "id" | "name" | "kind" | "family" | "distanceKm" | "description">[];
  visited: { name: string; kind: string; when: string }[];
  weather: WeatherDay[];
};

/**
 * Safety is not left to a 4B model's judgement: if every day in the forecast is stormy or
 * soaked, exposed places (peaks, falls, beaches, trails) are taken off the menu before the model
 * ever sees the list. The model still chooses and explains; it just can't send you up a
 * mountain into a thunderstorm.
 */
const EXPOSED: Place["family"][] = ["heights", "water", "nature"];
const isExposed = (p: Pick<Place, "family" | "kind">) => EXPOSED.includes(p.family) && !/garden|museum|zoo/.test(p.kind);

export function weatherGate(input: NextInput) {
  const days = input.weather;
  const allRough = days.length > 0 && days.every((d) => d.code >= 95 || d.rainProb >= 85 || d.rainMm >= 15);
  const sheltered = input.places.filter((p) => !isExposed(p));
  if (allRough && sheltered.length) {
    return { places: sheltered, note: "Every day this week looks stormy, so wild and high places are off the list for now. Pick somewhere sheltered." };
  }
  return { places: input.places, note: "" };
}

export function nextPrompt(input: NextInput): ChatMsg[] {
  const gate = weatherGate(input);
  const list = gate.places
    .map((p) => `- id=${p.id} | ${p.name} | ${p.kind} | ${fmtKm(p.distanceKm)} away${isExposed(p) ? " | outdoors, exposed to weather" : " | sheltered"}${p.description ? ` | ${p.description}` : ""}`)
    .join("\n");
  const been = input.visited.length
    ? input.visited.map((v) => `- ${v.name} (${v.kind}), ${v.when}`).join("\n")
    : "- nothing yet: this would be their first trip";
  const wx = input.weather.length
    ? input.weather.map((d) => `- ${d.date}: ${d.label}, ${Math.round(d.tMin)}-${Math.round(d.tMax)}°C, rain ${d.rainMm} mm (${d.rainProb}%)`).join("\n")
    : "- no forecast available";
  return [
    {
      role: "system",
      content:
        "You help someone pick the next place from their bucket list, to get them off the screen and outside. " +
        "Choose exactly one place from their list. Weigh the forecast first: never send them to an exposed place on a thunderstorm day; " +
        "pick the driest day for peaks, trails and beaches; waterfalls are fullest after rain but need a dry day to walk to. " +
        "Then distance, and variety (if they just did a waterfall, suggest something different). Be specific, honest and encouraging. No emoji.",
    },
    {
      role: "user",
      content: `Today: ${input.now}
Their bucket list (not visited yet):
${list}

Already visited:
${been}

Forecast near them:
${wx}
${gate.note ? `\nNote: ${gate.note}\n` : ""}
Return JSON only with keys:
"placeId": the id of the chosen place, copied exactly,
"headline": max 10 words,
"reason": 2 sentences, mention the weather or season and how it fits what they have done so far,
"bestDay": which day from the forecast and what time of day,
"bring": array of 3 things to bring,
"challenge": one small thing to do there that keeps the phone in the pocket.`,
    },
  ];
}

export function parseNext(text: string, input: NextInput, by: string): NextPick | null {
  const d = parseJson(text);
  if (!d) return null;
  const id = String(d.placeId ?? "").replace(/^id=/, "").trim();
  const allowed = weatherGate(input).places;
  const place = allowed.find((p) => p.id === id) ?? allowed.find((p) => p.name.toLowerCase() === id.toLowerCase());
  if (!place || typeof d.reason !== "string") return null;
  return {
    placeId: place.id,
    headline: clean(d.headline ?? place.name),
    reason: clean(d.reason),
    bestDay: clean(d.bestDay ?? ""),
    bring: strings(d.bring).slice(0, 4),
    challenge: clean(d.challenge ?? "") || CHALLENGES[place.name.length % CHALLENGES.length],
    by,
    at: Date.now(),
  };
}

export function fallbackNext(input: NextInput): NextPick | null {
  if (!input.places.length) return null;
  const doneKinds = new Set(input.visited.map((v) => v.kind));
  const dry = input.weather.find((d) => d.rainProb < 40) ?? input.weather[0];
  const pick = [...weatherGate(input).places].sort((a, b) => {
    const fresh = (p: typeof a) => (doneKinds.has(p.kind) ? 1 : 0);
    return fresh(a) - fresh(b) || a.distanceKm - b.distanceKm;
  })[0];
  return {
    placeId: pick.id,
    headline: `${pick.name}, ${fmtKm(pick.distanceKm)} away`,
    reason: `It's the closest ${pick.kind} on your list${doneKinds.has(pick.kind) ? "" : ", and you haven't ticked off one of those yet"}.` +
      (dry ? ` ${dry.date} looks like the best day: ${dry.label.toLowerCase()}.` : ""),
    bestDay: dry ? `${dry.date}, early morning` : "this weekend, early morning",
    bring: ["water", "a snack", "this notebook (well, your phone)"],
    challenge: CHALLENGES[0],
    by: "nearest-first fallback",
    at: Date.now(),
  };
}

const CHALLENGES = [
  "Sit for five minutes with your phone away and count every sound you hear.",
  "Ask someone who lives nearby what they love about this place, and remember their exact words.",
  "Find the oldest-looking thing there and touch it (if you're allowed).",
  "Take exactly one photo. Just one. Make it count.",
];

// ───────────────────────────── the diary interview ─────────────────────────────

export type DiaryContext = { name: string; place: PlaceFacts; visitedOn: string; forWhom?: string; weather?: string };

/**
 * The interview has a plan, the way a good interviewer does: eight topics in an order that
 * walks through the day. Code decides which topic comes next and when a short answer deserves
 * a follow-up; the model only words the question, building on what was just said.
 */
export const TOPICS = [
  { id: "arrival", label: "arriving", goal: "the first moment they arrived: the first thing they saw, heard or felt" },
  { id: "people", label: "the people", goal: "who they were with or who they met there, and something one of them said or did" },
  { id: "moment", label: "the best moment", goal: "the single best or most surprising moment of the visit, told like a short story" },
  { id: "senses", label: "the senses", goal: "a sound, smell, taste or temperature from the visit they want to remember" },
  { id: "food", label: "food & small things", goal: "what they ate or drank, or a small detail or object they noticed" },
  { id: "feeling", label: "how it felt", goal: "how they felt while they were there, and whether it was what they expected" },
  { id: "advice", label: "advice", goal: "what they would tell a friend going next, or what they would do differently" },
  { id: "lastword", label: "last words", goal: "one sentence they want whoever reads this diary years from now to remember about this day" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];
export type InterviewMode = "next" | "followup" | "again" | "jump" | "wrapup";
export type InterviewPlan = { topic: TopicId; mode: InterviewMode; previous?: string };

const topicOf = (id: string) => TOPICS.find((t) => t.id === id) ?? TOPICS[0];
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function openingQuestion(ctx: DiaryContext) {
  const first = ctx.name ? `${ctx.name}, you` : "You";
  return `${first} made it to ${ctx.place.name}! Take me back to the moment you arrived. What's the first thing you remember?`;
}

/** Which topic to ask about after the latest answer, and whether to dig deeper first. */
export function planNext(chat: ChatMsg[], skipped: string[] = []): InterviewPlan {
  const asked = new Map<string, number>(); // topic -> questions asked
  const covered = new Set<string>(); // topics with at least one answer
  let current: string = "arrival";
  for (const m of chat) {
    if (m.role === "assistant" && m.topic) {
      current = m.topic;
      asked.set(current, (asked.get(current) ?? 0) + 1);
    } else if (m.role === "user") covered.add(current);
  }
  const last = [...chat].reverse().find((m) => m.role === "user");
  // After the wrap-up, anything else they add just gets a gentle "tell me more".
  if (current === "wrapup") return { topic: "moment", mode: "followup" };
  // A short answer gets one gentle follow-up on the same topic before we move on.
  if (last && words(last.content) < 7 && (asked.get(current) ?? 0) < 2 && current !== "lastword") {
    return { topic: current as TopicId, mode: "followup" };
  }
  const nextTopic = TOPICS.find((t) => !covered.has(t.id) && !asked.has(t.id) && !skipped.includes(t.id));
  return nextTopic ? { topic: nextTopic.id, mode: "next" } : { topic: "lastword", mode: "wrapup" };
}

export function interviewPrompt(ctx: DiaryContext, chat: ChatMsg[], plan: InterviewPlan): ChatMsg[] {
  const t = topicOf(plan.topic);
  const example = FALLBACK[t.id][0];
  // Small models follow the last thing they read, so the steering goes at the very end.
  const how: Record<InterviewMode, string> = {
    next: `Now change topic to ${t.label.toUpperCase()}: ${t.goal}. First react to my last answer in at most 8 words. Then ask ONE question about ${t.label}, in the spirit of "${example}", but in your own words and connected to what I told you.`,
    followup: `My last answer was short. Stay on ${t.label.toUpperCase()} and ask ONE follow-up that asks for one concrete detail (a name, a sound, a colour, what happened next). No praise, only the question.`,
    again: `Ask me a different question about ${t.label.toUpperCase()}: ${t.goal}. Not this one: "${plan.previous ?? example}". Only the question.`,
    jump: `I want to talk about ${t.label.toUpperCase()} now: ${t.goal}. Ask ONE question about it, in the spirit of "${example}", in your own words. Only the question.`,
    wrapup: "The interview is finished. Do NOT ask a question. Write two short sentences: thank me warmly, mention one specific detail I shared, and say my page is ready whenever I tap 'write my diary page'.",
  };
  const messages: ChatMsg[] = [
    {
      role: "system",
      content:
        `You are a warm, curious interviewer for a travel diary, like a good radio interviewer. ${ctx.name || "The traveller"} visited ${ctx.place.name} (${ctx.place.kind}) on ${ctx.visitedOn}${ctx.weather ? `; the weather was ${ctx.weather}` : ""}. ` +
        "Your questions help them remember the visit so well that their diary page brings it back years from now. " +
        "Ask open questions (who, what, how, tell me about), never yes/no, never two things at once, at most 30 words. " +
        "Never assume anything they haven't told you. No emoji, no lists, no quotation marks. " +
        "Each turn ends with an instruction in square brackets telling you what to ask next; follow it exactly and never mention it.",
    },
    // Chat templates like Gemma's expect the user to speak first.
    { role: "user", content: `I just got back from ${ctx.place.name}. Interview me for my diary.` },
    ...chat.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
  ];
  const lastMsg = messages.at(-1)!;
  if (lastMsg.role === "user") lastMsg.content = `${lastMsg.content}\n\n[${how[plan.mode]}]`;
  else messages.push({ role: "user", content: `[${how[plan.mode]}]` });
  return messages;
}

/** What the progress row shows for each topic. */
export function topicStatus(chat: ChatMsg[], skipped: string[] = []) {
  const covered = new Set<string>();
  let current = "arrival";
  for (const m of chat) {
    if (m.role === "assistant" && m.topic) current = m.topic;
    else if (m.role === "user") covered.add(current);
  }
  const last = chat.at(-1);
  const open = last?.role === "assistant" ? (last.topic ?? "arrival") : null;
  return TOPICS.map((t) => ({
    ...t,
    state: open === t.id ? "now" : covered.has(t.id) ? "done" : skipped.includes(t.id) ? "skipped" : "todo",
  }));
}

/** The model sometimes echoes a [bracketed instruction]; never show one, even half-streamed. */
export const hideNotes = (text: string) => text.replace(/\s*\[[^\]]*(\]|$)/g, "").trim();

/** Small models sometimes ask two questions or wrap the reply in quotes; keep the first question. */
export function tidyQuestion(text: string, mode: InterviewMode) {
  let t = hideNotes(text).replace(/^["“]|["”]$/g, "").replace(/^(margin|interviewer|q\d*)\s*[:.]\s*/i, "");
  if (mode !== "wrapup") {
    const q = t.indexOf("?");
    if (q > 0) t = t.slice(0, q + 1);
  }
  return t.trim();
}

const FALLBACK: Record<TopicId, string[]> = {
  arrival: ["Take me back to the moment you arrived. What did you notice first?", "What was the very first thing you heard when you got there?"],
  people: ["Who were you with, and what did they say when you got there?", "Did you meet anyone there? Tell me about them."],
  moment: ["If you could keep just one moment from the visit, which one would it be?", "What surprised you most that day?"],
  senses: ["What could you hear while you were standing there?", "What did the air smell or feel like?"],
  food: ["What did you eat or drink that day, and where?", "What's one small thing you noticed that nobody else would?"],
  feeling: ["How did you feel standing there? Was it what you expected?", "What were you thinking about on the way back?"],
  advice: ["What would you tell a friend who's going next week?", "What would you do differently next time?"],
  lastword: ["If someone reads this page years from now, what's the one thing you want them to know about this day?", "Sum the day up in one sentence."],
};

export function fallbackQuestion(plan: InterviewPlan) {
  if (plan.mode === "wrapup") return "That's a whole day's worth of memories. Your page is ready whenever you tap 'write my diary page'.";
  const options = FALLBACK[plan.topic];
  if (plan.mode === "followup") return "Tell me a little more. What exactly did it look, sound or feel like?";
  return options.find((q) => q !== plan.previous) ?? options[0];
}

// ───────────────────────────── writing the diary page ─────────────────────────────

export function diaryPrompt(ctx: DiaryContext, chat: ChatMsg[]): ChatMsg[] {
  const transcript = chat
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "ME" : "MARGIN"}: ${m.content}`)
    .join("\n");
  const reader = ctx.forWhom?.trim() || "whoever reads this someday";
  return [
    {
      role: "system",
      content:
        "You turn a conversation into one handwritten diary page. Write in the first person as the person who visited, in their voice: keep their words, their humour, their small details. " +
        "Use ONLY what the ME lines say. MARGIN lines are just questions: if ME didn't answer one, that detail does not exist, so leave it out. " +
        "You may add at most one fact about the place from the notes, and only if it fits. " +
        "Plain, honest, vivid; not purple, not a travel brochure. No hashtags, no emoji, no headings, no markdown.",
    },
    {
      role: "user",
      content: `Place: ${ctx.place.name} (${ctx.place.kind})
Date of the visit: ${ctx.visitedOn}${ctx.weather ? `\nWeather that day: ${ctx.weather}` : ""}
Notes about the place: ${firstSentences(ctx.place.extract, 2) || ctx.place.description || "none"}

Our conversation:
${transcript}

Write the page: 140 to 230 words. The first line is a short, specific title (no quotes, not just the place name). Then a blank line, then the entry. Don't start with the date; it's already at the top of the page. End with one or two sentences written directly to ${reader}.`,
    },
  ];
}

export function splitDiary(text: string) {
  const lines = text.replace(/^\s+/, "").split("\n");
  const title = (lines[0] ?? "").replace(/^[#*\s"]+|[*"\s]+$/g, "").replace(/^title:\s*/i, "");
  const body = lines.slice(1).join("\n").trim();
  return { title: title.slice(0, 90), body };
}

/** No model? Stitch their own answers into a page. Still theirs, just less polished. */
export function fallbackDiary(ctx: DiaryContext, chat: ChatMsg[]) {
  const said = chat.filter((m) => m.role === "user").map((m) => m.content.trim().replace(/([^.!?])$/, "$1."));
  const reader = ctx.forWhom?.trim() || "whoever reads this someday";
  return `${ctx.place.name}\n\nToday I went to ${ctx.place.name}. ${said.join(" ")}\n\nTo ${reader}: go, if you ever get the chance. It's worth it.`;
}

// ───────────────────────────── helpers ─────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(text: string): Record<string, any> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const strings = (v: unknown) => (Array.isArray(v) ? v.map((s) => clean(String(s))).filter(Boolean) : []);
const clean = (s: string) => String(s).replace(/\s+/g, " ").replace(/^[-*•\s]+/, "").trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstSentence = (s?: string) => s?.split(/(?<=\.)\s+/)[0];
const firstSentences = (s: string | undefined, n: number) => s?.split(/(?<=\.)\s+/).slice(0, n).join(" ");
