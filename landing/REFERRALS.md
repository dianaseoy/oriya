# Oriya — Referral graph & waitlist ranking (Tally-side)

How to turn raw Tally submissions into a ranked, gamified waitlist.

The landing page never tracks counts itself — it only **writes** to Tally:

| Tally field | Source | Meaning |
|---|---|---|
| `Email` | user input | the signup |
| `ref` (hidden) | inbound `?ref=` URL param | the **referrer's** code |
| `source` (hidden) | always `landing` | attribution channel |

Plus the column Tally adds automatically:

| Tally column | Meaning |
|---|---|
| `Submission ID` | Tally's own unique id for the row (a.k.a. `respondentId`) |

---

## 1. The referral code (anchored on Tally's submission id)

When a signup is confirmed, the page reads `respondentId` from Tally's
`FormSubmitted` event and builds that person's shareable code as:

```
code = sanitize(localPart) + "-" + submissionId
```

- `localPart` = everything before `@`, lowercased, non‑alphanumerics → `-`
  (empty → `oriya`). This is **only a human‑readable label.**
- `submissionId` = Tally's `respondentId` for that row, lowercased,
  non‑alphanumerics stripped. This is the part that matters.

So a signup whose Tally row id is `a1b2c3d4` shares `…?ref=diana-a1b2c3d4`.

The id is always the **last `-`‑separated segment** of the code (the label may
contain dashes; the id never does):

```
referrerId = code.split("-").pop()
```

> ⚠️ **One thing to verify once:** the `respondentId` delivered to the page in
> the `FormSubmitted` event must equal the `Submission ID` Tally writes to your
> Sheet/export. They are the same identifier in Tally's model, but confirm it on
> your first real referral (sign up B through A's link, then check that
> `B.ref`'s trailing segment equals `A`'s `Submission ID`). If they ever differ,
> attribution breaks and nothing else here will work.

There is no hashing and nothing to keep "byte‑identical" between the page and
this doc anymore — the code carries Tally's own row id, so you match on it
directly.

---

## 2. Google Sheets / Apps Script (recommended)

Tally → **Integrations → Google Sheets** pushes every submission to a sheet
(columns include `Email`, `ref`, `source`, `Submission ID`, `Submitted at`).
Then add this Apps Script (Extensions → Apps Script) and run `rankWaitlist()`.

```js
function rankWaitlist() {
  var sh = SpreadsheetApp.getActiveSheet();
  var rows = sh.getDataRange().getValues();
  var header = rows.shift().map(function (h) { return String(h).trim().toLowerCase(); });
  var iEmail = header.indexOf('email');
  var iRef   = header.indexOf('ref');
  var iId    = header.findIndex(function (h) { return h.indexOf('submission id') > -1 || h === 'id' || h.indexOf('respondent') > -1; });
  var iTime  = header.findIndex(function (h) { return h.indexOf('submitted') > -1 || h === 'created at'; });

  // normalize an id the same way the page does (lowercase, alphanumerics only)
  function normId(v) { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  // the referrer id is the trailing segment of a ref code
  function refToId(v) { var parts = String(v || '').trim().split('-'); return normId(parts[parts.length - 1]); }

  // 1) one record per row, keyed by its own Tally submission id
  var people = {}; // id -> { id, email, ref, joinedAt }
  rows.forEach(function (r) {
    var id = normId(r[iId]);
    if (!id) return;
    people[id] = {
      id: id,
      email: String(r[iEmail] || '').trim().toLowerCase(),
      ref: refToId(r[iRef]),
      joinedAt: iTime > -1 ? new Date(r[iTime]).getTime() : 0
    };
  });

  // 2) count referrals: each row's ref points at its referrer's submission id
  var counts = {};
  Object.keys(people).forEach(function (id) {
    var ref = people[id].ref;
    if (!ref) return;                      // organic signup
    if (!people[ref] || ref === id) return; // unknown id or self-referral → ignore
    counts[ref] = (counts[ref] || 0) + 1;
  });

  // 3) rank: most referrals first, ties broken by earliest signup
  var ranked = Object.keys(people).map(function (id) {
    return { id: id, email: people[id].email, referrals: counts[id] || 0, joinedAt: people[id].joinedAt };
  }).sort(function (a, b) {
    return b.referrals - a.referrals || a.joinedAt - b.joinedAt;
  });

  // 4) write a Leaderboard tab
  var out = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaderboard')
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Leaderboard');
  out.clear();
  out.appendRow(['Position', 'Email', 'Submission ID', 'Referrals', 'Tier']);
  ranked.forEach(function (p, i) {
    out.appendRow([i + 1, p.email, p.id, p.referrals, tier(p.referrals)]);
  });
}

function tier(n) {
  if (n >= 10) return 'Founding Athlete';
  if (n >= 3)  return 'First cohort';
  if (n >= 1)  return 'Priority';
  return 'General queue';
}
```

Run it (or set a time-driven trigger to run hourly) → a **Leaderboard** tab
appears with position, referral count, and tier for everyone.

---

## 3. Ranking rules (what the tiers mean)

These mirror the milestones shown in the signup modal on the site:

| Referrals | Tier | Perk |
|---|---|---|
| 0 | General queue | standard position, sorted by signup time |
| 1+ | **Priority** | skip the general queue |
| 3+ | **First cohort** | access the day Season 1 opens |
| 10+ | **Founding Athlete** | exclusive status, perks & badge |

**Position** = sort by `(referrals desc, signupTime asc)`. Referrals are the
primary lever (that's the gamification); signup time only breaks ties, so early
joiners aren't permanently ahead of someone who actually brings friends.

---

## 4. Edge cases handled

- **Self-referral** — a row whose `ref` id equals its own submission id is ignored.
- **Unknown / stale `ref`** — an id matching no known submission (e.g. someone
  shared before signing up, or hand-edited URL) → treated as organic, not credited.
- **Empty `ref`** — organic signup, 0 referrals.
- **Label noise** — only the trailing id segment of `ref` is used, so the
  human-readable email prefix never affects matching.

---

## 5. If you'd rather do it in Python (one-off export)

```python
import csv, re

def norm_id(v):  return re.sub(r'[^a-z0-9]+', '', (v or '').strip().lower())
def ref_to_id(v): return norm_id((v or '').strip().split('-')[-1])

rows = list(csv.DictReader(open('tally_export.csv')))
people = {}
for r in rows:
    rid = norm_id(r.get('Submission ID') or r.get('id') or '')
    if not rid:
        continue
    people[rid] = {'email': (r.get('Email') or '').strip().lower(), 'ref': ref_to_id(r.get('ref'))}

counts = {}
for rid, p in people.items():
    ref = p['ref']
    if ref and ref in people and ref != rid:
        counts[ref] = counts.get(ref, 0) + 1

ranked = sorted(people, key=lambda rid: -counts.get(rid, 0))
for i, rid in enumerate(ranked, 1):
    print(i, people[rid]['email'], rid, counts.get(rid, 0))
```

---

## 6. Live on-page counter (optional, later)

Showing a real "you have 3 referrals" number **in the modal** isn't possible
from the static page — the browser can't read Tally's data. It needs a tiny
backend (a serverless function) that queries the
[Tally API](https://developers.tally.so/) `GET /forms/{formId}/submissions`,
runs the same counting logic above (match each submission's `ref` id against
every row's submission id), and returns a count for a given id. Wire that to a
`fetch()` in the modal and you get a live position. Say the word and I'll build
that endpoint.
