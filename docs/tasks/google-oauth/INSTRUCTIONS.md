Here's everything that was done in the console, followed by your two complete documents.

---

## ✅ What Was Just Done in the Console

**Layer 1 scopes added (all non-sensitive, live now):**
- `userinfo.email` — user's Google email address
- `userinfo.profile` — user's basic profile info
- `calendar.calendarlist.readonly` — see what calendars exist
- `calendar.events.freebusy` — see availability/free-busy times
- `drive.appdata` — app's own config storage in Drive (hidden folder)
- `drive.install` — appear in Drive's "Open with" menu
- `gmail.labels` — see and edit email labels

**MCP Service APIs enabled:**
- `gmailmcp.googleapis.com` — Gmail MCP API ✅ Enabled
- `drivemcp.googleapis.com` — Drive MCP API ✅ Enabled
- `calendarmcp.googleapis.com` — Calendar MCP API ✅ Enabled

(Gmail API and Drive API were already enabled.)

---

Now here are your two documents:

---

# DOCUMENT 1: Google OAuth Sensitive Scope Verification Checklist

```markdown
# Google OAuth Sensitive Scope Verification — AI Matrx
## Project: ai-matrix-engine | App: AI Matrx (verified, In Production, External)

---

## OVERVIEW

We are submitting for **sensitive scope** re-verification to add the following scopes to 
our already-verified OAuth app. These are all SENSITIVE (not Restricted), meaning Google 
reviews our use case and video but does NOT require a third-party security audit.

### Scopes Being Added

| Scope | Classification | Purpose |
|---|---|---|
| `gmail.send` | Sensitive | Send AI-drafted emails on user's behalf |
| `gmail.addons.current.message.metadata` | Sensitive | Read email subject/sender for context |
| `contacts.readonly` | Sensitive | Populate agent contact suggestions |
| `calendar.events` | Sensitive | Create/update calendar events via agent |
| `calendar.events.readonly` | Sensitive | Read calendar for scheduling context |

---

## PART 1: THINGS TO BUILD BEFORE SUBMITTING

Google's reviewers will visit your app and watch your demo video. 
Every scope must be demonstrably live in the app UI.

### 1A. Gmail Send — Feature to Build

**Feature name:** "AI Draft & Send"  
**Where in app:** Settings > Integrations > Gmail (or a dedicated "Email Agent" panel)  
**What it must show:**
- User connects their Google account via OAuth (show the consent screen in the video)
- User types a prompt like "Send a follow-up email to John about the proposal"
- App generates a draft, shows it to the user in a REVIEW PANEL
- User clicks "Approve & Send" — the email is dispatched via `gmail.send`
- A confirmation is shown: "Email sent to john@example.com"

**Key point for justification:** The review step is mandatory to show. Google needs 
to see that humans approve before sending. This is their #1 concern with `gmail.send`.

**What NOT to build:** Do not auto-send without user review. That will get rejected.

---

### 1B. Gmail Message Metadata — Feature to Build

**Feature name:** "Email Context Panel" or "Smart Email Lookup"  
**Where in app:** Inside any agent conversation or task panel  
**What it must show:**
- Agent displays relevant email subjects/senders alongside a task
  (e.g., "I found 3 recent emails from this contact about this project")
- Metadata only: subject line, sender, date, labels — NOT email body
- This clearly demonstrates why `gmail.readonly` is NOT needed (we only need metadata)

**Key point:** This scope is specifically for metadata. Your justification must explain 
that you do NOT read email body content — that's what makes this approvable without 
the restricted `gmail.readonly` scope.

---

### 1C. Contacts Readonly — Feature to Build

**Feature name:** "Smart Contact Suggestions" or "People Lookup"  
**Where in app:** Email compose panel, task assignment, or agent prompt autocomplete  
**What it must show:**
- User starts typing a name in a recipient/assignee field
- App suggests matching contacts from the user's Google Contacts
- User selects a contact — their name/email populates the field

**Key point:** Show it's for productivity (autocomplete/suggestions), 
not for harvesting or storing contact lists.

---

### 1D. Calendar Events (Read/Write) — Feature to Build

**Feature name:** "AI Calendar Assistant" or "Schedule Manager"  
**Where in app:** A calendar view or scheduling panel  
**What it must show:**
- Agent reads existing calendar events to check availability  
  (e.g., "You have a meeting at 2pm on Thursday")
- Agent creates a new event based on user instruction  
  (e.g., "Schedule a 30-minute call with Sarah next Tuesday at 10am")
- The created event appears in the app's calendar view AND in Google Calendar
- User sees a confirmation with event details

**Key point for justification:** You need BOTH `calendar.events` and 
`calendar.events.readonly` because your app both reads (for availability/context) 
AND creates/updates (for the agent to act). Explain why `calendar.app.created` 
(which you already have) is insufficient — it only covers calendars YOUR APP created,
not the user's primary calendar.

---

## PART 2: PRIVACY POLICY REQUIREMENTS

Your privacy policy at aimatrx.com must be updated BEFORE submitting.
Google reviewers check this manually.

### Required Additions to Privacy Policy

Add a dedicated section titled **"Google User Data"** or **"Third-Party Integrations"** 
that explicitly states:

```
GOOGLE USER DATA

