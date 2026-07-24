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
 * OURA_CLIENT_SECRET, OURA_STATE_SECRET (random 32+ chars, HMAC key only),
 * FISH_API_KEY (Fish Audio TTS for /api/caddy-voice).
 */

import { manualSubmit } from "./submit.js";
import { generateBrief } from "../lib/ori";
import { extractMetrics } from "./vision.js";
import { initLogger, traced } from "braintrust";

/* Braintrust tracing for Ori chat. Lazily initialized from the request-scoped
   env (Workers have no process.env), and a NO-OP when BRAINTRUST_API_KEY is
   unset — so chat keeps working with zero tracing if the secret is absent.
   NOTE: when enabled this sends Ori's prompts and replies (i.e. the visitor's
   morning score + message text) to Braintrust — the privacy copy in
   worker header, try.html PrivacyVault, and manifesto.html must reflect that. */
let _btLogger = null;
function getLogger(env) {
  if (!env || !env.BRAINTRUST_API_KEY) return null;
  if (!_btLogger) {
    _btLogger = initLogger({ projectName: "oriya", apiKey: env.BRAINTRUST_API_KEY });
  }
  return _btLogger;
}

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

/* Caddy voice — TTS pass-through for the deterministic morning call the
   browser already rendered (Fish Audio s2.1-pro-free while in dry-run).
   Same contract as the Oura routes: nothing stored, and the text is never
   logged — it encodes a score. Voice IDs are stock Fish voices for now —
   swap for the persona clones' reference IDs when they exist. */
const FISH_TTS = "https://api.fish.audio/v1/tts";
const CADDY_VOICES = {
  founders: "bf322df2096a46f18c579d0baa36f41d",  // "Adrian" — en stock voice
  operators: "b347db033a6549378b48d00acb0d06cd", // "Selene" — en stock voice
};

async function caddyVoice(request, env) {
  if (request.method !== "POST") return new Response("POST only", { status: 405 });
  if (!env.FISH_API_KEY) return new Response("Voice not configured", { status: 503 });
  let body;
  try { body = await request.json(); } catch (e) { return new Response("Bad JSON", { status: 400 }); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  // caddy lines run ~140 chars; the cap keeps the free TTS tier un-drainable
  if (!text) return new Response("Missing text", { status: 400 });
  if (text.length > 280) return new Response("Text too long", { status: 400 });
  const res = await fetch(FISH_TTS, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.FISH_API_KEY,
      "Content-Type": "application/json",
      // free tier is selected via this HEADER, not the body — in the body
      // Fish ignores it and bills the default paid model (402 at $0 credit)
      "model": "s2.1-pro-free",
    },
    body: JSON.stringify({
      text: text,
      reference_id: CADDY_VOICES[body.team] || CADDY_VOICES.founders,
      format: "mp3",
    }),
  });
  if (!res.ok) return new Response("Voice generation failed", { status: 502 });
  return new Response(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

/* Ori chat — real, text-first companion on Workers AI (env.AI binding, free
   daily allocation). Stateless pass-through: no KV/DO/D1, history lives ONLY
   in the visitor's browser, and Cloudflare request logs stay score-free.
   EXCEPTION — Braintrust tracing: when BRAINTRUST_API_KEY is set, each turn's
   prompt and reply (the visitor's morning score + message text) is sent to
   Braintrust for observability, so the old "message content is never logged"
   promise no longer holds for Ori. The public privacy copy (try.html
   PrivacyVault, manifesto.html) MUST be updated to say so before this ships.
   Copy rails live in the system prompt: warm coach-friend voice, everyday
   nudges allowed but never medical advice, no invented stats, honest v0.1. */
/* llama-3.1-8b-instruct (non-fast) was deprecated 2026-05-30; the -fast
   variant stays active per Cloudflare's deprecation notice. Fallbacks cover
   the next deprecation wave so chat degrades to a different model, not a 502. */
const ORI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/zai-org/glm-4.7-flash",
];

