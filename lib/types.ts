/* Shared types for the Ori Daily Brief. The API response is strongly typed
 * here and imported by the Worker route, the services, and the UI component. */

export type Wearable = "whoop" | "oura" | "garmin" | "apple";

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
}

/** Internal normalized signals the reasoning engines work on. */
export interface Signals {
  wearable: Wearable;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  sleepH: number | null;
  question: string;
}

export interface OriConfig {
  fireworksApiKey?: string; // absent → mock mode
}
