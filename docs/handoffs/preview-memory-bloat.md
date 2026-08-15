---
status: active
updated: 2026-08-15
repos: [matrx-frontend]
vision:
  [/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/VISION.md]
---

# Preview memory bloat

## Vision — Arman's words

> "This memory bloat has gotten so bad that on some of my machines that don't
> have hundreds of gigabytes of RAM, you can't even run the servers. Horrible.
> We need to figure out what's going on and fix that. But it needs a focus
> session."

The result must be a preview service ordinary development machines can run. A
higher watchdog cap, a larger machine, or calling 90–140 GB "normal" is not a
fix.

## Resources

- Launcher and monitor: `scripts/agent-dev-server.sh`
- Machine-wide server guard: `scripts/agent-harness/matrx-preview-ports.sh`
- Browser contract and current measurements: `docs/official/browser-testing.md`
- Next configuration and route-profile filtering: `next.config.js`
- Build-graph doctrine: `.claude/skills/code-splitting/SKILL.md`
- Build fragmentation campaign: `docs/handoffs/build-graph-fragmentation-campaign.md`
- Start/status/stop: `pnpm preview:start`, `pnpm preview:status`,
  `pnpm preview:stop`
- Known evidence: Coming-soon certification was terminated around 97.4 GB and
  102.8 GB. Later measurements recorded 90.7 GB after `/marketing` and 138.3 GB
  after adding Chat plus Administration. The harness still contains a stale
  16 GB message while the launcher currently defaults to a 192 GB cap.
- **Independent confirmation, 2026-08-14/15** (marketing navigation session):
  servers reached **73.5 GB, 106.6 GB, and 128.8 GB**, each within 1–3 minutes of
  compiling a `/marketing/brands/[brandId]/sites/[siteId]/*` route. `/marketing`
  alone peaked ~9.7 GB. `.next-preview` reached **117 GB on disk**. At the worst
  point: `PhysMem 240G used, 15G unused`, with **19 `next` processes** alive from
  parallel agent sessions — the per-server figure is not the whole cost.
  Two failure modes were seen and they look identical from the outside: the
  watchdog reaping (writes only to
  `<tmp>/matrx-frontend-preview-501/shared-next-dev.failed`, which nobody reads)
  and the process simply vanishing mid-`○ Compiling …` with no message at all.
  While the cap was 8 GB this reaped the server on **every** marketing route and
  read as a mysterious crash; it cost most of a session to identify. A site route
  is far heavier than `/marketing` itself, so **the site layout's module graph is
  the sharpest available probe** — worth measuring before the broader sweep.

## Remaining work

1. Reproduce from a clean worktree with timestamped process-tree evidence.
   Measure cold start, first route, warm reload, and each additional route.
   Attribute RSS to the root Next process, Turbopack/native workers, child Node
   processes, and any orphaned process groups; do not report only group total.
2. Separate retained build-graph cost from a leak. Repeat a fixed route sequence
   and include idle periods, garbage collection where safely observable,
   recompiles after one-file edits, preview stop, and a second clean start.
3. Find which route groups, imports, chunk boundaries, generated artifacts, or
   caches cause the step changes. Test the active `MATRX_PROFILE` promise
   against the modules actually loaded. Use graph evidence before changing
   dynamic/static import boundaries; invoke `code-splitting` first.
4. Test on a constrained machine or bounded container representative of the
   machines Arman says cannot start the app. A fix proven only on the 256 GB host
   is not proven.
5. Fix the generic architecture responsible for the memory. Preserve the one
   machine-wide managed-server lease, exact-worktree ownership, loud monitor,
   and provider-neutral commands. Do not solve it by raising the cap, hiding the
   measurement, parking required product routes, or weakening certification.
6. Add a repeatable memory benchmark that records phase and process ownership,
   fails loudly on regression, and can compare future Next/Turbopack upgrades.
   Document a realistic supported-machine budget from evidence.
7. Reconcile every copied machine/cap statement in the launcher, harness,
   browser-testing guide, Pattern Patrol docs, and automation prompts so status
   output is the only live cap source.
8. After the service is stable, rerun the bounded Coming-soon interaction proof
   named in `.matrx/patrol-reports/coming-soon-compliance.md`; do not broaden
   that patrol's authority until it completes.

## Acceptance

- A clean preview starts and serves representative Marketing, Chat, and
  Administration routes on the agreed ordinary-machine profile.
- Repeating the route sequence does not grow memory without a stable bound.
- `preview:status` identifies the dominant processes and current cap.
- Stop removes the entire owned process group and leaves no retained server.
- The benchmark and docs make a future regression loud.
