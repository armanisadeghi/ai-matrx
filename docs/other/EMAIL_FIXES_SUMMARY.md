# Email System Fixes - Summary

> **Primary config:** `features/email/FEATURE.md`. App email and Supabase Auth
> email use separate Resend credentials.

## Issues Fixed

### 1. **Organization Invitations - Email Not Sending**
**Problem:** The `inviteToOrganization` function was trying to send emails from client-side code, but `EMAIL_FROM` and `RESEND_API_KEY` environment variables are not accessible on the client.

**Solution:**
- Created `/app/api/organizations/invite/route.ts` API route
- Updated `features/organizations/service.ts` to call the API route instead of sending email directly
- Email now properly sent from server where environment variables are accessible

### 2. **Organization Invitations - Incorrect URL Format**
**Problem:** Invitation emails were using the wrong URL format:
- Old: `https://www.aimatrx.com/organizations/accept-invitation?token={token}`
- Correct: `https://www.aimatrx.com/invitations/accept/{token}`

**Solution:**
- Updated invitation URL in `/app/api/organizations/invite/route.ts`
- Updated documentation in `docs/EMAIL_TESTING_GUIDE.md`

### 3. **Resend Invitation - Not Sending Email**
**Problem:** The `resendInvitation` function had a `TODO` comment and never actually sent the email - it only extended the expiry date.

**Solution:**
- Created `/app/api/organizations/invitations/resend/route.ts` API route
- Updated `features/organizations/service.ts` to call the API route
- Resend now properly sends email with extended expiry date

### 4. **Sharing Notifications - Email Not Sending**
**Problem:** The `shareWithUser` function in `utils/permissions/service.ts` was trying to send sharing notification emails from client-side code.

**Solution:**
- Created `/app/api/sharing/notify/route.ts` API route
- Updated `utils/permissions/service.ts` to call the API route instead of importing and calling `sendSharingNotification` directly
- Sharing notifications now properly sent from server

## Files Created

### New API Routes
1. `/app/api/organizations/invite/route.ts` - Handles organization invitations
2. `/app/api/organizations/invitations/resend/route.ts` - Handles resending invitations
3. `/app/api/sharing/notify/route.ts` - Handles sharing notification emails

## Files Modified

### Service Files
1. `features/organizations/service.ts`
   - `inviteToOrganization()` - Now calls API route
   - `resendInvitation()` - Now calls API route

2. `utils/permissions/service.ts`
   - `shareWithUser()` - Now calls API route for email notifications

### Documentation
1. `docs/EMAIL_TESTING_GUIDE.md` - Updated invitation URL format

## Email Architecture

### Correct Pattern (Now Implemented)
```
Client Component
  ↓
Service Function (client-side)
  ↓
fetch('/api/...')  ← API Route
  ↓
sendEmail() from @/lib/email/client
  ↓
Resend API (with EMAIL_FROM, RESEND_API_KEY)
```

### Incorrect Pattern (Fixed)
```
Client Component
  ↓
Service Function (client-side)
  ↓
sendEmail() ← FAILS - No access to EMAIL_FROM
```

## Environment Variables Used

### Required Variables (app email — Path 1)
- `RESEND_API_KEY` - App Resend API key (not the Supabase SMTP `ai-matrx-main` key)
- `EMAIL_FROM` - App sender (e.g. `AI Matrx <noreply@aimatrx.com>`)
- `EMAIL_ALLOWED_DOMAINS` - Allowed custom From domains
- `NEXT_PUBLIC_SITE_URL` - Base URL for invitation links
- `ADMIN_EMAIL` (optional) - Admin email for notifications

Supabase Auth email (Path 2) uses SMTP config in the Supabase dashboard only.
See `features/email/FEATURE.md`.

## Email Services Status

### ✅ Working (Server-side only)
1. **Organization Invitations** - API route `/api/organizations/invite`
2. **Resend Invitations** - API route `/api/organizations/invitations/resend`
3. **Sharing Notifications** - API route `/api/sharing/notify`
4. **Contact Form** - API route `/api/contact`
5. **Invitation Request Approval/Rejection** - API route `/api/admin/invitation-requests/[id]`
6. **Generic Email Send** - API route `/api/email/send`

### ⚠️ Legacy Files (Not Used)
1. `features/sharing/emailService.ts` - Replaced by API route
2. `features/invitations/emailService.ts` - Only used from API routes (correct)
3. `utils/email/emailService.ts` - Already calls API route (correct)

## Testing Checklist

- [x] Organization invitation emails sent successfully
- [x] Invitation URLs have correct format
- [x] Resend invitation sends email with extended expiry
- [x] Sharing notifications sent when resources are shared
- [ ] Test all email types in production environment
- [ ] Verify EMAIL_FROM and RESEND_API_KEY are set in production

## Notes

- All email sending now happens on the server via API routes
- Client-side code uses `fetch()` to call API routes
- Email failures are logged but don't block the main action
- Environment variables are only accessible in API routes and server components
- The `lib/email/client.ts` file is now only called from server-side code

## Next Steps

1. Monitor email delivery in production
2. Consider adding email queue for reliability
3. Add rate limiting to email API routes
4. Implement email templates versioning
5. Add email delivery status tracking
