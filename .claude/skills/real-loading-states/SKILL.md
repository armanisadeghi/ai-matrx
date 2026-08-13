---
name: real-loading-states
description: Detect, triage, repair, and certify bare Loading text for Pattern Patrol P8. Use for `Loading...`/`Loading…` UI, Suspense fallbacks, loading placeholders, or any P8 patrol run.
---

# Real Loading States

Read the Pattern Patrol system, the P8 registry row, repo `CLAUDE.md`, and the
`pattern-patrol` skill first. Their batching, approval, certification, and
release rules remain binding.

## Detect

From the repository root, scan UI source with:

```bash
rg -n -i --glob '*.tsx' --glob '*.jsx' '\bloading\s*(\.\.\.|…)' \
  app components features lib hooks providers utils
```

The word boundary deliberately excludes `Uploading…` and `Downloading…`.
Every match is a candidate until its rendered context is verified.

## Classify every candidate

Choose exactly one route:

1. **Auto-approved Suspense fallback** — meets every gate below; repair it.
2. **Manual approval** — certainly user-visible, safely repairable, and worth
   fixing, but outside the exact auto-approved class; propose the concrete fix
   to Arman in plain English.
3. **Skeleton/design** — replaces page, panel, list, tree, editor, preview, or
   identity content whose final geometry is known; propose a surface-shaped
   skeleton. Never invent one during a patrol without approval.
4. **Compliant/false positive** — an existing component-library loader or
   skeleton, a spinner/pulse with contextual status, ARIA-only text, comment,
   fixture, diagnostic, or non-UI string. Record the reason; do not mutate.

An empty auto-approved set is not completion. Route every certain, safe,
worthwhile repair to Arman and keep unresolved candidates open with the missing
evidence.

## Auto-approved Suspense repair

Repair automatically only when all conditions hold:

- The literal is rendered inside a React `<Suspense fallback={...}>`.
- It is the fallback's only loading indicator; no loader or skeleton exists.
- The surrounding wrapper, dimensions, theme classes, and Suspense boundary
  can remain unchanged.
- The canonical `@/components/loaders/SuspenseLoader` can replace the literal
  without changing data flow, control flow, interaction, imports that define a
  chunk boundary, or desktop/mobile and light/dark behavior.
- A deterministic contextual message is available, such as
  `Loading model providers…`; never retain context-free `Loading…`.
- The target file has no overlapping uncommitted edits.
- The batch contains at most 15 files.

Use the existing primitive:

```tsx
<SuspenseLoader centered={false} message="Loading model providers…" />
```

Preserve the existing fallback wrapper. Static import of this lightweight,
server-compatible primitive is required; do not add a dynamic boundary or
create another loader. If the primitive lacks a generally useful capability,
extend it compatibly rather than wrapping or copying it locally.

## Manual proposal requirements

Propose only findings that are certainly real, have an exact safe solution,
and should be fixed now. State:

- the affected surface and grouped files;
- why the current state is harmful;
- the exact existing primitive or skeleton shape to use;
- what remains unchanged;
- the verification plan.

Approval covers only the named items and transform. Apply nothing else.

## Required false-positive review

Exclude only after verifying the rendered context:

- `aria-label`, `ariaLabel`, `title`, and screen-reader-only descriptions;
- comments, docs, fixtures, parser samples, logs, and copied/exported data;
- contextual operation labels such as uploading, downloading, compiling, or
  processing that are not bare loading text;
- an existing `SuspenseLoader`, `LoadingSpinner`, `Skeleton`, `Loader2`,
  spinner ring, shimmer, or pulse paired with contextual status;
- error and empty-state copy that merely contains the word “loading.”

A spinner plus a contextual message is compliant even when the message begins
with “Loading.” A bare animated text pulse is not a component-library loader.

## Verify and certify

After every approved batch:

1. Re-run the scoped grep and confirm the repaired bare literals are gone.
2. Run `pnpm type-check` and the relevant repository gates.
3. Inspect every changed surface at desktop and mobile widths in light and
   dark. Confirm the fallback remains centered, bounded, readable, and does
   not shift the settled layout.
4. Spawn a second adversarial agent with: **“assume this broke something; find
   it.”** The certifier repeats the grep and gates, reviews false-positive
   classes, and returns `CERTIFIED` or `REJECTED` with evidence.
5. Fix or fully revert a rejected batch. Ship nothing “mostly.”

After a certified auto-approved batch, record the transform and its exact gates
in the P8 report and registry. A later run may auto-approve only that proven
class; every broader loader or skeleton decision still routes manually.
