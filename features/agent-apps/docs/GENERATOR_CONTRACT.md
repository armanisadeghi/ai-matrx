# Agent App Generator Contract

Read this before generating or reviewing `app.definition.component_code`.

## Ownership boundary

| Concern                                             | Owner                             |
| --------------------------------------------------- | --------------------------------- |
| AppShell header, route tabs, back, publish, history | Platform host                     |
| Form inputs and workflow-specific body layout       | Generated component               |
| Streaming lifecycle and request identity            | Platform host                     |
| Markdown, tools, and registered `__kind` shapes     | `MarkdownStream` → Shape registry |
| Public URL availability                             | Platform publication transition   |

**Generated code never renders host chrome.** No `PageHeader`, `RouteHeader`, route tabs, history controls, fixed viewport header, or viewport-height calculation.

## Response rendering

Generated components accept `response`, `requestId`, `conversationId`, and `isStreaming`, then keep this mounted for the full run:

```tsx
<MarkdownStream
  content={response}
  requestId={requestId}
  conversationId={conversationId}
  isStreamActive={isStreaming}
/>
```

**The response is opaque to generated code.** These patterns are banned:

- `JSON.parse(response)` or parsing a substring of it.
- `response.match(...)`, code-fence extraction, or brace matching.
- Reading `__kind` in the generated component.
- Waiting for valid JSON or stream completion before rendering.
- Hand-rendering a registered Shape or any subset of one.
- Wrapping `MarkdownStream` in `prose`/typography transformations.
- Replacing streamed output with a spinner after response text exists.

`AgentAppMarkdownStreamBridge` supplies missing live request context as a recovery layer. **Recovery is not permission to omit the four props**; a recovery firing means generated code violated the contract.

## Publication

**Completed apps publish immediately.** Auto-create may persist an internal draft while paid generation is incomplete, but `finalizeDraft` publishes it. The user can unpublish later through the single publication transition; status and visibility never move independently.

## Failure audit — `a1bdeaed-2a25-4a75-acf3-47d460a1f898`

Agent-authored defects in the stored component (do not patch the row):

- Imports `@/components/mardown` instead of `@/components/MarkdownStream`.
- Extracts fenced JSON with regular expressions and calls `JSON.parse` during a live stream.
- Branches on `__kind === "product_research_report"`.
- Hand-renders the registered report as bespoke top-pick and retailer cards.
- Calls `MarkdownStream` with `content` only, omitting request and stream context.
- Shows a spinner while output could already render incrementally.

Platform defects exposed by the same app:

- The route nested `PageHeader` around `EntityModeHeader`, creating two portal owners.
- An orphaned history trigger remained after its inline sidebar was removed.
- Completed auto-created apps stopped in draft/internal state.
- Separate Status and Public controls allowed broken public-link combinations.
