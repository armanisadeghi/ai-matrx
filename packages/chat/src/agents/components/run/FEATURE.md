# Run status UI

- Fatal request errors render through `AssistantError` and remain visible after
  any partial answer.
- High-severity recoverable warnings render through `AssistantWarning`; they
  are not confined to the debug timeline.
- Friendly `user_message` text is primary. Machine code and system detail stay
  available behind a disclosure.
- Low/medium warnings remain telemetry/status information unless a dedicated
  surface promotes them. One promotion exists today: `setting_not_supported`
  (`level: "low"`, `recoverable: true`) — the Configuration Equivalence law's
  client-facing signal for an unexpected dropped setting
  (`common-docs/systems/platform/configuration-equivalence/FEATURE.md`). It renders
  inline via `selectVisibleWarnings` / `AssistantWarning` even though its
  server-declared level is low, because the run completed normally (never an
  error state) but the user's chosen setting was silently discarded — exactly
  the surprise the law requires be communicated. Add a code to
  `PROMOTED_WARNING_CODES` (`active-requests.selectors.ts`) to promote another
  one; never fork a second warning renderer to do it.

