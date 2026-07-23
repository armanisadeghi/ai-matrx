# SMS Integration Setup Tasks

Manual setup steps required to complete the SMS integration. The code is in place — these are the dashboard/console configurations that only you can do.

---

## 1. Environment Variables

Add these to your `.env.local` (and Vercel environment settings for production):

```env
# Twilio Core (already have these)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Twilio Verify (already have this)
TWILIO_VERIFY_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Twilio Messaging Service (NEW — create in step 2)
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Skip signature validation in dev
TWILIO_SKIP_VALIDATION=true   # Remove in production!
```

**Vercel:** Go to Project Settings > Environment Variables and add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SID`, and `TWILIO_MESSAGING_SERVICE_SID` for Production, Preview, and Development environments.

---

## 2. Twilio Console: Create a Messaging Service

1. Go to [Twilio Console > Messaging > Services](https://console.twilio.com/us1/develop/sms/services)
2. Click **Create Messaging Service**
3. Name it: `AI Matrx`
4. Use case: Select "Notify my users" or "Chat with users"
5. **Sender Pool**: Add your phone number(s) to the sender pool
6. **Integration**:
   - Incoming Messages webhook URL: `https://aimatrx.com/api/webhooks/twilio/sms`
   - Method: `POST`
   - Status Callback URL: `https://aimatrx.com/api/webhooks/twilio/status`
   - Method: `POST`
7. **Compliance**: Enable **Advanced Opt-Out** (auto-handles STOP/START keywords)
8. Enable **Smart Encoding** (converts Unicode to GSM to save segments)
9. Enable **Sticky Sender** (same number always used for same recipient)
10. Copy the **Messaging Service SID** (starts with `MG`) and add it as `TWILIO_MESSAGING_SERVICE_SID`

---

## 3. Twilio Console: Phone Number Configuration

