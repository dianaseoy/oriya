/* Screenshot → metrics. Uses the Worker's free Workers AI vision binding
 * (env.AI) — the same model already proven in /api/ori-chat. This lives in
 * worker/ (not lib/) because env.AI is a Cloudflare binding, not portable to
 * Next; Fireworks vision could replace it later behind the same signature.
 * Graceful by design: returns {} when nothing can be read, so the brief still
 * renders (the orchestrator's mock brain fills in from there). */

import { EXTRACT_PROMPT } from "../lib/prompts";

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

/** @returns {Promise<{wearable?:string, recovery?:number|null, hrv?:number|null, rhr?:number|null, sleep?:string|null}>} */
export async function extractMetrics(env, dataUrl) {
  if (!env || !env.AI) return {};
  const bytes = imageBytes(dataUrl);
  if (!bytes) return {};
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await env.AI.run(VISION_MODEL, { prompt: EXTRACT_PROMPT, image: bytes, max_tokens: 220 });
      const parsed = parseJson(String((out && out.response) || ""));
      if (parsed) return sanitize(parsed);
    } catch (e) {
      // First call per account must accept Meta's license; retry self-heals it.
      const d = String((e && e.message) || e);
      if (attempt === 0 && /agree|license|accept/i.test(d)) {
        try { await env.AI.run(VISION_MODEL, { prompt: "agree" }); } catch (e2) {}
      } else break;
    }
  }
  return {};
}

function parseJson(text) {
  const m = /\{[\s\S]*\}/.exec(text); // model may wrap JSON in prose
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// keep only the fields we trust; drop anything odd the model might return
function sanitize(p) {
  const wk = String(p.wearable || "").toLowerCase();
  const out = {};
  if (["whoop", "oura", "garmin", "apple"].includes(wk)) out.wearable = wk;
  ["recovery", "hrv", "rhr"].forEach((k) => { if (typeof p[k] === "number") out[k] = p[k]; });
  if (p.sleep != null && p.sleep !== "") out.sleep = String(p.sleep).slice(0, 12);
  return out;
}

/* data:image/…;base64 → byte array for the AI binding. Caps at ~2MB decoded. */
function imageBytes(dataUrl) {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(String(dataUrl || ""));
  if (!m || m[1].length > 2800000) return null;
  let bin;
  try { bin = atob(m[1]); } catch (e) { return null; }
  const bytes = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