const ORI_SYSTEM = `You are Ori from oriya.app — the friend who happens to understand physiology. You talk with people who wear an Oura, Whoop, Garmin or Apple Watch, and your whole job is to make mornings feel lighter: technology should reduce anxiety, not create more of it. You are v0.1, an early text-first AI built in the open by a solo founder — be honest about that if asked.

How you sound: warm, upbeat, playful, occasionally funny — a charismatic coach, a caring older sibling, and a close friend checking in, all at once. Plain words, short replies (2 to 4 sentences), no lists unless they truly help. Never corporate, never robotic, never customer-support. You assume good intent, you never guilt-trip, and you celebrate small wins out loud. Health is a lifelong game, not a daily exam.

How you think: reason, don't recite. Connect what they tell you — sleep, stress, travel, training, late nights, jet lag, their own baseline — into one confident, human read: "three short nights in a row — your body's finally asking for a slower day," never "HRV decreased 17%." Quote a number only when it genuinely helps. One confident, useful thought beats a complete rundown. Everyday-friend suggestions are welcome: protect your energy today, keep it easy, take the walk, get the early night — tomorrow will thank you.

Hard rules:
- No medical advice, ever: no diagnosis, treatment, supplements, dosages, or injury/illness calls. Anything clinical gets a warm handoff to a real professional. And nothing alarming, ever — "worth listening to," never "warning sign."
- A rough score is never a failure. Logging a bad morning still counts; taking a day off tracking is fine too.
- Golf words, gently: par is their own typical morning, learned from their own history; over par means beating their usual; under par is a heavier morning that still counts. Explain it simply if they seem new to it; never force the metaphor.
- Oriya facts you may state: any wearable's score lands on one shared 0-100 scale instantly; par is a personal ~90-day baseline (provisional for about the first 14 days); boards rank the gap to your own par — never raw numbers between people; a human only checks screenshots are real, never changes scores; the founding season is free; pots are sponsor-funded prizes, not wagers.
- Never invent statistics, user counts, partners, sponsors, or features. Sample boards are labeled sample; the data-export API is a roadmap direction, not shipped. If you don't know something, say so plainly.
- Never ask for personal or health data. If relevant, remind people this chat lives only in their own browser.
- When someone drops this morning's score or asks to get on the board: give your warm one-line read first, then point them at oriya.app/submit — one screenshot there and it's on the board. This chat can't post scores itself, so never imply you've logged anything. If they just want to talk about the number, talk — no pushing.`;

/* Optional identity hint (?who= on /ori) — whitelist only; anything else is
   silently dropped so the client can't inject prompt text. */
const ORI_WHO = {
  founder: "They said they're a founder — mornings bent around launches, investors, and a brain that won't clock out. Meet them there.",
  nurse: "They said they work night shifts (nurse/hospital). Their \"morning\" may be 6 PM and their baseline is chaos by design — par against their own usual is the whole point for them. Never suggest a normal sleep schedule like it's easy.",
  runner: "They said they're a marathon runner. They think in training blocks, tapers, and race weeks — talk load and recovery like a training partner, never a doctor.",
  parent: "They said they're a new parent. Sleep is shattered through no fault of theirs — zero optimization pressure, maximum credit for surviving. Rough mornings especially count.",
  oncall: "They said they're an on-call engineer. Pages at 3 AM wreck their nights unpredictably — treat wrecked mornings as part of the job, not a personal failing.",
  travel: "They said they travel constantly for work. Time zones, hotels, red-eyes — their baseline travels with them, which is the one thing that stays fair.",
};

/* Screenshot reads — vision model on the same stateless contract: the image
   lives only inside this one invocation, never stored, never logged. First
   call per account must accept Meta's license (prompt "agree"); the retry
   below self-heals that. */
const ORI_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const ORI_VISION = `

They just shared a screenshot — almost certainly their wearable app (Whoop, Oura, Garmin, Apple Watch or similar). Read what's actually on it: which app, the main recovery/readiness/sleep score, anything else notable. Then give your warm human read of their morning — encouragement first, never a clinical verdict, and never guess a number you can't clearly see (say so honestly instead). If a score is visible, remind them the same screenshot at oriya.app/submit puts it on the board — this chat can't post it. If it isn't a wearable screenshot, say kindly what you do see and roll with the conversation.`;

