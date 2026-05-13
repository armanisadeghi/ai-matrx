# Email System Testing Guide

This guide provides step-by-step instructions for testing all email functionality in AI Matrx.

## Prerequisites

Before testing, ensure:

1. **Environment Variables Set**:
   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxx
   EMAIL_FROM=AI Matrx <noreply@aimatrx.com>
   EMAIL_ALLOWED_DOMAINS=aimatrx.com
   ADMIN_EMAIL=admin@aimatrx.com
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

2. **Database Migration Run**:
   ```bash
   # Apply the email system migration
   supabase db push
   ```

3. **Resend Configuration**:
   - Domain verified in Resend
   - API key is valid
   - SMTP configured (if using for Supabase Auth)

## Test Checklist

### 1. Organization Invitations ✅

**Test**: Send organization invitation

**Steps**:
1. Log in as organization owner/admin
2. Navigate to Organization Settings
3. Go to "Members" tab
4. Click "Invite Member"
5. Enter email address and role
6. Click "Send Invitation"

**Expected Result**:
- Success message displayed
- Email received with invitation link
- Email contains organization name and inviter name
- Link expires in 7 days
- Database record shows `email_sent: true` and `email_sent_at` timestamp

**Check Email**:
- Subject: "You've been invited to join [Org Name] on AI Matrx"
- Contains invitation link
- Link format: `/invitations/organization/accept/{token}` (org) or `/invitations/project/accept/{token}` (project)
- Professional branding and styling

---

### 2. Resource Sharing Notifications ✅

**Test**: Share a resource with another user

**Steps**:
1. Log in as user A
2. Open a prompt/canvas/note
3. Click "Share" button
4. Select "Share with User"
5. Enter user B's email
6. Add optional message
7. Click "Share"

**Expected Result**:
- Success message displayed
- User B receives email notification
- Email includes sharer's name, resource title, and direct link
- Optional message included if provided
- User B can access the resource via link

**Check Email Preferences**:
- If user B has disabled sharing notifications, no email sent
- Success still reported in UI

---

### 3. Invitation Request Approval ✅

**Test**: Approve an invitation request

**Steps**:
1. Submit an invitation request (public form)
2. Log in as admin
3. Navigate to Admin > Invitation Requests
4. Select a pending request
5. Click "Approve"
6. Confirm action

**Expected Result**:
- Request status changes to "approved"
- Invitation code generated
- Applicant receives approval email with code
- Email contains signup link with code pre-filled

**Check Email**:
- Subject: "Your AI Matrx invitation request has been approved!"
- Contains invitation code (format: XXXX-XXXX-XXXX)
- Contains signup link
- Code can be used once to sign up

---

### 4. Invitation Request Rejection ✅

**Test**: Reject an invitation request

**Steps**:
1. Log in as admin
2. Navigate to Admin > Invitation Requests
3. Select a pending request
4. Click "Reject"
5. Add optional rejection reason
6. Confirm action

**Expected Result**:
- Request status changes to "rejected"
- Applicant receives rejection email
- Reason included if provided
- Professional and respectful tone

---

### 5. Admin Email Portal ✅

**Test**: Send bulk email to users

**Steps**:
1. Log in as admin
2. Navigate to Admin > Email
3. Select recipients (custom emails or selected users)
4. Choose a template (optional)
5. Enter subject and message
6. (Optional) Set custom From address
7. Click "Send Email"

**Expected Result**:
- Emails sent to all recipients
- Success/failure count displayed
- Email logged in `admin_email_logs` table
- Batch sending handled gracefully

**Check**:
- Multiple recipients receive email
- Custom from domain validated
- Email logs show correct counts

---

### 6. Contact Form ✅

**Test**: Submit contact form

**Steps**:
1. Navigate to /contact page
2. Fill in all fields:
   - Name
   - Email
   - Subject
   - Message
3. Click "Send Message"

**Expected Result**:
- Success message displayed
- Admin receives notification email at `ADMIN_EMAIL`
- Submitter receives confirmation email
- Submission saved to `contact_submissions` table
- Admin email includes reply-to address

