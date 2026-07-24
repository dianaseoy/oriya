/* Orchestrator — the one entry the Worker (and a future Next route) imports.
 * It normalizes the request, then picks the live Fireworks path or the mock
 * brain. Mock vs live is decided in exactly one place: whether a Fireworks key
 * is present. Everything downstream sees the same typed OriBrief. */

import { fireworksBrief } from "./fireworks";
import { mockBrief } from "./mock";
import type { AskOriRequest, OriBrief, OriConfig, OriMetrics, Signals, Wearable } from "./types";

const WEARABLE_KEYS: Wearable[] = ["whoop", "oura", "garmin", "apple"];

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}
function parseSleep(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v > 24 ? v / 60 : v; // minutes vs hours
  const str = String(v).trim();
  let m = /^(\d+)\s*[h:]\s*(\d+)/i.exec(str); // "5h31" / "5:31"
  if (m) return +m[1] + +m[2] / 60;
  m = /^(\d+(?:\.\d+)?)\s*h/i.exec(str); // "5.5h"
  if (m) return +m[1];
  const n = parseFloat(str);
  return isNaN(n) ? null : n > 24 ? n / 60 : n;
}

export function normalize(req: AskOriRequest): Signals {
  const wk = String(req?.wearable || "").toLowerCase() as Wearable;
  const wearable: Wearable = WEARABLE_KEYS.includes(wk) ? wk : "whoop";
  const m: OriMetrics = req?.metrics || {};
  return {
    wearable,
    recovery: num(m.recovery),
    hrv: num(m.hrv),
    rhr: num(m.rhr),
    sleepH: parseSleep(m.sleep),
    question: String(req?.userQuestion || "").slice(0, 300).trim(),
  };
}

/** Turn a normalized request into a brief. Never throws — a Fireworks failure
 * degrades to the mock brain so the panel is never blank. */
export async function generateBrief(config: OriConfig, req: AskOriRequest): Promise<OriBrief> {
  const s = normalize(req);
  if (config.fireworksApiKey) {
    try {
      return await fireworksBrief(config.fireworksApiKey, s);
    } catch {
      return mockBrief(s);
    }
  }
  return mockBrief(s);
}
