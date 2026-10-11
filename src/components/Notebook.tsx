"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BucketList } from "./BucketList";
import { Contents, EntryPage, ShowMode } from "./Diary";
import { DiaryWrite } from "./DiaryWrite";
import { InsideCover } from "./InsideCover";
import { Nearby } from "./Nearby";
import { NextUp } from "./NextUp";
import { PlacePage } from "./PlacePage";
import { PagedSheet, type SheetHandle } from "./PagedSheet";
import { useNotebook } from "./useNotebook";

export type Route =
  | { page: "nearby" }
  | { page: "list" }
  | { page: "place"; id: string }
  | { page: "next" }
  | { page: "diary" }
  | { page: "entry"; id: string }
  | { page: "write"; id: string; entry?: string }
  | { page: "show"; id?: string }
  | { page: "settings" };

export type Go = (r: Route) => void;

function parse(hash: string): Route {
  const [page, id, entry] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  switch (page) {
    case "list":
    case "next":
    case "diary":
    case "settings":
      return { page };
    case "place":
    case "entry":
      return id ? { page, id } : { page: "list" };
    case "write":
      return id ? { page, id, entry } : { page: "diary" };
    case "show":
      return { page, id };
    default:
      return { page: "nearby" };
  }
}

const toHash = (r: Route) =>
  "#/" + [r.page, "id" in r ? r.id : undefined, "entry" in r ? r.entry : undefined].filter(Boolean).map((s) => encodeURIComponent(s!)).join("/");

/** Where each page sits in the book, so a page turns forward or back like it would on paper. */
const ORDER: Record<Route["page"], number> = { nearby: 0, list: 1, place: 1.5, next: 2, diary: 3, entry: 3.5, write: 3.6, settings: 4, show: 5 };

const TABS = [
  { key: "nearby", label: "Nearby", color: "tab-yellow", pages: ["nearby"] },
  { key: "list", label: "My list", color: "tab-mint", pages: ["list", "place"] },
  { key: "next", label: "Next", color: "tab-pink", pages: ["next"] },
  { key: "diary", label: "Diary", color: "tab-blue", pages: ["diary", "entry", "write"] },
  { key: "settings", label: "Inside cover", color: "tab-lilac", pages: ["settings"] },
] as const;

type CoverState = "unknown" | "closed" | "opening" | "open";

