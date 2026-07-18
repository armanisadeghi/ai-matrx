# Agent variable assignments

**Status:** active  
**Last updated:** 2026-07-18

This feature resolves variable values before ordinary agent execution. The
agent runtime receives normal values and remains unaware of randomization,
batch planning, leases, or recovery.

## Two execution paths

### One secure random variable

A choice-backed variable opts in through
`customComponent.assignment.random=true`. Any Smart Agent Input surface may
then send the typed marker below through the normal agent endpoint:

```json
{"topic":{"type":"auto_assign","strategy":"random"}}
```

The browser never draws the option. Aidream validates the opt-in, reloads the
authoritative static or Structured List options, and uses OS-backed
cryptographic randomness. This path remains `POST /ai/agents/{id}`.

### Coordinated or exhaustive batches

The assignment API accepts a strict discriminated plan:

- `coordinated_rows` keeps related values, such as topic and research, paired.
- `independent_random` draws combinations with repeats or without replacement.
- `cartesian` enumerates combinations in declared or randomized order.

`POST /ai/agent-assignments` creates or resumes a durable session. Every
materialized item has a deterministic conversation, retry attempts, a lease,
and a persisted result. The frontend follows progress with
`GET /ai/agent-assignments/sessions/{id}` until the session is terminal; it can
cancel unfinished work with `POST .../cancel`.

Reusing a `session_key` with the same plan resumes the existing session and
does not rerun completed items. Reusing it with a different plan is rejected.
This supports recovery after a browser refresh, workflow retry, process crash,
or partial provider failure.

## Frontend implementation

- Demo route: `/demos/agent-assignments`
- UI: `components/assignment-demo/AgentAssignmentsDemo.tsx`
- RTK state/thunks: `redux/agent-assignments/`
- Typed HTTP wrappers: `lib/api/call-api.ts`
- Generated schemas: `types/python-generated/api-types.ts` and
  `stream-events.ts`

The demo covers single random assignment, paired blog rows, independent random
batches, and Cartesian enumeration. It exposes session identity, progress,
resume, cancel, and durable item results.

## Content IR and boundaries

The workflow action `ai.agent.assignment_batch` and the direct API call the
same backend helper. Strict Pydantic input/output models generate the TypeScript
API types. The workflow action publishes `action_io` Content IR contracts, and
each completed item records the generated `ai.agent.start` output kind. The
payload-independent assignment package knows only resolved JSON value maps;
future planners can become more sophisticated without changing agent inputs.

## Invariants

- Random choices are made server-side from authoritative options.
- Materialization happens once per idempotent session and is persisted exactly.
- Status reads never claim work or execute items.
- Every database read is authenticated and creator-owned; the persisted
  organization is recovered for body-less status and cancel calls.
- Normal agent execution remains the only model execution path.

## Change log

- 2026-07-18 — Added secure single-variable assignment, durable coordinated
  planning/execution, API wrappers, RTK demo state, and the complete demo UI.
