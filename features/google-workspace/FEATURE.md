# Google Workspace

## Purpose

This is AI Matrx's focused, reviewer-visible Google Workspace product surface. It proves the exact user actions behind the first direct Google OAuth verification campaign without exposing unrelated product features.

## Routes and entry points

- `/google-workspace-review` is the clean production reviewer route.
- `/user-settings/integrations/google-workspace` renders the same reusable workspace inside user settings.
- `GoogleWorkspaceReviewRoot.tsx` is the single provider boundary used by both routes.

## Authorization contract

- Docs and Sheets use `drive.file`, never an account-wide Drive scope. The user selects one Google Doc or Sheet through Google Picker before AI Matrx registers or operates on it.
- The browser Picker token is short-lived, memory-only, restricted to the requested identity plus `drive.file` scopes, and tied to the connected account with `login_hint`.
- The durable refresh token is encrypted in aidream's canonical user secrets vault and is never persisted in the browser.
- Gmail is incremental and uses only `gmail.send`. The product cannot read, search, delete, or organize Gmail.
- Gmail sending requires visible recipients, subject, body, and an unchecked user confirmation immediately before the send action.
- Google Workspace content is not persisted by these endpoints and is not used to train generalized AI models.
- `/privacy-policy` affirmatively states that Google Workspace API data use adheres to the Google User Data Policy, including Limited Use requirements.

## Data and API flow

1. The browser receives an authorization code from Google Identity Services.
2. The browser sends that one-time code directly to aidream `/api/google-integrations/exchange` with the signed-in user's Supabase JWT.
3. aidream stores the refresh token in the canonical vault and safe connection metadata in `users.integration_connections`.
4. Google Picker returns one file id. aidream validates it through `drive.file` and stores only safe metadata in `users.integration_connection_resources` as `google_document` or `google_spreadsheet`.
5. Typed aidream `/api/google-workspace/*` endpoints read or update that exact resource. Gmail sends only the exact reviewed payload.

## Invariants

- No Drive list or search endpoint exists in the service.
- No Gmail read scope or endpoint exists in this feature.
- No file content or email body is stored by the Workspace service.
- Re-consent for Gmail must preserve existing Picker-selected resource rows.
- Marketing scopes are not bundled into the reviewer workflow.
- The dedicated reviewer route prepopulates Picker with the review-fixture query so unrelated Drive file names do not appear in the verification video. The normal Settings surface remains unfiltered.
- The frontend and backend canonical scope registries must remain aligned with `common-docs/projects/google-oauth-verification/PLAN.md`.

## Change log

- 2026-08-13: Added Google's required affirmative Limited Use compliance statement to the public privacy policy.
- 2026-08-07: Prepopulated Google Picker only on the dedicated reviewer route so verification recordings show the named review fixtures without exposing unrelated Drive file names.
- 2026-08-06: Added the focused reviewer route, in-product disclosures, selected Doc/Sheet Picker flow, bounded read/update actions, incremental reviewed Gmail send, and explicit disconnect control.
