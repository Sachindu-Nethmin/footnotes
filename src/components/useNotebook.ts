"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fillDetails, health, pickNext } from "@/lib/ai";
import { distanceKm } from "@/lib/geo";
import * as store from "@/lib/store";
import type { Candidate, Entry, Home, NextPick, Place, Settings, WeatherDay } from "@/lib/types";

export type Nearby = { here: Home; candidates: Candidate[]; at: number };

/** "today", "yesterday", "5 days ago": small models misread raw dates. */
function ago(t: number) {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : new Date(t).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function useNotebook() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(store.DEFAULT_SETTINGS);
  const [places, setPlaces] = useState<Place[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [nearbyState, setNearbyState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [filling, setFilling] = useState<Set<string>>(new Set());
  const [next, setNext] = useState<NextPick | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const settingsRef = useRef(settings);
  // The latest version of every place, updated the moment it's saved (state lags a render).
  const placesRef = useRef<Place[]>([]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    (async () => {
      const [s, p, e, n, pick] = await Promise.all([
        store.loadSettings(),
        store.allPlaces(),
        store.allEntries(),
        store.getKV<Nearby>("nearby"),
        store.getKV<NextPick>("next"),
      ]);
      // A copy hosted with LLM_PROVIDER=browser has no server model: write with in-browser Gemma.
      const h = await health();
      if (h?.provider === "browser" && s.engine === "server") s.engine = "browser";
      setSettings(s);
      placesRef.current = p;
      setPlaces(p);
      setEntries(e);
      if (n) setNearby(n);
      if (pick) setNext(pick);
      setReady(true);
    })().catch((err) => {
      console.error("notebook failed to open", err);
      setReady(true);
    });
  }, []);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const s = { ...settingsRef.current, ...patch };
    settingsRef.current = s;
    setSettings(s);
    await store.setKV("settings", s);
  }, []);

  const savePlace = useCallback(async (p: Place) => {
    placesRef.current = [...placesRef.current.filter((x) => x.id !== p.id), p];
    setPlaces((all) => [...all.filter((x) => x.id !== p.id), p]);
    await store.putPlace(p);
  }, []);

  /**
   * Merge a change into the place as it is *now*. Notes written in the background take a few
   * seconds; saving a stale copy would undo a visit stamped meanwhile, or bring back a place
   * that was torn out.
   */
  const patchPlace = useCallback(
    async (id: string, patch: Partial<Place>) => {
      const current = placesRef.current.find((x) => x.id === id);
      if (!current) return null;
      const next = { ...current, ...patch };
      await savePlace(next);
      return next;
    },
    [savePlace],
  );

  // ─── nearby ───
  const findNearby = useCallback(
    async (here: Home) => {
      setNearbyState({ loading: true });
      try {
        const r = settingsRef.current.radiusKm;
        const res = await fetch(`/api/places?lat=${here.lat}&lon=${here.lon}&r=${r}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "lookup failed");
        const n: Nearby = { here, candidates: data.places, at: Date.now() };
        setNearby(n);
        await store.setKV("nearby", n);
        await saveSettings({ home: here });
        setNearbyState({ loading: false });
      } catch (err) {
        setNearbyState({ loading: false, error: err instanceof Error ? err.message : "lookup failed" });
      }
    },
    [saveSettings],
  );

  // ─── bucket list ───
  const fill = useCallback(
    async (p: Place) => {
      setFilling((s) => new Set(s).add(p.id));
      try {
        let place: Place | null = p;
        if (p.wiki && !p.extract) {
          const sum = await fetch(`/api/place?title=${encodeURIComponent(p.wiki)}`).then((r) => r.json()).catch(() => ({}));
          place = await patchPlace(p.id, { extract: sum.extract, image: p.image ?? sum.image, description: p.description ?? sum.description });
          if (!place) return; // torn out while we were reading Wikipedia
        }
        const details = await fillDetails(settingsRef.current.engine, place);
        await patchPlace(p.id, { details });
      } finally {
        setFilling((s) => {
          const n = new Set(s);
          n.delete(p.id);
          return n;
        });
      }
    },
    [patchPlace],
  );

  const addPlace = useCallback(
    async (c: Candidate) => {
      const p: Place = { ...c, addedAt: Date.now(), status: "dream" };
      await savePlace(p);
      void fill(p);
      return p;
    },
    [fill, savePlace],
  );

  // A page whose notes were interrupted (tab closed mid-write) gets finished on the next open.
  const resumed = useRef(false);
  useEffect(() => {
    if (!ready || resumed.current) return;
    resumed.current = true;
    const missing = places.filter((p) => !p.details);
    void (async () => {
      for (const p of missing) await fill(p);
    })();
  }, [ready, places, fill]);

  const removePlace = useCallback(async (id: string) => {
    placesRef.current = placesRef.current.filter((p) => p.id !== id);
    setPlaces((all) => all.filter((p) => p.id !== id));
    await store.deletePlace(id);
  }, []);

  const markVisited = useCallback(
    async (p: Place, verified: boolean, distanceM?: number) => {
      let wx: string | undefined;
      try {
        const days: WeatherDay[] = (await fetch(`/api/weather?lat=${p.lat}&lon=${p.lon}`).then((r) => r.json())).days;
        const d = days?.[0];
        if (d) wx = `${d.label.toLowerCase()}, ${Math.round(d.tMin)}–${Math.round(d.tMax)}°C`;
      } catch {}
      return patchPlace(p.id, { status: "visited", visit: { at: Date.now(), verified, distanceM, weather: wx } });
    },
    [patchPlace],
  );

  // ─── where next ───
  const loadWeather = useCallback(async (at: Home) => {
    try {
      const days: WeatherDay[] = (await fetch(`/api/weather?lat=${at.lat}&lon=${at.lon}`).then((r) => r.json())).days ?? [];
      setWeather(days);
      return days;
    } catch {
      return [];
    }
  }, []);

  const suggestNext = useCallback(
    async (exclude: string[] = []) => {
      const here = settingsRef.current.home;
      const dreams = places.filter((p) => p.status === "dream" && !exclude.includes(p.id));
      if (!dreams.length) return setNext(null);
      setNextLoading(true);
      try {
        const days = here ? await loadWeather(here) : [];
        const pick = await pickNext(settingsRef.current.engine, {
          now: new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          places: dreams
            .map((p) => ({
              id: p.id,
              name: p.name,
              kind: p.kind,
              family: p.family,
              description: p.description,
              distanceKm: here ? Math.round(distanceKm(here.lat, here.lon, p.lat, p.lon) * 10) / 10 : p.distanceKm,
            }))
            .sort((a, b) => a.distanceKm - b.distanceKm),
          visited: places
            .filter((p) => p.status === "visited" && p.visit)
            .sort((a, b) => b.visit!.at - a.visit!.at)
            .slice(0, 8)
            .map((p) => ({ name: p.name, kind: p.kind, when: ago(p.visit!.at) })),
          weather: days,
        });
        setNext(pick);
        await store.setKV("next", pick);
      } finally {
        setNextLoading(false);
      }
    },
    [places, loadWeather],
  );

  // ─── diary ───
  const saveEntry = useCallback(async (e: Entry) => {
    setEntries((all) => [...all.filter((x) => x.id !== e.id), e]);
    await store.putEntry(e);
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    setEntries((all) => all.filter((e) => e.id !== id));
    await store.deleteEntry(id);
  }, []);

  const reload = useCallback(async () => {
    const [s, p, e] = await Promise.all([store.loadSettings(), store.allPlaces(), store.allEntries()]);
    setSettings(s);
    placesRef.current = p;
    setPlaces(p);
    setEntries(e);
  }, []);

  return {
    ready,
    settings,
    saveSettings,
    places,
    entries,
    nearby,
    nearbyState,
    findNearby,
    addPlace,
    savePlace,
    removePlace,
    refill: fill,
    filling,
    markVisited,
    next,
    nextLoading,
    suggestNext,
    weather,
    loadWeather,
    saveEntry,
    removeEntry,
    reload,
  };
}

export type NotebookApi = ReturnType<typeof useNotebook>;
