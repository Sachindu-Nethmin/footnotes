"use client";

import { useEffect, useMemo, useState } from "react";
import { FAMILY_LABEL, fmtKm } from "@/lib/geo";
import type { Candidate, Family, Home } from "@/lib/types";
import { Check, FamilyIcon, Plus, Scribble, Writing } from "./doodles";
import type { Go } from "./Notebook";
import type { NotebookApi } from "./useNotebook";
import { photo } from "@/lib/photo";

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This browser can't share a location."));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.message || "Location was not shared.")), {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    });
  });
}

export async function placeName(lat: number, lon: number) {
  try {
    const { results } = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`).then((r) => r.json());
    return (results?.[0]?.label as string) ?? "here";
  } catch {
    return "here";
  }
}

export function Nearby({ nb, go }: { nb: NotebookApi; go: Go }) {
  const [filter, setFilter] = useState<Family | "all">("all");
  const [picking, setPicking] = useState(false);
  const { nearby, nearbyState } = nb;

  const onList = useMemo(() => new Set(nb.places.map((p) => p.id)), [nb.places]);
  const shown = useMemo(
    () => (nearby?.candidates ?? []).filter((c) => filter === "all" || c.family === filter),
    [nearby, filter],
  );
  const families = useMemo(() => [...new Set((nearby?.candidates ?? []).map((c) => c.family))], [nearby]);

  return (
    <section>
      <header className="page-head">
        <p className="page-date">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h2>
          Beautiful places near me
          <Scribble className="scribble" />
        </h2>
      </header>

      {nearby && !picking ? (
        <p className="where">
          near <strong>{nearby.here.label}</strong> · within {nb.settings.radiusKm} km ·{" "}
          <button className="link" onClick={() => setPicking(true)}>
            somewhere else?
          </button>
        </p>
      ) : (
        <WherePicker nb={nb} onDone={() => setPicking(false)} canCancel={Boolean(nearby)} />
      )}

      {nearbyState.loading && <Writing label="asking the open map what's around you…" />}
      {nearbyState.error && <p className="pencil-note error">{nearbyState.error}</p>}

      {nearby && !nearbyState.loading && (
        <>
          {families.length > 1 && (
            <div className="chips" role="group" aria-label="Filter by kind of place">
              {(["all", ...families] as const).map((f) => (
                <button key={f} className={`chip ${filter === f ? "chip-on" : ""}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
                  {f === "all" ? "everything" : FAMILY_LABEL[f]}
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <p className="pencil-note">Nothing on the open map within {nb.settings.radiusKm} km. Try a bigger circle on the inside cover.</p>
          ) : (
            <ul className="polaroids">
              {shown.map((c, i) => (
                <CandidateCard key={c.id} c={c} i={i} added={onList.has(c.id)} onAdd={() => nb.addPlace(c)} onOpen={() => go({ page: "place", id: c.id })} />
              ))}
            </ul>
          )}
          <p className="source-note">
            Places from Wikidata, notes from Wikipedia. Both are open and written by people who actually went. Only a ~1 km blurred version of your location is used to search.
          </p>
        </>
      )}
    </section>
  );
}

function CandidateCard({ c, i, added, onAdd, onOpen }: { c: Candidate; i: number; added: boolean; onAdd: () => void; onOpen: () => void }) {
  const tilt = ((i * 37) % 7) - 3;
  return (
    <li className="polaroid" style={{ "--tilt": `${tilt * 0.6}deg` } as React.CSSProperties}>
      <span className={`tape tape-${i % 3}`} aria-hidden />
      <button className="polaroid-open" onClick={onOpen} title={c.description ?? c.name}>
        <span className="polaroid-photo">
          {c.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo(c.image)} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span className={`sketch fam-${c.family}`}>
              <FamilyIcon family={c.family} size={48} />
            </span>
          )}
        </span>
        <span className="polaroid-caption">
          <span className="polaroid-name">{c.name}</span>
          <span className="typed polaroid-kind">
            {c.kind} · {fmtKm(c.distanceKm)}
          </span>
        </span>
      </button>
      {added ? (
        <button className="mini-btn mini-done" onClick={onOpen} aria-label={`${c.name} is on my list`}>
          <Check size={14} /> on my list
        </button>
      ) : (
        <button className="mini-btn" onClick={onAdd} aria-label={`Add ${c.name} to my list`}>
          <Plus size={14} /> add
        </button>
      )}
    </li>
  );
}

export function WherePicker({ nb, onDone, canCancel }: { nb: NotebookApi; onDone: () => void; canCancel: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<(Home & { full: string })[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 3) return;
    const t = setTimeout(async () => {
      try {
        const { results } = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json());
        setResults(results ?? []);
      } catch {}
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  const useGps = async () => {
    setBusy("Finding you…");
    setErr(null);
    try {
      const pos = await getPosition();
      const { latitude: lat, longitude: lon } = pos.coords;
      const label = await placeName(lat, lon);
      onDone();
      await nb.findNearby({ lat, lon, label });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't get your location.");
    } finally {
      setBusy(null);
    }
  };

  const choose = async (h: Home) => {
    onDone();
    await nb.findNearby({ lat: h.lat, lon: h.lon, label: h.label });
  };

  return (
    <div className="where-picker">
      <p className="hand-q">Where are you starting from?</p>
      <div className="where-row">
        <button className="ink-btn" onClick={useGps} disabled={Boolean(busy)}>
          {busy ?? "use where I am"}
        </button>
        <span className="pencil">or</span>
        <input className="line-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="type a town… (Ella, Kandy, Galle)" aria-label="Town or city" />
        {canCancel && (
          <button className="link" onClick={onDone}>
            never mind
          </button>
        )}
      </div>
      {err && <p className="pencil-note error">{err} You can type a town instead.</p>}
      {results.length > 0 && q.trim().length >= 3 && (
        <ul className="results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button className="link" onClick={() => choose(r)}>
                {r.label}
              </button>{" "}
              <span className="pencil small">{r.full}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
