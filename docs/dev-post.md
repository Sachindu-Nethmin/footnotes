---
title: "Footnotes: a bucket-list notebook that only fills up when you go outside"
published: false
tags: devchallenge, hf26challenge, gemma, opensource
cover_image: https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/cover.png
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

## What I Built

I have a bucket list of places I want to visit, and I wanted it to feel like a real notebook, not another app list. So I built **Footnotes**: a spiral notebook on a wooden desk, with sticky-note tabs, ruled pages, taped polaroids, and pages that actually turn.

![The cover of the Footnotes notebook](https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/01-cover.jpg)

It does four things, and each one is meant to get me out of the chair:

**1. It finds beautiful places near me.** Waterfalls, viewpoints, peaks, temples and old forts come from open data (Wikidata), ranked by how many Wikipedias bothered to write about them, with the places closest to me always included. Around Ella, that's Ravana Falls, the Nine Arches Bridge, Ella Rock and a lot of waterfalls.

![Nearby: beautiful places around Ella, as taped polaroids](https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/02-nearby.jpg)

**2. It fills in each place's page.** When I add a place, Gemma writes its page: why to go, three things to look for when I'm standing there (a checklist I can tick on the spot), the best time, practical tips, and one surprising fact on a sticky note. The Wikipedia text it worked from is clipped onto the page like a newspaper cutting.

![A place page written by Gemma](https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/03-place.jpg)

**3. It tells me where to go next.** Gemma reads my list, what I've already visited and the real 4-day forecast, picks one place, circles the best day, and gives me a small challenge that keeps the phone in my pocket. In a rainy week, it picked the sheltered Nine Arches Bridge.

![Where next? Gemma's pick with the forecast](https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/04-next.jpg)

**4. It turns each trip into a diary I can show someone someday.** When I'm actually there, I press **I'm here!** and, if my phone's GPS agrees, the page gets a red passport stamp. Afterwards the margin interviews me, one question at a time, and Gemma writes the diary page in my own words, addressed to whoever I'll show it to.

![The GPS passport stamp on a phone](https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/05-stamp.jpg)

The diary only has pages for places I've actually been. The screen is the part before I leave and after I'm home.

## Demo

▶ **Watch the 3-minute demo:** [YouTube link]

| The margin interviews you | The diary page Gemma writes |
|---|---|
| ![The margin interviews you about the visit](https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/06-interview.jpg) | ![The diary page Gemma writes from your answers](https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/07-diary.jpg) |

*The answers in these screenshots are demo text I typed while testing. My real pages stay on my laptop.*

## Code

{% github Sachindu-Nethmin/footnotes %}

It runs locally in three commands:

```bash
ollama pull gemma4:e4b
npm install
npm run dev
```

## How I Built It

**The model is Gemma 4 E4B, running on my laptop through Ollama.** Next.js serves the notebook, and its API routes are thin, stateless pass-throughs to `localhost:11434`. There's also a mode where **Gemma 2 2B runs inside the browser tab with WebLLM**, so the notebook works with no model server at all. Every prompt has a no-model fallback (notes straight from Wikipedia, a diary page stitched from your own answers), so the notebook never shows a blank page.

Everything else is open data with no API keys: **Wikidata** (a SPARQL "what's around me" query), **Wikipedia** and **Wikimedia Commons** (notes and photos), **OpenStreetMap Nominatim** (type a town instead of sharing GPS) and **Open-Meteo** (the forecast). The diary lives in the browser's IndexedDB. There's no account and no database, and *download my notebook* gives you one JSON file.

Most of the work was teaching a 4B model to behave, and a few of those lessons surprised me:

- **The storm trek.** In a week of thunderstorms, Gemma suggested a mountain trek "for a dramatic contrast". So safety isn't the model's call any more: if every day in the forecast is stormy, exposed places (peaks, falls, beaches, trails) are removed from the list *before* Gemma sees it. It still chooses and explains; it just can't send me up a mountain into lightning.
- **The rainbow.** The first interviewer asked my test user about "the colours in the rainbow". They'd never mentioned a rainbow. Now the interview follows a fixed plan in code (arriving, the people, the best moment, the senses, food, how it felt, advice, last words). Code decides when to move on and when a short answer deserves a follow-up. Gemma only words the question, building on what was just said. You can also skip a topic or ask for a different question.
- **Small models read the last line.** Even with the plan, Gemma kept asking "Describe…" questions about the mist. The topic instruction was buried in a long system prompt. Moving it to the end of the last message fixed it immediately.
- **Your diary, not the model's.** An unanswered "what was the air like?" turned into "the air was damp and warm" on the diary page. The writing prompt now labels the transcript `ME:` and `MARGIN:`, and a question you didn't answer is not a fact.
- **Fame isn't distance.** Ranking by Wikipedia fame alone let a famous national park 30 km away push Ella Rock, 1.7 km from town, off the list. A second, small-radius query now runs in parallel.

![A page turning: five hinged strips with the ink showing through](https://raw.githubusercontent.com/Sachindu-Nethmin/footnotes/main/docs/images/08-page-turn.jpg)

The notebook is plain CSS and SVG. Ruled lines are a `repeating-linear-gradient`, the spiral is one SVG coil repeated down the spine, and tape is a `clip-path` with ragged edges. Pages don't scroll: content flows into page-sized CSS columns, and you turn them with *next page*, the dog-eared corner, the arrow keys or a swipe. Each turn copies the page into five hinged strips that swing around the spiral, the outer ones lifting first, so the sheet curls instead of flipping like a board. The back of each sheet shows the ink faintly bleeding through, mirrored. (One gotcha: CSS `orphans: 2` kept pushing a whole row of polaroids onto the next page.)

## Why Does Open Innovation Matter?

Because a diary is the most personal thing I've ever asked a model to touch.

A travel diary holds who I was with, what I felt, and photos of the people I love. I want to show mine to someone years from now, not send it to a server today. With an open-weight model, that's simply the default:

- **The words never leave my machine.** The interview and the diary page are written by Gemma on my laptop. With WebLLM, they never even leave the browser tab.
- **My location is blurred before anyone sees it.** It's rounded to about 1 km before it reaches Wikidata, OpenStreetMap or the weather service. The photos come through the notebook's own server, so Wikimedia never sees my browser at all.
- **It costs nothing per page.** A diary is something you keep writing in for years. A metered API would turn every memory into a line on a bill.
- **I can see and change how it behaves.** When the model got something wrong (the rainbow, the storm trek), I could look at exactly what it was given and fix it, or swap in a smaller model for an older laptop. With no model at all, the notebook still works.

A closed API would have written prettier sentences on day one. But I'd be asking people to type their memories into a box that belongs to someone else, and that's not what a diary is.

## My Agent Session

I built Footnotes with an AI coding agent. [Agent session link]

## Prize Categories

- **Best Use of Gemma**: Gemma 4 E4B runs locally through Ollama and writes every place page, the next-place pick, the interview and the diary page. Gemma 2 2B runs in the browser through WebLLM for a no-server mode.