**Check Admin Email**:
- Subject: "New Contact Form Submission: [Subject]"
- Contains: name, email, subject, message, submission ID
- Can reply directly to submitter

**Check Confirmation Email**:
- Subject: "We received your message"
- Confirms receipt and response timeframe

---

### 7. Email Preferences ✅

**Test**: Update email notification preferences

**Steps**:
1. Log in as any user
2. Navigate to Settings > Email Preferences
3. Toggle various preferences:
   - Sharing notifications
   - Organization invitations
   - Resource updates
   - Marketing emails
   - Weekly digest
4. Click "Save Preferences"

**Expected Result**:
- Success message displayed
- Preferences saved to database
- Future emails respect preferences

**Verify**:
1. Disable "Sharing notifications"
2. Have someone share a resource with you
3. Confirm no email received (but share still works)

---

### 8. Supabase Auth Emails (Custom SMTP) ✅

**Test**: Authentication emails via custom SMTP

**Prerequisites**:
- Supabase Auth SMTP configured with Resend
- Follow [SUPABASE_SMTP_SETUP.md](./SUPABASE_SMTP_SETUP.md)

#### A. Signup Confirmation

**Steps**:
1. Sign up with new email
2. Check inbox for confirmation email

**Expected Result**:
- Email received from `noreply@aimatrx.com`
- Subject: "Confirm your signup" (or custom template)
- Contains confirmation link
- AI Matrx branding
- Link works and confirms account

#### B. Password Reset

**Steps**:
1. Click "Forgot Password"
2. Enter email address
3. Check inbox for reset email

**Expected Result**:
- Email received from `noreply@aimatrx.com`
- Subject: "Reset Your Password"
- Contains reset link
- Link works and allows password change
- Link expires in 1 hour

#### C. Email Change

**Steps**:
1. Log in
2. Go to Settings > Change Email
3. Enter new email
4. Check both old and new inbox

**Expected Result**:
- Confirmation email sent to new address
- Notification sent to old address
- Both use AI Matrx branding

---

### 9. Webhook Events ✅

**Test**: Resend webhook handling

**Setup**:
1. Configure webhook in Resend Dashboard
2. Set endpoint: `https://your-domain.com/api/webhooks/resend`
3. Add webhook secret to env: `RESEND_WEBHOOK_SECRET`

**Events to Test**:

#### A. Email Delivered
- Send any email
- Wait for delivery
- Check server logs for "Email delivered" message

#### B. Email Bounced
- Send to invalid email (if safe to test)
- Check logs for bounce handling
- Verify hard bounces are tracked

#### C. Spam Complaint
- If reported as spam, webhook should:
  - Log the complaint
  - Unsubscribe user from all emails
  - Update `user_email_preferences` table

#### D. Email Opened
- Send email
- Open it
- Check if open event logged (optional tracking)

---

### 10. Error Handling ✅

**Test**: Various error scenarios

#### A. Invalid Email Address
**Steps**: Try to share with invalid email
**Expected**: Validation error, no email sent

#### B. Missing Environment Variables
**Steps**: Remove `RESEND_API_KEY` and restart
**Expected**: Graceful error, clear message

#### C. Rate Limiting
**Steps**: Send many emails quickly
**Expected**: Graceful handling, proper error messages

#### D. Recipient Doesn't Exist
**Steps**: Share with non-existent user
**Expected**: Success (email still sent), no crash

---

## Performance Testing

### Batch Email Sending

**Test**: Send email to 100+ users

**Steps**:
1. Use admin portal
2. Select 100+ users
3. Send email

**Expected**:
- Batch processed using `Promise.allSettled()`
- No timeout errors
- Accurate success/failure counts
- All emails eventually delivered

---

## Email Deliverability Check

### 1. Spam Score Test

**Tools**:
- Mail Tester: https://www.mail-tester.com/
- GlockApps: https://glockapps.com/

**Steps**:
1. Send test email to provided address
2. Check spam score
3. Review recommendations

**Target**: Score > 8/10

