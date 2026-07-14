# Supabase Auth SMTP (Resend)

> Canonical overview: `features/email/FEATURE.md`  
> This doc covers **Path 2 only** — Supabase Auth email. App email uses `RESEND_API_KEY`
> via `lib/email/client.ts` and is a **separate** Resend credential.

## What this configures

Signup confirmation, password reset, and other Supabase Auth templates. Sent by
**Supabase**, relayed through Resend SMTP. No application code changes required.

## Supabase Dashboard → Authentication → Emails → SMTP Settings

| Field | Value |
|-------|-------|
| Custom SMTP | **Enabled** |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` (literal word) |
| Password | Resend API key **`ai-matrx-main`** (dedicated; stored in Supabase only) |
| Sender | `AI Matrx <noreply@updates.aimatrx.com>` |
| Encryption | SSL/TLS |

### Credential separation

- **`ai-matrx-main`** — Supabase SMTP password only. Not in repo or Vercel.
- **`RESEND_API_KEY`** — app transactional email only. Not used for auth SMTP.
- Rotating one does **not** affect the other. If `ai-matrx-main` is rotated, update
  only the Supabase SMTP password field.

## DNS (Vercel — `aimatrx.com` zone)

- Sending domain: `updates.aimatrx.com` (verified in Resend; DKIM/SPF/MX).
- Click tracking: `CNAME links.updates → links1.resend-dns.com`.
- Resend may suggest a CAA on `links.updates`; omit it (CNAME + CAA conflict).

## Email templates

Authentication → Email Templates: Confirm signup, Reset password, Magic Link, etc.

Variables: `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .RedirectTo }}`, etc.

## URL configuration

Authentication → URL Configuration:

- **Site URL:** `https://www.aimatrx.com` (prod) or `http://localhost:3000` (dev)
- **Redirect URLs** (required — without these, recovery links fall back to Site URL and break):
  ```
  https://www.aimatrx.com/auth/callback**
  http://localhost:3000/auth/callback**
  ```

Reset-password template must use `{{ .ConfirmationURL }}`, not `{{ .SiteURL }}` alone.

## Verify

1. Supabase SMTP → Send test email.
2. Password reset flow → confirm **Delivered** in Resend logs (sender
   `noreply@updates.aimatrx.com`).

## Troubleshooting

- **"Error sending recovery email"** — check SMTP password (`ai-matrx-main`), sender
  domain verification, and that username is exactly `resend`.
- **Wrong links** — check Site URL / Redirect URLs and `NEXT_PUBLIC_SITE_URL` in app env.
- **Spam** — confirm SPF/DKIM on `updates.aimatrx.com` in Resend + Vercel DNS.

## App env (related, not for SMTP password)

These are for **Path 1** app email only:

```bash
RESEND_API_KEY=          # app keys — NOT ai-matrx-main
EMAIL_FROM=AI Matrx <noreply@aimatrx.com>
EMAIL_ALLOWED_DOMAINS=aimatrx.com,updates.aimatrx.com
ADMIN_EMAIL=admin@aimatrx.com
NEXT_PUBLIC_SITE_URL=https://www.aimatrx.com
```

Do **not** put the Supabase SMTP key in Vercel or `.env.local`.
