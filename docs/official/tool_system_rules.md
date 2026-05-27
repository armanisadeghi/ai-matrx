# Tool System — Rules, Definitions, and Operating Principles

**Status:** Authoritative. This document supersedes any prior conventions.
**Audience:** Anyone writing code that creates tools, calls tools, registers executors, defines surfaces, or designs related features.
**Purpose:** Capture the *meaning* of the system so that the schema's enforcement is matched by everyone's understanding. The DB enforces what it can; this document enforces the rest.

---

## Part 1 — The Mental Model

### The two-input rule

Every routing decision in this system comes from exactly two facts:

1. **Is this executor active for this request?**
2. **Does the executor have a binding to this tool?**

If you ever find yourself reaching for a third input — a priority column, a delegated flag, a client_side boolean, a discriminator field — **you are reintroducing the original mess**. Stop. The answer is either (a) a code-level routing policy, or (b) a new executor, or (c) a surface-defaults rule. Never a third column.

### What the system IS

A capability map. Rows in `tool_def` describe contracts. Rows in `tool_executor` describe who can run things. Rows in `tool_binding` connect the two. Rows in `tool_surface_defaults` shape what shows up per surface. That's the whole system.

### What the system is NOT

- It is not a registry of code locations. Executors own their own internal registries; the DB does not store `function_path` for anyone.
- It is not a runtime health monitor. Whether an executor is *currently reachable* is a runtime concern, not a DB column.
- It is not a permissions system. Permissions are enforced via RLS on data tables and via `gating` checks in code.
- It is not where MCP tools are special. MCP executors are executors; MCP tools are tools. No special path.

---

## Part 2 — The Canonical Definitions

These definitions are normative. If code, comments, or documentation drift from them, the code/comments/documentation is wrong.

### Tool
A named, versioned **contract**. Lives in `tool_def`. Defines what arguments come in, what shape comes out, and what policy applies (`admin_only`, `tier`, `gating`, `dedupe_exempt`, `validation_exempt`). A tool knows nothing about who runs it.

### Executor
An **addressable capability provider**. Lives in `tool_executor`. A process, a package, a browser context, or an MCP server — anything that can dispatch tool calls. Identified by a canonical `name` (PK). Equal citizens — no "server vs client" category exists in the schema.

### Binding
The **M2M relationship** in `tool_binding` asserting that an executor can run a tool. Its presence means capability. Its absence means inability. It has no other meaning.

### Client
The **application or runtime environment** that hosts surfaces (Chrome extension, Next.js web app, etc.). Tracked in `ui_client`, which we don't own — we just consume it. Convention: the root executor's `name` matches the client's `name`. They are not formally linked by FK; the relationship is by convention, not constraint.

### Surface
A **page or panel within a client**. Lives in `ui_surface` (not ours; we consume it). Surfaces have two new columns we added: `executor_name` (FK → `tool_executor`) and `parent_surface_name` (self-FK for inheritance).

### Surface defaults
**Per-surface include/exclude rules and argument defaults.** Lives in `tool_surface_defaults`. One row per surface that has opinions. Surfaces without a row inherit purely from the parent chain.

### Bundle
A **labeled collection of tools**. Lives in `tool_bundle` + `tool_bundle_member`. A syntactic shortcut for inclusion in surface defaults. **NOT** a tool, **NOT** an executor, **NOT** part of routing.

### Gate
A **boolean function** referenced by name in `tool_def.gating`. The function itself lives in code (`matrx_ai.tools.gates.*`). The DB stores only the gate name and arguments to pass.

### Inheritance — executors
An executor can declare a `parent_executor_name`. The child **unions** the parent's bindings with its own. Used for granular sub-executors (e.g., `matrx-user.chat` inheriting from `matrx-user`).

### Inheritance — surfaces
A surface can declare a `parent_surface_name`. Surface defaults walk the chain root → leaf, with each level applying its rules in order. Exclusions accumulate; inclusions accumulate; arg_defaults overlay (child wins on key).

