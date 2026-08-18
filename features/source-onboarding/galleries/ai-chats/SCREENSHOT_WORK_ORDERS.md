# Screenshot work orders — ai-chats gallery

Codex work orders for capturing the guide screenshots on Arman's real accounts. Each order names the exact target path. Coding tools (Cursor, VS Code Copilot, Claude Code) need no screenshots — their flows are local-file flows.

## Capture status (groomed 2026-08-17)

**0 of 16 captured.** Every capture below sits behind a signed-in real account (ChatGPT, Claude, Google Takeout, Grok/xAI, WhatsApp, Meta Accounts Center) — none of the export UIs render anonymously, so a sandboxed agent cannot fill any of them and must never log into an account or fabricate a fake-UI image. Until a human (or an agent driving Arman's authenticated Chrome, with his consent) runs these orders, every slot renders the honest illustrated placeholder in `ScreenshotSlot.tsx` and the pages ship complete without the images. Landing a capture is zero-code: save the PNG at the exact target path.

| Provider | Slots | Account needed |
|---|---|---|
| ChatGPT | 4 (`settings-menu`, `data-controls`, `export-confirm`, `email-link`) | chatgpt.com + its email inbox |
| Claude | 3 (`settings-privacy`, `export-button`, `email-link`) | claude.ai + its email inbox |
| Gemini | 4 (`takeout-deselect`, `my-activity-filter`, `format-json`, `create-export`) | Google |
| Grok | 2 (`grok-settings`, `xai-data-page`) | grok.com / accounts.x.ai |
| Meta AI | 3 (`whatsapp-command`, `accounts-center`, `dyi-json`) | WhatsApp + Instagram/Facebook |

## Global rules (apply to every capture)

- Viewport: 1280px wide browser window, light mode.
- Save as PNG at the exact target path. Create the provider directory if missing.
- Redact before saving: blur or block out all email addresses and all chat titles visible anywhere in the frame (sidebars included). Account names/initials may stay if generic; redact if they identify a real person's email.
- Capture the relevant panel with enough surrounding context that a non-technical user recognizes where they are. Crop out unrelated browser chrome.
- Do not request a real data export where a confirmation screen can be captured and cancelled — EXCEPT where the order explicitly requires completing the export (email screenshots).

## 1. ChatGPT

Sign in at chatgpt.com.

1. `public/images/source-onboarding/chatgpt/settings-menu.png` — Click the profile icon in the bottom-left so the menu opens with Settings visible. Capture the open menu with Settings highlighted. Redact the account email in the menu and all chat titles in the sidebar.
2. `public/images/source-onboarding/chatgpt/data-controls.png` — Open Settings > Data controls (or navigate to https://chatgpt.com/#settings/DataControls). Capture the Settings panel with the Data controls tab selected and the Export data row visible.
3. `public/images/source-onboarding/chatgpt/export-confirm.png` — Click Export so the confirmation dialog appears. Capture the dialog with the Confirm export button visible. You may click Confirm (a real export is harmless) or cancel after capture.
4. `public/images/source-onboarding/chatgpt/email-link.png` — Requires a completed export. Confirm the export, wait for the email from noreply@tm.openai.com (check spam/promotions), open it, and capture the email with the download button visible. Redact the recipient email address and any account identifiers in the email body.

## 2. Claude

Sign in at claude.ai in a browser (not the mobile app — export does not exist there).

1. `public/images/source-onboarding/claude/settings-privacy.png` — Click the initials in the bottom-left > Settings > Privacy (or navigate to https://claude.ai/settings/data-privacy-controls). Capture the Privacy section with the Your data area visible. Redact the account email and any chat titles in the sidebar.
2. `public/images/source-onboarding/claude/export-button.png` — Same page, capture framed tightly on the Your data section so the Export data button is clearly the subject. Clicking it starts a real export; that is fine and is required for step 3.
3. `public/images/source-onboarding/claude/email-link.png` — Requires a completed export. Click Export data, wait for the email from Anthropic, open it, and capture it with the download link visible. Redact the recipient email address.

## 3. Gemini

Sign in with Arman's Google account. This provider has the two traps — the screenshots exist to disarm them, so frame each one on the exact control named.

1. `public/images/source-onboarding/gemini/takeout-deselect.png` — Go to takeout.google.com and click Deselect all. Capture the top of the product list showing Deselect all clicked and the products unchecked. The top-level Gemini row may be visible but must be UNCHECKED — that is the point of the shot.
2. `public/images/source-onboarding/gemini/my-activity-filter.png` — Scroll to My Activity, check it, click the "All activity data included" button, click Deselect all inside the dialog, then check only Gemini Apps. Capture the open dialog with only Gemini Apps checked.
3. `public/images/source-onboarding/gemini/format-json.png` — On the My Activity row, click "Multiple formats" and change Activity records from HTML to JSON. Capture the dialog with JSON selected for Activity records.
4. `public/images/source-onboarding/gemini/create-export.png` — Click Next step. Capture the destination/frequency screen with the Create export button visible. You may click Create export (harmless) or stop after capture. Redact the account email shown in the Google header.

## 4. Grok

Sign in at grok.com.

1. `public/images/source-onboarding/grok/grok-settings.png` — Open Settings > Data Controls. Capture the panel with the Export account data option visible. Redact any chat titles in the sidebar and the account email.
2. `public/images/source-onboarding/grok/xai-data-page.png` — Click Export account data (or navigate to https://accounts.x.ai/data). Capture the xAI data page with the download request button visible. Redact the account email.

## 5. Meta AI

Fragmented by design — three captures across two surfaces. No capture is needed for meta.ai on the web (it has no export button; the guide says so in words).

1. `public/images/source-onboarding/meta-ai/whatsapp-command.png` — In WhatsApp (web.whatsapp.com at 1280px, light mode), open a Meta AI chat and send the message /download-all-ai-info. Capture the chat showing the sent command and Meta AI's reply. Redact all other chat names in the sidebar and any phone numbers.
2. `public/images/source-onboarding/meta-ai/accounts-center.png` — Sign in to Instagram or Facebook, open Accounts Center > Your information and permissions > Download your information. Capture that screen. Redact the account email and profile names.
3. `public/images/source-onboarding/meta-ai/dyi-json.png` — Continue into the download flow (or navigate to https://privacycenter.instagram.com/dialog/download-chat-history-with-ai/) until the format choice is visible. Capture the screen with JSON selected as the format. Cancel after capture if you do not want a real export. Redact the account email.