export default function Notebook() {
  const nb = useNotebook();
  const [route, setRoute] = useState<Route>({ page: "nearby" });
  const [cover, setCover] = useState<CoverState>("unknown");
  const [turn, setTurn] = useState(0);
  const sheetRef = useRef<SheetHandle>(null);
  const routeRef = useRef<Route>(route);
  const coverRef = useRef<CoverState>(cover);

  useEffect(() => {
    coverRef.current = cover;
  }, [cover]);

  useEffect(() => {
    const show = (next: Route) => {
      routeRef.current = next;
      setRoute(next);
      setTurn((t) => t + 1);
    };

    const onHash = () => {
      const next = parse(location.hash);
      const prev = routeRef.current;
      const swap = () => flushSync(() => show(next));
      if (coverRef.current !== "open") {
        // A tab clicked on the closed book opens it at that page.
        swap();
        if (coverRef.current === "closed") setCover("opening");
        return;
      }
      if (!sheetRef.current || prev.page === "show" || next.page === "show") return swap();
      sheetRef.current.turn(ORDER[next.page] >= ORDER[prev.page] ? "fwd" : "back", swap);
    };

    show(parse(location.hash));
    // Opening the cover is a once-per-visit ritual; deep links skip it.
    let seen = false;
    try {
      seen = sessionStorage.getItem("footnotes:open") === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage, read after hydration
    setCover(seen || location.hash.length > 2 ? "open" : "closed");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go: Go = (r) => {
    const h = toHash(r);
    if (location.hash !== h) location.hash = h;
  };

  const opened = () => {
    setCover("open");
    try {
      sessionStorage.setItem("footnotes:open", "1");
    } catch {}
  };

  if (cover === "unknown" || !nb.ready) return <div className="desk" />;

  if (route.page === "show") return <ShowMode nb={nb} startId={route.id} go={go} />;

  const counts: Record<string, number> = {
    list: nb.places.filter((p) => p.status === "dream").length,
    diary: nb.entries.filter((e) => e.text).length,
  };
  const closed = cover !== "open";

  return (
    <div className="desk">
      <div className={`book ${closed ? "book-closed" : ""}`}>
        <div className="spiral" aria-hidden />
        <nav className="tabs" aria-label="Notebook sections">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={toHash({ page: t.key } as Route)}
              className={`tab ${t.color} ${!closed && (t.pages as readonly string[]).includes(route.page) ? "tab-on" : ""}`}
              aria-current={(t.pages as readonly string[]).includes(route.page) ? "page" : undefined}
            >
              {t.label}
              {counts[t.key] ? <b>{counts[t.key]}</b> : null}
            </a>
          ))}
        </nav>
        <PagedSheet ref={sheetRef} pageKey={turn} inert={cover === "closed"}>
          {route.page === "nearby" && <Nearby nb={nb} go={go} />}
          {route.page === "list" && <BucketList nb={nb} go={go} />}
          {route.page === "place" && <PlacePage nb={nb} go={go} id={route.id} />}
          {route.page === "next" && <NextUp nb={nb} go={go} />}
          {route.page === "diary" && <Contents nb={nb} go={go} />}
          {route.page === "entry" && <EntryPage nb={nb} go={go} id={route.id} />}
          {route.page === "write" && <DiaryWrite nb={nb} go={go} placeId={route.id} entryId={route.entry} />}
          {route.page === "settings" && <InsideCover nb={nb} go={go} />}
        </PagedSheet>
        <div className="page-stack" aria-hidden />
        {closed && (
          <Cover
            name={nb.settings.name}
            opening={cover === "opening"}
            onOpen={() => setCover("opening")}
            onOpened={opened}
            onName={(name) => nb.saveSettings({ name })}
          />
        )}
      </div>
      <p className="desk-note">
        Everything in this notebook stays in this browser. The writing is done by an open-weight model, Gemma, on your own machine.
      </p>
    </div>
  );
}

/**
 * The hard cover sits on top of the real first page. Opening it swings the board around the
 * spiral (it's stiff, so it doesn't bend like a page) and shows the endpaper on its back.
 */
function Cover({
  name,
  opening,
  onOpen,
  onOpened,
  onName,
}: {
  name: string;
  opening: boolean;
  onOpen: () => void;
  onOpened: () => void;
  onName: (n: string) => void;
}) {
  const [value, setValue] = useState(name);

  const open = () => {
    if (value.trim() !== name) onName(value.trim());
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return onOpened();
    onOpen();
  };

  return (
    <>
      {opening && <div className="cover-shadow" aria-hidden />}
      <div
        className={`cover ${opening ? "cover-opening" : ""}`}
        onAnimationEnd={(e) => e.target === e.currentTarget && onOpened()}
      >
        <div className="cover-front" inert={opening}>
          <div className="cover-band" aria-hidden />
          <div className="cover-label">
            <h1>Footnotes</h1>
            <p className="cover-sub">places my feet still owe a visit</p>
            <label className="cover-owner">
              <span>this book belongs to</span>
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="your name" maxLength={40} onKeyDown={(e) => e.key === "Enter" && open()} />
            </label>
          </div>
          <svg className="cover-emboss" viewBox="0 0 240 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="178" cy="34" r="14" />
            <path d="M8 104 L70 40 L98 70 L128 34 L196 104" />
            <path d="M60 50 L70 40 L80 52 M120 44 L128 34 L138 46" />
            <path d="M20 112 C60 104, 100 116, 140 108 S210 104, 232 110" />
            <path d="M150 104 C154 92, 160 92, 162 104 M164 104 C168 88, 176 88, 178 104" />
          </svg>
          <button className="cover-open" onClick={open}>
            open the notebook →
          </button>
          <p className="cover-foot">
            a bucket list that only fills up when you go outside
            <br />
            written by an open model, kept on your own device
          </p>
        </div>
        <div className="cover-back" aria-hidden>
          <p className="endpaper-note">
            if found, please return to
            <span>{value || "someone who went outside"}</span>
          </p>
        </div>
      </div>
    </>
  );
}