---

## Part 3 — The Hard Rules (Things You Cannot Do)

These rules exist to prevent the system from drifting back into its previous mess. The DB enforces several of them; you must enforce the rest in code review.

### R1. `tool_binding` is a pure join. Do not add columns.

The only allowed columns on `tool_binding` are: `tool_id`, `executor_name`, `is_active`, `created_at`, `updated_at`. **Nothing else, ever.** If you need per-(tool, executor) configuration, it lives in the executor's own code, not in this table.

Violation pattern to watch for: "we just need a small `priority` field" or "let's add a `delegated_to` for routing hints." That's how the old system grew its mess. The answer is always no.

### R2. No `kind` or category discriminators on `tool_executor`.

The row's existence and its `mcp_server_id` column ARE the discriminators. MCP executor? `mcp_server_id IS NOT NULL`. Server executor? Listed in the runtime registry. Client executor? The request's `client_executor_name` walks up to it. We do not need — and will not add — a `kind` enum.

### R3. No `function_path`, `source_app`, or any code-location columns on `tool_def`.

Executors own their internal registries. The DB stores the contract; the executor knows how to dispatch. If executor code and DB disagree on what tools exist, the executor crashes loudly at startup. **Loud failure beats silent confusion.**

### R4. No live executor presence / heartbeat in the DB.

`tool_executor.is_active` means "admin-disabled" or "deprecated." It does NOT mean "currently reachable." Live availability is a runtime registry concern owned by the orchestrator. The DB describes what *can* exist; runtime describes what *does* exist right now.

### R5. No covert use of `metadata` jsonb as a schema.

`metadata` columns exist for genuine one-off extras. If a field is real and structured — meaning you'd write code that reads it — give it a real column. If you find yourself reaching for `metadata->>'foo'` in production code paths, you owe the schema a column.

### R6. Routing policy lives in code, not in DB rows.

When the agent picks a tool to call and multiple applicable executors have bindings, the dispatcher applies a code-level policy. The current policy is **client > MCP > server**. If we change it, we change one place in code. We do not scatter per-binding overrides across hundreds of rows.

### R7. Executor names must match the canonical regex.

`^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$` — enforced by CHECK constraint. Roots are single-segment kebab-case (`matrx-ai-core`, `chrome-extension`). Sub-executors use dot notation (`matrx-user.chat`). MCP executors are `mcp.<server-slug>`. Don't invent other formats.

### R8. The parent chain is depth-limited to 3.

Enforced by trigger. Three levels is enough for any reasonable granularity (e.g., `matrx-user.workspace.chat`). If you find yourself wanting depth 4, you're modeling something else — make it a sibling, not a descendant.

### R9. MCP tools live in `tool_def` like any other tool.

When an MCP server advertises a tool, we create a `tool_def` row with `source_kind='mcp_discovered'` and `managed_by_server_id` set. It gets a `tool_binding` to the `mcp.<slug>` executor. From the rest of the system's perspective, it's just a tool. There is no "MCP tool" code path.

### R10. Tools are referenced by UUID, not by name, in FKs.

Names can change (rare, but it happens). UUIDs don't. `agx_agent.tools` is `uuid[]`. `tool_bundle_member.tool_id` is `uuid`. `cx_tool_call.tool_id` is `uuid` (loose reference). Don't introduce name-based FKs to `tool_def`. The `name` column on `tool_def` is a business key with a unique index, not a stable identifier.

### R11. Naming compatibility is not preserved across the migration.

Old executor kinds (`server:matrx_ai`, `matrx-ai.core`, `matrx-extend.browser`, `client:browser-dom`, etc.) **do not exist** post-migration. Code referencing them by string fails. This is the intended behavior — see R3 about loud failure.

### R12. Don't reference `ui_client` from our tables.

`ui_client` is owned by the UI team. We use the convention that root executor names match client names, but we do not enforce it with FKs. If we did, we'd be coupling our schema to theirs in ways that limit either of us.