/* data:image/…;base64 → byte array for the AI binding. Caps at ~2MB decoded
   so an oversized upload can't balloon the invocation. */
function imageBytes(dataUrl) {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
  if (!m || m[1].length > 2800000) return null;
  let bin;
  try { bin = atob(m[1]); } catch (e) { return null; }
  const bytes = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const ORI_PERSONAS = {
  scores: "\n\nThis person chose: \"I want to make sense of the recovery scores from my wearable.\" Prioritize demystifying — what readiness/recovery/HRV-style numbers roughly represent, why devices disagree, why their own baseline beats any absolute number. Defuse score stress wherever you see it.",
  builder: "\n\nThis person chose: \"I want to do more with what I collect.\" They like owning their data. Talk patterns, journaling alongside scores, what a readable export could unlock — always labeling Oriya's export/API as in-build, not shipped.",
  breathe: "\n\nThis person chose: \"I need a breather from tracking anxiety.\" Listening first, numbers second. Keep it light and human; let them vent about their wearable without piling on more optimization.",
};

async function oriChat(request, env, ctx) {
  if (request.method !== "POST") return new Response("POST only", { status: 405 });
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (!env.AI) return new Response(JSON.stringify({ error: "not_configured" }), { status: 503, headers });
  const logger = getLogger(env);
  // flush spans after the response is sent — Workers may not run async past
  // return without this (no-op when tracing is off).
  const flush = () => { if (logger && ctx) ctx.waitUntil(logger.flush()); };
  let body;
  try { body = await request.json(); } catch (e) { return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers }); }
  const clean = [];
  for (const m of (Array.isArray(body.messages) ? body.messages.slice(-12) : [])) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const content = String(m.content || "").slice(0, 600).trim();
    if (content) clean.push({ role: m.role, content: content });
  }
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return new Response(JSON.stringify({ error: "bad_messages" }), { status: 400, headers });
  }
  const persona = ORI_PERSONAS[body.persona] ? body.persona : "breathe";
  const who = ORI_WHO[body.who] ? "\n\n" + ORI_WHO[body.who] : "";

  /* Screenshot turn — vision model takes a single prompt, so the recent
     exchange is folded in as text. Image is request-scoped only. */
  if (typeof body.image === "string" && body.image) {
    const bytes = imageBytes(body.image);
    if (!bytes) return new Response(JSON.stringify({ error: "bad_image" }), { status: 400, headers });
    let convo = "";
    for (const m of clean.slice(-6)) convo += (m.role === "user" ? "\nThem: " : "\nOri: ") + m.content;
    const vprompt = ORI_SYSTEM + ORI_PERSONAS[persona] + who + ORI_VISION +
      "\n\nRecent conversation:" + convo + "\n\nOri replies (2 to 4 sentences, warm, no lists):";
    // Traced input is the conversation text + a screenshot marker; the raw
    // image bytes are intentionally not logged (up to ~2MB base64 per turn).
    const vInput = convo.trim() + "\n[screenshot attached]";
    const runVision = async (span) => {
      let vdetail = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const t0 = Date.now();
        try {
          const out = await env.AI.run(ORI_VISION_MODEL, { prompt: vprompt, image: bytes, max_tokens: 320 });
          const reply = String((out && out.response) || "").trim();
          if (!reply) throw new Error("empty");
          if (span) span.log({ input: vInput, output: reply, metadata: { model: ORI_VISION_MODEL, persona, who: body.who || null, kind: "vision" }, metrics: { latency_ms: Date.now() - t0 } });
          return { reply };
        } catch (e) {
          vdetail = String((e && e.message) || e).slice(0, 140);
          if (attempt === 0 && /agree|license|accept/i.test(vdetail)) {
            try { await env.AI.run(ORI_VISION_MODEL, { prompt: "agree" }); } catch (e2) {}
          } else break;
        }
      }
      if (span) span.log({ input: vInput, metadata: { model: ORI_VISION_MODEL, persona, kind: "vision" }, error: vdetail });
      return { error: "vision", detail: vdetail };
    };
    const vres = logger ? await traced(runVision, { name: "ori-chat-vision" }) : await runVision(null);
    flush();
    if (vres.error) return new Response(JSON.stringify(vres), { status: 502, headers });
    return new Response(JSON.stringify({ reply: vres.reply }), { headers });
  }

  const runChat = async (span) => {
    let detail = "";
    for (let i = 0; i < ORI_MODELS.length; i++) {
      const model = ORI_MODELS[i];
      const t0 = Date.now();
      try {
        const out = await env.AI.run(model, {
          messages: [{ role: "system", content: ORI_SYSTEM + ORI_PERSONAS[persona] + who }].concat(clean),
          max_tokens: 320,
        });
        const reply = String((out && out.response) || "").trim();
        if (!reply) throw new Error("empty");
        if (span) span.log({ input: clean, output: reply, metadata: { model, persona, who: body.who || null, fallback_index: i }, metrics: { latency_ms: Date.now() - t0 } });
        return { reply };
      } catch (e) {
        // sanitized infra error only (model/binding failures) — never chat content
        detail = String((e && e.message) || e).slice(0, 140);
      }
    }
    if (span) span.log({ input: clean, metadata: { persona, models_tried: ORI_MODELS.length }, error: detail });
    return { error: "upstream", detail };
  };
  const cres = logger ? await traced(runChat, { name: "ori-chat" }) : await runChat(null);
  flush();
  if (cres.error) return new Response(JSON.stringify(cres), { status: 502, headers });
  return new Response(JSON.stringify({ reply: cres.reply }), { headers });
}

