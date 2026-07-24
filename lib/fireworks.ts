/* The Fireworks service — the ONLY place that talks to Fireworks. Live calls
 * only: it throws on any failure and the orchestrator (lib/ori.ts) falls back
 * to the mock brain, so this module never has to know mock mode exists.
 *
 * Fireworks is OpenAI-compatible. To change models, edit FIREWORKS_MODEL. To
 * change providers entirely, replace this file — OriBrief is the only contract
 * the rest of the app depends on. */

import { ORI_SYSTEM_PROMPT } from "./prompts";
import { WEARABLES } from "./mock";
import type { BaselineSummary, OriBrief, Signals } from "./types";

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
  return `Return ONLY a JSON object (no markdown, no code fences) with exactly these keys: "greeting" (short, e.g. "🌅 Morning Brief"), "summary" (one-sentence overall read), "observations" (array of exactly 3 short interpreted strings), "recommendation" (the one thing to do today), "reassurance" (the one thing NOT to worry about), "confidence" ("low"|"medium"|"medium-high"|"high"), "reasoning" (2-3 sentences of the "why" behind the read), "answer" (${hasQuestion ? "a direct reply to the user's question in the same voice" : "null"}).`;
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
  };
}
