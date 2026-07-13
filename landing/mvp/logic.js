/* MVP business logic — pure functions only, no DOM, no fetch.
 * Everything an operator or athlete screen computes lives here so the UI
 * files stay presentational. Swapping mock data for a real backend later
 * changes store.js, never this file.
 * Validation question for every function: does it help validate daily
 * recovery competitions? (Scoring, ranks, reminder state, sources — yes.)
 */

var MVP = (function () {
  // Same correction factors as the main site — keep in sync with try.html DEVICE_MODEL.
  var DEVICES = {
    oura:   { tag: "Oura",        factor: 0.97, offset: 2.5 },
    whoop:  { tag: "Whoop",       factor: 0.92, offset: -1.0 },
    garmin: { tag: "Garmin",      factor: 0.95, offset: 0.0 },
    apple:  { tag: "Apple Watch", factor: 0.90, offset: 1.0 },
    other:  { tag: "Other",       factor: 1.0,  offset: 0.0 },
  };

  // Invite-code prefix = acquisition source. Codes look like RUN-014.
  var SOURCES = { RUN: "Run club", IG: "Instagram", TW: "X / Twitter", GYM: "Gym / box", REF: "Referral", OP: "Direct invite" };

  function normalize(raw, device) {
    var m = DEVICES[device] || DEVICES.other;
    return Math.max(0, Math.min(100, Math.round(raw * m.factor + m.offset)));
  }

  function deviceTag(device) { return (DEVICES[device] || DEVICES.other).tag; }

  // LOCAL dates on purpose: with UTC keys the board day would flip mid-evening
  // in SF — right when reminder state matters most.
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function dayOffset(day, minus) {
    var parts = day.split("-").map(Number);
    return todayKey(new Date(parts[0], parts[1] - 1, parts[2] - minus));
  }

  function codeValid(code) { return /^[A-Z]{2,3}-\d{3}$/.test(String(code || "").trim().toUpperCase()); }

  function cleanCode(code) { return String(code || "").trim().toUpperCase(); }

  function codeSource(code) { return SOURCES[cleanCode(code).split("-")[0]] || "Other"; }

  function loggedOn(p, day) { return !!(p.scores && p.scores[day] != null); }

  function normalizedOn(p, day) { return loggedOn(p, day) ? normalize(p.scores[day], p.device) : null; }

  // Days from a to b (both "YYYY-MM-DD", local), 0 when equal.
  function daysBetween(a, b) {
    var ap = a.split("-").map(Number), bp = b.split("-").map(Number);
    return Math.round((new Date(bp[0], bp[1] - 1, bp[2]) - new Date(ap[0], ap[1] - 1, ap[2])) / 86400000);
  }

  // 7-day average of normalized scores; a missed day counts 0 (the rule) —
  // but only days since the athlete JOINED can be missed. Without p.joined a
  // Day-5 joiner dragged five pre-join zeros, which punished exactly the
  // people we want to pull in fast. Window = days since joining, capped at 7;
  // athletes without a joined date (the original samples) keep the full week.
  function avg7(p, day) {
    var window = 7;
    if (p.joined) {
      var since = daysBetween(p.joined, day) + 1; // joining day counts
      if (since >= 1 && since < 7) window = since;
    }
    var sum = 0, logged = 0;
    for (var i = 0; i < window; i++) {
      var k = dayOffset(day, i);
      if (loggedOn(p, k)) { sum += normalizedOn(p, k); logged++; }
    }
    return { avg: Math.round((sum / window) * 10) / 10, logged: logged, window: window };
  }

  function streak(p, day) {
    var n = 0;
    for (var i = 0; i < 30; i++) {
      if (loggedOn(p, dayOffset(day, i))) n++;
      else if (i === 0) continue; // today not logged yet doesn't break yesterday's streak
      else break;
    }
    return n;
  }

  function rankBoard(participants, day) {
    var rows = participants.map(function (p) {
      var a = avg7(p, day);
      return { p: p, today: normalizedOn(p, day), avg: a.avg, logged: a.logged, window: a.window, streak: streak(p, day), loggedToday: loggedOn(p, day) };
    });
    rows.sort(function (x, y) { return y.avg - x.avg || (y.today || 0) - (x.today || 0); });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  // waiting → your team needs today's number; done → logged; late → evening nudge tone.
  function reminderState(p, day, hour) {
    if (loggedOn(p, day)) return "done";
    return hour >= 18 ? "late" : "waiting";
  }

  function reminderList(participants, day) {
    return participants.filter(function (p) { return !loggedOn(p, day); });
  }

  function reminderMessage(p, day) {
    return "Morning " + (p.name.split(" ")[0]) + " — the board's waiting on your score for day " + day.slice(5) +
      ". Screenshot your recovery screen and send it back here. A missed day counts 0 for you. — Oriya";
  }

  // Provisional archetypes — same taxonomy as try.html's PERSONALITIES, and
  // like there it's a stable hash (code+device), flavor not diagnosis, so the
  // read never flips day to day. Needs 3+ logged mornings before it shows.
  var ARCHETYPES = [
    { type: "Phase-Advanced Operator",   note: "Morning-loaded · HRV peaks pre-0700" },
    { type: "Delayed-Phase Engine",      note: "Night-loaded · ramps post-22:00" },
    { type: "High-HRV Sustainer",        note: "Minimal day-to-day drift" },
    { type: "Slow-Wave Dominant",        note: "Clears debt in one night" },
    { type: "Acute-Load Responder",      note: "Fast between-session rebound" },
    { type: "Variance Damper",           note: "Flattest swing on the board" },
    { type: "Strain-Tolerant Workhorse", note: "Holds readiness under load" },
    { type: "Parasympathetic Dominant",  note: "Vagal tone runs hot" },
  ];
  function archetype(p, day) {
    if (avg7(p, day).logged < 3) return null;
    var h = 0, s = String(p.code) + String(p.device);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
    return ARCHETYPES[h % ARCHETYPES.length];
  }

  // Passport stamps — only ones derivable from board data (no sleep-time
  // badges the MVP can't verify).
  function stamps(p, day, rank) {
    var a = avg7(p, day), peak = 0;
    for (var i = 0; i < 7; i++) {
      var v = normalizedOn(p, dayOffset(day, i));
      if (v != null && v > peak) peak = v;
    }
    return [
      { short: "FOUNDING 50",    emoji: "🏛", earned: true,                              hint: "Founding-season athlete" },
      { short: "7-DAY ADHERENT", emoji: "🔥", earned: a.logged >= 7,                     hint: "Log 7 mornings in 7 days" },
      { short: "PEAK 85+",       emoji: "⛰", earned: peak >= 85,                        hint: "Hit an adjusted 85+" },
      { short: "TOP 3",          emoji: "🏅", earned: rank != null && rank <= 3,         hint: "Hold a podium spot" },
    ];
  }

  // Group standings (device wars, squad cup): rank groups by the mean of
  // their members' 7-day averages — so a no-show member drags the side down.
  function groupBoard(participants, day, keyOf) {
    var by = {};
    participants.forEach(function (p) {
      var k = keyOf(p);
      (by[k] = by[k] || []).push(p);
    });
    return Object.keys(by).map(function (k) {
      var sum = by[k].reduce(function (acc, p) { return acc + avg7(p, day).avg; }, 0);
      return {
        key: k,
        members: by[k],
        avg: Math.round((sum / by[k].length) * 10) / 10,
        loggedToday: by[k].filter(function (p) { return loggedOn(p, day); }).length,
      };
    }).sort(function (a, b) { return b.avg - a.avg; });
  }

  function sourceStats(participants, day) {
    var by = {};
    participants.forEach(function (p) {
      var s = codeSource(p.code);
      if (!by[s]) by[s] = { source: s, count: 0, loggedToday: 0 };
      by[s].count++;
      if (loggedOn(p, day)) by[s].loggedToday++;
    });
    return Object.keys(by).map(function (k) {
      var r = by[k];
      r.rate = r.count ? Math.round((r.loggedToday / r.count) * 100) : 0;
      return r;
    }).sort(function (a, b) { return b.count - a.count; });
  }

  return {
    DEVICES: DEVICES, SOURCES: SOURCES,
    normalize: normalize, deviceTag: deviceTag, todayKey: todayKey, dayOffset: dayOffset,
    codeValid: codeValid, cleanCode: cleanCode, codeSource: codeSource,
    loggedOn: loggedOn, normalizedOn: normalizedOn, avg7: avg7, streak: streak,
    rankBoard: rankBoard, groupBoard: groupBoard, archetype: archetype, stamps: stamps,
    reminderState: reminderState, reminderList: reminderList,
    reminderMessage: reminderMessage, sourceStats: sourceStats,
  };
})();
