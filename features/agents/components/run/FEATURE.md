# Run status UI

- Fatal request errors render through `AssistantError` and remain visible after
  any partial answer.
- High-severity recoverable warnings render through `AssistantWarning`; they
  are not confined to the debug timeline.
- Friendly `user_message` text is primary. Machine code and system detail stay
  available behind a disclosure.
- Low/medium warnings remain telemetry/status information unless a dedicated
  surface promotes them.

