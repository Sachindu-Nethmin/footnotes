/**
 * GET /api/img?u=<Wikimedia URL> — the notebook's photos come through its own server, so
 * Wikimedia never sees the reader's browser, and photos still load where only the server can
 * reach the internet. Only Wikimedia image hosts are allowed, including on every redirect hop.
 */
const ALLOWED = new Set(["commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"]);
const UA = process.env.WIKI_USER_AGENT ?? "Footnotes/0.1 (bucket-list notebook)";

export async function GET(req: Request) {
  let target: URL;
  try {
    target = new URL(new URL(req.url).searchParams.get("u") ?? "");
  } catch {
    return new Response("bad url", { status: 400 });
  }
  for (let hop = 0; hop < 4; hop++) {
    if (target.protocol !== "https:" || !ALLOWED.has(target.hostname)) return new Response("not a Wikimedia image", { status: 400 });
    const res = await fetch(target, { headers: { "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!res) return new Response("unreachable", { status: 502 });
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      target = new URL(next, target);
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new Response("no image", { status: 502 });
    return new Response(res.body, { headers: { "content-type": type, "cache-control": "public, max-age=604800, immutable" } });
  }
  return new Response("too many redirects", { status: 502 });
}
