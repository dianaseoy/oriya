/* The mock reasoning brain — clearly separated from the live Fireworks path.
 * It reasons over the normalized Signals (never parrots numbers) and returns
 * the same OriBrief shape the live path does, so the UI can't tell them apart
 * beyond `source:"mock"`. This is the offline stand-in that gets replaced by
 * real reasoning + real wearable integrations after the hackathon.
 *
 * History rule: this brain NEVER invents a past. It references averages,
 * ranges or trends ONLY from the real baseline the caller passes in
 * (Signals.baseline, built from the user's own stored days). With no baseline
 * it reads today alone and says so — no fabricated "usual HRV", no "this week". */

import type { OriBrief, Signals, Wearable } from "./types";

/* Every wearable speaks a different language; Ori translates all of them.
 * native:false = the brand ships no single recovery number (Apple). */
export const WEARABLES: Record<Wearable, { label: string; score: string; native: boolean }> = {
  whoop: { label: "WHOOP", score: "recovery", native: true },
  oura: { label: "Oura", score: "readiness", native: true },
  garmin: { label: "Garmin", score: "Body Battery", native: true },
  apple: { label: "Apple Watch", score: "overnight recovery", native: false },
};

export function fmtSleep(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

type State = "strained" | "primed" | "steady";
function readState(s: Signals): State {
  const veryShort = s.sleepH != null && s.sleepH < 5.5;
  const short = s.sleepH != null && s.sleepH < 6.2;
  const lowRec = s.recovery != null && s.recovery < 50;
  const highRec = s.recovery != null && s.recovery >= 67;
  if (lowRec || (short && s.recovery != null && s.recovery < 60)) return "strained";
  if (highRec && !veryShort) return "primed";
  return "steady";
}

/* A real HRV baseline, or null. Comes only from stored history (>= 2 days) —
 * there is no synthetic fallback. */
function realHrvBase(s: Signals): number | null {
  const b = s.baseline;
  if (!b || b.days < 2 || b.hrvAvg == null) return null;
  return Math.round(b.hrvAvg);
}

// Honest note used whenever there's no history to lean on.
const NO_HISTORY =
  "I've only got this morning to read so far, so I'm going off today's numbers alone — a few more days of screenshots and I'll know what's genuinely normal for you.";

export function mockBrief(s: Signals): OriBrief {
  const w = WEARABLES[s.wearable];
  const state = readState(s);
  const hist = s.baseline && s.baseline.days >= 2 ? s.baseline : null;
  const base = realHrvBase(s);
  const sleep = s.sleepH != null ? fmtSleep(s.sleepH) : null;
  const derived = !w.native
    ? `${w.label} doesn't hand you one recovery number, so I'm reading your HRV, resting heart rate and sleep together instead. `
    : "";

  // Real comparison of today's HRV to the person's own average — only when both exist.
  const hrvVsBase =
    hist && base != null && s.hrv != null
      ? s.hrv >= base
        ? `your HRV (${s.hrv} ms) is at or above your ${hist.days}-day average of ${base} ms`
        : `your HRV (${s.hrv} ms) is below your ${hist.days}-day average of ${base} ms`
      : null;
  const baselineLine =
    hist && base != null
      ? `Against your ${hist.days}-day baseline (HRV avg ${base} ms${hist.avgSleepH != null ? `, sleep avg ${fmtSleep(hist.avgSleepH)}` : ""})`
      : null;

  let core: Pick<OriBrief, "summary" | "observations" | "recommendation" | "reassurance" | "confidence" | "reasoning">;
  if (state === "strained") {
    core = {
      summary: "You're running on more determination than recovery today.",
      observations: [
        `The thing that stands out isn't your ${w.score} score — it's that your HRV and sleep are pulling the same way${sleep ? ` (${sleep} last night)` : ""}. Together they read more like fatigue than one rough night.`,
        s.rhr != null
          ? "Your resting heart rate is sitting a touch high, which fits — your body's still doing its overnight housekeeping and hasn't fully clocked off yet."
          : "This reads less like you're coming down with something and more like your body's asking for an easier day.",
        hrvVsBase
          ? `And ${hrvVsBase}, so today really is a step down from your own normal — worth respecting.`
          : `A single morning like this is a snapshot, not a verdict. ${NO_HISTORY}`,
      ],
      recommendation:
        "I'd postpone anything that needs maximum intensity and keep today easy and aerobic. Protect your energy — tomorrow will thank you.",
      reassurance: `One thing I wouldn't worry about is today's ${w.score} figure on its own. These scores naturally bounce around; ${hist ? "your own week-over-week trend is what actually matters" : "the trend across a few logged days is what will actually matter"}.`,
      confidence: hist ? "medium-high" : "medium",
      reasoning: `${derived}${
        baselineLine
          ? `${baselineLine}, today's HRV is on the low side while sleep ran short — that pairing reads as accumulated fatigue, not illness. If tonight's sleep lands longer, I'd expect ${w.score} to rebound.`
          : `Reading only this morning: ${s.hrv != null ? `HRV ${s.hrv} ms` : "a softer HRV"}${sleep ? ` on ${sleep} of sleep` : ""} points toward fatigue rather than something wrong — but ${NO_HISTORY}`
      }`,
    };
  } else if (state === "primed") {
    core = {
      summary: "You've bounced back nicely — today's a green light.",
      observations: [
        `Your ${w.score} came in strong${sleep ? `, and it lines up with a solid ${sleep} of sleep` : ""}. That combination usually means your body's genuinely ready, not just rested on paper.`,
        hrvVsBase
          ? `${hrvVsBase.charAt(0).toUpperCase()}${hrvVsBase.slice(1)} — the quiet tell that you've actually absorbed your recent training.`
          : "The signals are pulling in the same direction, which is exactly what a real recovery morning looks like.",
        hist
          ? "Mornings like this are the ones to spend, not save — this is the fitness you've been building showing up on cue."
          : `Mornings like this are the ones to spend, not save. ${NO_HISTORY}`,
      ],
      recommendation:
        "If you've got a harder session in mind, today's the day to take it. Warm up honestly, then let yourself go after it.",
      reassurance:
        "And don't overthink chasing a perfect score every day — you don't need green to make progress. Today just happens to be a gift.",
      confidence: hist ? "high" : "medium-high",
      reasoning: `${derived}${
        baselineLine
          ? `${baselineLine}, everything's rowing the same way: ${w.score} up${sleep ? ", sleep respectable" : ""}, ${hrvVsBase}. When your signals agree above your own normal, the read is easy — you're adapted and ready.`
          : `Everything's rowing the same way this morning: ${w.score} up${sleep ? ", sleep respectable" : ""}${s.hrv != null ? `, HRV a healthy ${s.hrv} ms` : ""}. That's a ready-to-go morning — though ${NO_HISTORY}`
      }`,
    };
  } else {
    core = {
      summary: "You're in steady, workable shape this morning — nothing loud in either direction.",
      observations: [
        `Your ${w.score} is sitting in ordinary territory${sleep ? ` on ${sleep} of sleep` : ""} — not a peak, not a warning, just a normal day your body can handle.`,
        hrvVsBase
          ? `${hrvVsBase.charAt(0).toUpperCase()}${hrvVsBase.slice(1)}, so there's no hidden fatigue lurking under the score. What you feel is probably what you've got.`
          : s.hrv != null
          ? `Your HRV (${s.hrv} ms) isn't flagging anything, so what you feel is probably what you've got.`
          : "Nothing in the numbers is fighting you, which honestly is a fine place to start a day.",
        hist
          ? "Days like this are the backbone of the whole thing — consistency, not heroics, is what compounds."
          : `Days like this are the backbone of the whole thing. ${NO_HISTORY}`,
      ],
      recommendation:
        "I'd take a normal session and read the first ten minutes. If you warm up and feel good, go with it; if it feels heavy, ease off without guilt.",
      reassurance:
        "Don't wait around for a perfect-recovery morning to do something good for yourself — the steady days are where most of the progress actually gets made.",
      confidence: "medium",
      reasoning: `${derived}${
        baselineLine
          ? `${baselineLine}, nothing's pulling hard: ${w.score} mid-range${hrvVsBase ? `, ${hrvVsBase}` : ""}. That's a body in balance, so I'd trust how you feel once you're moving.`
          : `Nothing's pulling hard this morning: ${w.score} mid-range${s.hrv != null ? `, HRV a normal-looking ${s.hrv} ms` : ""}. That's a body in balance — I'd trust how you feel once you're moving. ${NO_HISTORY}`
      }`,
    };
  }

  return {
    greeting: "🌅 Morning Brief",
    ...core,
    answer: s.question ? mockAnswer(s, state, base) : null,
    wearable: s.wearable,
    metrics: echo(s),
    source: "mock",
  };
}

