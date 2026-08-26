# Unity EOC — Virtual Disaster Command Center

One interface, two modes. **LIVE** runs on real feeds; **EXERCISE** runs the same
maps, forms, ICS structure and comms against simulated data, so the drill and the
real thing are the same muscle memory. Smart India Hackathon entry, PS 83.

This README covers the part that decides *who sees what*: the authentication and
role-based access-control module that now sits under every view in the app.

## Running it

```bash
npm install          # Vite only; the auth server has zero dependencies
npm run seed         # create the account database (prints the 2FA secrets once)
npm run dev          # boots the auth API on :4000 and Vite on :5173 together
```

Then open http://localhost:5173. You will land on the credential gateway — there
is no way past it without a password the server accepts.

| command | what it does |
| --- | --- |
| `npm run dev` | auth API + Vite, colour-prefixed in one terminal |
| `npm run server` | the auth API alone |
| `npm run dev:web` | Vite alone (logins will fail — nothing to authenticate against) |
| `npm run seed` / `npm run reset` | create / wipe the account database |
| `npm run totp <credential>` | print the current 6-digit code for a Tier 1/2 account |
| `npm run test` | the full suite: 83 server break-tests + 60 client end-to-end tests |
| `npm run test:auth` | adversarial server tests only |
| `npm run test:client` | browser-client tests only (boots its own API) |

## The ten seeded accounts

All ten share the password `Unity@2026` — a **demo convenience, documented on
purpose**. Tier 1 and Tier 2 additionally need a rotating TOTP code; the other
tiers do not, which mirrors how a field volunteer actually signs in on a phone.

| credential | tier | jurisdiction | 2FA |
| --- | --- | --- | --- |
| `NDMA-AUTH-01` | T1 Authority | national | yes |
| `NDMA-AUTH-02` | T1 Authority | national | yes |
| `STRAT-OD-01` | T2 Strategist | Odisha | yes |
| `STRAT-WB-02` | T2 Strategist | West Bengal | yes |
| `COORD-BHK-01` | T3 Coordinator | Odisha · Bhadrak / Dhamra | no |
| `COORD-KNP-02` | T3 Coordinator | Odisha · Kendrapara / Rajnagar | no |
| `TACT-NDRF-01` | T4 Tactical | Odisha · Bhadrak / Dhamra | no |
| `TACT-ODRAF-02` | T4 Tactical | Odisha · Kendrapara / Rajnagar | no |
| `VOL-AM-01` | T5 Volunteer | Odisha · Bhadrak / Dhamra | no |
| `VOL-AM-02` | T5 Volunteer | Odisha · Kendrapara / Rajnagar | no |

For a demo, the login screen has a "fetch current code" button that pulls the live
TOTP value. It is served by `GET /api/demo/totp/:credential`, which **returns 404
unless `UNITY_DEMO_MODE=1`** — a flag only `scripts/dev.js` sets, only for the API
child process. Every reveal is written to the audit log. Never set it in a
deployment.

The roster lives in one place, `server/src/db/roster.js`, read by both the seeder
and the public `/api/directory` endpoint, so the cards on the login screen cannot
drift from the accounts that actually exist. Passwords and TOTP secrets are not in
that file — the seeder generates them into `server/data/`, which is git-ignored.

## What the five tiers can do

The permission matrix in `server/src/config/permissions.js` and the nav/action
table in `server/src/config/nav.js` are the single source of truth. An unknown
role, view, action or scope is **denied**, never allowed.

**Tier 1 — Authority (national).** Every view. Signs the Incident Action Plan,
issues declarations, approves funds. Site data arrives *aggregated by region* by
default with an explicit `?view=detail` drill-down, because a national officer
should see the shape of the emergency before the individual shelter rows.
Notably cannot register field assets — that is Tier 2's job, and the matrix says
so rather than granting T1 everything by reflex.

**Tier 2 — Strategist (one region).** Region-scoped reads. Registers assets,
arranges mutual aid, verifies incoming incident reports, transmits SACHET alerts
in LIVE, approves escalations from its region.

**Tier 3 — Coordinator (one district).** Site-scoped. Requests assets rather than
registering them, assigns squads, opens shelters. May transmit a SACHET alert in
**EXERCISE but not in LIVE** — the same button, gated on the mode, which is the
whole point of one interface with two modes.