### R13. `arg_injection` is reserved. Do not use it yet.

`tool_surface_defaults.arg_injection` is a placeholder column for future dynamic binding from `ui_surface_value`. Until that feature is designed and shipped, the column stays empty `{}` and is ignored by resolvers. Reserving the column name now means we don't have to migrate the table when it does ship.

### R14. Bundle membership: surface defaults reference SYSTEM bundles only.

User-authored bundles (`tool_bundle.is_system = false`) exist for ad-hoc grouping in user UIs. They must never appear in `tool_surface_defaults.always_include_bundles` or `never_include_bundles`. The resolver only expands system bundles. If you need a tool group for a surface, make it a system bundle.

### R15. Gate names that don't resolve must crash the server at startup.

Gate functions live in code. The startup pass in `aidream/startup/tools_check.py` must walk every `tool_def.gating` array, look up each gate name in the Python registry, and **crash if any gate doesn't resolve**. A tool that references a missing gate is a configuration bug, not a runtime warning.

---

## Part 4 — The Soft Rules (Strong Conventions)

These aren't enforced by the schema. They're enforced by code review and judgment.

### S1. New tools get the simplest possible binding.

Most tools get bound to exactly one executor — the one whose code owns them. Don't bind a tool to every executor "just in case." Multiple bindings mean multiple implementations, and the dispatcher's policy decides which one wins. That's a real architectural choice, not a convenience.

### S2. New executors are added by the team that ships the runtime.

If `matrx-mobile` wants its own runtime someday, the matrx-mobile team adds the executor row. Don't preemptively add executors for hypothetical clients. Each executor is a real, deployed runtime — not a placeholder.

### S3. Sub-executors are for genuine specialization, not for organization.

`matrx-user.chat` is a valid sub-executor IF the chat page has actual chat-specific tools that other matrx-user pages can't run. If the only difference is "I want to show different tools here," that's a surface defaults concern, not a new executor.

### S4. Surface defaults should be sparse.

If a surface has no opinions, it has no `tool_surface_defaults` row. The default behavior — "give me every tool my executor can run" — is the right starting point for most surfaces. Don't preemptively create empty rows.

### S5. `always_include_tools` is an override, not a manifest.

Use it when the surface *requires* a tool that wouldn't otherwise be available (e.g., a tool bound only to a different client, but this surface needs to force-include it). Don't use it to list every tool you want on the surface — those come from the executor universe automatically.

### S6. `never_include_tools` is a subtraction, not a configuration default.

Use it to exclude tools that *would* be available but shouldn't appear on this surface (e.g., "the chat surface doesn't expose `web_scrape` because we already have direct browser access"). It accumulates down the parent chain — child surfaces can't undo parent exclusions.

### S7. When in doubt, don't add a column.

Schema changes are forever. Before adding a column to any `tool_*` table, ask: "Can this be derived from existing data? Can this live in `metadata`? Can this be a code-level convention?" If yes to any, do that instead.

### S8. Tool names are stable. Tool UUIDs are immutable.

