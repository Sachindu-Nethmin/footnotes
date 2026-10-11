"use client";

import { useEffect, useRef, useState } from "react";
import { distanceKm, fmtKm } from "@/lib/geo";
import { Arrow, FamilyIcon, Scribble, Star, WeatherIcon, Writing } from "./doodles";
import type { Go } from "./Notebook";
import type { NotebookApi } from "./useNotebook";
import { photo } from "@/lib/photo";

export function NextUp({ nb, go }: { nb: NotebookApi; go: Go }) {
  const dreams = nb.places.filter((p) => p.status === "dream");
  const pick = nb.next && dreams.find((p) => p.id === nb.next!.placeId) ? nb.next : null;
  const place = pick ? dreams.find((p) => p.id === pick.placeId) : undefined;
  const [skipped, setSkipped] = useState<string[]>([]);
  const asked = useRef(false);
  const { suggestNext, loadWeather, settings, weather } = nb;

  useEffect(() => {
    if (asked.current || !dreams.length) return;
    asked.current = true;
    if (!pick) void suggestNext();
    else if (settings.home && !weather.length) void loadWeather(settings.home);
  }, [dreams.length, pick, suggestNext, loadWeather, settings.home, weather.length]);

  const another = () => {
    const skip = [...skipped, ...(pick ? [pick.placeId] : [])];
    setSkipped(skip.length >= dreams.length ? [] : skip);
    void suggestNext(skip.length >= dreams.length ? [] : skip);
  };

  const here = nb.settings.home;

  return (
    <section>
      <header className="page-head">
        <p className="page-date">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h2>
          Where next?
          <Scribble className="scribble" />
        </h2>
      </header>

      {dreams.length === 0 ? (
        <div className="empty">
          <p className="hand-q">Nowhere to suggest yet.</p>
          <p className="pencil">
            Add a few places from <button className="link" onClick={() => go({ page: "nearby" })}>Nearby</button> and I&apos;ll pick the best one for this week.
          </p>
          <Arrow className="empty-arrow" />
        </div>
      ) : nb.nextLoading ? (
        <Writing label="Gemma is reading your list and the forecast…" />
      ) : pick && place ? (
        <div className="next">
          <figure className="polaroid polaroid-hero" style={{ "--tilt": "-2deg" } as React.CSSProperties}>
            <span className="tape tape-2" aria-hidden />
            <div className="polaroid-photo">
              {place.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo(place.image, 800)} alt={place.name} referrerPolicy="no-referrer" />
              ) : (
                <div className={`sketch fam-${place.family}`}>
                  <FamilyIcon family={place.family} size={90} />
                </div>
              )}
            </div>
            <figcaption className="pencil">{place.name}</figcaption>
          </figure>

          <p className="next-kicker typed">
            <Star size={16} /> next up · {place.kind}
            {here ? ` · ${fmtKm(distanceKm(here.lat, here.lon, place.lat, place.lon))}` : ""}
          </p>
          <h3 className="next-headline">{pick.headline}</h3>
          <p className="ink">{pick.reason}</p>

          {nb.weather.length > 0 && (
            <div className="forecast" aria-label="Forecast">
              {nb.weather.map((d) => (
                <div key={d.date} className={`day ${pick.bestDay.toLowerCase().includes(d.date.split(" ")[0].toLowerCase()) ? "day-best" : ""}`}>
                  <WeatherIcon code={d.code} />
                  <span className="typed">{d.date}</span>
                  <span className="pencil small">
                    {Math.round(d.tMax)}° · {d.rainProb}% rain
                  </span>
                </div>
              ))}
            </div>
          )}

          {pick.bestDay && (
            <p className="ink">
              <strong className="hand-label">Best day:</strong> {pick.bestDay}
            </p>
          )}

          {pick.bring.length > 0 && (
            <>
              <h3 className="section-title">Bring</h3>
              <ul className="dash-list">
                {pick.bring.map((b, i) => (
                  <li key={i} className="ink">
                    {b}
                  </li>
                ))}
              </ul>
            </>
          )}

          {pick.challenge && (
            <aside className="sticky sticky-pink">
              <span className="sticky-head">your little challenge</span>
              {pick.challenge}
            </aside>
          )}

          <div className="actions">
            <a className="ink-btn ink-red" href={`https://www.openstreetmap.org/directions?to=${place.lat}%2C${place.lon}`} target="_blank" rel="noreferrer">
              let&apos;s go ↗
            </a>
            <button className="ink-btn" onClick={() => go({ page: "place", id: place.id })}>
              open its page
            </button>
            {dreams.length > 1 && (
              <button className="link" onClick={another}>
                not this one, suggest another
              </button>
            )}
          </div>
          <p className="signed pencil">picked by {pick.by}</p>
        </div>
      ) : (
        <button className="ink-btn" onClick={() => suggestNext()}>
          pick my next place
        </button>
      )}
    </section>
  );
}
