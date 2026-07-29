# build-lab — local build experiments, no Vercel required

Born 2026-07-28, the day five plausible "build optimizations" (Tests A-E,
v0.4.217-221) all made the build SLOWER while one provider dedup saved ~3min —
because everyone was guessing at an unmeasured quantity. This lab replaces the
guessing.

**The law:** build cost ≈ Σ (module's transitive size × entry contexts that
compile it). The only winning move is reducing the multiplicity of heavy
subgraphs. "Static" vs "dynamic" is mechanism, not goal — each helps or hurts
depending on that product. See the `code-splitting` skill (rule 6 + caveat).

## Tools

- `pnpm lab:graph` — deterministic, seconds, no build. Ranks (1) THE COMPILE
  BILL: clusters by size×contexts; (2) DYNAMIC-EDGE RISK: every `import()` by
  importer-reach × target-size (the D115 detonator shape). `--json out.json`
  for cross-ref diffs, `--top N` for more rows. Known-sanctioned HIGH rows:
  the `MarkdownStream → MarkdownStreamImpl` front door (the paved ssr:false
  gate) — deliberate, do not "fix".
- `pnpm lab:run <label> [--ref <ref>] [--profile slim|full] [--keep]` — full
  local production build in an isolated worktree (`~/.cache/matrx-build-lab`),
  measuring exit / compile time / peak RSS / wall, appended to a ledger.
  `pnpm lab:run --results` prints the ledger.

## Protocol (hard-won)

1. Hypothesis first: name the cluster and the multiplicity you expect to cut
   (`lab:graph` before/after — deterministic, zero noise).
2. Ground truth second: `lab:run` the ref. **Peak RSS is the trustworthy
   metric; single-run compile time has ±1.5-2min noise** — never attribute a
   win/loss from one timing.
3. Sequential runs only (parallel builds corrupt timing).
4. Only then release. Production is not the lab.

## History that justifies all of this

- D115 (FOUND_DEFECTS.md): one `await import()` of the content-ir registry
  from ubiquitous toolStateEffects → +14GB RSS, +50% compile, 12 OOM'd builds.
- Tests A-E (2026-07-28): removing/inlining dynamic edges by heuristic — all
  five regressed; combined probe >15min vs 8.8min baseline.
- Provider dedup (v0.4.216): two files each compiling OverlayController+deps →
  one shared file → ~3min saved. The shape every future win takes.
