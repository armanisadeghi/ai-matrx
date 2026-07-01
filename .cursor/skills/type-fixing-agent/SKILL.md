---
name: type-fixing-agent
description: The canonical doctrine and workflow for fixing TypeScript type errors. Generated types (database.types.ts, python-generated/api-types.ts) are the source of truth — code and data must conform to them, never the reverse. Use when fixing type errors, resolving tsc failures, aligning local types with generated types, triaging type-errors files, running a type-fix pass, or whenever tempted to cast/suppress. Silencing an error is the opposite of fixing it.
---

# Type-Fixing Agent

## Source of Truth

Generated types are **always correct**. Code, local types, and stored data conform to them — never the reverse.

| Boundary | Generated source | Regen |
|---|---|---|
| Database (Supabase) | `types/database.types.ts` | `pnpm db-types` |
| Python API (aidream Pydantic → OpenAPI) | `types/python-generated/api-types.ts` — alias via `components["schemas"]["..."]` | `pnpm sync-types` |

Never hand-mirror, re-declare, or widen a generated type. A hand-written "compatible" copy is a violation even if it currently matches — it drifts silently and shields call sites from schema changes. Full standards: [`TYPESCRIPT_STANDARDS.md`](../../../TYPESCRIPT_STANDARDS.md). Duplicate-type doctrine: [`PRINCIPLES.md`](../../../PRINCIPLES.md) §1.

---

## Reality Check — What a Real Fix Actually Involves

A type error at a data boundary is a **signal that the code produces or accepts wrong data shapes**. The error is the diagnostic, not the problem. A real fix changes the code and the data — not the type annotations. Expect a real fix to involve most or all of:

1. **Actual code modifications** — nearly always. If your diff only touches type declarations, casts, or annotations, it is not a fix.
2. **Runtime validation at ingress** — data fetched from the DB or imported from external sources is validated against the generated schema, with explicit errors or warnings when it doesn't conform. `Json` → typed happens through **validation, never assertion**.
3. **A backfill** — if old rows in the DB carry the wrong shape, they get repaired, not papered over at read time.
4. **A codebase-wide audit** — every path that reads, writes, or constructs this data is found and corrected. Fixing one call site while others still produce bad data is not a fix.
5. **Cascading fixes** — expect the first correction to surface additional errors downstream. That is the fix working. Resolve them all so this is fixed ONCE and fixed correctly.

**Silencing the type error is the exact opposite of fixing it.** A cast tells the compiler to stop checking; the malformed data still reaches the DB or Python at runtime, now with zero warning. Data typed with a duplicate wrong type is more dangerous than data not typed at all.

## The Required Sequence — errors go UP before they go down

1. **Expose everything to the truth.** Delete hand-written duplicate types and alias directly from the generated source (`components["schemas"]["..."]` / `Database["schema"]["Tables"][...]`). Errors erupt across the feature — that is the goal: every error is a location where code disagrees with the real contract.
2. **Fix the code, not the errors.** Correct construction sites, add ingress validation, repair converters, backfill bad rows.
3. **Errors resolve themselves.** When the code genuinely conforms, the errors disappear — zero casts, zero suppressions, zero shadow types remaining.

**Definition of done:** the feature compiles against the generated types with no assertions or suppressions in the data path, invalid DB data is caught and surfaced at read time, and no code path can construct a non-conforming value.

Worked example (CustomTool / OpenAPI alias): [`docs/type-drift-openapi-alias-example.md`](../../../docs/type-drift-openapi-alias-example.md).

---

## Forbidden "fixes"

If your solution contains any of these at a data boundary, you have hidden the bug, not fixed it (`TYPESCRIPT_STANDARDS.md` §3; growth gated by `pnpm check:hatches`):

- `as SomeType` / `as unknown as SomeType` / `as NonNullable<...>` / `as any` / `value!`
- `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`
- Widening a generated type (literal union → `string`), `Record<string, any>`, making a field optional/`any` to quiet the error
- Re-declaring a hand-written "compatible" version of a generated schema
- `?? {}` / `|| []` to paper over bad data — throw at the boundary instead

