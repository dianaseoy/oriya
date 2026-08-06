/* The 7-day baseline model — the ONE place that turns stored days of metrics
 * into an honest summary. It is deliberately pure (no I/O, no fetch): the live
 * surface (landing/ori.html) keeps the raw BaselineEntry rows in localStorage
 * and mirrors this logic in vanilla JS, and a future Next app imports this
 * directly. Everything here is COMPUTED from real rows — nothing is assumed.
 *
 * Keep this in sync with the mirror in landing/ori.html (search "baseline"). */

import type { BaselineEntry, BaselineSummary } from "./types.ts";

export const BASELINE_DAYS = 7;

function avg(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}
function pick(entries: BaselineEntry[], key: "recovery" | "hrv" | "rhr" | "sleepH"): number[] {
  return entries.map((e) => e[key]).filter((v): v is number => typeof v === "number" && !isNaN(v));
}

/** Keep at most the most recent BASELINE_DAYS days, one row per day (latest
 * upload for a day wins), newest last. Callers pass whatever they have stored. */
export function trimBaseline(entries: BaselineEntry[]): BaselineEntry[] {
  const byDay = new Map<string, BaselineEntry>();
  for (const e of entries) if (e && e.day) byDay.set(e.day, e); // later write wins
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day)).slice(-BASELINE_DAYS);
}

/** Summarize real stored days into aggregates + plain-language patterns. Returns
 * a zero-day summary (all nulls, no patterns) when there's nothing to say. */
export function summarizeBaseline(raw: BaselineEntry[]): BaselineSummary {
  const entries = trimBaseline(raw || []);
  const rec = pick(entries, "recovery");
  const hrv = pick(entries, "hrv");
  const rhr = pick(entries, "rhr");
  const sleep = pick(entries, "sleepH");

  const summary: BaselineSummary = {
    days: entries.length,
    avgRecovery: round1(avg(rec)),
    avgSleepH: round1(avg(sleep)),
    hrvMin: hrv.length ? Math.min(...hrv) : null,
    hrvMax: hrv.length ? Math.max(...hrv) : null,
    hrvAvg: round1(avg(hrv)),
    avgRhr: round1(avg(rhr)),
    patterns: [],
  };
  summary.patterns = derivePatterns(entries, summary);
  return summary;
}

/* Patterns are the honest part: each one is only emitted when the stored rows
 * actually support it. With fewer than 3 real days we say nothing rather than
 * guess — the caller shows a "still learning" state instead. */
function derivePatterns(entries: BaselineEntry[], s: BaselineSummary): string[] {
  const out: string[] = [];
  if (entries.length < 3) return out;

  const sleep = pick(entries, "sleepH");
  if (sleep.length >= 3) {
    const spread = Math.max(...sleep) - Math.min(...sleep);
    if (spread <= 1) out.push("Your sleep is remarkably consistent night to night.");
    else if (spread >= 2.5) out.push("Your sleep swings a lot from night to night — that variability tends to drive the rest.");
  }

  // Does lower recovery line up with shorter sleep the night before? Only assert
  // it when both series exist across the same days and the link is real.
  const paired = entries.filter((e) => typeof e.recovery === "number" && typeof e.sleepH === "number");
  if (paired.length >= 3 && s.avgRecovery != null && s.avgSleepH != null) {
    const belowSleepBelowRec = paired.filter((e) => (e.sleepH as number) < (s.avgSleepH as number) && (e.recovery as number) < (s.avgRecovery as number)).length;
    const belowSleep = paired.filter((e) => (e.sleepH as number) < (s.avgSleepH as number)).length;
    if (belowSleep >= 2 && belowSleepBelowRec >= Math.ceil(belowSleep * 0.75)) {
      out.push("Your shorter nights are the ones your recovery dips on — sleep looks like your biggest lever.");
    }
  }

  // Recovery drift across the window (first third vs last third).
  const rec = entries.filter((e) => typeof e.recovery === "number").map((e) => e.recovery as number);
  if (rec.length >= 4) {
    const head = rec.slice(0, Math.floor(rec.length / 2));
    const tail = rec.slice(-Math.floor(rec.length / 2));
    const dh = avg(head), dt = avg(tail);
    if (dh != null && dt != null) {
      if (dt - dh >= 8) out.push("Your recovery has been trending up across these days.");
      else if (dh - dt >= 8) out.push("Your recovery has been drifting down across these days — worth an easier stretch.");
    }
  }

  return out;
}
