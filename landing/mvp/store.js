/* MVP storage + IO. Mock-data-first by design:
 * - Athletes READ the board from data/board.json (a file the founder pushes —
 *   git is the database; every write is a deliberate operator action).
 * - The operator WORKS in localStorage on ops-33a447.html and exports two files:
 *   board.json (public — contacts stripped) and a full local backup.
 * To go beyond manual ops later, replace fetchBoard/publishing here with an
 * API; logic.js and the UI files don't change.
 */

var STORE = (function () {
  var BOARD_URL = "data/board.json";

  // SAMPLE boards re-anchor to today so the demo never decays (a static file
  // whose day falls behind makes every 7-day average bleed toward 0 — that's
  // a bug in the demo, not a fact). Real published boards (sample:false) are
  // never shifted: real dates are the record. Requires logic.js loaded first.
  function reanchor(b) {
    if (!b || !b.sample || !b.day) return b;
    var today = MVP.todayKey();
    if (b.day === today) return b;
    var fp = b.day.split("-").map(Number);
    var from = new Date(fp[0], fp[1] - 1, fp[2]);
    var now = new Date();
    var delta = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - from) / 86400000);
    b.participants.forEach(function (p) {
      var shifted = {};
      Object.keys(p.scores || {}).forEach(function (k) {
        var kp = k.split("-").map(Number);
        shifted[MVP.todayKey(new Date(kp[0], kp[1] - 1, kp[2] + delta))] = p.scores[k];
      });
      p.scores = shifted;
      if (p.joined) {
        var jp = p.joined.split("-").map(Number);
        p.joined = MVP.todayKey(new Date(jp[0], jp[1] - 1, jp[2] + delta));
      }
    });
    b.day = today;
    return b;
  }

  async function fetchBoard() {
    try {
      var r = await fetch(BOARD_URL + "?t=" + Date.now());
      if (!r.ok) throw 0;
      return reanchor(await r.json());
    } catch (e) {
      // file:// previews (and broken local setups) can't fetch a relative
      // path — fall back to the live board, which sends CORS via _headers.
      if (location.hostname === "oriya.app") return null;
      try {
        var r2 = await fetch("https://oriya.app/mvp/data/board.json?t=" + Date.now());
        if (!r2.ok) return null;
        return reanchor(await r2.json());
      } catch (e2) { return null; }
    }
  }

  function loadLocal(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }

  function saveLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // Athlete identity on this device: just their invite code.
  var ME_KEY = "oriya:mvp:me";
  function loadMe() { return loadLocal(ME_KEY, null); }
  function saveMe(code) { saveLocal(ME_KEY, code); }

  // Operator working copy (includes private contact fields — never published).
  var ADMIN_KEY = "oriya:mvp:admin";
  function loadAdmin() { return loadLocal(ADMIN_KEY, null); }
  function saveAdmin(board) { saveLocal(ADMIN_KEY, board); }

  // Public board = working copy minus anything personal beyond name/handle.
  function publicBoard(board) {
    return {
      updated: new Date().toISOString().slice(0, 16).replace("T", " "),
      day: board.day, season: board.season, sample: !!board.sample,
      participants: board.participants.map(function (p) {
        var row = { code: p.code, name: p.name, handle: p.handle || "", device: p.device, scores: p.scores || {} };
        if (p.fvo) row.fvo = p.fvo; // Founders-vs-Operators side — public, it's on the challenge board
        if (p.joined) row.joined = p.joined; // join date — public, it sets their scoring window
        return row;
      }),
    };
  }

  function downloadJSON(obj, filename) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  return { fetchBoard: fetchBoard, loadMe: loadMe, saveMe: saveMe, loadAdmin: loadAdmin, saveAdmin: saveAdmin, publicBoard: publicBoard, downloadJSON: downloadJSON };
})();
