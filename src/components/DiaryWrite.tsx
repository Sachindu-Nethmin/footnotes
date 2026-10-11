"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { askMargin, writePage } from "@/lib/ai";
import { hideNotes, openingQuestion, planNext, splitDiary, topicStatus, type DiaryContext, type InterviewPlan, type TopicId } from "@/lib/prompts";
import { shrinkPhoto } from "@/lib/store";
import type { ChatMsg, Entry } from "@/lib/types";
import { Pen, Scribble, Writing } from "./doodles";
import { usePager } from "./PagedSheet";
import type { Go } from "./Notebook";
import type { NotebookApi } from "./useNotebook";

const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function DiaryWrite({ nb, go, placeId, entryId }: { nb: NotebookApi; go: Go; placeId: string; entryId?: string }) {
  const place = nb.places.find((p) => p.id === placeId);
  const engine = nb.settings.engine;

  const ctx: DiaryContext | null = useMemo(
    () =>
      place
        ? {
            name: nb.settings.name,
            place: { id: place.id, name: place.name, kind: place.kind, description: place.description, distanceKm: place.distanceKm, extract: place.extract, lat: place.lat, lon: place.lon },
            visitedOn: place.visit ? fmtDay(place.visit.at) : "",
            weather: place.visit?.weather,
          }
        : null,
    [place, nb.settings.name],
  );

  // Resume a draft if there is one; otherwise start with the margin's opening question
  // (no model round-trip needed for it). A new entry is only saved once you write something.
  const [entry, setEntry] = useState<Entry | null>(() => {
    const existing = entryId ? nb.entries.find((e) => e.id === entryId) : nb.entries.find((e) => e.placeId === placeId && !e.text);
    if (existing) return existing;
    if (!ctx || !place?.visit) return null;
    return { id: `e-${Date.now().toString(36)}`, placeId, createdAt: Date.now(), chat: [{ role: "assistant", content: openingQuestion(ctx), topic: "arrival" }] };
  });
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [page, setPage] = useState<{ text: string; by: string; done: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const composeRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  const pager = usePager();

  // As the interview grows onto a new notebook page, follow it there.
  useEffect(() => {
    pager.show(composeRef.current ?? draftRef.current);
  }, [entry?.chat.length, streaming, pager]);

  if (!place || !ctx) {
    return (
      <section className="empty">
        <p className="hand-q">Which place is this page about?</p>
        <button className="link" onClick={() => go({ page: "diary" })}>
          back to the diary
        </button>
      </section>
    );
  }

  if (!place.visit) {
    return (
      <section className="empty">
        <p className="hand-q">Go there first.</p>
        <p className="pencil">
          This diary only has pages for places you&apos;ve actually been. Get yourself to {place.name}, press <em>I&apos;m here</em> on its page, then come back
          and tell me everything.
        </p>
        <button className="ink-btn" onClick={() => go({ page: "place", id: place.id })}>
          open {place.name}
        </button>
      </section>
    );
  }

  const update = (patch: Partial<Entry>) => {
    setEntry((e) => {
      if (!e) return e;
      const n = { ...e, ...patch };
      void nb.saveEntry(n);
      return n;
    });
  };

  /** Ask the interviewer for a question under `plan`, replacing the unanswered one if asked to. */
  const ask = async (chat: ChatMsg[], plan: InterviewPlan, patch: Partial<Entry> = {}) => {
    setBusy(true);
    update({ ...patch, chat });
    setStreaming("");
    const { text } = await askMargin(engine, ctx, chat, plan, (t) => setStreaming((s) => (s ?? "") + t));
    setStreaming(null);
    update({ chat: [...chat, { role: "assistant", content: text, topic: plan.mode === "wrapup" ? "wrapup" : plan.topic }] });
    setBusy(false);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !entry || busy) return;
    setDraft("");
    const chat: ChatMsg[] = [...entry.chat, { role: "user", content: text }];
    await ask(chat, planNext(chat, entry.skipped));
  };

  const last = entry?.chat.at(-1);
  const waiting = last?.role === "assistant" ? last : null; // the question still waiting for an answer
  const withoutWaiting = () => (waiting ? entry!.chat.slice(0, -1) : entry!.chat);

  /** "Try again": the same topic, asked a different way. */
  const askAgain = () => {
    if (!entry || !waiting || busy) return;
    const topic = (waiting.topic && waiting.topic !== "wrapup" ? waiting.topic : "moment") as TopicId;
    void ask(withoutWaiting(), { topic, mode: "again", previous: waiting.content });
  };

  /** Skip this topic and move on to the next one in the plan. */
  const skip = () => {
    if (!entry || !waiting || busy) return;
    const skipped = [...new Set([...(entry.skipped ?? []), waiting.topic ?? "arrival"])];
    const chat = withoutWaiting();
    const plan = planNext(chat, skipped);
    void ask(chat, { ...plan, mode: plan.mode === "wrapup" ? "wrapup" : "jump" }, { skipped });
  };

  /** Jump straight to a topic they want to talk about. */
  const jump = (topic: TopicId) => {
    if (!entry || busy) return;
    void ask(withoutWaiting(), { topic, mode: "jump" }, { skipped: (entry.skipped ?? []).filter((t) => t !== topic) });
  };

  const compose = async () => {
    if (!entry) return;
    setBusy(true);
    setPage({ text: "", by: "", done: false });
    const { text, by } = await writePage(engine, { ...ctx, forWhom: entry.forWhom }, entry.chat, (t) =>
      setPage((p) => ({ text: (p?.text ?? "") + t, by: p?.by ?? "", done: false })),
    );
    setPage({ text, by, done: true });
    setBusy(false);
  };

  const keep = async () => {
    if (!entry || !page) return;
    const { title, body } = splitDiary(page.text);
    const saved: Entry = { ...entry, title: title || place.name, text: body || page.text, by: page.by, weather: place.visit?.weather };
    await nb.saveEntry(saved);
    go({ page: "entry", id: saved.id });
  };

  const answers = entry?.chat.filter((m) => m.role === "user").length ?? 0;
  const topics = topicStatus(entry?.chat ?? [], entry?.skipped);
  // Question numbers count only the interviewer's turns before index i.
  const qNumber = (i: number) => (entry?.chat.slice(0, i).filter((m) => m.role === "assistant").length ?? 0) + 1;
  const preview = page ? splitDiary(page.text) : null;

  return (
    <section className="write">
      <header className="page-head">
        <p className="page-date">
          {ctx.visitedOn}
          {place.visit.weather ? ` · ${place.visit.weather}` : ""}
        </p>
        <h2>
          Dear diary, {place.name}
          <Scribble className="scribble" />
        </h2>
        <p className="pencil">
          A short interview about your visit. Answer like you&apos;re telling a friend; short answers get a follow-up, and you can skip or pick a topic. Nothing
          you write leaves this device.
        </p>
      </header>

      <nav className="interview-plan" aria-label="Interview topics">
        <span className="typed plan-label">interview</span>
        {topics.map((t) => (
          <button
            key={t.id}
            className={`plan-topic plan-${t.state}`}
            onClick={() => jump(t.id)}
            disabled={busy || Boolean(page) || t.state === "now"}
            title={t.state === "done" ? `talked about ${t.label}` : `ask me about ${t.label}`}
          >
            {t.state === "done" && <span aria-hidden>✓ </span>}
            {t.label}
          </button>
        ))}
      </nav>

      <div className="chat" aria-live="polite">
        {entry?.chat.map((m, i) =>
          m.role === "assistant" ? (
            <p key={i} className="margin-q">
              <span className="margin-tag">{m.topic === "wrapup" ? "fin" : `Q${qNumber(i)}`}</span>
              {m.content}
            </p>
          ) : (
            <p key={i} className="my-a">
              {m.content}
            </p>
          ),
        )}
        {streaming !== null && (
          <p className="margin-q">
            <span className="margin-tag">Q{qNumber(entry?.chat.length ?? 0)}</span>
            {hideNotes(streaming) || <span className="dots">…</span>}
          </p>
        )}
        {waiting && streaming === null && !page && waiting.topic !== "wrapup" && (
          <p className="q-tools">
            <button className="link small" onClick={askAgain} disabled={busy}>
              ↻ ask me something else
            </button>
            <button className="link small" onClick={skip} disabled={busy}>
              skip this one →
            </button>
          </p>
        )}
      </div>

      {!page && (
        <form
          ref={composeRef}
          className="compose"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            className="lined-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={waiting?.topic === "wrapup" ? "anything else? or write your page below" : "your answer…"}
            rows={3}
            aria-label="Your answer"
            disabled={busy}
          />
          <button className="ink-btn ink-blue" type="submit" disabled={busy || !draft.trim()}>
            <Pen size={18} /> write
          </button>
        </form>
      )}

      <div className="keepsakes">
        <label className="for-whom">
          <span className="pencil">someday I&apos;ll show this to</span>
          <input
            className="line-input"
            value={entry?.forWhom ?? ""}
            onChange={(e) => update({ forWhom: e.target.value })}
            placeholder="my kids, Amma, whoever finds this…"
            maxLength={60}
          />
        </label>
        <label className="photo-pick">
          {entry?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.photo} alt="Your photo from the visit" />
          ) : (
            <span className="pencil">+ tape in a photo</span>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) update({ photo: await shrinkPhoto(f) });
            }}
          />
        </label>
      </div>

      {!page ? (
        <div className="actions">
          <button className="ink-btn ink-red" onClick={compose} disabled={busy || answers < 2}>
            write my diary page
          </button>
          {answers < 2 && <span className="pencil small">answer a couple of questions first</span>}
        </div>
      ) : (
        <div className="draft-page" ref={draftRef}>
          {!page.done && !page.text && <Writing label="writing your page…" />}
          {preview && (
            <>
              <h3 className="diary-title">{preview.title}</h3>
              <div className="diary-text">{preview.body}</div>
            </>
          )}
          {page.done && (
            <div className="actions">
              <button className="ink-btn ink-blue" onClick={keep}>
                keep this page
              </button>
              <button className="ink-btn" onClick={compose} disabled={busy}>
                write it again
              </button>
              <button className="link" onClick={() => setPage(null)}>
                keep talking first
              </button>
              <span className="pencil small">written by {page.by}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