Once you publish a tool name, treat it as part of your API surface. Renames are possible but require checking every place that references the name as a string (surface defaults arrays, bundle members aren't affected since they use UUIDs, but gate args might reference tool names). The UUID never changes.

### S9. Don't write raw SQL against `tool_*` tables in application code.

Use the matrx-orm managers. The only places raw SQL is acceptable: migrations, RPC bodies, and verification scripts. Application code goes through the manager layer so that schema changes are absorbed in one place.

### S10. Crash loudly, log carefully, recover never.

The system is designed so that misconfiguration produces immediate, obvious failures. Don't wrap startup checks in try/except. Don't fall back to "default" behavior when a referenced executor doesn't exist. The whole point of the simplification was to make failure modes obvious.

---

## Part 5 — How To Do Common Things

### "I want to add a new tool."

1. Decide which executor(s) will run it. Usually exactly one.
2. Call `tool_register(p_def jsonb, p_executor_names text[])` with the tool definition and the executor names.
3. Confirm the binding(s) exist.
4. If the tool needs to appear on a specific surface by default, add it to that surface's `tool_surface_defaults.always_include_tools` — but only if it wouldn't appear automatically from the executor universe.

### "I want a new surface to have a different tool set."

1. Confirm the surface has the right `executor_name` set on `ui_surface`.
2. Insert a row into `tool_surface_defaults` with the include/exclude arrays you need.
3. If your surface has a parent surface, remember exclusions accumulate.

### "I want to add a new client runtime (e.g., a mobile app)."

1. Add a `tool_executor` row with the canonical name (e.g., `matrx-mobile`).
2. Add `tool_binding` rows for every tool the runtime implements.
3. Tell the UI team to add the corresponding `ui_client` row.
4. When `ui_surface` rows are created for the new client, set their `executor_name`.

### "I want to add MCP support for a new provider."

1. Add a `tool_mcp_server` row with the slug, endpoint, auth strategy, etc.
2. The corresponding `tool_executor` row (`mcp.<slug>`) is created automatically on next sync.
3. MCP tools are discovered and registered via `tool_register_mcp_discovered` — you don't add them by hand.

### "A tool exists on two executors and the wrong one is being called."

1. First, confirm both bindings should exist. They probably shouldn't.
2. If they should, the routing policy (client > MCP > server) is making the decision. If you want different policy, change the dispatcher's code — not the DB.
3. If you want to disable one binding temporarily, set its `is_active = false`. Don't delete it; soft-disable preserves history.

### "I want to deprecate a tool."

1. Set `tool_def.is_active = false`.
2. The tool stops appearing in resolution.
3. After a soak period, you can delete it (cascade deletes its bindings).
4. Don't try to "soft-rename" a deprecated tool by changing its name to something funny. The UUID is the identity.

### "I want to look up which surface a tool will appear on."

There is no direct "tool → surfaces" query because surface inclusion is computed at request time from executor inheritance + surface defaults + bundles. If you need a "where is this tool used" admin view, it has to recompute against every surface — that's a real query, not a lookup column.

---

## Part 6 — Anti-Patterns To Flag In Code Review

If you see any of these in a PR, push back:

1. **A new column on `tool_binding`.** R1 violation. The PR needs a different design.
2. **A `if is_client_side` or `if delegated` check in code.** Those concepts no longer exist. The PR is operating on a mental model that's two versions out of date.
3. **A `function_path` string assembled in Python.** R3 violation. The executor knows how to dispatch its own tools.
4. **A "fallback if tool not found" branch in dispatch.** R10 + R15 violation. Loud failure is the design.
5. **A heartbeat / health column added to `tool_executor`.** R4 violation. Runtime liveness belongs in the orchestrator's registry.
6. **A new RPC that takes both a UUID and a name parameter to "support either."** Pick one. `tool_get` accepts a name OR UUID by detecting the format — that's a one-time concession for ergonomics, not a pattern to copy.
7. **A surface defaults row with 50 entries in `always_include_tools`.** S5 violation. You're using it as a manifest, not an override. The right answer is probably a system bundle.
8. **An MCP-specific code path that doesn't go through `tool_executor` + `tool_binding`.** R9 violation. MCP isn't special.
9. **A tool referenced by name in a new FK column.** R10 violation. Use the UUID.
10. **String parsing of executor names to derive properties** (e.g., `if name.startswith("mcp.")`). The properties exist as real columns. `mcp_server_id IS NOT NULL` tells you it's an MCP executor; you don't need to parse the name.

---

## Part 7 — The North Star

When making any decision about this system, ask:

> *Does this preserve the two-input rule? Is the routing decision still "active executor + binding = capability"?*

If yes, the change is probably fine.

If you have to explain a third input, you have to explain why the previous design's mess won't return. That explanation needs to be very, very good.

The old system was rebuilt because five inputs to one decision became unmaintainable. The new system has two. **Keep it that way.**
