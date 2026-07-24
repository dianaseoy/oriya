"use client";

/* Ori Daily Brief — reusable panel (Next.js 14 App Router reference).
 *
 * This is the spec-compliant React component. TODAY the brief ships integrated
 * into the live Ori companion at landing/ori.html (the product is a Cloudflare
 * Worker + static assets, not a Next app yet), where the entry point is a
 * screenshot upload. This component is the typed-metrics reference that drops in
 * 1:1 when the product moves to Next — same design tokens, same /api/ask-ori —
 * exactly as app/p/[username]/page.tsx mirrors landing/mvp/passport.html.
 *
 * Data: POST /api/ask-ori. The reasoning engine is isolated in lib/ (prompts.ts,
 * fireworks.ts, mock.ts, ori.ts): Fireworks when FIREWORKS_API_KEY is set, the
 * mock brain otherwise. Ori interprets wearable metrics; it never just repeats
 * them.
 */

import { useState } from "react";
import type { OriBrief, OriMetrics, Wearable } from "../lib/types";

const WEARABLES: Record<Wearable, { label: string; score: string; preset: OriMetrics }> = {
  whoop: { label: "WHOOP", score: "Recovery", preset: { recovery: 42, sleep: "5h31", hrv: 38, rhr: 68 } },
  oura: { label: "Oura", score: "Readiness", preset: { recovery: 81, sleep: "7h48", hrv: 62, rhr: 54 } },
  garmin: { label: "Garmin", score: "Body Battery", preset: { recovery: 58, sleep: "6h40", hrv: 49, rhr: 60 } },
  apple: { label: "Apple Watch", score: "Recovery", preset: { sleep: "6h05", hrv: 44, rhr: 63 } },
};

const THINK = [
  "Looking across your recovery trend…",
  "Comparing sleep consistency…",
  "Reading your HRV against your baseline…",
  "Thinking…",
];

type Msg = { who: "user" | "bot"; text: string };

async function ask(wearable: Wearable, metrics: OriMetrics, userQuestion = ""): Promise<OriBrief> {
  const res = await fetch("/api/ask-ori", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wearable, metrics, userQuestion }),
  });
  if (!res.ok) throw new Error("ask-ori " + res.status);
  return res.json();
}

export default function OriDailyBrief() {
  const [wearable, setWearable] = useState<Wearable>("whoop");
  const [metrics, setMetrics] = useState<OriMetrics>(WEARABLES.whoop.preset);
  const [brief, setBrief] = useState<OriBrief | null>(null);
  const [thinking, setThinking] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [thread, setThread] = useState<Msg[]>([]);
  const [q, setQ] = useState("");

  function pick(k: Wearable) {
    setWearable(k);
    setMetrics(WEARABLES[k].preset);
  }
  function setField(key: keyof OriMetrics, v: string) {
    setMetrics((m) => ({ ...m, [key]: v }));
  }

  async function generate() {
    setBrief(null);
    setThread([]);
    setShowWhy(false);
    // streaming "thinking" — Ori appears to reason before answering
    let i = 0;
    setThinking(THINK[0]);
    const timer = setInterval(() => setThinking(THINK[(i = (i + 1) % THINK.length)]), 620);
    const data = await ask(wearable, metrics).catch(() => null);
    await new Promise((r) => setTimeout(r, 1500)); // let the thinking breathe
    clearInterval(timer);
    setThinking(null);
    if (data) setBrief(data);
  }

  async function sendQ(text: string) {
    text = text.trim();
    if (!text) return;
    setQ("");
    setThread((t) => [...t, { who: "user", text }, { who: "bot", text: "…" }]);
    const data = await ask(wearable, metrics, text).catch(() => null);
    const answer = data?.answer || data?.summary || "I'm here — ask me anything about this morning.";
    setThread((t) => t.map((m, i) => (i === t.length - 1 ? { who: "bot", text: answer } : m)));
  }

  return (
    <div className="odb">
      <div className="odb-top">
        <span className="odb-avatar">O</span>
        <span className="odb-name">Ori</span>
        <span className="odb-vtag">v0.1 · daily brief</span>
      </div>
      <p className="odb-lede">Every wearable speaks a different language. Ori reads yours and tells you what it actually means.</p>

      <div className="odb-card">
        <span className="odb-label">Whose morning are we reading?</span>
        <div className="odb-chips">
          {(Object.keys(WEARABLES) as Wearable[]).map((k) => (
            <button key={k} className={"odb-chip" + (k === wearable ? " on" : "")} onClick={() => pick(k)}>
              {WEARABLES[k].label}
            </button>
          ))}
        </div>
        <div className="odb-grid">
          <Field label={WEARABLES[wearable].score} value={metrics.recovery ?? ""} onChange={(v) => setField("recovery", v)} />
          <Field label="Sleep" value={metrics.sleep ?? ""} onChange={(v) => setField("sleep", v)} placeholder="7h20" />
          <Field label="HRV (ms)" value={metrics.hrv ?? ""} onChange={(v) => setField("hrv", v)} />
          <Field label="Resting HR" value={metrics.rhr ?? ""} onChange={(v) => setField("rhr", v)} />
        </div>
        <button className="odb-go" onClick={generate} disabled={!!thinking}>
          Read my morning
        </button>
      </div>

      {thinking && (
        <div className="odb-card odb-thinking">
          <span className="odb-dot" /> {thinking}
        </div>
      )}

      {brief && (
        <div className="odb-card">
          <div className="odb-greeting">{brief.greeting}</div>
          <p className="odb-summary">{brief.summary}</p>
          <ul className="odb-obs">
            {brief.observations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
          <div className="odb-block rec">
            <b>What I'd do</b>
            {brief.recommendation}
          </div>
          <div className="odb-block rea">
            <b>Don't worry about</b>
            {brief.reassurance}
          </div>
          <div className="odb-meta">
            {brief.confidence && (
              <span className="odb-pill">
                confidence <b>{brief.confidence}</b>
              </span>
            )}
            <button className="odb-why" onClick={() => setShowWhy((s) => !s)}>
              {showWhy ? "Hide" : "Why?"}
            </button>
          </div>
          {showWhy && <div className="odb-reasoning">{brief.reasoning}</div>}

          <div className="odb-ask">
            <span className="odb-label">Ask Ori</span>
            <div className="odb-ex">
              {["Can I push today's workout?", "Why is my recovery lower?", "What changed this week?"].map((ex) => (
                <button key={ex} onClick={() => sendQ(ex)}>
                  {ex}
                </button>
              ))}
            </div>
            <div className="odb-thread">
              {thread.map((m, i) => (
                <div key={i} className={"odb-msg " + m.who}>
                  {m.text}
                </div>
              ))}
            </div>
            <div className="odb-bar">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendQ(q)}
                placeholder="Ask Ori anything about your morning…"
              />
              <button className="odb-send" onClick={() => sendQ(q)}>
                Ask
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="odb-field">
      <span>{label}</span>
      <input value={String(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
