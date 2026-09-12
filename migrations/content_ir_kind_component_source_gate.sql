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
-- Idempotent: CREATE OR REPLACE + DROP/CREATE TRIGGER.

create or replace function content_ir.kind_component_source_gate()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
    v_source text := new.component_source;
    v_offender text;
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
    v_offender := (regexp_match(
        v_source,
        '(?:^|[^.[:alnum:]_$])(EventSource|WebSocket|XMLHttpRequest|fetch|importScripts|localStorage|sessionStorage)(?:[^[:alnum:]_$]|$)'
    ))[1];

    -- 2. The evaluator, only where it is CALLED or CONSTRUCTED. The bare word
    --    `Function` is a legal TypeScript type annotation and appears in live
    --    bodies, so the identifier itself is not banned.
    if v_offender is null then
        v_offender := (regexp_match(
            v_source,
            '(?:^|[^.[:alnum:]_$])(Function|eval)[[:space:]]*\('
        ))[1];
    end if;

    -- 3. The same names reached as a PROPERTY — `window.fetch`,
    --    `globalThis.WebSocket`, `document.cookie`, `navigator.sendBeacon` —
    --    which is the obvious way around rule 1.
    if v_offender is null then
        v_offender := (regexp_match(
            v_source,
            '\.[[:space:]]*(EventSource|Function|WebSocket|XMLHttpRequest|cookie|eval|fetch|importScripts|sendBeacon)(?:[^[:alnum:]_$]|$)'
        ))[1];
    end if;

    if v_offender is not null then
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
    'Q82/B-17 backstop: refuses a kind component body that reaches the network, browser storage, or the JavaScript evaluator. Twin rules live in matrx-frontend features/agent-apps/utils/component-source-gate.ts and aidream matrx_ai/tools/implementations/kind_shared.py.';

drop trigger if exists zzz_component_source_gate on content_ir.kind_component;

-- `zzz_` so it runs AFTER the stamping triggers, matching the convention the
-- table's other business-rule triggers already use.
create trigger zzz_component_source_gate
    before insert or update of component_source
    on content_ir.kind_component
    for each row
    execute function content_ir.kind_component_source_gate();
