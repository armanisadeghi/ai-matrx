# Email & Auth Delivery

> Last verified: 2026-07-13

All email is **configuration-only** for auth. Application sends go through `lib/email/client.ts`.
There are **two independent paths** with **separate Resend credentials**.

## Path 1 — Application email (this repo)

- **Sender:** `lib/email/client.ts` → Resend API (`resend` package).
- **Credentials:** `RESEND_API_KEY` in app env (Vercel/Doppler). Uses the app's
  existing Resend keys (e.g. `RealSingles Production`, `Onboarding`). **Not** the
  Supabase SMTP key.
- **From address:** `EMAIL_FROM` env var (default example: `AI Matrx <noreply@aimatrx.com>`).
- **Domain guard:** `EMAIL_ALLOWED_DOMAINS` (e.g. `aimatrx.com,updates.aimatrx.com`).
- **Admin notifications:** `ADMIN_EMAIL` (contact form, some feedback routes).

**Covers:** org/project invites, sharing notifications, contact form, feedback,
admin bulk email, generic/public sends, invitation & landing emails, export/notification
emails.

**Does NOT cover:** signup confirmation or password reset — those are Path 2.

**Gmail SMTP env vars** (`SMTP_HOST`, etc.) are **unused** by code. Safe to remove
from local env; do not add to `.env.example`.

## Path 2 — Supabase Auth email (dashboard config only)

- **Sender:** Supabase Auth, relayed through Resend **SMTP** (not app code).
- **Credentials:** dedicated Resend API key **`ai-matrx-main`**, stored encrypted in
  Supabase → Authentication → Emails → SMTP Settings. **Not** in this repo or Vercel.
- **SMTP:** host `smtp.resend.com`, port `465`, username `resend` (literal), password
  = the `ai-matrx-main` key.
- **From address:** `AI Matrx <noreply@updates.aimatrx.com>`.

**Covers:** signup confirmation, password reset (and other Supabase Auth templates).

Rotating app `RESEND_API_KEY` does **not** affect auth email. Rotating `ai-matrx-main`
requires updating only the Supabase SMTP password field.

### Supabase redirect URLs (required for password reset)

Authentication → URL Configuration → **Redirect URLs** must include:

```
https://www.aimatrx.com/auth/callback**
http://localhost:3000/auth/callback**
```

If the callback URL is missing, Supabase falls back to **Site URL** (`https://www.aimatrx.com`)
and the recovery `code` lands on the homepage instead of `/reset-password`. The proxy
rewrites `/?code=` → `/auth/callback` as a safety net, but the allowlist should still
be set.

Reset-password email template must use `{{ .ConfirmationURL }}` (not `{{ .SiteURL }}` alone).

## DNS & Resend (operations)

- **Sending domain:** `updates.aimatrx.com` (verified in Resend; DNS in Vercel).
- **Click tracking:** `links.updates.aimatrx.com` → CNAME `links1.resend-dns.com`.
  Resend may suggest a CAA record on the same name; omit it — CNAME and CAA cannot
  coexist on one hostname.

## Code map

| Area | Role |
|------|------|
| `lib/email/client.ts` | Resend API client + templates |
| `lib/email/render.ts`, `lib/email/templates/` | React-email templates |
| `app/api/email/send` | Authenticated generic send |
| `app/api/admin/email` | Admin bulk send |
| `app/api/contact` | Contact form (+ `ADMIN_EMAIL`) |
| `app/api/webhooks/resend` | Resend delivery webhooks (optional `RESEND_WEBHOOK_SECRET`) |
| `utils/email/emailService.ts` | Client-side fetch wrapper → `/api/email/send` |

Supabase SMTP setup details: `docs/other/SUPABASE_SMTP_SETUP.md`.
