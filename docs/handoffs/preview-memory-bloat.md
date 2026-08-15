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
- Next.js 16.3 memory work: <https://nextjs.org/blog/next-16-3> and
  <https://nextjs.org/blog/next-16-3-turbopack>
- Turbopack cache/tracing reference:
  <https://nextjs.org/docs/app/api-reference/turbopack>
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
  point: `PhysMem 240G used, 15G unused`, with **19 Next-related processes**.
  The focused diagnosis below corrected the original interpretation: those 19
  processes were one managed preview process group, not 19 independent servers.
  Two failure modes were seen and they look identical from the outside: the
  watchdog reaping (writes only to
  `<tmp>/matrx-frontend-preview-501/shared-next-dev.failed`, which nobody reads)
  and the process simply vanishing mid-`○ Compiling …` with no message at all.
  While the cap was 8 GB this reaped the server on **every** marketing route and
  read as a mysterious crash; it cost most of a session to identify. A site route
  is far heavier than `/marketing` itself, so **the site layout's module graph is
  the sharpest available probe** — worth measuring before the broader sweep.

## Focused diagnosis — 2026-08-15

### Verdict

The dominant defect is **native Turbopack compiler and persistent-cache
retention in the installed Next.js 16.2.9 development server**. Route coverage,
requests, HMR, and cache persistence feed the retained compiler state; they are
not a 100+ GB JavaScript application-heap leak. A marketing site route is a
sharp trigger because it adds a large route surface to the shared compiler, but
its static layout closure is not the prior D115-style boundary explosion.

| Candidate | Result | Discriminating evidence |
|---|---|---|
| Legitimate one-time compile cost | Ruled out | A traced 16.2.9 session grew from 15.95 to 91.88 GiB RSS in 26 requests. Later fresh server processes could begin at 70–88 GiB from the persistent cache, and `.next-preview` was observed at 117 GB. |
| Unbounded request/HMR leak | Confirmed in the 16.2.9 compiler/cache, not the app heap | The trace reached 122.32 GiB RSS while V8 heap was only 0.365 GiB. Clean 16.3.1 repeated-request and HMR probes retained far less memory and partially evicted it during idle. A longer ordinary-machine run is still an acceptance gate before calling it bounded. |
| Many concurrent servers paying full cost | Ruled out for the measured incident | `ps`, PGID ownership, and the managed-server state showed one launcher, one `next-server`, and its Turbopack transform workers. The 19 processes were one owned group. Historical trace starts also span time; they are not simultaneous servers. |
| Known build-graph fragmentation class | Disfavored as the primary cause | The marketing site layout closes over 174 first-party modules and one of 1,611 entries; it does not show the prior ~190-extra-boundary shape. More decisively, the same application graph on Next 16.3.1 reduced retained compiler footprint by ~90% without an application refactor. Existing graph defects remain a separate optimization campaign. |

### Measurements

The live 16.2.9 server's `next-server` process had a 34.0 GiB physical footprint.
`vmmap` attributed 31.1 GiB resident / 29.9 GiB dirty to `IOAccelerator`, while
JavaScript malloc was about 0.5 GiB. The persisted Next trace contains 3,748
memory samples across 7,919 requests and 748 HMR events. Its highest sample was
122.32 GiB RSS with only 0.365 GiB V8 heap; several short sessions reached
80–106 GiB without HMR. This places the large allocation below the application
heap, in compiler-managed native/cache state.

The focused graph probe found these first-party static closures:

- `/marketing/page.tsx`: 37 modules
- `/marketing/layout.tsx`: 38 modules
- marketing site layout: 174 modules
- marketing site root page: 241 modules
- shared `(core)/layout.tsx`: 526 modules

The graph has 11,054 modules, 1,611 entries, 41,792 static edges, and 886 dynamic
edges overall. That inventory may justify later graph work, but the build lab's
own doctrine says static closure size does not predict Turbopack memory. There
is no measured marketing-layout boundary explosion to refactor now.

A clean, committed-source A/B used one managed server at a time, the same core
profile, cache location semantics, environment, and route sequence (`/`,
`/marketing`, a marketing site route, `/chat/new`, `/administration`):

| End of route sequence | Next 16.2.9 | Next 16.3.1 default `auto` eviction | Change |
|---|---:|---:|---:|
| Owned process-group summed RSS | 26.32 GiB | 19.35 GiB | -26% |
| `next-server` retained physical footprint | 15.1 GiB | 1.5 GiB | -90% |
| `next-server` peak physical footprint | 18.4 GiB | 8.0 GiB | -57% |
| `.next-preview` disk | 13.66 GB | 3.68 GB | -73% |
| Cold `/marketing` response | 30.23 s | 12.72 s | -58% |
| Cold marketing site response | 13.76 s | 10.34 s | -25% |

