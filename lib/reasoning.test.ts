/* Unit tests for the pure reasoning core — no network, no bindings, no deps.
 *
 * Run (Node >= 22.6):
 *   node --test --experimental-strip-types ./lib
 * On Node >= 23.6 / 22.18 native type-stripping is the default:
 *   node --test ./lib
 *
 * Covers the deterministic business logic that has no other safety net:
 *  - normalize(): wearable whitelist, number coercion, sleep-string parsing,
 *    and untrusted-baseline sanitization (all reachable only through normalize,
 *    since num/parseSleep/cleanBaseline are module-private).
 *  - trimBaseline()/summarizeBaseline(): dedupe-by-day, 7-day window, honest
 *    aggregates + pattern derivation.
 *  - mockBrief()/fmtSleep(): output-shape invariants and the "no fabricated
 *    history" rule when no baseline is supplied.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalize } from "./ori.ts";
import { trimBaseline, summarizeBaseline, BASELINE_DAYS } from "./baseline.ts";
import { mockBrief, fmtSleep } from "./mock.ts";
import { buildActions, runAction, ACTION_CATALOG } from "./actions.ts";
import type { BaselineEntry, OriActionKind, Signals } from "./types.ts";

/* ── normalize(): wearable + metric coercion ─────────────────────────────── */

test("normalize lowercases a known wearable and coerces string metrics", () => {
  const s = normalize({
    wearable: "WHOOP" as any,
    metrics: { recovery: "66", hrv: "48", rhr: "52", sleep: "7h30" },
  });
  assert.equal(s.wearable, "whoop");
  assert.equal(s.recovery, 66);
  assert.equal(s.hrv, 48);
  assert.equal(s.rhr, 52);
  assert.equal(s.sleepH, 7.5); // "7h30" -> 7 + 30/60
});

test("normalize falls back to whoop for an unknown wearable", () => {
  assert.equal(normalize({ wearable: "fitbit" as any, metrics: {} }).wearable, "whoop");
});

test("normalize treats empty/garbage metrics as null, not 0/NaN", () => {
  const s = normalize({ metrics: { recovery: "", hrv: "abc", rhr: null, sleep: "" } as any });
  assert.equal(s.recovery, null);
  assert.equal(s.hrv, null);
  assert.equal(s.rhr, null);
  assert.equal(s.sleepH, null);
});

test("normalize parses every supported sleep format", () => {
  const sleepH = (v: unknown) => normalize({ metrics: { sleep: v as any } }).sleepH;
  assert.equal(sleepH("5:31"), 5 + 31 / 60); // colon form
  assert.equal(sleepH("6.5h"), 6.5); // decimal-hours form
  assert.equal(sleepH(8), 8); // number <= 24 kept as hours
  assert.equal(sleepH(450), 7.5); // number > 24 read as minutes
  assert.equal(sleepH("480"), 8); // numeric string > 24 read as minutes
});

test("normalize clamps the question and defaults it to empty string", () => {
  assert.equal(normalize({ metrics: {} }).question, "");
  assert.equal(normalize({ metrics: {}, userQuestion: "  should I train?  " }).question, "should I train?");
});

/* ── normalize(): untrusted baseline sanitization ────────────────────────── */

test("normalize keeps a valid baseline and clamps days to [1,7]", () => {
  const s = normalize({
    metrics: {},
    baseline: { days: 10, avgRecovery: 60, hrvAvg: 45, patterns: ["a", "b"], junk: "x" } as any,
  });
  assert.ok(s.baseline);
  assert.equal(s.baseline!.days, 7); // clamped down from 10
  assert.equal(s.baseline!.avgRecovery, 60);
  assert.equal(s.baseline!.hrvAvg, 45);
  assert.deepEqual(s.baseline!.patterns, ["a", "b"]);
  assert.equal((s.baseline as any).junk, undefined); // stray field dropped
});

test("normalize drops a baseline that claims zero days", () => {
  assert.equal(normalize({ metrics: {}, baseline: { days: 0 } as any }).baseline, null);
});

/* ── trimBaseline(): dedupe-by-day + window ──────────────────────────────── */

const entry = (day: string, recovery: number | null = null, sleepH: number | null = null): BaselineEntry => ({
  day,
  wearable: "whoop",
  recovery,
  hrv: null,
  rhr: null,
  sleepH,
});

test("trimBaseline keeps the latest write per day and sorts ascending", () => {
  const out = trimBaseline([entry("2026-01-01", 50), entry("2026-01-01", 60), entry("2026-01-03", 70)]);
  assert.equal(out.length, 2);
  assert.equal(out[0].day, "2026-01-01");
  assert.equal(out[0].recovery, 60); // later write wins
  assert.equal(out[1].day, "2026-01-03");
});

test("trimBaseline retains only the newest BASELINE_DAYS days", () => {
  const rows = Array.from({ length: 10 }, (_, i) => entry(`2026-01-${String(i + 1).padStart(2, "0")}`, i));
  const out = trimBaseline(rows);
  assert.equal(out.length, BASELINE_DAYS);
  assert.equal(out[0].day, "2026-01-04"); // oldest three dropped
  assert.equal(out[out.length - 1].day, "2026-01-10");
});

/* ── summarizeBaseline(): honest aggregates + patterns ───────────────────── */

test("summarizeBaseline returns an empty summary for no rows", () => {
  const s = summarizeBaseline([]);
  assert.equal(s.days, 0);
  assert.equal(s.avgRecovery, null);
  assert.deepEqual(s.patterns, []);
});

