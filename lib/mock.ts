/* The mock reasoning brain — clearly separated from the live Fireworks path.
 * It reasons over the normalized Signals (never parrots numbers) and returns
 * the same OriBrief shape the live path does, so the UI can't tell them apart
 * beyond `source:"mock"`. This is the offline stand-in that gets replaced by
 * real reasoning + real wearable integrations after the hackathon. */

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
// A plausible personal HRV baseline — the mock's stand-in for reading history.
function hrvBaseline(s: Signals, state: State): number | null {
  if (s.hrv == null) return null;
  if (state === "strained") return Math.round(s.hrv * 1.45);
  if (state === "primed") return Math.round(s.hrv * 0.92);
  return Math.round(s.hrv * 1.1);
}

/** Representative metrics when no screenshot can actually be read (no vision,
 * no key). Keeps the flow demonstrable; live mode replaces this entirely. */
export function mockMetrics(wearable: Wearable): Signals {
  return { wearable, recovery: 42, hrv: 38, rhr: 68, sleepH: 5.52, question: "" };
}

export function mockBrief(s: Signals): OriBrief {
  const w = WEARABLES[s.wearable];
  const state = readState(s);
  const base = hrvBaseline(s, state);
  const sleep = s.sleepH != null ? fmtSleep(s.sleepH) : null;
  const derived = !w.native
    ? `${w.label} doesn't hand you one recovery number, so I'm reading your HRV, resting heart rate and sleep together instead. `
    : "";

  let core: Pick<OriBrief, "summary" | "observations" | "recommendation" | "reassurance" | "confidence" | "reasoning">;
  if (state === "strained") {
    core = {
      summary: "You're running on more determination than recovery today.",
      observations: [
        `The thing that stands out isn't your ${w.score} score — it's that your HRV eased off${sleep ? ` while sleep stayed short at ${sleep}` : ""}. Those two together usually point to accumulated fatigue rather than one rough night.`,
        s.rhr != null
          ? `Your resting heart rate is sitting a touch high, which fits — your body's still doing its overnight housekeeping and hasn't fully clocked off yet.`
          : `This reads less like you're getting sick and more like the last few days are catching up with you all at once.`,
        `A single morning like this is a snapshot, not a verdict. What you do over the next few days moves the needle far more than today's number.`,
      ],
      recommendation:
        "I'd postpone anything that needs maximum intensity and keep today easy and aerobic. Protect your energy — tomorrow will thank you.",
      reassurance: `One thing I wouldn't worry about is today's ${w.score} figure on its own. These scores naturally bounce around; the trend across the week is what actually matters.`,
      confidence: "medium-high",
      reasoning: `${derived}Your HRV usually sits around ${base != null ? base + " ms" : "your normal"}, and a few shorter nights in a row have pulled it down. That's a fatigue signature, not an illness one. If tonight's sleep lands a bit longer, I'd expect your ${w.score} to rebound pretty quickly.`,
    };
  } else if (state === "primed") {
    core = {
      summary: "You've bounced back nicely — today's a green light.",
      observations: [
        `Your ${w.score} came in strong${sleep ? `, and it lines up with a solid ${sleep} of sleep` : ""}. That combination usually means your body's genuinely ready, not just rested on paper.`,
        base != null
          ? `Your HRV is holding at or above where it normally sits — the quiet tell that you've actually absorbed your recent training rather than just survived it.`
          : `The signals are pulling in the same direction, which is exactly what a real recovery morning looks like.`,
        `Mornings like this are the ones to spend, not save — this is fitness you've been building showing up right on cue.`,
      ],
      recommendation:
        "If you've got a harder session in mind, today's the day to take it. Warm up honestly, then let yourself go after it.",
      reassurance:
        "And don't overthink chasing a perfect score every day — you don't need green to make progress. Today just happens to be a gift.",
      confidence: "high",
      reasoning: `${derived}Everything's rowing the same way: ${w.score} up${sleep ? `, sleep respectable` : ""}, HRV at or above your usual${base != null ? ` (~${base} ms)` : ""}. When the signals agree like this, the read is easy — you're adapted and ready.`,
    };
  } else {
    core = {
      summary: "You're in steady, workable shape this morning — nothing loud in either direction.",
      observations: [
        `Your ${w.score} is sitting in ordinary territory${sleep ? ` on ${sleep} of sleep` : ""} — not a peak, not a warning, just a normal day your body can handle.`,
        s.hrv != null
          ? `Your HRV is close to where it usually lives, so there's no hidden fatigue lurking under the score. What you feel is probably what you've got.`
          : `Nothing in the numbers is fighting you, which honestly is a fine place to start a day.`,
        `Days like this are the backbone of the whole thing — consistency, not heroics, is what actually compounds.`,
      ],
      recommendation:
        "I'd take a normal session and read the first ten minutes. If you warm up and feel good, go with it; if it feels heavy, ease off without guilt.",
      reassurance:
        "Don't wait around for a perfect-recovery morning to do something good for yourself — the steady days are where most of the progress actually gets made.",
      confidence: "medium",
      reasoning: `${derived}Nothing's pulling hard: ${w.score} mid-range${s.hrv != null ? `, HRV near your usual${base != null ? ` (~${base} ms)` : ""}` : ""}. That's a body in balance rather than one recovering or overreaching, so I'd trust how you feel once you're moving.`,
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

/* Lightweight Ask Ori — same reasoning voice, matched to the question. */
export function mockAnswer(s: Signals, state: State, base: number | null): string {
  const q = s.question.toLowerCase();
  if (/push|workout|train|lift|run|intensity|hard|session|gym|exercise/.test(q)) {
    if (state === "strained")
      return "I'd move it, honestly — or at least swap the hard intervals for something easy and aerobic. Pushing through a low-HRV morning rarely pays you back, and the session will still be there tomorrow when you can actually attack it.";
    if (state === "primed")
      return "Go for it. Everything's pointing green — good recovery, HRV where it should be. This is exactly the kind of morning to spend the fitness you've been building.";
    return "You've got a normal session in you — just let the first ten minutes decide. If you warm up and feel good, take it; if it feels heavy, dial it back. No need to force a big day.";
  }
  if (/why|lower|drop|down|bad|red|low|worse/.test(q)) {
    return `${base != null ? `Your HRV usually sits around ${base} ms, and a stretch of shorter nights has pulled it below that. ` : "A run of shorter nights has your body still catching up. "}That's what's dragging the score — it's fatigue stacking up, not something wrong. If tonight's sleep improves, I'd expect it to climb back fairly fast.`;
  }
  if (/week|changed|trend|lately|days|recent|month/.test(q)) {
    if (state === "strained")
      return "This week your sleep has been the swinging variable — a couple of short nights stacked up and your HRV drifted down with them. It's a dip, not a decline; the shape of it says recover, not worry.";
    if (state === "primed")
      return "The arc this week is genuinely good — your HRV has been trending up over the last few mornings and today's the payoff. Whatever you changed with sleep or load, your body liked it.";
    return "This week's been mostly flat and steady — no big swings up or down. That's not boring, it's stable, and stable is the base everything else gets built on.";
  }
  return `${s.recovery != null ? "Reading it all together rather than any one number: " : ""}your body's telling a ${state === "strained" ? "take-it-easy" : state === "primed" ? "go-enjoy-it" : "steady-as-you-go"} story this morning. I'd trust that overall shape more than any single metric — and remember this is one data point in a long game, not a grade.`;
}

function echo(s: Signals): { recovery: number | null; hrv: number | null; rhr: number | null; sleep: number | null } {
  return { recovery: s.recovery, hrv: s.hrv, rhr: s.rhr, sleep: s.sleepH };
}
