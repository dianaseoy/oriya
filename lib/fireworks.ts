/* The Fireworks service — the ONLY place that talks to Fireworks. Live calls
 * only: it throws on any failure and the orchestrator (lib/ori.ts) falls back
 * to the mock brain, so this module never has to know mock mode exists.
 *
 * Fireworks is OpenAI-compatible. To change models, edit FIREWORKS_MODEL. To
 * change providers entirely, replace this file — OriBrief is the only contract
 * the rest of the app depends on. */

import { ORI_SYSTEM_PROMPT } from "./prompts.ts";
import { WEARABLES, readState } from "./mock.ts";
import { buildActions } from "./actions.ts";
import type { BaselineSummary, OriAction, OriActionKind, OriBrief, Signals } from "./types.ts";

const ACTION_KINDS: OriActionKind[] = ["draft_checkin", "plan_today", "frame_stake"];

/* Coerce the model's `actions` into a trusted OriAction[]. Drops anything with an
 * unknown kind or an empty draft; de-dupes by kind. Returns null when nothing
 * usable survives, so the caller can fall back to the deterministic generator and
 * the field is never empty. */
function coerceActions(raw: unknown): OriAction[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: OriAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kind = String(o.kind || "") as OriActionKind;
    const draft = String(o.draft || "").trim();
    if (!ACTION_KINDS.includes(kind) || !draft || seen.has(kind)) continue;
    seen.add(kind);
    out.push({
      id: kind,
      kind,
      label: String(o.label || "").trim() || "Copy",
      why: String(o.why || "").trim(),
      draft,
      source: "fireworks",
    });
  }
  return out.length ? out : null;
}

/* Turn a real baseline into a line the model can compare against — or an
 * explicit no-history instruction so it never fabricates one. */
function baselineLine(b: BaselineSummary | null | undefined): string {
  if (!b || b.days < 2) {
    return `No baseline or history is available for this person. Read ONLY today's numbers. Do not reference "usually", a "normal" range, past nights, "this week", or any trend — say plainly that a single morning is limited context.`;
  }
  const bits: string[] = [];
  if (b.avgRecovery != null) bits.push(`avg recovery ${b.avgRecovery}`);
  if (b.avgSleepH != null) bits.push(`avg sleep ${b.avgSleepH}h`);
  if (b.hrvMin != null && b.hrvMax != null) bits.push(`HRV range ${b.hrvMin}-${b.hrvMax}ms (avg ${b.hrvAvg ?? "?"})`);
  if (b.avgRhr != null) bits.push(`avg resting HR ${b.avgRhr}`);
  const patterns = b.patterns && b.patterns.length ? ` Known patterns from their data: ${b.patterns.join("; ")}.` : "";
  return `Their real ${b.days}-day baseline (from their own logged days): ${bits.join(", ")}.${patterns} Compare today against this baseline only — do not invent history beyond these figures.`;
}

export const FIREWORKS_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions";
// ← swap the model here; any Fireworks chat model with JSON mode works.
export const FIREWORKS_MODEL = "accounts/fireworks/models/llama-v3p3-70b-instruct";

/** JSON contract appended to the persona so ORI_SYSTEM_PROMPT stays reusable. */
function schemaInstruction(hasQuestion: boolean): string {
  return `Return ONLY a JSON object (no markdown, no code fences) with exactly these keys: "greeting" (short, e.g. "🌅 Morning Brief"), "summary" (one-sentence overall read), "observations" (array of exactly 3 short interpreted strings), "recommendation" (the one thing to do today), "reassurance" (the one thing NOT to worry about), "confidence" ("low"|"medium"|"medium-high"|"high"), "reasoning" (2-3 sentences of the "why" behind the read), "answer" (${hasQuestion ? "a direct reply to the user's question in the same voice" : "null"}), "actions" (array of 1-3 done-for-you items the person can copy and use immediately, each an object {"kind","label","why","draft"}). The three allowed kinds, use each at most once: "draft_checkin" = a short, ready-to-post accountability check-in for their squad or duel partner; "plan_today" = 2-3 concrete training/recovery swaps for today as bullet lines (coaching only, never medical); "frame_stake" = a PROPOSED accountability stake line they place themselves in Duels — always phrase it as a proposal they set, never say it is already placed or that any money moved. "draft" is the copy-ready text; "label" is a short button like "Copy my check-in"; "why" is one short line tying it to today's read.`;
}

export async function fireworksBrief(apiKey: string, s: Signals): Promise<OriBrief> {
  const w = WEARABLES[s.wearable];
  const system = `${ORI_SYSTEM_PROMPT}

This person's device is ${w.label}${w.native ? "" : ", which ships no single recovery score — read HRV + resting heart rate + sleep together and say so"}.

${schemaInstruction(!!s.question)}`;
  const user = `Wearable: ${w.label}
Today's metrics: ${JSON.stringify({ recovery: s.recovery, hrv: s.hrv, restingHr: s.rhr, sleepHours: s.sleepH })}
${baselineLine(s.baseline)}
${s.question ? `The person also asks: "${s.question}"` : "Write the opening morning brief."}`;

  const res = await fetch(FIREWORKS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      max_tokens: 700,
      temperature: 0.6,
      response_format: { type: "json_object" }, // Fireworks JSON mode
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error("fireworks_" + res.status);
  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(raw); // throws → orchestrator falls back to mock

  return {
    greeting: parsed.greeting || "🌅 Morning Brief",
    summary: String(parsed.summary || ""),
    observations: Array.isArray(parsed.observations) ? parsed.observations.slice(0, 3).map(String) : [],
    recommendation: String(parsed.recommendation || ""),
    reassurance: String(parsed.reassurance || ""),
    confidence: parsed.confidence || null,
    reasoning: String(parsed.reasoning || ""),
    answer: s.question ? String(parsed.answer || "") : null,
    wearable: s.wearable,
    metrics: { recovery: s.recovery, hrv: s.hrv, rhr: s.rhr, sleep: s.sleepH },
    source: "fireworks",
    // Model-authored actions when valid; else the deterministic generator so the
    // field is never empty. Stamped "fireworks" either way (this is the live path).
    actions: coerceActions(parsed.actions) || buildActions(s, readState(s), "fireworks"),
  };
}