**Tier 4 — Tactical (one team).** Sees only tasks assigned to it. Files incident
reports and damage assessments. Its escalations go **straight to Tier 2**,
deliberately bypassing Tier 3, because a collapsed bridge should not wait for a
district meeting.

**Tier 5 — Volunteer.** Landing view only, one radio net, push-to-talk. No
resource visibility at all. Escalates to its district Tier 3.

Jurisdiction is enforced twice on purpose: the server filters every list and
returns **404, not 403**, for a row outside your scope (a 403 would confirm the
row exists), and the client filters `src/data.js` by the same region/site rules so
a district coordinator genuinely sees fewer rows than a national officer.

## How the security works

Zero npm dependencies in the auth module — Node built-ins only.

- **Passwords**: scrypt, per-account salt, constant-time comparison.
- **Tokens**: hand-rolled HS256 JWT. The HMAC is computed over the raw
  `header.payload` before anything is parsed and the header's `alg` field is never
  consulted, which makes algorithm-confusion and `alg:none` structurally
  impossible rather than merely blocked. Constant-time signature comparison. A
  token with no expiry is rejected, not treated as eternal.
- **2FA**: RFC-6238 TOTP, Google Authenticator compatible, ±1 step for clock
  skew — and each code is **single-use**, so a code glimpsed over a shoulder
  cannot mint a second session during the ~90 seconds it stays valid.
- **Brute force**: per-credential and per-IP failure counters with linear backoff
  and a 15-minute lockout. This one is load-bearing, not decorative: the
  credential list is public (the login screen needs it) and the demo password is
  documented, so the rotating 6-digit code is the last thing standing between the
  internet and national authority.
- **Enumeration**: an unknown credential is hashed against a decoy of identical
  cost, so "no such user" and "wrong password" are indistinguishable in both
  message and timing.
- **Logout actually revokes.** The token's `jti` goes on a denylist until its own
  expiry, so a copied token dies when its owner signs out.
- **The database wins on every request.** The middleware re-reads the account and
  refuses a token whose tier or jurisdiction no longer matches. Demoting someone
  mid-incident takes effect on their next request, not in an hour.
- **Writes are pinned, not trusted.** Region, site and owner are stamped from the
  verified token; a forged `region` in a request body is overwritten, and a `site`
  that does not name a real site inside the caller's own region is rejected
  outright.
- **Everything is audited**: who, what, when, the result, and whether an approval
  bypassed the normal chain of command.

`npm run test` runs 143 assertions that actively try to break these boundaries —
forged and expired tokens, algorithm confusion, replayed 2FA codes, guessed row
IDs from another district, projection widening via query string, mass assignment,
cross-region writes, and privilege escalation at every tier.

### Three hard requirements

1. **`JWT_SECRET` must be set in production.** With `NODE_ENV=production` and no
   `JWT_SECRET`, the server prints a FATAL block and exits 1 rather than booting.
   That is deliberate: on a host with an ephemeral disk an auto-generated secret
   changes on every restart and silently invalidates every session, which is much
   harder to diagnose than a refusal to start. In development it generates one into
   `server/data/.jwt_secret` and warns.
2. **Change the passwords.** `Unity@2026` is a demo fixture, and it is documented
   in this file.
3. **`server/data/` must stay out of git.** It holds the signing secret, the
   password hashes and the TOTP secrets. It is already in `.gitignore`.

Deployment mechanics and the operational caveats are in the next section.

## Deploying it (API on Render, UI on Vercel)

**In a hurry? [`DEPLOY.md`](DEPLOY.md) is the copy-paste checklist.** This section
explains *why* each step exists.

The UI is a static bundle, but the auth API is a long-running process that holds the
account database, the login throttle counters and the token denylist in memory.
Vercel's functions are stateless and short-lived, so the API lives on Render and
Vercel proxies `/api` to it. Same-origin from the browser's point of view, which
means no CORS involved at all.

**1 — push to GitHub.** Nothing sensitive is tracked; `server/data/` (JWT secret,
password hashes, TOTP secrets) is git-ignored. Confirm with `git status --porcelain`
before the first push.