Next 16.3.1 is important because it introduces dev compiler-memory eviction;
the installed 16.2.9 package does not expose that setting. Under 16.3.1, 400
repeated warm requests and ten file-edit/HMR cycles moved the server footprint
from roughly 1.5 GiB through a 7.3 GiB high point, then it fell to 4.5 GiB after
idle. Disk remained 3.68 GB. This is not the old monotonic 90–140 GB shape, but
it is not yet an ordinary-machine endurance proof.

Two measurement cautions now belong in the permanent benchmark:

1. The harness sums per-process RSS. Shared mappings can make that number much
   larger than macOS physical footprint, especially for transform workers. It
   remains useful as a conservative alarm, but status must identify both the
   server and worker contribution and report physical footprint where available.
2. A trial of `turbopackMemoryEviction: "full"` was contaminated when the lab
   process disappeared while another session restarted the shared preview. It
   proves nothing. Do not prefer `full` over the 16.3 default `auto` without a
   clean A/B.

The local container daemon was unavailable, so no claim is being made that this
is fixed on a 32 GB machine. That test remains mandatory.

## Proposed fix plan — awaiting Arman's approval

The simple first move is a toolchain correction, not an application refactor:

1. Upgrade the pinned lockfile from Next 16.2.9 to the current stable 16.3 line
   in one isolated change. Resolve the already-observed compatibility cost:
   16.3.1 rejects the current aliased
   `typescript: npm:@typescript/typescript6@^6.0.2`; the clean lab worked with
   real `typescript@6.0.3`. Run the full repository gates before proceeding.
2. Keep Next 16.3's default `turbopackMemoryEviction: "auto"` for the first
   benchmark. Rotate the old 16.2 `.next-preview` cache once, loudly and
   recoverably, so a poisoned persistent cache cannot contaminate the result.
   Do not add routine cache deletion; cold recompilation is a real cost.
3. Add one generic benchmark that records exact process-group ownership,
   per-process RSS, macOS physical footprint/peak where available, trace heap,
   cache disk size, response time, and phase. It must cover clean and warm
   starts, the representative route sequence, repeated warm requests, ten HMR
   cycles, a 60-second idle period, stop, and restart.
4. Run that benchmark on an actual 32 GB development machine or a container/VM
   with a hard 32 GB memory limit. Agree the permanent budget from that result;
   require stable repeated-route behavior and meaningful host headroom. A run
   on this 256 GB host does not pass acceptance.
5. A/B `turbopackPluginRuntimeStrategy: "workerThreads"` only after the default
   16.3 baseline. The 16.3 child-process pool still accounts for most summed
   group RSS, and the 16.3 source describes worker threads as the lower-memory
   strategy, but it must win the full behavior and memory benchmark before
   adoption.
6. Only if 16.3 plus the best proven worker strategy misses the 32 GB budget,
   use Turbopack trace evidence to identify pathological application edges and
   propose a targeted consolidation. Do not begin a broad marketing or shared
   layout refactor from the current static graph.
7. After the compiler behavior is inside budget, update `preview:status` to
   distinguish one server from its workers and expose the live cap, RSS,
   physical footprint where supported, and cache size. Then derive a hard
   runaway cap from the supported-machine benchmark. Lowering or raising the
   cap before the root fix is only changing how the failure presents.
8. Reconcile copied cap/machine statements and rerun the bounded Coming-soon
   interaction proof only after the ordinary-machine benchmark passes.

Expected effect from the clean A/B is approximately 57–90% less compiler
physical memory, 73% less preview-cache disk, and faster cold marketing
compiles. The principal cost is the Next/TypeScript upgrade and regression
gate, followed by the benchmark and one real 32 GB certification run. The plan
deliberately avoids a speculative application refactor.

## Remaining work after approval

1. Obtain approval for the eight-step plan above; do not refactor the application
   graph during the diagnosis handoff.
2. Upgrade Next/TypeScript, run gates, and repeat the clean same-host A/B with a
   saved trace.
3. Build the generic benchmark, then certify it on a hard-limited 32 GB machine.
4. Test the worker-thread strategy and full eviction only as separate A/Bs.
5. Make the status/watchdog/docs changes that the winning benchmark supports.
6. Rerun Coming-soon certification and record the final supported-machine
   budget and regression threshold here.

## Acceptance

- A clean preview starts and serves representative Marketing, Chat, and
  Administration routes on the agreed ordinary-machine profile.
- Repeating the route sequence does not grow memory without a stable bound.
- `preview:status` identifies the dominant processes and current cap.
- Stop removes the entire owned process group and leaves no retained server.
- The benchmark and docs make a future regression loud.
