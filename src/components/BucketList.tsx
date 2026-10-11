"use client";

import { distanceKm, fmtKm } from "@/lib/geo";
import type { Place } from "@/lib/types";
import { Arrow, Check, FamilyIcon, Scribble, Star } from "./doodles";
import type { Go } from "./Notebook";
import type { NotebookApi } from "./useNotebook";

export function BucketList({ nb, go }: { nb: NotebookApi; go: Go }) {
  const here = nb.settings.home;
  const away = (p: Place) => (here ? distanceKm(here.lat, here.lon, p.lat, p.lon) : p.distanceKm);
  const dreams = nb.places.filter((p) => p.status === "dream").sort((a, b) => away(a) - away(b));
  const been = nb.places.filter((p) => p.status === "visited").sort((a, b) => (b.visit?.at ?? 0) - (a.visit?.at ?? 0));
  const total = dreams.length + been.length;

  return (
    <section>
      <header className="page-head">
        <p className="page-date">{total ? `${been.length} of ${total} done` : "a fresh page"}</p>
        <h2>
          My bucket list
          <Scribble className="scribble" />
        </h2>
      </header>

      {total === 0 && (
        <div className="empty">
          <p className="hand-q">Nothing on the list yet.</p>
          <p className="pencil">
            Turn to <button className="link" onClick={() => go({ page: "nearby" })}>Nearby</button> and add a few places you&apos;ve always meant to see.
          </p>
          <Arrow className="empty-arrow" />
        </div>
      )}

      {dreams.length > 0 && (
        <>
          <h3 className="section-title">Someday</h3>
          <ol className="checklist">
            {dreams.map((p) => (
              <li key={p.id}>
                <button className="check-row" onClick={() => go({ page: "place", id: p.id })}>
                  <span className="box" aria-hidden />
                  <span className="check-name">{p.name}</span>
                  <span className="check-meta typed">
                    {p.kind} · {fmtKm(away(p))}
                  </span>
                  {nb.filling.has(p.id) && <span className="check-meta pencil">· notes coming…</span>}
                  {nb.next?.placeId === p.id && (
                    <span className="next-flag">
                      <Star size={16} /> next
                    </span>
                  )}
                  <FamilyIcon family={p.family} size={22} className="check-icon" />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {been.length > 0 && (
        <>
          <h3 className="section-title">Been there</h3>
          <ol className="checklist done">
            {been.map((p) => {
              const entry = nb.entries.find((e) => e.placeId === p.id && e.text);
              return (
                <li key={p.id}>
                  <button className="check-row" onClick={() => go(entry ? { page: "entry", id: entry.id } : { page: "place", id: p.id })}>
                    <span className="box box-ticked" aria-hidden>
                      <Check size={20} />
                    </span>
                    <span className="check-name struck">{p.name}</span>
                    <span className="check-meta typed">
                      {p.visit ? new Date(p.visit.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                      {p.visit?.verified ? " · stamped on the spot" : ""}
                    </span>
                    {entry ? <span className="check-meta pencil">· diary page ✎</span> : <span className="check-meta pencil">· no diary page yet</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
