# oriya

Static landing site (`landing/`) served by Cloudflare Workers static assets, plus one
tiny Worker (`worker/index.js`) that makes the Oura "connect read-only" on /try a
**real** OAuth sync. Everything else on the site is honestly labeled demo.

## Oura live sync — founder ops

One-time setup (nothing works until these are done):

1. **Register the OAuth app** at <https://cloud.ouraring.com/oauth/applications>:
   - Redirect URIs: `https://oriya.app/auth/oura/callback` **and** `http://localhost:8787/auth/oura/callback`
   - Scopes: `daily`, `personal`
2. **Set the Worker secrets** (never put these in any file in this repo):
   ```sh
   npx wrangler secret put OURA_CLIENT_ID
   npx wrangler secret put OURA_CLIENT_SECRET
   npx wrangler secret put OURA_STATE_SECRET   # any random 32+ chars, e.g. `openssl rand -hex 32`
   ```
3. **Confirm deploy wiring**: in the Cloudflare dashboard → Workers → `oriya` → Builds,
   check push-to-main runs `wrangler deploy`. If not wired, deploy manually with
   `npx wrangler deploy`.

Local dev: create `.dev.vars` (gitignored) with the same three vars, then
`npx wrangler dev` and open `http://localhost:8787/try`.

### What the Worker does (privacy contract)

`/auth/oura/start` → Oura consent page → `/auth/oura/callback` exchanges the code,
fetches the last 7 days of readiness, and redirects to `/try#oura=<payload>` —
the scores travel in the URL **fragment**, which browsers never send to a server.
The Worker stores **nothing**: no accounts, no database, no tokens. This contract
is stated verbatim on /try (connect sheet + privacy vault) — if the Worker's
behavior ever changes, change that copy in the same commit.

Failure modes land on `/try#oura-error=<denied|state|exchange|nodata|config>`
and the page offers retry / demo sync / screenshot instead.

## Manual submission pipeline (/mvp) — founder ops

`/mvp/submit.html` posts to the Worker's `POST /api/manual-submit`, which
forwards ONE email to team@oriya.app with the screenshot attached — your inbox
is the pending queue; you type the raw score into the operator console and
publish the board. No storage, no accounts.

**Internal pages (unguessable filenames, never link these publicly):**

- Operator console: `/mvp/ops-33a447.html` — scores, invite codes, publish.
  The "Next invite codes" card shows the next unused code per source prefix
  (RUN/IG/TW/GYM/REF/OP); you reply to each submission with one by hand.
- Outreach workbench: `/mvp/outreach-03d56d.html` — the 4-stage email matrix.

Both are `noindex` and unlinked, but that is obscurity, not auth — the
filenames are visible in this repo, so if the GitHub repo is public anyone
reading it can find them. For a real lock, put `/mvp/ops-*` and
`/mvp/outreach-*` behind Cloudflare Access (Zero Trust → Applications,
free for ≤50 users). Neither page holds secrets: contacts live only in the
operator's browser localStorage, never in the deployed files.

Setup:

1. Create a [Resend](https://resend.com) account, verify the `oriya.app`
   sending domain (free tier: 100 emails/day — fine for 50 athletes).
2. `npx wrangler secret put RESEND_API_KEY`
3. Optional: `SUBMIT_FROM` var to change the sender (default `board@oriya.app`).

Until the secret is set, the form falls back to opening a prefilled email
draft (the participant attaches the screenshot themselves) — nothing breaks.

## Public Body Passport — /p/&lt;username&gt;

Live route: the Worker maps `/p/<handle-or-code>` → `landing/mvp/passport.html?u=…`
(QR + squads/badges/earnings ledger, rendered from `landing/mvp/data/board.json`).
`app/p/[username]/page.tsx` is the spec-equivalent **Next.js 14 reference
implementation** of the same page — it is NOT built or served by this repo's
Worker+assets deploy (no Next app, node not required); it exists so the page
ports 1:1 if the product moves to Next. Do not add a root `package.json` for
it — Cloudflare Workers Builds would try to run a build step.

### Rollback

The assets router matches static files **before** the Worker, so a broken Worker
cannot take down the site — only `/auth/oura/*` is affected. Full rollback:
remove `"main"` from `wrangler.jsonc` and push (pure static again), or
`npx wrangler rollback`.

### Not live (deliberately)

- **Whoop**: possible next (requires the developer to own a Whoop — we do).
- **Garmin**: requires a company application to the Garmin Connect Developer
  Program + a public privacy policy page. Not yet.
- **Apple Watch**: no web API exists; needs an iOS app. The screenshot OCR path
  covers it honestly.
