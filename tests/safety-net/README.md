# Safety net (live, headless)

Real-user journeys that the shared-package refactor (auth/session, orgs, DB calls, server requests, uploads) can break.
Runs headless Playwright on the shared preview as admin@admin.com (live DB). Assertions are on what a person sees.

    pnpm preview:status                      # preview must be running (never start a second server)
    pnpm test:safety-net                     # all journeys   (= node tests/safety-net/run.mjs)
    pnpm test:safety-net j3                  # one journey by id prefix
    ORIGIN=http://<your-host>.localhost:3001 pnpm test:safety-net   # override the preview URL

Fault proof: `SAFETYNET_FAULT=<journey-id> pnpm test:safety-net <id>` makes one expectation impossible; it must go red.
Results table prints at the end and JSON lands in the temp dir (`SAFETYNET_OUT`). Exit code 1 if any journey fails.
Journeys clean up only the disposable records they create. Read-only for chat (never sends a message).
