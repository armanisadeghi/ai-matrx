# New Features — Test Guide (for Arman)

Four features shipped. Each below has: **what it is**, **where to click**, **steps**, and **how you know it works**. Everything is reachable in the UI.

**Log in first:** open `/login` → `admin@admin.com` / `Password1234#`.

---

## 1. Outbound Webhooks
Get a signed HTTPS callback whenever one of your events fires (a file is shared, a long job finishes, etc.). For Zapier/n8n, the Chrome extension, or any external system.

**Where:** `/files` → **Webhooks** in the left sidebar (or go straight to `/files/webhooks`).

**Test it (2 minutes):**
1. Open `https://webhook.site` in another tab → copy "Your unique URL".
2. On `/files/webhooks` → **New webhook** → paste that URL → leave **All event types** → **Create webhook**.
3. A yellow **signing secret** banner appears (that's shown once — normal).
4. On the new webhook's card, click the **paper-plane (Send)** icon.
5. Switch to the webhook.site tab.

**Works when:** webhook.site shows an incoming **POST** with headers `X-Matrx-Event: webhook.test` and `X-Matrx-Signature: sha256=…`. Back on the card, click **Recent deliveries** → a row shows **delivered / 200**.

**Security spot-check:** try **New webhook** with `http://localhost/x` → it's **rejected** with an error (blocks server-side request forgery). Only `https://` public URLs are allowed.

**Clean up:** delete the test webhook (trash icon) when done.

---

## 2. Long-job completion events (the "event spine")
Every long-running job now records a `run.completed` / `run.failed` event the moment it finishes. This is what lets webhooks (feature 1) and future in-app alerts fire on completion instead of the app polling for hours.

**Where (admin):** `/administration` → **Events** (or `/administration/events`).

**Test it:**
1. Open `/administration/events`. Click the **Jobs (run.*)** filter. Toggle **Auto-refresh (5s)** on.
2. In another tab, trigger a job that finishes — easiest is processing a file into a knowledge base (RAG ingest), which completes in under a minute.
3. Watch the Events table.

**Works when:** a **`run.completed`** row appears, showing the run type (e.g. `file_rag_jobs`) and your user as the actor.

**Best combined test (job → webhook):** keep a webhook from feature 1 active, run a job, and watch webhook.site receive a `run.completed` POST automatically. That proves the whole chain end-to-end.

---

## 3. Live run lists (no more polling)
The podcast runs list now updates **live** via realtime instead of re-fetching every 15 seconds.

**Where:** `/podcast/studio`.

**Test it:**
1. Open `/podcast/studio` (the runs / manage page) — it loads your runs.
2. Start a podcast generation (or have one running). Leave the runs list open and **don't refresh**.

**Works when:** the run's status changes on screen on its own (e.g. running → completed) without you refreshing, and there's no periodic flicker/reload.

---

## 4. Keep your work when a guest signs up
If someone uses the app as a **guest** (not logged in) and creates files or chats, signing up now **keeps all of it** in their new account instead of starting empty.

**Where:** `/sign-up`.

**Test it (use an incognito window so you're a fresh guest):**
1. In incognito, use the app as a guest — e.g. open a public agent app at `/p/<slug>` and create some content.
2. Go to `/sign-up`, create an account with email + password.

**Works when:** right after sign-up you're **logged straight in** (no email-confirmation wait) and the files/chats you made as a guest are **already there**.

**Note:** this works for **email/password** sign-up. Signing up with Google/Apple/GitHub does **not** yet preserve guest work (see Known gaps).

---

## Known gaps (honest status)
- **AI Runs list is broken right now** — its database table (`ai_runs`) was moved to `graveyard` by the ongoing DB migration; the feature needs repointing. This is separate from the work above and is on the DB team's plate.
- **OAuth guest preservation** — Google/Apple/GitHub sign-up doesn't yet keep guest work (only email/password does).
- **Remaining polls are intentional** — the only always-on poller that needed killing was the podcast runs list (done). The podcast *detail* page polls only as a fallback when its live stream disconnects, and the project-creation resolver is a brief one-shot wait for a new record; both are appropriate and were deliberately left as-is.

---

## One-line summary of what each feature touches
| Feature | User/Admin | Entry point |
|---|---|---|
| Webhooks | User | `/files/webhooks` (Files sidebar → Webhooks) |
| Job-completion events | Admin | `/administration/events` |
| Live run lists | User | `/podcast/studio` |
| Guest → account | User | `/sign-up` (from a guest session) |
