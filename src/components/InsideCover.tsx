"use client";

import { useEffect, useState } from "react";
import { health, type Health } from "@/lib/ai";
import { browserModelLoaded, checkSupport, loadEngine } from "@/lib/browser-ai";
import * as store from "@/lib/store";
import { Scribble } from "./doodles";
import { WherePicker } from "./Nearby";
import type { Go } from "./Notebook";
import type { NotebookApi } from "./useNotebook";

export function InsideCover({ nb, go }: { nb: NotebookApi; go: Go }) {
  const s = nb.settings;
  const [h, setH] = useState<Health | null | undefined>(undefined);
  const [webllm, setWebllm] = useState<string | null>(browserModelLoaded() ? "loaded and ready" : null);
  const [moving, setMoving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    health().then(setH);
  }, []);

  const loadBrowser = async () => {
    const sup = await checkSupport();
    if (!sup.ok) return setWebllm(`not available: ${sup.reason}`);
    setWebllm("starting…");
    try {
      await loadEngine(sup.modelId, (r) => setWebllm(`${Math.round(r.progress * 100)}% · ${r.text.split(".")[0]}`));
      setWebllm("loaded and ready");
      await nb.saveSettings({ engine: "browser" });
    } catch (e) {
      setWebllm(`couldn't load: ${e instanceof Error ? e.message : e}`);
    }
  };

  const download = async () => {
    const data = await store.exportNotebook();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `footnotes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upload = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== "footnotes") throw new Error("not a Footnotes file");
      await store.importNotebook(data);
      await nb.reload();
      setMsg(`Imported ${data.places?.length ?? 0} places and ${data.entries?.length ?? 0} diary pages.`);
    } catch (e) {
      setMsg(`Couldn't import: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <section className="inside">
      <header className="page-head">
        <p className="page-date">inside cover</p>
        <h2>
          If found, please return to
          <Scribble className="scribble" />
        </h2>
      </header>

      <label className="field">
        <span className="hand-label">my name</span>
        <input className="line-input big" value={s.name} onChange={(e) => nb.saveSettings({ name: e.target.value })} placeholder="your name" maxLength={40} />
      </label>

      <div className="field">
        <span className="hand-label">starting point</span>
        {moving ? (
          <WherePicker nb={nb} onDone={() => (setMoving(false), go({ page: "nearby" }))} canCancel />
        ) : (
          <p className="ink">
            {s.home ? `near ${s.home.label}` : "not set yet"}{" "}
            <button className="link" onClick={() => setMoving(true)}>
              change
            </button>
          </p>
        )}
      </div>

      <label className="field">
        <span className="hand-label">how far I&apos;ll go: {s.radiusKm} km</span>
        <input type="range" min={10} max={80} step={5} value={s.radiusKm} onChange={(e) => nb.saveSettings({ radiusKm: Number(e.target.value) })} />
      </label>

      <fieldset className="field engines">
        <legend className="hand-label">who does the writing</legend>
        <label className={`engine ${s.engine === "server" ? "engine-on" : ""}`}>
          <input type="radio" name="engine" checked={s.engine === "server"} onChange={() => nb.saveSettings({ engine: "server" })} />
          <span>
            <strong>Gemma on this computer</strong>
            <span className="pencil small">
              {h === undefined
                ? "checking…"
                : h?.modelReady
                  ? `${h.model}: running ✓`
                  : h
                    ? `${h.model}: not answering. Start it with \`ollama run ${h.model.split(" ")[0]}\``
                    : "the notebook server isn't reachable"}
            </span>
          </span>
        </label>
        <label className={`engine ${s.engine === "browser" ? "engine-on" : ""}`}>
          <input
            type="radio"
            name="engine"
            checked={s.engine === "browser"}
            onChange={() => (browserModelLoaded() ? nb.saveSettings({ engine: "browser" }) : loadBrowser())}
          />
          <span>
            <strong>Gemma inside this browser</strong>
            <span className="pencil small">{webllm ?? "Gemma 2 2B via WebLLM. About 1.5 GB to download once; after that your words never leave this tab."}</span>
          </span>
        </label>
        <p className="pencil small">With no model at all, the notebook still works: notes come straight from Wikipedia and your diary page is stitched from your own answers.</p>
      </fieldset>

      <h3 className="section-title">What leaves this notebook</h3>
      <table className="ledger">
        <tbody>
          <tr>
            <td>Wikidata, Wikipedia, OpenStreetMap, Open-Meteo</td>
            <td>your location, blurred to about 1 km, to find places and weather</td>
          </tr>
          <tr>
            <td>The open model</td>
            <td>place facts and your diary chat, but it runs on your own machine or inside this browser</td>
          </tr>
          <tr>
            <td>Anyone else</td>
            <td>nothing. No account, no analytics, no cloud copy. The notebook lives in this browser&apos;s storage.</td>
          </tr>
        </tbody>
      </table>

      <h3 className="section-title">Keep it safe</h3>
      <div className="actions">
        <button className="ink-btn" onClick={download}>
          download my notebook
        </button>
        <label className="ink-btn file-btn">
          bring a notebook back
          <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <button
          className="link small"
          onClick={async () => {
            if (!confirm("Erase every place and diary page in this browser? Download a copy first if you want to keep them.")) return;
            indexedDB.deleteDatabase("footnotes");
            location.hash = "";
            location.reload();
          }}
        >
          erase this notebook
        </button>
      </div>
      {msg && <p className="pencil-note">{msg}</p>}
    </section>
  );
}
