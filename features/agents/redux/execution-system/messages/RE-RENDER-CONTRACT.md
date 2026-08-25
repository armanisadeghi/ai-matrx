# `messages/` — re-render contract

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/CLIENT-RUNTIME.md` — read it before touching this feature in ANY repo.

Message-body components do expensive work (markdown parsing, renderBlock compilation, tool-call
visualizations, LaTeX, image loaders). The stream commit path fires several small status patches per
assistant turn. The slice uses Immer `createSlice` and patches with `Object.assign`, so structural
sharing keeps `content` referentially equal across a status-only patch — and `useAppSelector`
compares with `===`. That only holds if you select narrowly.

## The rules

- **Do NOT subscribe to the full record when you only need one field.** ❌ `selectMessageById`
  ✅ `selectMessageContent` / `selectMessageStatus` / `selectMessageClientStatus` /
  `selectMessageRole` / `selectMessagePosition` / `selectMessageAgentId` /
  `selectMessageMetadata` / `selectMessageContentHistoryRecord` / `selectOrderedMessageIds`
  (all in `messages.selectors.ts`).
- **Never return a fresh `[]`.** `?? []` hands back a new array every call. Return a module-level
  constant (`const EMPTY: Foo[] = []`) or use `createSelector`.
- **Never compose narrow selectors into an object inside a hook.** `{ content, status }` is a new
  object every render. Use multiple `useAppSelector` calls, or one memoized `createSelector`.
- **`selectDisplayMessages` still projects from `turns[]`.** When it flips to `byId + orderedIds`
  it must be `createSelector`-memoized on `byId` identity, not on individual field patches.

The record carries BOTH a server `status` and a client rollup `_clientStatus`; they are not
interchangeable.