When you connect your Google account to AI Matrx, we may access the following 
data depending on the permissions you grant:

- Your Google Account email address and basic profile information
- Gmail labels and email metadata (subject, sender, date) — we do NOT read 
  email body content without your explicit action
- The ability to send emails on your behalf, only after your explicit approval 
  of each message
- Your Google Contacts for autocomplete and suggestion features within the app
- Your Google Calendar events to assist with scheduling and task management
- Google Drive files that you explicitly open or create within AI Matrx

HOW WE USE THIS DATA:
This data is used solely to provide AI-powered productivity features within 
AI Matrx. We use it to help you compose emails, manage your calendar, suggest 
contacts, and interact with your Drive files through our AI agents.

WHAT WE DO NOT DO:
- We do NOT use your Google data to train AI or machine learning models
- We do NOT sell, share, or transfer your Google data to third parties
- We do NOT use your Google data for advertising or marketing purposes
- We do NOT store email body content on our servers
- We do NOT access your Google data beyond what is needed for the 
  specific feature you are actively using

DATA RETENTION:
OAuth access tokens are stored securely and are used only during active sessions. 
Users may revoke access at any time via their Google Account settings at 
myaccount.google.com/permissions.

This use complies with Google's Limited Use Policy:
https://developers.google.com/terms/api-services-user-data-policy
```

**Also required on your homepage (aimatrx.com):**
- A visible link to this privacy policy
- A description of the app's functionality (not just a login page)
- The privacy policy URL must match exactly what's in your OAuth consent screen config

---

## PART 3: DEMO VIDEO REQUIREMENTS

Google requires a video showing the COMPLETE OAuth flow AND each feature.

### Video Checklist (must hit ALL of these)

- [ ] Start from a logged-out state — show fresh sign-in
- [ ] Show the OAuth consent screen mid-flow (the actual Google consent dialog)
  - The consent screen MUST show all the scopes being requested
  - Language on consent screen must be set to **English** (bottom-left toggle)
- [ ] For EACH scope, show the specific feature that uses it:
  - Show "AI Draft & Send" using `gmail.send` — include the review/approval step
  - Show "Email Context Panel" using `gmail.addons.current.message.metadata`
  - Show contact autocomplete using `contacts.readonly`
  - Show reading calendar events using `calendar.events.readonly`
  - Show creating a calendar event using `calendar.events`
- [ ] Show your app name and logo throughout (must match consent screen branding)
- [ ] Video must be publicly accessible (YouTube unlisted is fine)
- [ ] No cuts between the OAuth flow and the feature — show it end-to-end

**Recommended tool:** Loom (loom.com) — records screen + narration, easy YouTube upload

### Video Script Outline

1. "This is AI Matrx, a productivity platform that uses AI agents to help users 
   manage their communications and schedule."
2. Show the Google sign-in button → click it
3. Walk through the OAuth consent screen — read the scopes out loud
4. After auth: show each feature, narrate what scope it uses and why

---

## PART 4: SCOPE JUSTIFICATION TEXT

Use this text verbatim (or adapt slightly) when filling in the justification 
fields during Google's verification submission form.

### gmail.send
```
AI Matrx's Email Agent feature enables AI-generated email drafts that users 
review and explicitly approve before sending. The app displays a draft in a 
review panel where users can edit, approve, or discard. The email is only sent 
after the user clicks "Approve & Send." We use gmail.send (not gmail.compose or 
gmail.modify) because we only need to dispatch pre-approved outbound emails — 
we do not need to read, modify, or store any inbox data.
```

### gmail.addons.current.message.metadata
```
AI Matrx's context panel displays relevant email metadata (subject, sender, date) 
alongside tasks and agent conversations to help users understand communication 
history without leaving the app. We use this metadata-only scope rather than 
gmail.readonly because we do not need to access email body content — showing 
subject lines and sender names provides sufficient context for our productivity 
features.
```

### contacts.readonly
```
AI Matrx uses the user's Google Contacts to power autocomplete suggestions in 
the email recipient field and agent task assignment. When a user starts typing 
a name, we surface matching contacts to reduce manual entry errors. We use 
readonly access because we never create, modify, or delete contacts — we only 
read them to power suggestions.
```

### calendar.events.readonly
```
AI Matrx's scheduling agent reads the user's calendar events to check 
availability and provide context when answering questions like "What do I 
have on Thursday?" This scope is needed in addition to calendar.app.created 
(which we already have) because calendar.app.created only covers calendars 
created by our app — it does not give visibility into the user's primary 
Google Calendar where their actual schedule lives.
```

### calendar.events
```
AI Matrx's scheduling agent creates, updates, and manages Google Calendar events 
on behalf of the user based on their instructions (e.g., "Schedule a 1-hour 
meeting with Sarah next Tuesday at 10am"). Users confirm event details before 
they are created. We require the write portion of this scope because the core 
value of the scheduling agent is acting on the calendar, not just reading it.
```

---

## PART 5: HOW TO SUBMIT

1. Go to: console.cloud.google.com → Google Auth Platform → Data Access
2. Click "Add or remove scopes" and add the 5 sensitive scopes listed above
3. Click Save
4. Go to: Google Auth Platform → Verification Center
5. Click "Prepare for verification" or "Edit app"
6. Fill in all fields:
   - App homepage URL: https://www.aimatrx.com
   - Privacy policy URL: https://www.aimatrx.com/privacy (must be live)
   - Demo video URL: [your Loom/YouTube link]
   - Justifications: paste from Part 4 above
7. Submit and await email from Google (typically 3-5 business days, sometimes longer)

**Important:** Do NOT add restricted scopes (gmail.readonly, drive.readonly, etc.) 
to this submission. Adding them will cause the entire submission to be reviewed 
under the more stringent restricted scope process and risk rejection of everything.

---

## PART 6: THINGS THAT COMMONLY CAUSE REJECTION

- Homepage is just a login page with no feature description → REJECTED
- Privacy policy doesn't mention Google data → REJECTED  
- Demo video cuts away from the consent screen → REJECTED
- Justification says "we might use this in the future" → REJECTED
- Scope is requested but not visibly demonstrated in the app → REJECTED
- App name on consent screen doesn't match app name in video → REJECTED
- Requesting more than the narrowest scope needed → REJECTED

---

## STATUS TRACKER

| Task | Owner | Status |
|---|---|---|
| Build "AI Draft & Send" feature | Dev team | ☐ Not started |
| Build "Email Context Panel" feature | Dev team | ☐ Not started |
| Build "Contact Autocomplete" feature | Dev team | ☐ Not started |
| Build "Calendar Agent" feature | Dev team | ☐ Not started |
| Update privacy policy with Google data section | Arman | ☐ Not started |
| Add privacy policy link to homepage | Dev team | ☐ Not started |
| Record demo video | Arman | ☐ Not started |
| Add sensitive scopes in console | Claude | ☐ Do when features are live |
| Submit in Verification Center | Arman | ☐ Do last |
```

---

# DOCUMENT 2: Google MCP Integration — In-App Setup Guide

```markdown
# Google MCP Integration — AI Matrx In-App Agents
## Project: ai-matrix-engine

---

## WHAT'S ALREADY DONE (as of June 12, 2026)

✅ Gmail API enabled (gmail.googleapis.com)  
✅ Google Drive API enabled (drive.googleapis.com)  
✅ Gmail MCP API enabled (gmailmcp.googleapis.com)  
✅ Drive MCP API enabled (drivemcp.googleapis.com)  
✅ Calendar MCP API enabled (calendarmcp.googleapis.com)  
✅ Web OAuth client exists (34576215171-sf7s...lahk8)  
✅ drive.file scope on consent screen (Drive MCP file creation works NOW)  

---

## HOW THE IN-APP MCP ARCHITECTURE WORKS

The Google remote MCP servers work like this for in-app agents:

1. **User connects Google** — your app initiates the standard OAuth flow 
   using your Web client ID. The user grants scopes. You receive an 
   access token + refresh token.

2. **Your agent calls the MCP endpoint** — when an agent needs to read Gmail 
   or Drive, your backend passes the user's OAuth token in the Authorization 
   header to Google's MCP server URL.

3. **Google's MCP server responds** — it validates the token, checks the 
   scopes, and returns structured tool responses your agent can use.

This means: **your agents act as MCP clients**, calling Google's remote MCP 
server with the user's token. The user doesn't need to use Antigravity or any 
specific client — your app IS the MCP client.

---

## MCP ENDPOINTS

| Service | MCP Endpoint URL |
|---|---|
| Gmail | `https://gmailmcp.googleapis.com/mcp/v1` |
| Google Drive | `https://drivemcp.googleapis.com/mcp/v1` |
| Google Calendar | `https://calendarmcp.googleapis.com/mcp/v1` |

All use HTTP transport with OAuth Bearer token authentication.

---

## WHAT SCOPES UNLOCK WHAT MCP TOOLS

### Gmail MCP Tools
Requires scopes: `gmail.readonly` (restricted) + `gmail.compose` (restricted)

| Tool | What it does |
|---|---|
| `search_threads` | Search user's emails |
| `get_thread` | Read a full email thread |
| `list_labels` | List Gmail labels |
| `label_message` / `unlabel_message` | Apply/remove labels |
| `list_drafts` | List draft emails |
| `create_draft` | Create a draft email |

⚠️ **Gmail MCP requires restricted scopes.** Until those are verified on your app,
only YOUR accounts (test users) can use Gmail MCP tools. Production users will 
see "unverified app" warnings on the restricted scopes.

**Short-term workaround:** Add yourself and team members as test users in 
Google Auth Platform → Audience → Test users. Gmail MCP works for test users 
without verification.

### Drive MCP Tools
Requires scopes: `drive.readonly` (restricted) + `drive.file` (non-sensitive ✅)

| Tool | What it does | Scope needed |
|---|---|---|
| `search_files` | Search Drive files | `drive.readonly` (restricted) |
| `read_file_content` | Read file contents | `drive.readonly` (restricted) |
| `get_file_metadata` | Get file info | `drive.readonly` (restricted) |
| `list_recent_files` | List recent files | `drive.readonly` (restricted) |
| `create_file` | Create new file | `drive.file` ✅ WORKS NOW |
| `copy_file` | Copy a file | `drive.file` ✅ WORKS NOW |
| `download_file_content` | Download content | `drive.readonly` (restricted) |

**Good news:** `create_file` and `copy_file` work right now with `drive.file`.

### Calendar MCP Tools
Requires: `calendar.events` (sensitive — needs verification)

---

## PART 1: ADD MCP REDIRECT URI TO YOUR WEB CLIENT

Your existing Web OAuth client needs one additional redirect URI to support 
the MCP OAuth callback flow.

**You need to do this:**
1. Go to: console.cloud.google.com → APIs & Services → Credentials
2. Click on "Web client (auto created by Google Service)"
3. Under "Authorized redirect URIs", add:
   - `https://www.aimatrx.com/auth/google/callback` (if not already there — 
     check your existing URIs first, you may already have the right one)
   
   For any MCP client integrations, the redirect URI depends on the client:
   - Antigravity: `https://antigravity.google/oauth-callback`
   - Claude.ai: `https://claude.ai/api/mcp/auth_callback`  
   - Your custom in-app callback: whatever URL your auth handler uses

4. Click Save

---

## PART 2: BACKEND IMPLEMENTATION FOR IN-APP MCP

Your backend needs to make MCP calls on behalf of users. Here's the pattern:

### Step 1: OAuth Token Storage

When a user connects their Google account, store their tokens securely:
- `access_token` — short-lived (1 hour)
- `refresh_token` — long-lived (use this to get new access tokens)
- `scope` — what scopes the user granted
- `user_id` — to associate tokens with your user

Store in your database or a secure token store (NOT in localStorage or cookies).

### Step 2: Making MCP Calls

Your agent backend calls the MCP endpoint directly:

```javascript
// Example: Call Gmail MCP to search threads
const response = await fetch('https://gmailmcp.googleapis.com/mcp/v1', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userAccessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'search_threads',
      arguments: {
        query: 'from:john subject:proposal',
        maxResults: 10
      }
    },
    id: 1
  })
});
```

### Step 3: Token Refresh

Access tokens expire every hour. Implement automatic refresh:

```javascript
// When you get a 401, refresh the token
const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: YOUR_CLIENT_ID,
    client_secret: YOUR_CLIENT_SECRET,
    refresh_token: storedRefreshToken,
    grant_type: 'refresh_token'
  })
});
const { access_token } = await refreshResponse.json();
// Save new access_token, retry the MCP call
```

### Step 4: Scope Gating in Your UI

Before calling an MCP tool, check whether the user has granted the required scope:

```javascript
// Check if user has granted the needed scope
const hasGmailScope = user.googleScopes.includes('https://www.googleapis.com/auth/gmail.readonly');
if (!hasGmailScope) {
  // Show "Connect Gmail" CTA — trigger incremental auth for that scope
  showConnectGmailPrompt();
} else {
  // Proceed with MCP call
  callGmailMCP();
}
```

This is called **incremental authorization** — users can connect Google initially 
with just the non-sensitive scopes, and you request additional scopes later 
only when they try to use the feature that needs them.

---

## PART 3: WHAT WORKS RIGHT NOW FOR YOUR USERS

Without any additional verification, here's what's immediately usable in production:

| Feature | Scope | Status |
|---|---|---|
| User identity (name, email, avatar) | `userinfo.email` + `userinfo.profile` | ✅ Works now |
| See user's calendar list | `calendar.calendarlist.readonly` | ✅ Works now |
| Check free/busy times | `calendar.events.freebusy` | ✅ Works now |
| Store app config in user's Drive | `drive.appdata` | ✅ Works now |
| Create new Drive files (agent-created) | `drive.file` | ✅ Works now |
| Create a Drive file via MCP | Drive MCP + `drive.file` | ✅ Works now |
| See/edit Gmail labels | `gmail.labels` | ✅ Works now |
| All of the above for Gmail MCP (test users only) | All | ✅ Test users only |

---

## PART 4: GOOGLE SHEETS/DOCS IMPORT — THE QUESTION YOU ASKED

**Importing a Google Sheet or Doc into your app** is the most nuanced part.

### What "import" means matters a lot:

**Scenario A: User imports a Sheet/Doc that YOUR APP created**  
→ Scope needed: `drive.file` ✅ Already have it. Works today.  
The user opens a file your app created, your app reads it back. No new scopes needed.

**Scenario B: User imports ANY Sheet/Doc from their Drive**  
→ Scope needed: `drive.readonly` ❌ Restricted scope  
This requires a security audit. Not achievable without going through 
the full restricted scope verification process.

**Scenario C: User uses Google Picker to select a specific file**  
→ Scope needed: `drive.file` ✅ Already have it!  

**THIS IS THE WINNER.** The Google Picker API lets users browse their Drive 
and select a specific file. When they select it, that file is "opened with" 
your app, and `drive.file` gives you access to it. This is Google's intended 
pattern for letting apps access user files WITHOUT needing `drive.readonly`.

### How to Implement Google Picker (the right way)

```html
<!-- 1. Load the Picker library -->
<script src="https://apis.google.com/js/api.js"></script>
```

```javascript
// 2. Open the picker when user clicks "Import from Google Drive"
function openGooglePicker(userOAuthToken) {
  gapi.load('picker', () => {
    const picker = new google.picker.PickerBuilder()
      .addView(
        new google.picker.DocsView()
          .setIncludeFolders(false)
          .setMimeTypes('application/vnd.google-apps.spreadsheet,application/vnd.google-apps.document')
      )
      .setOAuthToken(userOAuthToken)  // user's access token with drive.file scope
      .setDeveloperKey(YOUR_API_KEY)  // your Gemini API key or a separate browser key
      .setCallback(handlePickerResult)
      .build();
    picker.setVisible(true);
  });
}

// 3. Handle the selected file
function handlePickerResult(data) {
  if (data.action === google.picker.Action.PICKED) {
    const file = data.docs[0];
    const fileId = file.id;
    const mimeType = file.mimeType;
    
    // 4. Export the file content via Drive API
    // For Sheets: export as CSV or XLSX
    // For Docs: export as plain text or DOCX
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
    
    fetch(exportUrl, {
      headers: { Authorization: `Bearer ${userOAuthToken}` }
    })
    .then(r => r.text())
    .then(csvContent => {
      // Import the CSV content into your app
      importContentToApp(csvContent);
    });
  }
}
```

### Sheets vs Docs Export Formats

| Source | Export MIME type | Result |
|---|---|---|
| Google Sheets | `text/csv` | CSV data — easy to parse |
| Google Sheets | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | XLSX |
| Google Docs | `text/plain` | Plain text |
| Google Docs | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | DOCX |

**The Google Picker + drive.file approach is the answer to your question.**  
It lets users import any Sheet or Doc they choose, using ONLY the `drive.file` 
scope you already have. No new verification needed. This is the recommended 
pattern Google explicitly endorses as the alternative to `drive.readonly`.

---

## PART 5: THINGS STILL NEEDED FROM YOU

| Task | What | Notes |
|---|---|---|
| Verify MCP redirect URI is correct | Check Web client authorized URIs | Compare against your auth callback URL |
| Implement OAuth token storage | Backend DB table for Google tokens | Include refresh_token, scopes, expiry |
| Implement token refresh logic | Backend middleware | Auto-refresh before MCP calls |
| Implement incremental auth | Frontend + backend | Request new scopes on demand |
| Implement Google Picker | Frontend | For Sheets/Docs import NOW |
| Add MCP client to your agent framework | Backend | HTTP calls to MCP endpoints |
| Add yourself as test user | Console → Audience → Test users | To test Gmail MCP today |
| Enable People API (for contacts) | console.cloud.google.com → Library → People API | Needed when contacts scope is verified |

---

## PART 6: WHEN RESTRICTED SCOPES ARE APPROVED (future)

Once you go through the full restricted scope process (which requires 
a security audit — plan for 3-6 months and ~$3,000-8,000 for the audit), 
you'll unlock:

- `gmail.readonly` → Gmail MCP's `search_threads`, `get_thread` for all users
- `drive.readonly` → Drive MCP's `search_files`, `read_file_content` for all files
- `drive.metadata.readonly` → File metadata browsing

Until then, the Picker approach covers the import use case completely, 
and MCP works for your own accounts as test users.
```

---

## On Item 4 — Google Sheets/Docs Import: The Short Answer

**You do NOT need restricted scopes to do this.** The Google Picker API + `drive.file` (which you already have) is the exact pattern Google designed for this. The user sees a native Google file browser, selects their Sheet or Doc, and your app gets the content. It's clean, it's already authorized, and it works in production right now for all your users. That's the implementation path I'd prioritize immediately.