/* Lightweight Ask Ori — same reasoning voice, matched to the question. History
 * (base + s.baseline) is used only when real; otherwise the answer stays honest
 * about not having past days yet. */
export function mockAnswer(s: Signals, state: State, base: number | null): string {
  const q = s.question.toLowerCase();
  const hist = s.baseline && s.baseline.days >= 2 ? s.baseline : null;

  if (/push|workout|train|lift|run|intensity|hard|session|gym|exercise/.test(q)) {
    if (state === "strained")
      return "I'd move it, honestly — or at least swap the hard intervals for something easy and aerobic. Pushing through a low morning rarely pays you back, and the session will still be there tomorrow when you can actually attack it.";
    if (state === "primed")
      return "Go for it. Everything's pointing green this morning — good recovery, HRV where you'd want it. This is exactly the kind of day to spend the fitness you've been building.";
    return "You've got a normal session in you — just let the first ten minutes decide. If you warm up and feel good, take it; if it feels heavy, dial it back. No need to force a big day.";
  }

  if (/why|lower|drop|down|bad|red|low|worse/.test(q)) {
    if (hist && base != null && s.hrv != null) {
      return s.hrv < base
        ? `Your HRV is at ${s.hrv} ms against your ${hist.days}-day average of ${base} ms, and short sleep tends to pull it down like this. That's what's dragging the score — fatigue stacking up, not something wrong. A longer night usually brings it back.`
        : `Honestly your HRV (${s.hrv} ms) is right around your ${hist.days}-day average of ${base} ms, so the score isn't as low as it feels — it's within your normal bounce. I'd read it as an ordinary dip, not a red flag.`;
    }
    return `Reading just this morning, ${s.hrv != null ? `an HRV of ${s.hrv} ms` : "a softer HRV"}${s.sleepH != null ? ` on ${fmtSleep(s.sleepH)} of sleep` : ""} points to ordinary fatigue rather than anything wrong. I can't compare it to your usual yet — ${NO_HISTORY}`;
  }

  if (/week|changed|trend|lately|days|recent|month/.test(q)) {
    if (hist) {
      const parts: string[] = [];
      if (hist.avgRecovery != null && s.recovery != null)
        parts.push(`recovery's averaging ${hist.avgRecovery} over ${hist.days} days and today's ${s.recovery}`);
      if (hist.hrvMin != null && hist.hrvMax != null)
        parts.push(`HRV's been ranging ${hist.hrvMin}–${hist.hrvMax} ms`);
      if (hist.avgSleepH != null) parts.push(`sleep's averaging ${fmtSleep(hist.avgSleepH)}`);
      const facts = parts.length ? parts.join(", ") + ". " : "";
      const pat = hist.patterns && hist.patterns.length ? hist.patterns[0] + " " : "";
      return `${facts}${pat}That's the shape from your own logged days — nothing invented.`;
    }
    return `I can't answer that honestly yet — I only have this one morning, so there's no week to compare against. Share a few more mornings and I'll be able to show you real trends. ${NO_HISTORY}`;
  }

  return `${s.recovery != null ? "Reading it all together rather than any one number: " : ""}your body's telling a ${
    state === "strained" ? "take-it-easy" : state === "primed" ? "go-enjoy-it" : "steady-as-you-go"
  } story this morning. I'd trust that overall shape${hist ? " and your own baseline" : ""} more than any single metric — and remember this is one data point in a long game, not a grade.`;
}

function echo(s: Signals): { recovery: number | null; hrv: number | null; rhr: number | null; sleep: number | null } {
  return { recovery: s.recovery, hrv: s.hrv, rhr: s.rhr, sleep: s.sleepH };
}