### 2. Authentication Check

**Verify**:
- SPF record: `v=spf1 include:_spf.resend.com ~all`
- DKIM signature present in emails
- DMARC policy configured

### 3. Content Check

**Review**:
- No spam trigger words
- Proper text/HTML ratio
- Unsubscribe link present (if marketing)
- Physical address (if marketing)

---

## Troubleshooting

### Emails Not Arriving

1. **Check Resend Dashboard**:
   - Go to Logs
   - Check delivery status
   - Look for errors

2. **Check Environment Variables**:
   ```bash
   # In your .env.local
   echo $RESEND_API_KEY
   echo $EMAIL_FROM
   ```

3. **Check Domain Verification**:
   - Ensure domain is verified in Resend
   - Check DNS records are correct

4. **Check Spam Folder**:
   - Look in spam/junk
   - Mark as "Not Spam" if found

### Emails Go to Spam

1. **Warm Up Domain**:
   - Start with small volume
   - Gradually increase over days/weeks

2. **Improve Content**:
   - Avoid spam trigger words
   - Balance text and images
   - Include unsubscribe link

3. **Fix Authentication**:
   - Ensure SPF/DKIM/DMARC configured
   - Use mail tester to check

### Database Errors

1. **Migration Not Applied**:
   ```bash
   supabase db push
   ```

2. **RLS Policy Issues**:
   - Check policies allow operation
   - Try with service role key

3. **Function Missing**:
   - Ensure `get_user_email_preferences` function exists
   - Re-run migration if needed

---

## Test Results Template

Use this template to record test results:

```markdown
## Test Date: YYYY-MM-DD
## Tester: [Name]
## Environment: [Development/Staging/Production]

| Test | Status | Notes |
|------|--------|-------|
| Organization Invitations | ✅/❌ | |
| Resource Sharing | ✅/❌ | |
| Invitation Approval | ✅/❌ | |
| Invitation Rejection | ✅/❌ | |
| Admin Email Portal | ✅/❌ | |
| Contact Form | ✅/❌ | |
| Email Preferences | ✅/❌ | |
| Signup Confirmation | ✅/❌ | |
| Password Reset | ✅/❌ | |
| Webhook Events | ✅/❌ | |

### Issues Found:
1. [Description]
   - Severity: High/Medium/Low
   - Steps to reproduce:
   - Expected vs Actual:

### Additional Notes:
[Any other observations]
```

---

## Continuous Monitoring

### Metrics to Track

1. **Email Delivery Rate**:
   - Target: > 95%
   - Monitor in Resend Dashboard

2. **Bounce Rate**:
   - Target: < 2%
   - Track hard vs soft bounces

3. **Spam Complaint Rate**:
   - Target: < 0.1%
   - Immediate action if increasing

4. **Open Rate** (if tracked):
   - Varies by email type
   - Benchmark: 15-25%

### Alerts to Set Up

- Email delivery failure
- High bounce rate
- Spam complaints
- API rate limit approaching

---

## Production Checklist

Before going live:

- [ ] All tests passing
- [ ] Environment variables configured in production
- [ ] Domain verified in Resend
- [ ] SPF/DKIM/DMARC configured
- [ ] Supabase Auth SMTP configured
- [ ] Webhook endpoint configured
- [ ] Email templates reviewed and approved
- [ ] Legal text added (unsubscribe, address, etc.)
- [ ] Rate limiting configured
- [ ] Monitoring and alerts set up
- [ ] Team trained on admin portal
- [ ] Backup admin email configured
- [ ] Documentation reviewed

---

## Support Resources

- **Resend Docs**: https://resend.com/docs
- **Supabase Auth**: https://supabase.com/docs/guides/auth
- **Email Best Practices**: https://www.sparkpost.com/resources/email-deliverability/
- **Spam Testing**: https://www.mail-tester.com/

## Internal Documentation

- [Supabase SMTP Setup](./SUPABASE_SMTP_SETUP.md)
- [Email System README](../features/email/README.md)
- [.env.example](../.env.example)
