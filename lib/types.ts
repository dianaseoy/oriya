/* Shared types for the Ori Daily Brief. The API response is strongly typed
 * here and imported by the Worker route, the services, and the UI component. */

export type Wearable = "whoop" | "oura" | "garmin" | "apple";

/** The done-for-you actions Ori can produce from a read. Each `kind` is also the
 * dispatch name in lib/actions.ts (runAction) — the seam a future /api/ori/act
 * route + MCP tool reuse verbatim. */
export type OriActionKind = "draft_checkin" | "plan_today" | "frame_stake";

/** A single done-for-you output: Ori did the work, the user hands it off (copies
 * it). v0 is draft-only — no side effects, nothing placed or posted. */
export interface OriAction {
  id: string; // stable id, equal to the dispatch name (== kind for v0)
  kind: OriActionKind;
  label: string; // button/bubble text, e.g. "Copy my check-in"
  why: string; // one line tying it to today's read (own-par framed)
  draft: string; // the copy-ready work-product
  source: "fireworks" | "mock"; // live vs mock, surfaced honestly like the brief
}

/** Raw metrics as they arrive — from a screenshot extraction or typed input.
 * Loose on purpose (strings like "5h31" are allowed); normalize() tightens it. */
export interface OriMetrics {
  recovery?: number | string | null; // WHOOP recovery / Oura readiness / Garmin Body Battery
  hrv?: number | string | null; // ms
  rhr?: number | string | null; // resting heart rate, bpm
  sleep?: number | string | null; // "5h31", "6.5h", hours, or minutes
}

/** POST /api/ask-ori body. Either `image` (screenshot) or `metrics` (typed). */
export interface AskOriRequest {
  wearable?: Wearable;
  metrics?: OriMetrics;
  image?: string; // data: URL of a wearable screenshot
  userQuestion?: string; // set for an "Ask Ori" follow-up
  baseline?: BaselineSummary | null; // the person's own 7-day history, if built
  extractOnly?: boolean; // true = read metrics from the image, skip reasoning
}

/** One day of extracted metrics. This is the ONLY historical record Ori keeps,
 * and it lives client-side (localStorage) — never on the server. sleepH is
 * hours (normalized from "5h31" etc.). */
export interface BaselineEntry {
  day: string; // "YYYY-MM-DD" — one entry per day, latest upload wins
  wearable: Wearable;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  sleepH: number | null;
}

/** The rolling 7-day baseline, summarized. Real aggregates only — every field
 * is computed from stored BaselineEntry rows, never assumed. null when there
 * isn't enough data to state it honestly. */
export interface BaselineSummary {
  days: number; // how many days actually contributed (0-7)
  avgRecovery: number | null;
  avgSleepH: number | null;
  hrvMin: number | null;
  hrvMax: number | null;
  hrvAvg: number | null;
  avgRhr: number | null;
  patterns: string[]; // plain-language patterns derived from the data (may be empty)
}

/** The one response shape every caller depends on. Never contains markdown. */
export interface OriBrief {
  greeting: string;
  summary: string; // overall interpretation, one sentence
  observations: string[]; // exactly 3 personalized reads
  recommendation: string; // the one thing to do today
  reassurance: string; // the one thing not to worry about
  confidence: string | null;
  reasoning: string; // the "Why?" expandable text
  answer: string | null; // filled only for an Ask Ori follow-up
  wearable: Wearable; // echoed so follow-ups stay grounded
  metrics: OriMetrics; // echoed (extracted from the screenshot when applicable)
  source: "fireworks" | "mock"; // live vs mock, surfaced honestly
  actions: OriAction[]; // done-for-you outputs from this read (may be empty)
}

/** Internal normalized signals the reasoning engines work on. */
export interface Signals {
  wearable: Wearable;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  sleepH: number | null;
  question: string;
  baseline: BaselineSummary | null; // real history when the user has built one
}

export interface OriConfig {
  fireworksApiKey?: string; // absent → mock mode
}
