/* Oura OAuth pass-through worker.
 *
 * Privacy contract (mirrored in try.html's PrivacyVault — keep them in sync):
 * this worker exchanges the OAuth code, fetches the last 7 days of readiness,
 * hands the scores to the browser in a URL FRAGMENT (never sent back to any
 * server), and forgets everything. No KV, no DO, no D1, no storage of any
 * kind. The access token lives only inside one callback invocation.
 *
 * Never console.log payloads, tokens, or fragments — observability is on and
 * logs must stay score-free.
 *
 * Secrets (wrangler secret put / .dev.vars): OURA_CLIENT_ID,
 * OURA_CLIENT_SECRET, OURA_STATE_SECRET (random 32+ chars, HMAC key only).
 */

import { manualSubmit } from "./submit.js";

const OURA_AUTH = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN = "https://api.ouraring.com/oauth/token";
const OURA_READINESS = "https://api.ouraring.com/v2/usercollection/daily_readiness";
const STATE_TTL_MS = 10 * 60 * 1000;

const enc = new TextEncoder();

function b64url(buf) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/* __Host- requires Secure, which requires https; plain name keeps
   wrangler dev on http://localhost working in every browser. */
function cookieName(origin) {
  return origin.startsWith("https") ? "__Host-oura_state" : "oura_state";
}
function cookieAttrs(origin) {
  return origin.startsWith("https")
    ? "; Path=/; Secure; HttpOnly; SameSite=Lax"
    : "; Path=/; HttpOnly; SameSite=Lax";
}

function getCookie(request, name) {
  const h = request.headers.get("Cookie") || "";
  const m = h.match(new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]+)"));
  return m ? m[1] : null;
}

function backToTry(origin, hash, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  headers.set("Location", origin + "/try" + hash);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}

async function start(request, env) {
  const origin = new URL(request.url).origin;
  if (!env.OURA_CLIENT_ID || !env.OURA_CLIENT_SECRET || !env.OURA_STATE_SECRET) {
    return backToTry(origin, "#oura-error=config");
  }
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const ts = Date.now().toString();
  const sig = await hmac(nonce + "." + ts, env.OURA_STATE_SECRET);
  const auth = new URL(OURA_AUTH);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", env.OURA_CLIENT_ID);
  auth.searchParams.set("redirect_uri", origin + "/auth/oura/callback");
  auth.searchParams.set("scope", "daily personal");
  auth.searchParams.set("state", nonce + "." + ts + "." + sig);
  return new Response(null, {
    status: 302,
    headers: {
      "Location": auth.toString(),
      "Set-Cookie": cookieName(origin) + "=" + nonce + cookieAttrs(origin) + "; Max-Age=600",
      "Cache-Control": "no-store",
    },
  });
}

async function callback(request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  const clearCookie = { "Set-Cookie": cookieName(origin) + "=" + cookieAttrs(origin) + "; Max-Age=0" };
  if (!env.OURA_CLIENT_ID || !env.OURA_CLIENT_SECRET || !env.OURA_STATE_SECRET) {
    return backToTry(origin, "#oura-error=config", clearCookie);
  }
  if (url.searchParams.get("error")) return backToTry(origin, "#oura-error=denied", clearCookie);

  const code = url.searchParams.get("code");
  const parts = (url.searchParams.get("state") || "").split(".");
  if (!code || parts.length !== 3) return backToTry(origin, "#oura-error=state", clearCookie);
  const nonce = parts[0], ts = parts[1], sig = parts[2];
  const expected = await hmac(nonce + "." + ts, env.OURA_STATE_SECRET);
  const fresh = Date.now() - Number(ts) < STATE_TTL_MS;
  const cookieOk = getCookie(request, cookieName(origin)) === nonce;
  if (sig !== expected || !fresh || !cookieOk) return backToTry(origin, "#oura-error=state", clearCookie);

  const tokenRes = await fetch(OURA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: origin + "/auth/oura/callback",
      client_id: env.OURA_CLIENT_ID,
      client_secret: env.OURA_CLIENT_SECRET,
    }),
  });
  if (!tokenRes.ok) return backToTry(origin, "#oura-error=exchange", clearCookie);
  const token = await tokenRes.json();

  const iso = (d) => d.toISOString().slice(0, 10);
  const dataRes = await fetch(
    OURA_READINESS + "?start_date=" + iso(new Date(Date.now() - 6 * 864e5)) + "&end_date=" + iso(new Date()),
    { headers: { Authorization: "Bearer " + token.access_token } }
  );
  // access token goes out of scope here — nothing is persisted anywhere
  if (!dataRes.ok) return backToTry(origin, "#oura-error=exchange", clearCookie);
  const data = await dataRes.json();
  const rows = (data.data || [])
    .filter((r) => typeof r.score === "number" && r.day)
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!rows.length) return backToTry(origin, "#oura-error=nodata", clearCookie);

  const latest = rows[rows.length - 1];
  const payload = {
    v: 1,
    provider: "oura",
    score: latest.score,
    day: latest.day,
    baseline: rows.map((r) => ({ day: r.day, score: r.score })),
    ts: Date.now(),
  };
  return backToTry(origin, "#oura=" + b64url(enc.encode(JSON.stringify(payload))), clearCookie);
}

/* Outreach-friendly short routes (assets match first, so these only fire when
   no static file exists at the path). 302 so they stay repointable. */
const SHORTLINKS = {
  "/submit": "/mvp/submit.html",
  "/passport": "/mvp/passport.html",
  "/challenges": "/mvp/challenges.html",
  "/squads": "/mvp/squads.html",
  "/board": "/mvp/",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/auth/oura/start") return start(request, env);
    if (pathname === "/auth/oura/callback") return callback(request, env);
    if (pathname === "/api/manual-submit") return manualSubmit(request, env);
    if (SHORTLINKS[pathname]) return Response.redirect(url.origin + SHORTLINKS[pathname] + url.search, 302);
    // /p/<handle-or-code> — public Body Passport (renders live from board.json)
    if (pathname.startsWith("/p/") && pathname.length > 3) {
      const u = decodeURIComponent(pathname.slice(3));
      return Response.redirect(url.origin + "/mvp/passport.html?u=" + encodeURIComponent(u), 302);
    }
    return env.ASSETS.fetch(request);
  },
};
