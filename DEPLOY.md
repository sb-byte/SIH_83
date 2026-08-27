# Deploy & Run Checklist — Unity EOC

Production-grade disaster command center stack:

| Layer | Technology | Service |
| --- | --- | --- |
| **Frontend** | Vite + Vanilla JS + Leaflet + Turf | Vercel / Static Web Host |
| **Backend API** | FastAPI + Python 3.11 | Render / Docker / EC2 |
| **Database** | PostgreSQL 15 + PostGIS | Neon / Supabase / Managed Postgres |
| **Real-time & Cache** | Redis 7 Pub/Sub | Upstash / Managed Redis |

---

## Quick Start — Local Development with Docker Compose

Run the full stack (PostgreSQL + PostGIS, Redis, FastAPI Backend, Vite UI):

```bash
# 1. Start Database, Redis, and Backend
docker-compose up -d --build

# 2. Start Frontend Dev Server
npm install
npm run dev
```

Open **http://localhost:5173** to launch Unity EOC.

---

## Running Backend Directly (Python Virtual Environment)

```bash
# 1. Install backend requirements
pip install -r backend/requirements.txt

# 2. Set environment variables
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/unity_eoc"
export REDIS_URL="redis://localhost:6379/0"

# 3. Run FastAPI server
python -m uvicorn backend.app.main:app --reload --port 8000
```

Log in as a volunteer (no 2FA needed):

```
credential:  VOL-AM-01
password:    Unity@2026
```

You should see a stripped-down view — one district, no resource controls.

Now try a national officer, which needs a second factor:

```
credential:  NDMA-AUTH-01
password:    Unity@2026
```

It will ask for a 6-digit code. Get the current one in a second terminal:

```bash
npm run totp NDMA-AUTH-01
```

Log in and you should see everything — all regions, all six views.

**Confirm the security actually holds** (optional but worth doing once, ~1 min):

```bash
npm test             # 143 checks: 83 server-side, 60 through the real browser client
```

Stop the servers with `Ctrl-C` when you're done.

---

## Part 2 — Push to GitHub

Your remote is already set up (`github.com/sb-byte/SIH_83`), so this is short.

```bash
cd ~/Everything./SIH_83_fresh

npm run build        # refresh dist/ — the committed one predates the login gate
git add -A
git commit -m "Add server-enforced 5-tier auth + Render/Vercel deploy config"
git push origin main
```

Nothing secret gets pushed: `server/data/` holds the signing secret, the password
hashes and the TOTP secrets, and it is git-ignored. Sanity-check before committing if
you like — this must print nothing:

```bash
git status --porcelain | grep "server/data"
```

---

## Part 3 — Deploy the API to Render

1. Go to **https://dashboard.render.com** and sign in with GitHub.
2. Click **New → Blueprint**.
3. Pick the **SIH_83** repo. Render reads `render.yaml` and pre-fills everything —
   free plan, no build step, start command, health check. Don't change them.
4. It will prompt for the three optional variables. **Skip all three for now** (you
   set `TOTP_SECRETS` in Part 4). `JWT_SECRET` is generated for you automatically.
5. Click **Apply** / **Create**. Wait for the status to go **live** and the health
   check to pass. First deploy takes 2–4 minutes.
6. **Copy the service URL** from the top of the page. It looks like
   `https://unity-eoc-api.onrender.com`.

Check it works — this should return JSON, not an error:

```
https://unity-eoc-api.onrender.com/api/health
```

---

## Part 4 — Pin the 2FA secrets (don't skip this)

Render wipes its disk on every restart and redeploy. The app re-creates the accounts
automatically, but if the 2FA secrets are regenerated each time, your authenticator
app stops matching and the Tier-1 and Tier-2 accounts become unusable.

On your machine:

```bash
npm run enroll
```

It prints a long line starting `TOTP_SECRETS={...}` plus a QR-able `otpauth://` link
for each 2FA account.

1. In Render: **your service → Environment → Add Environment Variable**.
2. Key `TOTP_SECRETS`, value = everything after `TOTP_SECRETS=` on that line.
3. While you're there, add `DEMO_PASSWORD` and set it to something other than
   `Unity@2026`, which is published in the README.
4. Save. Render restarts automatically.
5. Scan the printed `otpauth://` URIs into Google Authenticator / Authy — or just
   keep using `npm run totp <credential>` locally to read codes.

Treat that output as a password. Don't commit it or paste it in chat.

---

## Part 5 — Deploy the UI to Vercel

**First, tell the UI where the API lives.** Edit `vercel.json` and replace the
placeholder with your real Render URL from Part 3:

```json
{
  "source": "/api/:path*",
  "destination": "https://unity-eoc-api.onrender.com/api/:path*"
}
```

Then:

```bash
git add vercel.json
git commit -m "Point /api at the Render service"
git push origin main
```

Now in Vercel:

1. Go to **https://vercel.com/new** and sign in with GitHub.
2. **Import** the SIH_83 repo.
3. Leave every setting alone — `vercel.json` already specifies the Vite framework,
   `npm run build`, and `dist` as the output directory.
4. Click **Deploy**. Takes 1–2 minutes.
5. Open the URL it gives you and log in exactly as you did locally.

If login works, you're done.

---

## Before you demo to judges

**Wake the API first.** Render's free tier puts the service to sleep after about 15
minutes of no traffic. The next request takes ~30 seconds while the container boots,
and during that pause the login screen looks broken. Open your Vercel URL a couple of
minutes before you present and log in once. After that it stays warm.

**Have `npm run totp` ready** in a terminal if you plan to demo a Tier-1 login and
haven't set up an authenticator app.

**Know what to say about persistence.** Anything created during the demo — tasks,
escalations, audit entries — is held in the container and is lost if it restarts. The
ten accounts always come back. If a judge asks, the honest answer is that a
production deployment would point `DB_PATH` at a managed database; the file store is
a demo choice, not an architectural one.

---

## If something breaks

**Login says the API is unreachable.** The `vercel.json` destination is wrong or
still the placeholder. Check `https://<your-render-url>/api/health` directly in a
browser first — if that fails, the problem is Render, not Vercel.

**Render deploy succeeds but the service never goes live.** The health check on
`/api/health` is failing. Check the Render logs for the boot line; if you see a
`FATAL: JWT_SECRET is not set` block, the generated variable didn't get created —
add one manually with a long random string.

**Every credential is refused after a few tries.** That's the login throttle doing
its job — 8 failures per credential locks it for 15 minutes. Wait it out, or restart
the Render service to clear the in-memory counters.

**2FA codes stopped working after a redeploy.** You skipped Part 4.

**"That code has already been used."** Codes are single-use by design. Wait for the
next 30-second window.

**GitHub Pages shows the old app with no login.** If you have Pages enabled on this
repo it serves the static bundle with no API behind it, so it can't log anyone in.
Turn Pages off in the repo settings and use the Vercel URL — otherwise you risk
demoing the wrong link.
