/* MVP storage + IO. Mock-data-first by design:
 * - Athletes READ the board from data/board.json (a file the founder pushes —
 *   git is the database; every write is a deliberate operator action).
 * - The operator WORKS in localStorage on admin.html and exports two files:
 *   board.json (public — contacts stripped) and a full local backup.
 * To go beyond manual ops later, replace fetchBoard/publishing here with an
 * API; logic.js and the UI files don't change.
 */

var STORE = (function () {
  var BOARD_URL = "data/board.json";

  async function fetchBoard() {
    try {
      var r = await fetch(BOARD_URL + "?t=" + Date.now());
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
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
        return { code: p.code, name: p.name, handle: p.handle || "", device: p.device, scores: p.scores || {} };
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