**2 — create the Render service.** In Render, choose *New → Blueprint* and point it
at the repo. `render.yaml` describes everything: Node runtime, free plan, no build
step (the API is dependency-free), start command `node server/src/server.js`, and a
health check on `/api/health`. `JWT_SECRET` is generated automatically. Wait for the
health check to go green, then copy the service URL — something like
`https://unity-eoc-api.onrender.com`.

**3 — enrol the two-factor accounts.** Render's filesystem resets on every restart
and redeploy, so the server re-seeds an empty database on boot. If TOTP secrets are
generated at seed time they change underneath you and your authenticator app stops
working. Pin them instead:

```
npm run enroll
```

That prints a `TOTP_SECRETS={...}` line. Paste it into the Render service's
environment as the `TOTP_SECRETS` variable, then scan the printed `otpauth://` URIs
into an authenticator app once. The four 2FA accounts now survive redeploys. While
you're in there, set `DEMO_PASSWORD` to something other than the documented default.

**4 — point Vercel at Render.** Edit the one placeholder in `vercel.json`:

```json
{ "source": "/api/:path*", "destination": "https://YOUR-SERVICE.onrender.com/api/:path*" }
```

Commit, then import the repo into Vercel. It picks up the Vite framework preset,
builds to `dist/`, and rewrites every `/api` call to Render.

**5 — log in.** First request after an idle period is slow — see below.

### Things that will surprise you

**Render's free tier sleeps after ~15 minutes idle.** The first login after a gap
takes roughly 30 seconds while the container wakes, and it can look like the app is
broken. Before a live demo, load the page once a minute or two ahead of time.

**The container's disk is ephemeral.** Seeded accounts always come back, because the
server re-seeds on boot. Anything created during a session — tasks, escalations,
audit rows — does not survive a restart. Fine for a demo; a real deployment wants a
managed database.

**Throttling and revocation are in-process.** One instance only. If you ever scale
past a single container, both need to move to Redis or the database, or a locked-out
credential will simply be retried against a different instance.

**Never set `UNITY_DEMO_MODE`.** It exposes `GET /api/demo/totp/:credential`, which
hands out live second factors next to a documented password. `scripts/dev.js` sets it
for the local API child only.

**The static build cannot log in on its own.** This is by design — every credential
check and every data read is server-enforced, with no offline fallback. A `dist/`
served from GitHub Pages without a reachable `/api` shows the gateway and refuses
every credential. If you have an older GitHub Pages deploy live, rebuild it: any
bundle built before the auth integration has no login gate at all.

### If you'd rather not use the rewrite

Host the UI anywhere and talk to Render cross-origin instead:

```
# on Vercel (build-time)
VITE_API_BASE=https://your-service.onrender.com/api
# on Render (runtime)
ALLOWED_ORIGINS=https://your-app.vercel.app,https://*.vercel.app
```

The allowlist is empty by default, so an unlisted origin gets no
`Access-Control-Allow-Origin` header and its preflight returns 403 — it fails closed.
The `*.` prefix matches one host label, which covers Vercel's per-branch preview URLs
without opening the door to `https://notvercel.app`. Sessions are Bearer tokens in
`sessionStorage`, never cookies, so there is no
`Access-Control-Allow-Credentials` and nothing for CSRF to hook into.

## Layout

```
src/                    the Vite app (vanilla ESM)
  auth.js               thin server-backed client — no credential store, no fallback
  main.js               UI; gates nav, buttons and radio nets on server permissions
  data.js               demo domain data, every row tagged region + site
server/                 the auth API (CommonJS island, zero dependencies)
  src/auth/             jwt · password · totp · gatekeeper (throttle + revocation)
  src/config/           roles · permissions matrix · nav/action table
  src/db/               json store · roster · seeder · query scoping
  src/middleware/       authenticate · guards · audit
  src/routes/           auth · data · escalation
  test/                 break-tests.js (server) · client-e2e.mjs (browser client)
  data/                 GIT-IGNORED — secrets and hashes live here
scripts/dev.js          runs the API and Vite together, zero dependencies
```

One note unrelated to auth: `src/volunteerSync.js` carries a Google Sheets API
key. It is client-side by nature and therefore public in any static bundle; it is
restricted by referrer at the Google console, which is the correct mitigation, but
it is worth re-checking that restriction before the demo.
