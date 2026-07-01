# AI Matrx — TypeScript Code Standards

**Status:** Active. Applies to Matrx Admin, Matrx Local (frontend), Matrx Code, Matrx Chrome, Matrx Mobile, and Matrx Ship-generated apps.

---

## 0. Migration Posture (Read First)

The codebase predates these standards. Pre-existing violations are intentional, not invitations.

- **New files:** fully conform.
- **Touched code:** the diff conforms. Surrounding code may remain.
- **Untouched code:** leave alone.

Non-conforming code is **not** evidence the rules are optional. Agents that mirror the surrounding style instead of conforming are producing broken work. When you cannot conform, write `// MATRX-EXCEPTION: <reason>` inline. Reviewed periodically. "Annoying" is not a reason.

---

## 1. Principles

1. **TypeScript types are erased at runtime.** Validate at every trust boundary.
2. **One source of truth per contract.** Derive types via `z.infer`. Never hand-mirror.
3. **The compiler and linter are the gate.** Suppression without a fix is a violation.
4. **Escape hatches require justification.** `any`, `as`, `!`, `@ts-expect-error` all need a comment.
5. **Fail loud at the boundary.** No `?? {}`, no `|| []` to paper over bad data.

---

## 2. tsconfig Floor

Every project extends a base with at minimum:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "allowUnreachableCode": false,
    "useUnknownInCatchVariables": true
  }
}
```

Projects may add strictness. They may not remove.

---

## 3. Banned Constructs

Enforced as ESLint errors:

- `any` — `@typescript-eslint/no-explicit-any`
- `as Foo` casts — `@typescript-eslint/consistent-type-assertions` (except `as const` and Zod brand application)
- `as unknown as T` — banned, with **one** exception: the compile-time DB shape-guarded Supabase RPC-row cast (`DbRpcRow` + `satisfies` guard — see the `type-safety` skill's `supabase-patterns.md`). The guard proves the structural row shape; Json fields inside stay `JsonObject`/`unknown` and become typed only through validation, never through the cast. Any other use is cheating; growth is gated by `pnpm check:hatches`.
- `value!` non-null assertions — `@typescript-eslint/no-non-null-assertion`
- `@ts-ignore` — `@typescript-eslint/ban-ts-comment` (use `@ts-expect-error` with description if needed)
- `Function`, `Object`, `{}` types — meaningless, use proper signatures
- Unsafe `any` propagation — `@typescript-eslint/no-unsafe-*` family on error
- `Array<T>` mixed with `T[]` — pick one per project, lint it

Narrow `unknown` via parsing or type guards, not casts.

---

## 4. Runtime Validation

**Mandatory parse points:**

- API responses (`fetch`, RTK Query, server actions, tRPC, third-party SDKs)
- API inputs server-side (route handlers, Server Actions, middleware)
- Form submissions (via `@hookform/resolvers/zod`)
- URL params, search params, route params
- `localStorage` / `sessionStorage` / `IndexedDB` reads — including your own writes
- `postMessage`, WebSocket, SSE, EventSource frames
- `process.env` — parsed once at boot into a frozen typed config
- Anything from a Chrome/VS Code extension messaging API

**Library:** Zod by default. Valibot acceptable for Matrx Mobile and Matrx Chrome (bundle-size sensitive); document the choice at the schema file head.

---

## 5. Schemas Are the Source of Truth

Contract types are derived via `z.infer`, never hand-written alongside a schema.

For the Python boundary: Pydantic models in AI Dream are upstream. Pipeline is **Pydantic → OpenAPI → generated Zod → `z.infer` types**. Generated files live in `src/generated/` and are not hand-edited. Regen is part of the build and freshness is CI-checked.

Hand-mirroring a backend type into a TypeScript `interface` is a violation.

---

## 6. Branded IDs

Every domain ID is a branded type via `.brand<"Name">()`. Functions taking IDs take the branded type, not raw `string`. Cross-entity ID confusion (passing a `WorkspaceId` where a `UserId` is expected) is a compile error, not a runtime bug.

---

## 7. Discriminated Unions

Variant shapes use a `type` discriminator with `z.discriminatedUnion`. Consumers use exhaustive `switch` over the discriminator with `never`-typed default for exhaustiveness checking. Optional-field-soup variants are a violation.

---

## 8. Standard Toolkit

- **`@total-typescript/ts-reset`** imported at every entry point. Non-negotiable.
- **`zod`** (or `valibot` where justified).
- **`@hookform/resolvers/zod`** for forms.
- **`typescript-eslint`** strict configs, not the legacy plugins.
- **`prettier`** for formatting. No bikeshedding.

---

## 9. React / Next.js

- **Server Components are the default.** `'use client'` requires a reason — never to "make it work."
- **Props from API data are schema-derived types.** Inline `interface Props` only for purely presentational components.
- **Server Action inputs are Zod-parsed.** `'use server'` boundaries are untrusted.
- **Event handlers and refs are properly typed.** `React.MouseEvent<HTMLButtonElement>`, `useRef<HTMLInputElement>(null)`. No `any`.
- **No `dangerouslySetInnerHTML`** without a sanitization comment and a trust source.
- **Suspense boundaries are intentional.** Streaming and loading UI are design decisions, not afterthoughts.
- **No `useEffect` for derived state.** If it's computable from props/state, compute it.

---

## 10. State Management (Redux Toolkit)

- **Normalized entity slices** via `createEntityAdapter` for collections.
- **RTK Query responses are Zod-parsed in `transformResponse`.** Server contract drift surfaces at the boundary, not in a component.
- **Selectors are memoized** (`createSelector`) when they derive shapes.
- **No untyped `extraReducers`.** Use `builder.addCase` with the action creator.

---

## 11. The Constitution (React side)

- **Every incoming frame is parsed** before dispatch into Redux or component state.
- **`schema_version` is checked.** Unknown versions are dropped with a logged error, not silently coerced.
- **Frame handlers are exhaustive switches** over the discriminator. Adding a frame type without updating consumers is a compile error.
- **No pass-through `unknown` payloads** into the render tree. Parse or drop.

---

## 12. Errors and Async

- **`Promise` returns are awaited or explicitly returned.** Lint `@typescript-eslint/no-floating-promises` on error.
- **`catch` clauses receive `unknown`** (via `useUnknownInCatchVariables`). Narrow before use.
- **Error boundaries are typed.** No generic catch-all components that swallow.
- **`Result<T, E>` patterns are encouraged** (`neverthrow` or hand-rolled) for fallible domain operations. Exceptions are for the unexpected.

---

## 13. Enforcement

CI gate on every PR: `tsc --noEmit`, `eslint --max-warnings 0`, `prettier --check`, generated-schema freshness, tests. No override flag. Wrong rules get changed via PR, not bypassed.

Pre-commit via `husky` + `lint-staged` runs the fast subset locally. CI is the source of truth.

---

## 14. Agent Directives

You are operating in a partially-migrated codebase. The standards above apply to your output regardless of surrounding code.

**Fixing type errors? Invoke the `type-safety` skill first** (`.claude/skills/type-safety/SKILL.md`) — the canonical fix doctrine: a type error at a data boundary means the code or data is wrong; the fix changes code and data, never annotations. Silencing an error is the opposite of fixing it — escalate what you cannot fix.

- **Do not reach for `as`, `!`, or `any` to silence the compiler.** Each is a sign you have not modeled the type. Read the upstream schema. If it's wrong, fix it upstream.
- **Do not `@ts-expect-error` without a description.** Bare suppressions are violations.
- **Do not hand-mirror a Pydantic model into a TypeScript interface.** Generate it. If generation isn't wired up, wiring it up is the task.
- **Do not skip the boundary parse to "just get the data flowing."** The parse is the point.
- **Do not coerce with `?? {}` or `|| []` to hide a bad response.** Throw at the boundary. The caller decides recovery.
- **Do not add `'use client'` to fix a Server Component error.** Understand the error.
- **When TypeScript types look right but runtime breaks, the parse layer is missing.** Add it.
- **Exceptions go in `MATRX-EXCEPTION` comments.** Silent violations are the failure mode this document exists to prevent.

---

**Version:** 1.0 · **Owner:** Arman / Matrx core
