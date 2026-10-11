"use client";

/**
 * Your notebook lives in this browser's IndexedDB, and only there. There is no account and no
 * sync. "Export" hands you the whole thing as one file you own.
 */
import type { Entry, Place, Settings } from "./types";

const DB = "footnotes";
const VERSION = 1;

let opening: Promise<IDBDatabase> | null = null;

function db() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("places")) d.createObjectStore("places", { keyPath: "id" });
      if (!d.objectStoreNames.contains("entries")) d.createObjectStore("entries", { keyPath: "id" }).createIndex("placeId", "placeId");
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const allPlaces = () => run<Place[]>("places", "readonly", (s) => s.getAll());
export const putPlace = (p: Place) => run("places", "readwrite", (s) => s.put(p));
export const deletePlace = (id: string) => run("places", "readwrite", (s) => s.delete(id));

export const allEntries = () => run<Entry[]>("entries", "readonly", (s) => s.getAll());
export const putEntry = (e: Entry) => run("entries", "readwrite", (s) => s.put(e));
export const deleteEntry = (id: string) => run("entries", "readwrite", (s) => s.delete(id));

export const getKV = <T>(key: string) => run<T | undefined>("kv", "readonly", (s) => s.get(key));
export const setKV = (key: string, value: unknown) => run("kv", "readwrite", (s) => s.put(value, key));

export const DEFAULT_SETTINGS: Settings = { name: "", radiusKm: 35, engine: "server" };

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await getKV<Settings>("settings")) ?? {}) };
}

export async function exportNotebook() {
  const [places, entries, settings] = await Promise.all([allPlaces(), allEntries(), loadSettings()]);
  return { app: "footnotes", version: 1, exportedAt: new Date().toISOString(), settings, places, entries };
}

export async function importNotebook(data: { places?: Place[]; entries?: Entry[]; settings?: Settings }) {
  for (const p of data.places ?? []) await putPlace(p);
  for (const e of data.entries ?? []) await putEntry(e);
  if (data.settings) await setKV("settings", data.settings);
}

/** Shrinks a photo to a small JPEG so a whole diary still fits comfortably on a phone. */
export function shrinkPhoto(file: File, max = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
