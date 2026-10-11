"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Entry, Place } from "@/lib/types";
import { Arrow, FamilyIcon, Scribble, Stamp } from "./doodles";
import type { Go } from "./Notebook";
import { PagedSheet, type SheetHandle } from "./PagedSheet";
import type { NotebookApi } from "./useNotebook";
import { photo } from "@/lib/photo";

const fmtShort = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtLong = (t: number) => new Date(t).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function written(nb: NotebookApi) {
  return nb.entries
    .filter((e) => e.text)
    .map((e) => ({ e, p: nb.places.find((p) => p.id === e.placeId) }))
    .filter((x): x is { e: Entry; p: Place } => Boolean(x.p))
    .sort((a, b) => (a.p.visit?.at ?? a.e.createdAt) - (b.p.visit?.at ?? b.e.createdAt));
}

export function Contents({ nb, go }: { nb: NotebookApi; go: Go }) {
  const pages = written(nb);
  const waiting = nb.places.filter((p) => p.status === "visited" && !nb.entries.some((e) => e.placeId === p.id && e.text));

  return (
    <section>
      <header className="page-head">
        <p className="page-date">{pages.length ? `${pages.length} page${pages.length > 1 ? "s" : ""} so far` : "nothing written yet"}</p>
        <h2>
          Contents
          <Scribble className="scribble" />
        </h2>
      </header>

      {pages.length > 0 ? (
        <ol className="toc">
          {pages.map(({ e, p }, i) => (
            <li key={e.id}>
              <button className="toc-row" onClick={() => go({ page: "entry", id: e.id })}>
                <span className="toc-title">{e.title}</span>
                <span className="toc-dots" aria-hidden />
                <span className="toc-meta typed">
                  {p.name} · {fmtShort(p.visit?.at ?? e.createdAt)}
                </span>
                <span className="toc-num">{i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty">
          <p className="hand-q">The diary is empty, and that&apos;s the point.</p>
          <p className="pencil">
            Pages only appear here after you&apos;ve been somewhere. Pick a place, go there, press <em>I&apos;m here</em>, and tell the margin how it was.
          </p>
          <button className="ink-btn" onClick={() => go({ page: "next" })}>
            where should I go next?
          </button>
          <Arrow className="empty-arrow" />
        </div>
      )}

      {waiting.length > 0 && (
        <>
          <h3 className="section-title">Been there, not written yet</h3>
          <ul className="dash-list">
            {waiting.map((p) => (
              <li key={p.id} className="ink">
                <button className="link" onClick={() => go({ page: "write", id: p.id })}>
                  {p.name}
                </button>{" "}
                <span className="pencil small">{p.visit ? fmtShort(p.visit.at) : ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {pages.length > 0 && (
        <div className="actions">
          <button className="ink-btn ink-red" onClick={() => go({ page: "show" })}>
            show someone ↗
          </button>
          <span className="pencil small">opens the diary as a book you can hand over, or print</span>
        </div>
      )}
    </section>
  );
}

export function EntryPage({ nb, go, id }: { nb: NotebookApi; go: Go; id: string }) {
  const e = nb.entries.find((x) => x.id === id);
  const p = e && nb.places.find((x) => x.id === e.placeId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(e?.text ?? "");
  const [title, setTitle] = useState(e?.title ?? "");

  if (!e || !p) {
    return (
      <section className="empty">
        <p className="hand-q">This page was torn out.</p>
        <button className="link" onClick={() => go({ page: "diary" })}>
          back to contents
        </button>
      </section>
    );
  }

  const save = async () => {
    await nb.saveEntry({ ...e, text, title });
    setEditing(false);
  };

  return (
    <article className="entry">
      <button className="link back" onClick={() => go({ page: "diary" })}>
        ← contents
      </button>
      <DiaryLeaf e={e} p={p} name={nb.settings.name} editing={editing} title={title} text={text} onTitle={setTitle} onText={setText} />
      <div className="actions no-print">
        {editing ? (
          <>
            <button className="ink-btn ink-blue" onClick={save}>
              save my changes
            </button>
            <button className="link" onClick={() => (setEditing(false), setText(e.text ?? ""), setTitle(e.title ?? ""))}>
              cancel
            </button>
          </>
        ) : (
          <>
            <button className="ink-btn ink-red" onClick={() => go({ page: "show", id: e.id })}>
              show someone ↗
            </button>
            <button className="ink-btn" onClick={() => setEditing(true)}>
              edit in my own words
            </button>
            <button className="link" onClick={() => go({ page: "write", id: p.id, entry: e.id })}>
              keep talking about it
            </button>
            <button
              className="link small"
              onClick={async () => {
                if (confirm("Tear this diary page out?")) {
                  await nb.removeEntry(e.id);
                  go({ page: "diary" });
                }
              }}
            >
              tear out
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function DiaryLeaf({
  e,
  p,
  name,
  editing = false,
  title,
  text,
  onTitle,
  onText,
}: {
  e: Entry;
  p: Place;
  name: string;
  editing?: boolean;
  title?: string;
  text?: string;
  onTitle?: (s: string) => void;
  onText?: (s: string) => void;
}) {
  const visitAt = p.visit?.at ?? e.createdAt;
  return (
    <div className="leaf">
      <p className="leaf-date">
        {fmtLong(visitAt)}
        {e.weather ? <span className="pencil"> · {e.weather}</span> : null}
      </p>
      {(e.photo || p.image) && (
        <figure className="polaroid polaroid-leaf" style={{ "--tilt": "3deg" } as React.CSSProperties}>
          <span className="tape tape-0" aria-hidden />
          <div className="polaroid-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.photo ?? photo(p.image, 800)} alt={e.photo ? `My photo at ${p.name}` : p.name} referrerPolicy="no-referrer" />
          </div>
          <figcaption className="pencil">{e.photo ? "me, there" : p.name}</figcaption>
        </figure>
      )}
      {editing ? (
        <input className="diary-title diary-title-edit" value={title} onChange={(ev) => onTitle?.(ev.target.value)} aria-label="Title" />
      ) : (
        <h2 className="diary-title">{e.title}</h2>
      )}
      <p className="typed leaf-place">
        <FamilyIcon family={p.family} size={18} /> {p.name} · {p.kind}
      </p>
      {editing ? (
        <textarea className="diary-text diary-edit" value={text} onChange={(ev) => onText?.(ev.target.value)} aria-label="Diary text" />
      ) : (
        <div className="diary-text">{e.text}</div>
      )}
      <p className="leaf-sign">— {name || "me"}</p>
      {p.visit && (
        <div className="leaf-stamp">
          <Stamp date={fmtShort(p.visit.at).toUpperCase()} verified={p.visit.verified} place={p.name} />
        </div>
      )}
      {e.by && <p className="pencil small leaf-by">put into words with {e.by}, from what I told it</p>}
    </div>
  );
}

/** The diary as a book you can hand to someone. Arrow keys turn pages; Print makes a keepsake PDF. */
export function ShowMode({ nb, startId, go }: { nb: NotebookApi; startId?: string; go: Go }) {
  const pages = written(nb);
  const start = startId ? pages.findIndex((x) => x.e.id === startId) + 1 : 0;
  const [at, setAt] = useState(Math.max(0, start));
  const atRef = useRef(at);
  const sheetRef = useRef<SheetHandle>(null);
  const last = pages.length + 1;

  /** Past the first or last page of an entry: on to the neighbouring entry. */
  const turnEntry = useCallback(
    (dir: "fwd" | "back") => {
      const to = Math.min(last, Math.max(0, atRef.current + (dir === "fwd" ? 1 : -1)));
      if (to === atRef.current) return;
      atRef.current = to;
      const swap = () => flushSync(() => setAt(to));
      if (!sheetRef.current) return swap();
      sheetRef.current.turn(dir, swap);
    },
    [last],
  );

  /** Next: the rest of this entry's pages first, then the next entry. */
  const turn = useCallback((d: number) => void (d > 0 ? sheetRef.current?.next() : sheetRef.current?.prev()), []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowRight") turn(1);
      if (ev.key === "ArrowLeft") turn(-1);
      if (ev.key === "Escape") go({ page: "diary" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn, go]);

  const name = nb.settings.name || "my";
  const first = pages[0]?.p.visit?.at;
  const lastAt = pages.at(-1)?.p.visit?.at;
  const remaining = nb.places.filter((p) => p.status === "dream").length;

  return (
    <div className="desk show">
      <div className="show-bar no-print">
        <button className="link" onClick={() => go({ page: "diary" })}>
          ← back to the notebook
        </button>
        <span className="pencil">
          {at === 0 ? "cover" : at === last ? "the end" : `page ${at} of ${pages.length}`}
        </span>
        <button className="link" onClick={() => window.print()}>
          print / save as PDF
        </button>
      </div>

      <div className="show-book no-print">
        <button className="turn turn-prev" onClick={() => turn(-1)} disabled={at === 0} aria-label="Previous page">
          ‹
        </button>
        <PagedSheet ref={sheetRef} pageKey={at} className="page show-page" keys={false} edges={{ prev: at > 0, next: at < last }} onEdge={turnEntry}>
          {at === 0 ? (
            <div className="show-cover">
              <p className="pencil">the travel diary of</p>
              <h1>{name === "my" ? "someone who went outside" : name}</h1>
              <p className="typed">
                {pages.length} place{pages.length === 1 ? "" : "s"}
                {first ? ` · ${fmtShort(first)}${lastAt && lastAt !== first ? ` to ${fmtShort(lastAt)}` : ""}` : ""}
              </p>
              <button className="ink-btn" onClick={() => turn(1)}>
                open →
              </button>
            </div>
          ) : at === last ? (
            <div className="show-cover">
              <h1>the end</h1>
              <p className="hand-q">(for now)</p>
              <p className="pencil">
                {remaining > 0 ? `${remaining} more place${remaining === 1 ? "" : "s"} still on the list.` : "Time to add more places to the list."}
              </p>
            </div>
          ) : (
            <DiaryLeaf e={pages[at - 1].e} p={pages[at - 1].p} name={nb.settings.name} />
          )}
        </PagedSheet>
        <button className="turn turn-next" onClick={() => turn(1)} disabled={at === last} aria-label="Next page">
          ›
        </button>
      </div>

      {/* Print: every page, one per sheet. */}
      <div className="print-only">
        <div className="show-cover print-sheet">
          <p className="pencil">the travel diary of</p>
          <h1>{name === "my" ? "someone who went outside" : name}</h1>
          <p className="typed">{pages.length} places</p>
        </div>
        {pages.map(({ e, p }) => (
          <div className="print-sheet" key={e.id}>
            <DiaryLeaf e={e} p={p} name={nb.settings.name} />
          </div>
        ))}
      </div>
    </div>
  );
}
