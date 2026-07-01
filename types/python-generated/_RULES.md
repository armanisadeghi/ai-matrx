## Types: Never Declare What Already Exists

Before writing any `type` or `interface`, search for an existing one
(`types/python-generated/api-types.ts`, `features/**/types/`). Declaring a new
type for data that already has one is a defect, not a shortcut.

**Need the same shape?** Alias it. Never re-declare.
  `type CustomTool = components["schemas"]["CustomTool"];`

**Need a variation?** Derive it. Never re-declare.
  `Omit<T, "id">`, `Pick<T, "name" | "spec">`, `Partial<T>`, `T & { extra: X }`
  Derived types track the source automatically; copies silently rot.

**Need a looser shape for in-transition data?** Model the transition explicitly.
  Name it for what it is (`type CustomToolDraft = Partial<CustomTool>` or a
  discriminated `{ status: "raw"; data: unknown } | { status: "valid"; data: CustomTool }`)
  and convert to the real type through validation at a single boundary.
  Never loosen the canonical type, and never use a hand-written "compatible"
  lookalike as the loose version.

**Litmus test:** if your new type's fields overlap an existing type's fields,
you should be writing `Omit`/`Pick`/`Partial`/`&` against that type — or using
it directly. A structurally similar standalone type is always wrong.

## Reality Check — What a Real Fix Actually Involves

Type errors at the OpenAPI boundary are a **signal that the code produces or accepts
wrong data shapes**. The error is the diagnostic, not the problem. A real fix must
therefore change the code and the data — not the type annotations. Expect a real fix
to involve most or all of the following:

1. **Actual code modifications** — nearly always. If your diff only touches type
   declarations, casts, or annotations, it is not a fix.
2. **Runtime validation at ingress** — data fetched from the DB or imported from
   external sources must be validated against the generated schema, with explicit
   errors or warnings when it doesn't conform. `Json` → typed happens through
   validation, never through assertion.
3. **A backfill** — if old rows in the DB carry the wrong shape, they must be
   repaired, not papered over at read time.
4. **A codebase-wide audit** — every path that reads, writes, or constructs this
   data must be found and corrected. Fixing one call site while others still
   produce bad data is not a fix.
5. **Cascading fixes** — expect the first correction to surface additional errors
   downstream. That is the fix working. Resolve them all so this is fixed ONCE
   and fixed correctly.

**Silencing the type error is the exact opposite of fixing it.** A cast tells the
compiler to stop checking; the malformed data still reaches Python at runtime,
now with zero warning.

### Forbidden "fixes"

If your solution contains any of the following at a data boundary, you have not
fixed anything — you have hidden the bug:

- `as SomeType` / `as unknown as SomeType`
- `as NonNullable<...>`
- `@ts-ignore` / `@ts-expect-error`
- Widening a generated type (e.g., changing a literal union to `string`)
- Re-declaring a hand-written "compatible" version of a generated schema
- Making a field optional or `any` to make the error go away

## Correct Fix — The Required Sequence

The strategy is deliberately counterintuitive: **make the error count go UP before
it goes down.**

1. **Expose everything to the truth.** Delete the hand-written duplicate types and
   alias directly from the generated OpenAPI types
   (`components["schemas"]["..."]`). This will cause type errors to erupt across
   the feature. That is the goal — every error is a location where the code
   disagrees with the wire contract.
2. **Fix the code, not the errors.** Work through each error by correcting the
   code so it no longer produces or accepts the wrong shape: fix construction
   sites, add ingress validation, repair converters, backfill bad rows.
3. **Errors resolve themselves.** When the code genuinely conforms to the
   contract, the errors disappear on their own — with zero casts, zero
   suppressions, zero hand-written shadow types remaining.

**Definition of done:** the feature compiles against the generated types with no
assertions or suppressions anywhere in the data path, invalid DB data is caught
and surfaced at read time, and no code path can construct a non-conforming value.

## Inventory & tracking

- **Tracker (waves + checkboxes):** [`docs/type-drift/TRACKER.md`](../../docs/type-drift/TRACKER.md)
- **Regenerate hitlists:** `pnpm generate:type-drift-hitlists` → `docs/type-drift/generated/`
