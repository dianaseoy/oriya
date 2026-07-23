/* POST /api/manual-submit — the manual pipeline's only server piece.
 * The participant never sends an email: the form posts here, we forward one
 * email to team@oriya.app with the screenshot attached, and the founder's
 * inbox is the pending queue (admin board stays the source of truth).
 * No storage, no database, no accounts — the message IS the record.
 *
 * Secrets: RESEND_API_KEY (required; unset → { ok:false, code:"config" } and
 * the form falls back to a prefilled mail draft). Optional var SUBMIT_FROM —
 * defaults to board@oriya.app, which must be a Resend-verified domain sender.
 * Never log emails, scores, or image data — observability is on.
 */

var DEVICES = ["Oura", "Whoop", "Garmin", "Apple Health"];
var MAX_B64 = 7 * 1024 * 1024; // ~5MB image after base64 inflation

// Cross-device normalization — the same correction factors as landing/mvp/logic.js
// (keep in sync). Raw device score → one comparable 0-100 Oriya Index. This is
// deterministic math, computed instantly; the only human step is confirming the
// screenshot is a real device capture, which never changes the number.
var MODEL = {
  "Oura":         { factor: 0.97, offset: 2.5 },
  "Whoop":        { factor: 0.92, offset: -1.0 },
  "Garmin":       { factor: 0.95, offset: 0.0 },
  "Apple Health": { factor: 0.90, offset: 1.0 },
};
function oriyaIndex(raw, device) {
  var m = MODEL[device] || { factor: 1.0, offset: 0.0 };
  return Math.max(0, Math.min(100, Math.round(raw * m.factor + m.offset)));
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function manualSubmit(request, env) {
  if (request.method !== "POST") return json({ ok: false, code: "method" }, 405);
  if (!env.RESEND_API_KEY) return json({ ok: false, code: "config" }, 200);

  var body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, code: "parse" }, 400); }

  var email = String(body.email || "").trim().toLowerCase();
  var device = String(body.device || "").trim();
  var score = Number(body.score);
  var challenge = String(body.challenge || "").slice(0, 80);
  var code = String(body.code || "").slice(0, 12);
  // Ori's read — computed client-side (par lives in the browser); quoted in the
  // E1 receipt only. Flattened + capped so it can't bloat or break the email.
  var read = String(body.read || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, code: "email" }, 400);
  if (DEVICES.indexOf(device) < 0) return json({ ok: false, code: "device" }, 400);
  if (!(score >= 0 && score <= 100)) return json({ ok: false, code: "score" }, 400);
  var index = oriyaIndex(score, device);

  var m = String(body.image || "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[2].length > MAX_B64) return json({ ok: false, code: "image" }, 400);
  var ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";

  var when = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }) + " PT";
  var text = "New Oriya submission\n\nEmail:\n" + email + "\n\nDevice:\n" + device +
    "\n\nRaw score:\n" + score +
    "\n\nOriya Index (auto-normalized):\n" + index + "  ← posted to the athlete instantly; verify the screenshot is a real device capture" +
    (code ? "\n\nInvite code:\n" + code : "") +
    (challenge ? "\n\nChallenge:\n" + challenge : "") +
    "\n\nTimestamp:\n" + when + "\n";

  var res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.SUBMIT_FROM || "Oriya Board <board@oriya.app>",
      to: ["team@oriya.app"],
      reply_to: email,
      subject: "New Oriya submission · " + device + " " + score + (code ? " · " + code : ""),
      text: text,
      attachments: [{ filename: "recovery." + ext, content: m[2] }],
    }),
  });
  if (!res.ok) return json({ ok: false, code: "send" }, 502);

  // E1 — the instant-score receipt to the participant. Normalization is
  // deterministic math (computed above), so the number is real and immediate —
  // no "wait an hour". Best-effort: the team email above is the real record, so
  // a failed receipt never fails the submission. Board voice discloses the
  // human; reply routes to the founder. Keep this copy in sync with the E1 card
  // on the outreach workbench.
  try {
    var lock = challenge ? " You're in on " + challenge + "." : "";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.SUBMIT_FROM || "Oriya Board <board@oriya.app>",
        to: [email],
        reply_to: "team@oriya.app",
        subject: "Your Oriya Index is " + index + " — you're on the board",
        text: "Your Oriya Index is " + index + "." + lock +
          (read ? "\n\n“" + read + "”\n— Ori, your recovery companion" : "") +
          "\n\n" + device + " " + score + " → Index " + index + " — read against your own baseline, same instant math for every device." +
          "\n\nThe only human step is a quick check that your screenshot is a real device capture — it never changes your number." +
          "\n\nWatch your side move → oriya.app/board" +
          "\nSame screenshot tomorrow keeps your streak — a rough morning logged still beats a great one skipped." +
          "\n\n— the Oriya board\nReply to this email and it reaches Diana directly.",
      }),
    });
  } catch (e) { /* receipt is best-effort — never blocks the submission */ }

  return json({ ok: true }, 200);
}
