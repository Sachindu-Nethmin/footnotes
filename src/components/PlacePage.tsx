"use client";

import { useState } from "react";
import { distanceKm, fmtKm } from "@/lib/geo";
import type { Place } from "@/lib/types";
import { FamilyIcon, Pen, Plus, Stamp, Writing } from "./doodles";
import { getPosition } from "./Nearby";
import type { Go } from "./Notebook";
import type { NotebookApi } from "./useNotebook";
import { photo } from "@/lib/photo";

/** Big places (parks, forests) are "here" from further away than a waterfall is. */
const reachKm = (kind: string) => (/park|reserve|protected|forest|valley|trail|mountain/.test(kind) ? 8 : 2.5);

export function PlacePage({ nb, go, id }: { nb: NotebookApi; go: Go; id: string }) {
  const saved = nb.places.find((p) => p.id === id);
  const candidate = nb.nearby?.candidates.find((c) => c.id === id);
  const [ticks, setTicks] = useState<Set<number>>(new Set());
  const [checkin, setCheckin] = useState<{ busy?: boolean; msg?: string; far?: number } | null>(null);

  if (!saved && !candidate) {
    return (
      <section className="empty">
        <p className="hand-q">This page was torn out.</p>
        <button className="link" onClick={() => go({ page: "list" })}>
          back to my list
        </button>
      </section>
    );
  }

  const p = (saved ?? { ...candidate!, addedAt: 0, status: "dream" }) as Place;
  const d = p.details;
  const here = nb.settings.home;
  const away = here ? distanceKm(here.lat, here.lon, p.lat, p.lon) : p.distanceKm;
  const filling = nb.filling.has(p.id);

  const stampIt = async () => {
    setCheckin({ busy: true, msg: "Checking where you are…" });
    try {
      const pos = await getPosition();
      const km = distanceKm(pos.coords.latitude, pos.coords.longitude, p.lat, p.lon);
      if (km <= reachKm(p.kind)) {
        await nb.markVisited(p, true, Math.round(km * 1000));
        setCheckin({ msg: "Stamped! Now tell your diary about it." });
      } else {
        setCheckin({ far: km, msg: `You're ${fmtKm(km)} from ${p.name}. The stamp only works when you're actually there.` });
      }
    } catch (e) {
      setCheckin({ msg: e instanceof Error ? e.message : "Couldn't get your location." });
    }
  };

  const fromMemory = async () => {
    await nb.markVisited(p, false);
    setCheckin(null);
    go({ page: "write", id: p.id });
  };

  const visitDate = p.visit ? new Date(p.visit.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase() : "";
  const entry = nb.entries.find((e) => e.placeId === p.id);

  return (
    <article className="place">
      <button className="link back" onClick={() => go({ page: saved ? "list" : "nearby" })}>
        ← {saved ? "my list" : "nearby"}
      </button>

      <figure className="polaroid polaroid-hero" style={{ "--tilt": "2deg" } as React.CSSProperties}>
        <span className="tape tape-1" aria-hidden />
        <div className="polaroid-photo">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo(p.image, 800)} alt={p.name} referrerPolicy="no-referrer" />
          ) : (
            <div className={`sketch fam-${p.family}`}>
              <FamilyIcon family={p.family} size={90} />
            </div>
          )}
        </div>
        <figcaption className="pencil">{p.name}</figcaption>
      </figure>

      <h2 className="place-title">{p.name}</h2>
      <p className="typed place-meta">
        {p.kind} · {fmtKm(away)} away · {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
      </p>

      {p.visit && (
        <div className="stamp-wrap">
          <Stamp date={visitDate} verified={p.visit.verified} place={p.name} />
        </div>
      )}

      {d ? (
        <>
          <p className="hook">
            <mark>{d.hook}</mark>
          </p>
          <h3 className="section-title">Why go</h3>
          <p className="ink">{d.why}</p>

          {d.lookFor.length > 0 && (
            <>
              <h3 className="section-title">When you&apos;re there, look for</h3>
              <ul className="checklist small-list">
                {d.lookFor.map((item, i) => (
                  <li key={i}>
                    <button
                      className="check-row"
                      aria-pressed={ticks.has(i)}
                      onClick={() =>
                        setTicks((t) => {
                          const n = new Set(t);
                          if (n.has(i)) n.delete(i);
                          else n.add(i);
                          return n;
                        })
                      }
                    >
                      <span className={`box ${ticks.has(i) ? "box-ticked" : ""}`} aria-hidden>
                        {ticks.has(i) ? "✓" : ""}
                      </span>
                      <span className={`ink ${ticks.has(i) ? "struck" : ""}`}>{item}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {d.bestTime && (
            <>
              <h3 className="section-title">Best time</h3>
              <p className="ink">{d.bestTime}</p>
            </>
          )}

          {d.tips.length > 0 && (
            <>
              <h3 className="section-title">Tips</h3>
              <ul className="dash-list">
                {d.tips.map((t, i) => (
                  <li key={i} className="ink">
                    {t}
                  </li>
                ))}
              </ul>
            </>
          )}

          {d.funFact && (
            <aside className="sticky sticky-yellow">
              <span className="sticky-head">did you know?</span>
              {d.funFact}
            </aside>
          )}
          <p className="signed pencil">notes by {d.by}</p>
        </>
      ) : filling ? (
        <Writing label="Gemma is filling in this page…" />
      ) : saved ? (
        <button className="ink-btn" onClick={() => nb.refill(p)}>
          <Pen size={18} /> fill in this page
        </button>
      ) : null}

      {p.extract && (
        <blockquote className="clipping">
          <span className="clip" aria-hidden />
          <p>{p.extract}</p>
          <footer>
            clipped from{" "}
            <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent((p.wiki ?? p.name).replace(/ /g, "_"))}`} target="_blank" rel="noreferrer">
              Wikipedia
            </a>{" "}
            · CC BY-SA
          </footer>
        </blockquote>
      )}

      <div className="actions">
        {!saved ? (
          <button className="ink-btn" onClick={() => nb.addPlace(candidate!)}>
            <Plus size={18} /> add to my list
          </button>
        ) : (
          <>
            <a className="ink-btn" href={`https://www.openstreetmap.org/directions?to=${p.lat}%2C${p.lon}`} target="_blank" rel="noreferrer">
              how to get there ↗
            </a>
            {p.status === "dream" ? (
              <>
                <button className="ink-btn ink-red" onClick={stampIt} disabled={checkin?.busy}>
                  I&apos;m here! stamp it
                </button>
                <button className="link" onClick={fromMemory}>
                  already been? add it from memory
                </button>
              </>
            ) : (
              <button className="ink-btn ink-blue" onClick={() => go(entry?.text ? { page: "entry", id: entry.id } : { page: "write", id: p.id })}>
                <Pen size={18} /> {entry?.text ? "read my diary page" : "write my diary page"}
              </button>
            )}
          </>
        )}
      </div>

      {checkin?.msg && (
        <p className="pencil-note" role="status">
          {checkin.msg}{" "}
          {p.status === "visited" && !entry?.text && (
            <button className="link" onClick={() => go({ page: "write", id: p.id })}>
              write it now →
            </button>
          )}
          {checkin.far !== undefined && (
            <button className="link" onClick={fromMemory}>
              I was there earlier, add it from memory
            </button>
          )}
        </p>
      )}

      {saved && (
        <p className="page-foot">
          {d && (
            <button className="link small" onClick={() => nb.refill({ ...p, details: undefined })} disabled={filling}>
              rewrite these notes
            </button>
          )}
          <button
            className="link small"
            onClick={async () => {
              if (confirm(`Tear ${p.name} out of the notebook?`)) {
                await nb.removePlace(p.id);
                go({ page: "list" });
              }
            }}
          >
            tear this page out
          </button>
        </p>
      )}
    </article>
  );
}