test("summarizeBaseline emits no patterns below 3 real days", () => {
  const s = summarizeBaseline([entry("2026-01-01", 50, 7), entry("2026-01-02", 60, 7)]);
  assert.equal(s.days, 2);
  assert.deepEqual(s.patterns, []);
});

test("summarizeBaseline flags consistent sleep and averages recovery", () => {
  const s = summarizeBaseline([
    entry("2026-01-01", 50, 7),
    entry("2026-01-02", 60, 7),
    entry("2026-01-03", 70, 7),
  ]);
  assert.equal(s.days, 3);
  assert.equal(s.avgRecovery, 60);
  assert.ok(s.patterns.some((p) => /consistent/i.test(p)));
});

/* ── mockBrief(): shape invariants + no-fabrication rule ──────────────────── */

const signals = (over: Partial<Signals> = {}): Signals => ({
  wearable: "whoop",
  recovery: null,
  hrv: null,
  rhr: null,
  sleepH: null,
  question: "",
  baseline: null,
  ...over,
});

test("mockBrief always returns 3 observations, mock source, and a greeting", () => {
  const b = mockBrief(signals({ recovery: 55, sleepH: 7 }));
  assert.equal(b.observations.length, 3);
  assert.equal(b.source, "mock");
  assert.ok(b.greeting.length > 0);
  assert.equal(b.answer, null); // no question -> no answer
});

test("mockBrief invents no history when no baseline is given", () => {
  const b = mockBrief(signals({ recovery: 40, hrv: 42, sleepH: 5 })); // strained path
  const blob = [b.summary, ...b.observations, b.reasoning].join(" ").toLowerCase();
  for (const banned of ["usually", "your normal", "this week", "last few nights", "trending"]) {
    assert.ok(!blob.includes(banned), `mock brief must not fabricate history ("${banned}")`);
  }
});

test("mockBrief fills answer only when a question is present", () => {
  assert.equal(typeof mockBrief(signals({ recovery: 80, sleepH: 8, question: "can I train hard?" })).answer, "string");
});

/* ── fmtSleep(): formatting ──────────────────────────────────────────────── */

test("fmtSleep renders hours and minutes", () => {
  assert.equal(fmtSleep(7.5), "7h 30m");
  assert.equal(fmtSleep(7), "7h");
});

/* ── Ori Acts: done-for-you actions layer ────────────────────────────────── */

const KINDS: OriActionKind[] = ["draft_checkin", "plan_today", "frame_stake"];

test("mockBrief attaches actions: one per kind, non-empty draft, mock source", () => {
  const b = mockBrief(signals({ recovery: 55, sleepH: 7 }));
  assert.equal(b.actions.length, 3);
  for (const kind of KINDS) {
    const a = b.actions.find((x) => x.kind === kind);
    assert.ok(a, `missing action ${kind}`);
    assert.ok(a!.draft.trim().length > 0, `${kind} draft is empty`);
    assert.ok(a!.label.trim().length > 0, `${kind} label is empty`);
    assert.equal(a!.id, kind);
    assert.equal(a!.source, "mock");
  }
});

test("frame_stake is a proposal — never claims money moved", () => {
  for (const state of ["strained", "primed", "steady"] as const) {
    const stake = buildActions(signals({ recovery: 60 }), state).find((a) => a.kind === "frame_stake")!;
    const draft = stake.draft.toLowerCase();
    for (const banned of ["placed", "charged", "deducted", "withdrawn"]) {
      assert.ok(!draft.includes(banned), `frame_stake must stay a proposal ("${banned}") in ${state}`);
    }
  }
});

test("actions invent no history when there is no baseline", () => {
  const b = mockBrief(signals({ recovery: 40, hrv: 42, sleepH: 5 })); // strained, no baseline
  const blob = b.actions.map((a) => a.draft + " " + a.why).join(" ").toLowerCase();
  for (const banned of ["usually", "your normal", "this week", "last few nights", "trending", "baseline"]) {
    assert.ok(!blob.includes(banned), `action text must not fabricate history ("${banned}")`);
  }
});

test("actions reference own baseline only when it is real (>=2 days)", () => {
  const withBase = buildActions(
    signals({ recovery: 40, hrv: 30, baseline: { days: 4, avgRecovery: 60, avgSleepH: 7, hrvMin: 40, hrvMax: 60, hrvAvg: 50, avgRhr: 52, patterns: [] } }),
    "strained",
  );
  const checkin = withBase.find((a) => a.kind === "draft_checkin")!;
  assert.ok(/baseline/i.test(checkin.draft), "own-par tag should appear when a real baseline backs it");
});

test("ACTION_CATALOG is MCP-shaped and covers exactly the three kinds", () => {
  assert.equal(ACTION_CATALOG.length, 3);
  for (const entry of ACTION_CATALOG) {
    assert.equal(entry.name, entry.kind);
    assert.ok(KINDS.includes(entry.kind));
    assert.ok(entry.description.length > 0);
    assert.equal(entry.inputSchema.type, "object");
  }
});

test("runAction validates the name and hands the draft back undelivered (v0)", () => {
  const [a] = buildActions(signals({ recovery: 70 }), "steady");
  const ok = runAction(a.kind, { action: a });
  assert.equal(ok.ok, true);
  assert.equal(ok.kind, a.kind);
  assert.equal(ok.draft, a.draft);
  assert.equal(ok.delivered, false); // nothing executed in v0

  const bad = runAction("not_a_real_action", { action: a });
  assert.equal(bad.ok, false);
});