### Option A: Use an existing number
1. Go to [Phone Numbers > Manage > Active Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click your phone number
3. Under **Messaging**:
   - Configure with: **Messaging Service** > Select "AI Matrx"
   - This auto-routes inbound SMS through the Messaging Service

### Option B: Purchase a new number
1. Go to [Phone Numbers > Buy a Number](https://console.twilio.com/us1/develop/phone-numbers/manage/search)
2. Search for a number with SMS and MMS capabilities
3. Purchase it
4. Add it to the AI Matrx Messaging Service sender pool

### Option C: Toll-Free Number (recommended for production)
1. Go to [Phone Numbers > Buy a Number](https://console.twilio.com/us1/develop/phone-numbers/manage/search)
2. Click **Toll-Free** tab
3. Purchase a toll-free number
4. Complete **Toll-Free Verification** (required):
   - Go to [Messaging > Compliance > Toll-Free Verifications](https://console.twilio.com/us1/develop/sms/regulatory/compliance/toll-free)
   - Submit verification with your business details and use case
   - Approval takes 1-5 business days

---

## 4. A2P 10DLC Registration (Required for US 10-digit numbers)

**If using a standard 10-digit local number in the US, you MUST register:**

1. Go to [Messaging > Compliance > A2P Registration](https://console.twilio.com/us1/develop/sms/regulatory/compliance)
2. **Register your Brand**:
   - Company name, EIN/Tax ID, website, address
   - Brand type: Standard ($44 one-time) or Sole Prop ($4 one-time)
3. **Create a Campaign**:
   - Campaign type: Mixed (covers transactional + notifications)
   - Use case description: "AI-powered task management and notification system. Users opt-in via web application to receive task reminders, job completion alerts, direct message notifications, and interact with AI agents via SMS."
   - Sample messages: Include 2-3 examples of messages you'll send
   - Opt-in flow description: "Users opt-in through the web application settings by verifying their phone number via OTP code."
   - $15 one-time campaign vetting fee + $1.50-$10/month
4. Wait for approval (typically 1 week)
5. Assign your number(s) to the campaign

**Skip this step if using toll-free numbers** (they have a separate verification process).

---

## 5. Twilio Verify Service Configuration

Your Verify service is already created (`TWILIO_VERIFY_SID`). Confirm the settings:

1. Go to [Verify > Services](https://console.twilio.com/us1/develop/verify/services)
2. Click your service
3. Settings to confirm:
   - **Code length**: 6 digits
   - **Code expiry**: 10 minutes
   - **Lookup enabled**: Yes (validates phone numbers)
   - **Fraud Guard**: Enabled (blocks SMS pumping fraud)
4. Under **Messaging Integration**:
   - Channel: SMS
   - Messaging Service SID: Use the one from step 2 (or leave default)

---

## 6. Supabase: Phone Auth Configuration

To enable phone-based authentication (sign-in/sign-up with phone number):

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) > Your Project
2. Navigate to **Authentication > Providers > Phone**
3. **Enable** the Phone provider
4. **SMS Provider**: Select `Twilio Verify`
5. Enter credentials:
   - **Account SID**: Your `TWILIO_ACCOUNT_SID`
   - **Auth Token**: Your `TWILIO_AUTH_TOKEN`
   - **Verify Service SID**: Your `TWILIO_VERIFY_SID`
6. **Save**

This enables `supabase.auth.signInWithOtp({ phone })` and `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` for phone-based authentication.

---

## 7. Supabase: Run Database Migration

Run the migration to create all `sms_` tables:

```bash
# Option A: Via Supabase CLI
supabase db push

# Option B: Via SQL Editor in Supabase Dashboard
# Copy contents of migrations/0010_sms_integration.sql
# Paste into SQL Editor and run
```

### Tables created:
| Table | Purpose |
|-------|---------|
| `sms_phone_numbers` | Twilio phone numbers assigned to users |
| `sms_conversations` | Conversation threads (user, admin, AI agent, notification) |
| `sms_messages` | All inbound/outbound messages with full Twilio metadata |
| `sms_media` | MMS attachment tracking |
| `sms_consent` | TCPA opt-in/opt-out compliance |
| `sms_notification_preferences` | Per-user SMS notification settings |
| `sms_notifications` | Outbound notification audit log |
| `sms_rate_limits` | Per-number rate limiting |
| `sms_webhook_logs` | Raw webhook payload logging for debugging |

### Triggers created:
- `trg_sms_message_inserted`: Updates conversation metadata on new message
- `trg_sms_opt_out_handler`: Auto-handles STOP/START keywords at DB level
- `trg_sms_*_updated`: Auto-updates `updated_at` timestamps

---

## 8. Vercel: Webhook URL Configuration

After deploying, verify that your webhook URLs are accessible:

1. **Inbound SMS**: `https://aimatrx.com/api/webhooks/twilio/sms`
2. **Status Callbacks**: `https://aimatrx.com/api/webhooks/twilio/status`

Test with curl:
```bash
curl https://aimatrx.com/api/webhooks/twilio/sms
# Should return JSON with endpoint info

curl https://aimatrx.com/api/webhooks/twilio/status
# Should return JSON with endpoint info
```

### For local development:
Use ngrok to expose your local server:
```bash
ngrok http 3000
# Copy the https URL and update your Twilio webhook URLs temporarily
```

---

## 9. Install Twilio SDK (if not already installed)

```bash
pnpm add twilio
pnpm add -D @types/twilio   # If types are needed (SDK v5 has built-in types)
```

---

## 10. Post-Deployment Checklist

- [ ] Environment variables set in Vercel (all 4 Twilio vars)
- [ ] Messaging Service created in Twilio Console
- [ ] Phone number(s) added to Messaging Service sender pool
- [ ] Webhook URLs configured on Messaging Service
- [ ] A2P 10DLC registration submitted (or toll-free verification)
- [ ] Supabase Phone Auth enabled with Twilio Verify
- [ ] Database migration run successfully
- [ ] Test inbound SMS to your Twilio number
- [ ] Test outbound SMS via `/api/sms/send`
- [ ] Test phone verification via `/api/sms/verify`
- [ ] Verify status callbacks are being received

---

## API Reference (Quick)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks/twilio/sms` | POST | Twilio inbound SMS webhook |
| `/api/webhooks/twilio/status` | POST | Twilio delivery status callback |
| `/api/sms/send` | POST | Send outbound SMS (authenticated) |
| `/api/sms/conversations` | GET/POST | List/manage conversations |
| `/api/sms/messages` | GET | Fetch messages for a conversation |
| `/api/sms/preferences` | GET/PUT | SMS notification preferences |
| `/api/sms/verify` | POST | Phone number verification |
| `/api/sms/numbers` | GET/POST | Phone number management |
| `/api/sms/admin` | POST | Admin SMS operations + analytics |

---

## Architecture Overview

```
lib/sms/                          # Server-side service layer
├── client.ts                     # Twilio client singleton
├── types.ts                      # Service types
├── send.ts                       # Outbound SMS with DB logging
├── receive.ts                    # Inbound SMS processing
├── verify.ts                     # Phone verification (Twilio Verify)
├── numbers.ts                    # Phone number management
├── validate.ts                   # Webhook signature validation
├── notificationService.ts        # High-level notification functions
└── index.ts                      # Barrel exports

features/sms/                     # Client-side feature module
├── types.ts                      # Client types
├── redux/smsSlice.ts             # Redux state management
└── index.ts                      # Barrel exports

app/api/webhooks/twilio/          # Twilio webhook handlers
├── sms/route.ts                  # Inbound SMS
└── status/route.ts               # Status callbacks

app/api/sms/                      # SMS REST API
├── send/route.ts                 # Send messages
├── conversations/route.ts        # Conversation management
├── messages/route.ts             # Message history
├── preferences/route.ts          # User notification prefs
├── verify/route.ts               # Phone verification
├── numbers/route.ts              # Phone number management
└── admin/route.ts                # Admin operations + analytics
```
