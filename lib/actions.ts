/* Ori Acts — the done-for-you actions layer.
 *
 * This is what moves Ori from ADVISOR (tells you your read) to OPERATOR (does
 * the work). v0 is draft-and-hand-off: every action produces a copy-ready
 * work-product from the SAME in-request signals that make the brief. Nothing is
 * stored, posted, placed, or charged — the user copies the draft and acts.
 *
 * Two exported surfaces:
 *   buildActions(s, state) — the deterministic generator the mock brain uses and
 *     the Fireworks path falls back to. Honors the spine: own-par (baseline only
 *     when real), never-medical, and real-money = PROPOSE, never auto-commit.
 *   runAction(name, args)  — the single dispatch seam. v0 just hands the draft
 *     back with delivered:false. This is the exact function a future
 *     POST /api/ori/act route and MCP `ori.act` tool will call — the twin of the
 *     client-side onGesture seam in landing/ori-pet.html. Real execution backends
 *     (calendar write, squad post, Duels stake) drop in behind this signature
 *     without touching any caller.
 *
 * ACTION_CATALOG is shaped as an MCP tool manifest on purpose: a later worker can
 * enumerate it as tools with zero reshaping — the agent-native infra seam. */

import { WEARABLES } from "./mock.ts";
import type { OriAction, OriActionKind, Signals } from "./types.ts";

export type ActionState = "strained" | "primed" | "steady";

/* MCP-tool-manifest-shaped catalog. `name` === the dispatch id === OriAction.kind
 * for v0. inputSchema is JSON-schema so it can be surfaced as an agent tool as-is. */
export const ACTION_CATALOG: {
  name: OriActionKind;
  kind: OriActionKind;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
}[] = [
  {
    name: "draft_checkin",
    kind: "draft_checkin",
    description: "Draft a short, ready-to-post accountability check-in for the user's squad or duel, grounded in today's read.",
    inputSchema: { type: "object", properties: { draft: { type: "string" } }, required: ["draft"] },
  },
  {
    name: "plan_today",
    kind: "plan_today",
    description: "Turn today's read into 2-3 concrete training/recovery swaps for the day. Coaching only, never medical.",
    inputSchema: { type: "object", properties: { draft: { type: "string" } }, required: ["draft"] },
  },
  {
    name: "frame_stake",
    kind: "frame_stake",
    description: "Draft a proposed Recovery-Network stake/duel line the user can place themselves. A PROPOSAL only — never commits money.",
    inputSchema: { type: "object", properties: { draft: { type: "string" } }, required: ["draft"] },
  },
];

/* True only when the user has a real ≥2-day baseline — the same gate mock.ts uses
 * before it will reference "your normal". Keeps own-par honest: no invented past. */
function hasBaseline(s: Signals): boolean {
  return !!(s.baseline && s.baseline.days >= 2);
}

/** Generate the done-for-you drafts for a read. Deterministic; no side effects. */
export function buildActions(s: Signals, state: ActionState, source: "fireworks" | "mock" = "mock"): OriAction[] {
  const w = WEARABLES[s.wearable];
  const base = hasBaseline(s);

  // A one-clause own-par tag, used only when a real baseline backs it.
  const ownPar =
    base && s.hrv != null && s.baseline!.hrvAvg != null
      ? s.hrv >= Math.round(s.baseline!.hrvAvg)
        ? " (HRV at/above my own baseline)"
        : " (HRV under my own baseline)"
      : "";

  const checkin =
    state === "strained"
      ? `Rough read today — more grit than recovery${ownPar}, so I'm keeping it easy and aerobic. Still showing up. ✅`
      : state === "primed"
      ? `Green light this morning — recovered and ready${ownPar}. Taking the hard session while I've got it. 🟢`
      : `Steady day — nothing loud either way${ownPar}. Normal session, reading the first 10 minutes. Logged. ✅`;

  const plan =
    state === "strained"
      ? "• Swap the intervals → 35–45 min easy zone-2\n• Drop the top-end sets, keep it conversational\n• Bank the intensity for a day the numbers back it"
      : state === "primed"
      ? "• Take the harder session you've been eyeing\n• Warm up honestly, then commit to it\n• One quality block beats three half-efforts"
      : "• Normal session — let the first 10 minutes decide\n• Feels good, take it; feels heavy, ease off (no guilt)\n• Consistency today over heroics";

  // Real-money = PROPOSE only. No "placed"/"charged"; Ori writes the line, the
  // user sets it in Duels. Wording is deliberately proposal-framed.
  const stake =
    state === "primed"
      ? "Want it to count for real? Draft stake: “I take my planned hard session today — miss it and $10 rides to my duel partner.” You set this in Duels yourself; I only write the line, I never move money."
      : "Want it to count for real? Draft stake: “I do my planned session today — skip it and $10 rides to my duel partner.” You set this in Duels yourself; I only write the line, I never move money.";

  return [
    {
      id: "draft_checkin",
      kind: "draft_checkin",
      label: "Copy my check-in",
      why: "A one-tap check-in for your squad, matched to today's read.",
      draft: checkin,
      source,
    },
    {
      id: "plan_today",
      kind: "plan_today",
      label: "Copy today's plan",
      why: base
        ? "Concrete swaps for today, measured against your own baseline."
        : "Concrete swaps for today's read.",
      draft: plan,
      source,
    },
    {
      id: "frame_stake",
      kind: "frame_stake",
      label: "Draft a stake",
      why: "Turn today's plan into an accountability stake — you place it, not me.",
      draft: stake,
      source,
    },
  ];
}

export interface ActionResult {
  ok: boolean;
  kind: OriActionKind;
  draft: string;
  delivered: boolean; // v0 is always false — draft handed back, nothing executed
  note: string;
}

/** The dispatch seam. v0: validate the name and hand the draft back undelivered.
 * A future POST /api/ori/act + MCP `ori.act` tool calls THIS — real backends
 * (squad post, Duels stake, calendar write) replace the body and set
 * delivered:true, without any caller changing. */
export function runAction(name: string, args: { action: OriAction }): ActionResult {
  const entry = ACTION_CATALOG.find((a) => a.name === name);
  if (!entry || !args || !args.action) {
    return { ok: false, kind: (name as OriActionKind), draft: "", delivered: false, note: "unknown_action" };
  }
  // v0 draft-only: no execution backend is wired yet.
  return { ok: true, kind: entry.kind, draft: args.action.draft, delivered: false, note: "draft-only" };
}