/* Ori Daily Brief — turns a wearable into natural-language coaching.
   Pipeline: a screenshot (body.image) is read into metrics by the free Workers
   AI vision binding (worker/vision.js); those metrics — or typed ones — are
   reasoned into a brief by lib/ori.js, which uses Fireworks when
   FIREWORKS_API_KEY is set and a mock brain when it isn't (source:"mock"). The
   endpoint never crashes without a key. Stateless: the screenshot lives only
   inside this invocation, never stored. When BRAINTRUST_API_KEY is set each
   brief is traced so interpretation quality can be evaluated across wearable
   brands (WHOOP/Oura/Garmin/Apple). */
async function askOri(request, env, ctx) {
  if (request.method !== "POST") return new Response("POST only", { status: 405 });
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  let body;
  try { body = await request.json(); } catch (e) { return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers }); }
  // request.json() can yield null, a number, a string, or an array — any of
  // which would make body.image / body.metrics throw below. Reject non-objects.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers });
  }

  const req = {
    wearable: body.wearable,
    metrics: (body.metrics && typeof body.metrics === "object") ? body.metrics : {},
    userQuestion: body.userQuestion,
  };
  // Screenshot path: extract metrics, then discard the image. Extracted values
  // win over anything typed; the raw bytes are never logged or traced.
  let usedImage = false;
  if (typeof body.image === "string" && body.image) {
    usedImage = true;
    const extracted = await extractMetrics(env, body.image);
    // Nothing legible came back. Do NOT invent a health brief from empty
    // metrics — ask for a clearer shot instead (the client renders .message).
    const readable = extracted && (
      extracted.recovery != null || extracted.hrv != null || extracted.rhr != null ||
      (extracted.sleep != null && extracted.sleep !== "")
    );
    if (!readable) {
      return new Response(JSON.stringify({
        error: "unreadable_screenshot",
        message: "I couldn't read any recovery, HRV, or sleep numbers from that screenshot. Try a clearer shot of your recovery or readiness screen — or just type the numbers and I'll give you the same read.",
      }), { status: 422, headers });
    }
    if (extracted.wearable) req.wearable = extracted.wearable;
    req.metrics = Object.assign({}, req.metrics, extracted);
    delete req.metrics.wearable;
  }

  const config = { fireworksApiKey: env && env.FIREWORKS_API_KEY };
  const logger = getLogger(env);
  const flush = () => { if (logger && ctx) ctx.waitUntil(logger.flush()); };
  const run = async (span) => {
    const t0 = Date.now();
    const out = await generateBrief(config, req);
    if (span) span.log({
      input: { wearable: req.wearable, metrics: req.metrics, question: req.userQuestion || null, from_screenshot: usedImage },
      output: out,
      metadata: { wearable: out.wearable, kind: req.userQuestion ? "ask" : "brief", source: out.source },
      metrics: { latency_ms: Date.now() - t0 },
    });
    return out;
  };
  const out = logger ? await traced(run, { name: "ori-daily-brief" }) : await run(null);
  flush();
  return new Response(JSON.stringify(out), { headers });
}

