# Supabase Type-Safety Patterns

Reference for the `type-safety` skill. Covers RPC return types, table queries, the `DbRpcRow` utility, and Json field narrowing. Fix doctrine (what counts as a fix vs. hiding the bug): [`SKILL.md`](./SKILL.md).

## The Core Problem

Supabase generates `Json` for JSONB columns. `Json` is a wide recursive union:
```ts
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
```
TypeScript rejects `Json` when your interface expects `LLMParams`, `MyInterface[]`, etc. — even though the data is correct at runtime.

**The rule:** Never use `as unknown` to escape this. Use the patterns below instead.

---

## Pattern 1: RPC calls — use `DbRpcRow<F>`

Located at `@/types/supabase-rpc.ts`. Replaces all `Json` fields with `unknown` so structural checks work.

### Step 1: Define the interface with a DB shape guard

```ts
import type { DbRpcRow } from "@/types/supabase-rpc";
import type { JsonObject } from "@/types/json";

export interface MyRpcResult {
  id: string;
  name: string;
  settings: JsonObject;   // Json field stays open — narrow at use (Pattern 4) or Zod-parse at ingress
  tags: string[];
}

// Compile-time guard — breaks if DB adds/removes a key
type _Check = MyRpcResult extends DbRpcRow<"my_rpc_function"> ? true : false;
declare const _c: _Check;
true satisfies typeof _c;
```

**How the guard works:**
- DB removes a key your interface has → `false` → `true satisfies false` → **TypeScript error**
- DB adds a key your interface doesn't declare → your interface no longer extends the DB row → **TypeScript error**
- Json fields become `unknown` on the DB side → the guard **cannot check their inner shape**. Declaring a concrete type there is an unchecked assertion — declare `JsonObject`/`unknown` and validate instead (Pattern 4, or a Zod parse at ingress for a known shape). `Json` → typed happens through validation, never assertion.

### Step 2: Cast at the call site

```ts
// For RPCs that return typed rows (array-returning functions):
const { data, error } = await supabase.rpc("my_rpc_function", { p_id: id });
if (error) throw error;
const row = (Array.isArray(data) ? data[0] : data) as unknown as MyRpcResult;

// For RPCs that return arrays:
const rows = (data ?? []) as unknown as MyRpcResult[];

// For RPCs that return Json directly (promote_, purge_, accept_, update_from_source patterns):
// These have no DB row schema — cast through unknown is correct and intentional
const result = data as unknown as MyResult;
```

**Why `as unknown as T` instead of `as T`:**
The Supabase-typed response still says `Json` for those fields. TypeScript rejects the single-step cast because the types don't overlap. `as unknown as T` is the correct two-step cast — the DB shape guard above is what makes it safe. This is the **one sanctioned use** of `as unknown as` in the codebase (`TYPESCRIPT_STANDARDS.md` §3); without the guard it is a banned hatch.

### Which RPCs return Json directly vs typed rows?

Check `types/database.types.ts`:
```ts
// Typed rows — Returns: { field: string, other: Json }[]
agx_get_list, agx_get_execution_full, agx_check_drift, etc.

// Json directly — Returns: Json
agx_promote_version, agx_purge_versions, agx_accept_version, agx_update_from_source
```
For Json-direct RPCs: no DB guard possible; cast with `data as unknown as MyResult`.

---

## Pattern 2: Table queries — use `Tables<"table_name">`

```ts
import type { Database } from "@/types/database.types";

type AgentRow = Database["public"]["Tables"]["agx_agent"]["Row"];
type AgentInsert = Database["public"]["Tables"]["agx_agent"]["Insert"];
type AgentUpdate = Database["public"]["Tables"]["agx_agent"]["Update"];

// Query:
const { data, error } = await supabase.from("agx_agent").select("*");
const rows = (data ?? []) as AgentRow[];  // single cast works — no Json in table rows

// Insert:
const insert: AgentInsert = { name: "...", ... };
await supabase.from("agx_agent").insert(insert);
```