**The ONE sanctioned cast:** `as unknown as T` on a Supabase RPC row **only** when a compile-time `DbRpcRow` shape guard validates `T` against the generated row (see **supabase-type-safety** skill). The guard proves the structural shape; it cannot check Json field interiors — those stay `JsonObject`/`unknown` in the interface and are narrowed by runtime guards or a Zod parse, never given concrete types via the cast.

**The "cast it harder" anti-fix:** when a strictness flag surfaces an error on a line that already has a loose `as X`, the wrong move is escalating to `as unknown as X`. The right move is almost always **deleting the cast** — it was masking a signature the type system satisfies honestly.

---

## Fix patterns (canonical)

- **Duplicate local type** → delete it; import/alias the generated type.
- **Property doesn't exist after schema change** → the DB renamed it; update the code (and audit every other reader/writer).
- **Signature disagrees with DB return** → align the signature; under `strictFunctionTypes`, prefer **widening the implementation's parameter** to the expected signature over narrowing the expected type.
- **`Json`/`unknown` field** → narrow the FIELD, never the row: `isJsonObject` & friends from `@/types/json` for open JSON; Zod parse at ingress for a known concrete shape (`TYPESCRIPT_STANDARDS.md` §4).
- **`X | null` vs `X | undefined`** (Supabase) → `p_arg: v || undefined` for optional RPC args (omits the arg); `?? undefined` per field or widen the domain type to `| null` for row→domain mappers. Never blanket-cast.
- **`possibly null/undefined` on query results** → guard first (`if (error) throw error; if (!data) return …`) so `data` narrows. This is the real-bug class strictNullChecks exists to catch — handle it, don't `!`.

---

## Operating modes

**Deep Fix (default).** You own the whole fix: the Required Sequence above, cross-feature audit, ingress validation, backfill. Stop and ask only for: a DB migration/backfill needing approval, a genuine product-behavior decision, or protected resources (`protected-resources` skill).

**Batch / wave mode** — only when explicitly running assigned per-file task lists (strictness waves, `type-errors/` fan-outs; see [`docs/upgrades/STRICTNESS-WAVE-HANDOFF.md`](../../../docs/upgrades/STRICTNESS-WAVE-HANDOFF.md)):
- Edit only the assigned file; work blind from the error list.
- **Never run `tsc` / `pnpm build` / full type-checks** — parallel agents stall everyone; the orchestrator verifies centrally.
- No forbidden hatches, ever — a batch fix that cheats is worse than no fix.
- An error needing cross-file/logic/data changes → **leave it and report it**; the report feeds a Deep Fix, it is not a license to cast.

## Verification

- Solo sessions: `pnpm type-check` (raw `tsc`, ~60–70s) — but read the active-wave banner in `STRICTNESS-WAVE-HANDOFF.md` first; during an active wave it is red by design.
- `pnpm check:hatches` — the escape-hatch ratchet must not grow; `pnpm check:hatches <path>` lists offenders under a path.
- After DB/API changes: `pnpm sync-types` (regen + type-check), per the `finalize-and-ship` skill.

## Reporting

```
### filename.ts
**Fixed:** [error] → [what changed and why]
**Escalated (needs deep fix / decision):** [error] → [what a real fix requires: code paths, validation, backfill]
```

## Key files

| File | Role |
|------|------|
| `types/database.types.ts` | Supabase-generated types — source of truth |
| `types/python-generated/api-types.ts` | OpenAPI-generated Python API types — source of truth |
| `types/supabase-rpc.ts` | `DbRpcRow<F>`, `JsonToUnknown<T>` |
| `types/json.ts` | `JsonObject`/`JsonValue` + `isJsonObject` guards |
| `TYPESCRIPT_STANDARDS.md` | The constitution — banned constructs, validation points |
| `scripts/check-type-hatches.ts` | Escape-hatch ratchet (`pnpm check:hatches`) |
