"use client";

/* Public Body Passport — /p/[username] (Next.js 14 App Router reference).
 *
 * This is the spec-compliant Next.js implementation of the public profile.
 * The PRODUCTION route today is served without Next: the Cloudflare Worker
 * maps /p/<handle-or-code> → landing/mvp/passport.html?u=…, which renders the
 * same data. This file exists so the page ports 1:1 when the product moves to
 * a Next.js app. It is NOT built by the current deploy (repo has no Next app;
 * assets deploy straight from landing/). To use: drop into a Next.js 14
 * project and `npm i qrcode.react`.
 *
 * Honesty rails (same as the live page): data renders from the public
 * board.json — nothing here that the board doesn't already show; earnings are
 * an honest $0.00 for everyone until a pot actually settles; entries are never
 * presented as identity-checked (the board's badge is anon · work-email).
 */

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Participant = { code: string; name: string; handle?: string; device: string; scores: Record<string, number> };
type Board = { season: string; sample?: boolean; participants: Participant[] };

const SOURCES: Record<string, string> = { RUN: "Run club", IG: "Instagram", TW: "X / Twitter", GYM: "Gym / box", REF: "Referral", OP: "Direct invite" };
const DEVICES: Record<string, string> = { oura: "Oura", whoop: "Whoop", garmin: "Garmin", apple: "Apple Watch" };

function last7(p: Participant): number[] {
  const out: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (p.scores[k] != null) out.push(p.scores[k]);
  }
  return out;
}

export default function PublicPassport({ params }: { params: { username: string } }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(window.location.href);
    fetch("/mvp/data/board.json?t=" + Date.now()).then((r) => r.json()).then(setBoard).catch(() => setBoard(null));
  }, []);

  const u = decodeURIComponent(params.username).replace(/^@/, "").toLowerCase();
  const me = board?.participants.find(
    (p) => p.code.toLowerCase() === u || (p.handle || "").replace("@", "").toLowerCase() === u
  );

  if (!board) return <main className="min-h-screen bg-transparent text-gray-100 p-6 text-sm text-gray-400">Loading…</main>;
  if (!me) return <main className="min-h-screen bg-transparent text-gray-100 p-6 text-sm text-gray-400">No athlete “{params.username}” on the board.</main>;

  const days = last7(me);
  const squad = SOURCES[me.code.split("-")[0]] ?? "Open board";
  const badges = [
    { label: "FOUNDING 50", earned: true },
    { label: "7-DAY ADHERENT", earned: days.length >= 7 },
    { label: "PEAK 85+", earned: Math.max(0, ...days) >= 85 },
  ];

  return (
    <main className="min-h-screen bg-transparent text-gray-100 antialiased">
      <div className="mx-auto max-w-md px-5 py-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">Oriya · Body Passport — public view</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {me.name} {me.handle && <span className="text-sm text-gray-400">{me.handle}</span>}
        </h1>
        <p className="mt-1 text-xs text-gray-400 font-mono">
          {DEVICES[me.device] ?? "Other"} · {me.code} · {board.season}{board.sample ? " · sample data" : ""}
        </p>

        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-gray-800 p-5">
          {url && <QRCodeSVG value={url} size={96} bgColor="#E5E7EB" fgColor="#0B0C0E" className="rounded-lg" />}
          <p className="text-xs text-gray-400">
            Scan for the live card. A screenshot goes stale — this page renders straight from the board, so what it shows is what the board says.
          </p>
        </div>

        <ol className="mt-6 space-y-0 border-l border-gray-800 pl-5">
          <li className="relative pb-6">
            <span className="absolute -left-[26px] top-1 h-2 w-2 rounded-full bg-emerald-300" />
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Active squads</p>
            <p className="mt-1 text-sm">{squad} <span className="text-xs text-gray-400">· device wars — {DEVICES[me.device] ?? "Other"} side</span></p>
          </li>
          <li className="relative pb-6">
            <span className="absolute -left-[26px] top-1 h-2 w-2 rounded-full bg-emerald-300" />
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Historic badges</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <span key={b.label} className={`rounded-md border px-2 py-0.5 font-mono text-[10px] tracking-wide ${b.earned ? "border-emerald-300/50 text-emerald-300" : "border-gray-800 text-gray-600"}`}>
                  {b.label}
                </span>
              ))}
            </div>
          </li>
          <li className="relative">
            <span className="absolute -left-[26px] top-1 h-2 w-2 rounded-full bg-amber-400" />
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Earnings balance</p>
            <p className="mt-1 font-mono text-base">$0.00 USD</p>
            <p className="mt-0.5 text-xs text-gray-400">Founding season — no pots settled yet. Pots are sponsor-funded; athletes win them.</p>
          </li>
        </ol>
      </div>
    </main>
  );
}
