---
name: agent-disclosure
description: >-
  Register the fixed AI jobs a surface already runs in the existing top Agents
  menu, and open each mandate in place. Use when a page, panel, overlay, or
  window already runs a mandate behind a button, assist, automatic action, or
  mode; when the agent-disclosure guard names a file; or during a surface check.
  Disclosure never adds agent labels, chips, cards, rosters, or any other visible
  page content. Not for agent-native surfaces or universal agent hosts, where no
  fixed worker is bound to the surface.
---

# Agent disclosure — register existing fixed jobs in the top menu

## The non-negotiable boundary

🚨 **DISCLOSURE MUST NEVER CHANGE THE SURFACE'S VISIBLE CONTENT.**

Do not add an agent chip, badge, card, row, label, roster, callout, explanatory
copy, icon, toolbar item, or section to the page, panel, dialog, overlay, or
window. Do not move or resize existing content to make room for disclosure. Do
not create a new agent integration merely so a surface can be "complete."

The disclosure destination is the shell's **existing top Agents menu only**.
The job must already exist in the product surface. This skill records that
pre-existing fixed job so the user can inspect its mandate without leaving the
page. It is not authority to modify page content or product behavior.

There is no inline disclosure component. `PageAgents` is forbidden and deleted.
If a task or old document tells you to render it, that instruction is stale and
must not be followed.

Cross-repo source of truth:
`../../../common-docs/systems/agents/mandates/CLIENT-SURFACES.md` § THE
DISCLOSURE LAW. Frontend detail:
[`features/surfaces/FEATURE.md`](../../../features/surfaces/FEATURE.md).

## Decide whether a roster exists

### Fixed surface job — disclose in the top menu

A fixed job is an AI action the surface itself owns: for example, a specific
mandate behind "Assign topics" or a recurring agent that performs the same job
for this page. Confirm the integration already exists before registering it.

- Static job: declare a manifest `agentRole` carrying its `mandateKey`.
- Runtime-selected fixed job: call `useDeclaredSurfaceMandates` from the
  existing action-bearing component. This call has no UI.
- Open the mandate through `useOpenMandateWindow`; never link away to a mandate
  route from a working surface.

### Agent-native surface — excluded and unbound

If the product is choosing, building, editing, running, testing, reviewing, or
comparing agents, the agent is the subject—not a hidden worker and not a surface
binding. This includes Chat, Agents Hub, Agent Apps, Agent Build/Builder, Agent
Run/Runner/history, Agent Battle/comparison, mandate authoring/settings, and
agent/widget test harnesses.

- Do not add manifest `agentRoles`, defaults, bindings, a bound roster, or Bind.
- Do not register a "separate fixed job" merely because one appears inside the
  host; the whole agent-native surface is outside disclosure.
- Do not add visible agent content. Existing agent cards, pickers, runs, and
  controls are the product itself, not disclosure.

### Universal agent host — exempt and structurally unbound

If the user may choose or chat with arbitrary agents, there is no fixed surface
roster. Chat, generic agent runners, agent pickers, pinned agents, history, and
quick-action choices are universal-host content/navigation.

- Set the manifest's `agentRosterMode: "universal"`.
- Do not add manifest `agentRoles` for available agents.
- Do not bind default, public, organization, or user agents to the surface.
- The top Agents menu must omit the bound-agent list and Bind control.
- The binding service must reject direct writes for the surface.

An agent-native host never becomes eligible because it also runs a fixed
mandate. Keep that job out of surface roles and bindings.

## Find the work

```bash
pnpm check:agent-disclosure
```

The guard scans UI surfaces that run mandates. It also fails loudly if the
forbidden `PageAgents` import or JSX pattern returns anywhere. Execution
machinery is excluded because it runs on behalf of a surface.

Before changing anything, inventory the surface's existing buttons, assists,
automatic actions, tabs, and modes. For every candidate, prove which fixed
mandate it already runs. Never infer a job from an agent-looking icon or from
the existence of an agent picker.

## Register a static fixed job

In the surface manifest:

```ts
agentRoles: [
  {
    name: "topic_assigner",
    label: "Topic assigner",
    description: "Places this surface's keywords onto the Offering tree.",
    kind: "single",
    defaultAgentId: null,
    mandateKey: "seo.topic_assigner",
    autoRun: "never",
    sortOrder: 100,
  },
],
```

- Use a mandate key, never a raw agent UUID.
- `does`/description says what the job does here in plain product language.
- `mandateKey` and a non-null `defaultAgentId` are mutually exclusive.
- Do not add a role when the surface merely lets the user choose an agent.

## Register a runtime-selected fixed job

Use this only when live state determines which already-existing fixed job the
surface runs:

```tsx
useDeclaredSurfaceMandates(
  engine.agents.map((agent) => ({
    mandateKey: agent.mandateKey,
    does: agent.does,
    surfaceName,
  })),
);
```

`useDeclaredSurfaceMandates` populates the top Agents menu and renders nothing.
Mount it in the existing action-bearing component. Do not add a wrapper or a
visible sibling. Do not use it for arbitrary picker choices.

## Open the mandate in place

```tsx
const openMandate = useOpenMandateWindow();
openMandate({
  initialMandateKey,
  mandateKeys,
  surfaceName,
  initialView: "yours",
});
```

The existing menu row is the door. A link from a working surface to
`/agents/mandates` or `/administration/agents/mandates` is a regression.

## Decision table

| Situation | Verdict |
| --- | --- |
| Existing button/assist/automatic action runs one fixed mandate | Register that job in the top menu only. |
| Page chooses, builds, runs, tests, reviews, or compares agents | Excluded and unbound; the agent is the subject. |
| Page lets the user choose or chat with any agent | Exempt universal host; no bound roster or Bind control. |
| Runtime mode selects one of several fixed jobs | Register the live fixed job without rendering UI. |
| Service/thunk/tool handler runs a mandate | Register on the calling surface, not in machinery. |
| No AI job exists yet | Do nothing; disclosure cannot invent one. |
| Agent uses a raw UUID with no mandate | Fix hardcoded-agent architecture first; do not invent a key. |

## Verify live

1. Capture the surface before and after. The page body's visible content,
   spacing, controls, and layout are unchanged by disclosure.
2. For a fixed job, open the existing top Agents menu and confirm the job
   appears exactly once. Open it and confirm the mandate window appears over
   the page.
3. For a universal host, confirm the menu contains no default/public/bound
   roster and no Bind control for that surface.
4. Confirm no `PageAgents` import, JSX, agent chip, or disclosure-only page
   content exists.
5. Run `pnpm check:agent-disclosure`, focused tests, and `pnpm type-check`.

## Sweep discipline

- One feature area per commit; stage only owned files in the shared checkout.
- Never add visible UI to reduce the guard count.
- Never register an agent the surface does not already run.
- Never add an exemption merely because a finding is inconvenient.
- Update the feature's `FEATURE.md` change log in the same commit.

## Where this runs from

- Standalone: `/agent-disclosure` or an undisclosed-surface sweep.
- Live UI work: `live-ui-iteration` routes here when the surface already has a
  fixed AI job.
- Certification: `surface-check` S5.
- Codex and Claude share this exact skill because `.agents/skills` points to
  `.claude/skills`; `agents/openai.yaml` supplies the Codex interface.