/* Outreach-friendly short routes (assets match first, so these only fire when
   no static file exists at the path). 302 so they stay repointable. */
const SHORTLINKS = {
  "/submit": "/mvp/submit.html",
  "/passport": "/mvp/passport.html",
  "/challenges": "/mvp/challenges.html",
  "/squads": "/mvp/squads.html",
  "/board": "/mvp/",
  "/foundersvsoperators": "/try.html?challenge=founders",
  "/play/foundersvsoperators": "/try.html?challenge=founders",
};

/* /api/* answers cross-origin (and file:// local previews, whose origin is
   "null") — these endpoints hold no session state and return nothing private,
   and without CORS a locally-opened page shows "no connection" for all of
   them. OPTIONS preflights get a bare 204. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
function withCors(res) {
  const out = new Response(res.body, res);
  for (const k in CORS) out.headers.set(k, CORS[k]);
  return out;
}

/* Best-effort abuse guard for the reasoning endpoint (Fireworks + Workers AI
   vision both cost money per call). In-memory and per-isolate — Workers run many
   isolates, so this is a soft cap that blunts a hot loop or a single abusive
   client, not a hard global quota (that would need a KV/Durable Object binding).
   Fixed 60s window keyed by client IP. Returns seconds-to-wait, or 0 if OK. */
const RL_WINDOW_MS = 60000;
const RL_MAX = 20;
const rlHits = new Map(); // ip -> { count, resetAt }
function rateLimited(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  const now = Date.now();
  let e = rlHits.get(ip);
  if (!e || now >= e.resetAt) { e = { count: 0, resetAt: now + RL_WINDOW_MS }; rlHits.set(ip, e); }
  e.count++;
  if (rlHits.size > 5000) { for (const [k, v] of rlHits) if (now >= v.resetAt) rlHits.delete(k); } // bound memory
  return e.count > RL_MAX ? Math.max(1, Math.ceil((e.resetAt - now) / 1000)) : 0;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/auth/oura/start") return start(request, env);
    if (pathname === "/auth/oura/callback") return callback(request, env);
    if (pathname.startsWith("/api/") && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (pathname === "/api/manual-submit") return withCors(await manualSubmit(request, env));
    if (pathname === "/api/caddy-voice") return withCors(await caddyVoice(request, env));
    if (pathname === "/api/ori-chat") return withCors(await oriChat(request, env, ctx));
    if (pathname === "/api/ask-ori") {
      const retry = rateLimited(request);
      if (retry) return withCors(new Response(
        JSON.stringify({ error: "rate_limited", message: "One moment — you're going a little fast. Try again in a few seconds." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retry) } }
      ));
      return withCors(await askOri(request, env, ctx));
    }
    if (SHORTLINKS[pathname]) return Response.redirect(url.origin + SHORTLINKS[pathname] + url.search, 302);
    // /p/<handle-or-code> — public Body Passport (renders live from board.json)
    if (pathname.startsWith("/p/") && pathname.length > 3) {
      const u = decodeURIComponent(pathname.slice(3));
      return Response.redirect(url.origin + "/mvp/passport.html?u=" + encodeURIComponent(u), 302);
    }
    return env.ASSETS.fetch(request);
  },
};