For table queries with `.select("id, name, settings")` (partial selects), use:
```ts
type PartialAgent = Pick<AgentRow, "id" | "name"> & { settings: unknown };
```

---

## Pattern 3: `JsonToUnknown` for complex cases

When you need the full DB row type but with Json → unknown for further processing:

```ts
import type { JsonToUnknown } from "@/types/supabase-rpc";
import type { Database } from "@/types/database.types";

type RawRow = Database["public"]["Functions"]["my_func"]["Returns"][number];
type SafeRow = JsonToUnknown<RawRow>;  // Json fields become unknown
```

---

## Pattern 4: "Just an object" JSON fields — narrow the FIELD, never the row

A JSONB column comes back as bare `unknown` (this repo patches `Json` → `unknown`). The lazy reaction is to cast the **whole row** — `row as unknown as MyTypedRow` — re-asserting every already-typed column just to reach the one `unknown` field. That discards real type info and is the #1 source of `as unknown as` cheating.

Instead, give the field an honest name and narrow only it, using `@/types/json`:

```ts
import { type JsonObject, isJsonObject } from "@/types/json";

// Type the ONE open field; leave the rest of the row typed:
interface MyRow { id: string; name: string; config: JsonObject }

// Narrow a bare `unknown` DB field at runtime — no cast, no `any`:
const cfg = isJsonObject(row.config) ? row.config : undefined;
const label = typeof cfg?.label === "string" ? cfg.label : null;
```

`JsonObject` / `JsonArray` / `JsonValue` (+ `isJsonObject` / `isJsonArray` / `isJsonPrimitive` guards) are the canonical "it's just JSON, accept it" types. They are NOT `any` and NOT a whole-row `unknown` nuke. For a **known, concrete** shape, prefer a Zod parse at the boundary (`TYPESCRIPT_STANDARDS.md` §4); these types are for genuinely open JSON.

---

## Pattern 5: Where NOT to add guards

Skip the `satisfies`/`_Check` guard for:
- RPCs that return `Json` directly (no row schema to enforce)
- Table queries (use `Tables<T>["Row"]` directly — already typed)
- Utility/legacy code with `@ts-nocheck` (fix the nocheck first)

---

## Adding a guard to an existing interface

1. Import `DbRpcRow` from `@/types/supabase-rpc`
2. Check the RPC in `database.types.ts` — does it `Returns: {...}[]` or `Returns: Json`?
3. If `Returns: {...}[]`: add the three-line guard block below the interface
4. If `Returns: Json`: no guard possible — document it with a comment
5. Update cast at call site from `as SomeType` to `as unknown as SomeType`

```ts
// Guard block template (3 lines, zero runtime cost):
type _Check_MyInterface = MyInterface extends DbRpcRow<"rpc_name"> ? true : false;
declare const _myInterface: _Check_MyInterface;
true satisfies typeof _myInterface;
```

---

## File locations

| File | Purpose |
|------|---------|
| `types/json.ts` | Canonical `JsonValue`/`JsonObject`/`JsonArray` + `isJsonObject`/`isJsonArray`/`isJsonPrimitive` guards (narrow the field, not the row) |
| `types/supabase-rpc.ts` | `DbRpcRow<F>` and `JsonToUnknown<T>` utilities |
| `types/database.types.ts` | Supabase-generated types (source of truth) |
| `utils/supabase/client.ts` | `supabase` singleton |
| `utils/supabase/server.ts` | `createClient()` for server components |

---

## Quick reference: error → fix

| Error | Fix |
|-------|-----|
| `Type 'Json' is not assignable to type 'X'` | Add DB shape guard; cast with `as unknown as T` |
| `Conversion of type '...' may be a mistake` | Change `as T` to `as unknown as T` |
| `true satisfies false` | Interface has wrong keys — check `database.types.ts` and update interface |
| `Property 'x' does not exist on type DbRpcRow<...>` | DB renamed or dropped the key — update interface to match |
