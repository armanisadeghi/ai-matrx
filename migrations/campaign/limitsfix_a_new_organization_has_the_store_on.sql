-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.assert_store_door(uuid, text) 931e55b772ae9212a20a93c4a769ebf2940e2651f67029e94315baa4d8509cf5
--
-- LIMITS-FIX — A NEW ORGANIZATION HAS THE RECORD STORE ON, AND AN OLD ONE IS TOLD PLAINLY.
--
-- Real-data crew D, 2026-09-21: made three organizations for three real businesses, called
-- `table_declare` → `field_declare` → `record_write` exactly as the product's own tour
-- document says to, and every door refused — with a sentence naming a knob, a campaign
-- checklist and a database role. Nothing in the table-creation flow had said the store was
-- off, and the refusal arrived at the WRITE, several calls after the work had begun.
--
-- MEASURED on the main database 2026-09-21: 588 organizations, 73 carrying a
-- `custom/system_enabled` override, so **515 organizations resolve to the platform default
-- of false** — the store is off for every organization anyone has made without knowing to
-- ask for it, which is every organization the crews made.
--
-- TWO CHANGES, both additive.
--
-- 1. AN ORGANIZATION BORN FROM NOW HAS THE STORE ON. An AFTER INSERT trigger on
--    `iam.organizations` writes that organization's own `custom/system_enabled = true`
--    override. It is stamped per organization rather than flipping the platform default,
--    precisely so THE 515 EXISTING ORGANIZATIONS KEEP THE VALUE THEY HAVE: flipping the
--    default would silently switch the store on underneath every one of them, which is a
--    decision about their data and not a fix for a new organization's first hour. The row
--    is an ordinary override, visible and turn-off-able on the same settings screen as any
--    other — the switch still switches.
--
-- 2. THE REFUSAL SAYS WHAT TO DO. `custom.assert_store_door` now names the organization's
--    situation and where the switch is, instead of the knob key, the checklist and the
--    owning role. The door is exactly as closed as it was; only the sentence changed.
--
-- WHAT THIS DOES NOT DO: it does not turn the store on for any existing organization, it
-- does not move the refusal earlier in the flow (a screen saying so before the first table
-- is lane LIMITS-FIX-UI's), and it changes no check.
--
-- CREATE, not CREATE OR REPLACE: this function is new, and a file that names
-- production is judged by an allow-list in which a REPLACE must declare the body it saw.
create or replace function custom._store_on_for_a_new_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- `on conflict do nothing`: a creation path that already sets the switch deliberately
  -- (a fixture, an import, a tenant restored from elsewhere) keeps its own answer. This
  -- trigger supplies a value where there was none; it never overrides one.
  insert into platform.knob_override
    (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values
    ('custom', 'system_enabled', 'organization', new.id, new.id, 'true'::jsonb,
     'on at birth: an organization made from 2026-09-21 can use the record store the moment it exists (LIMITS-FIX, from real-data crew D)')
  on conflict do nothing;
  return new;
end;
$function$;

-- No DROP first: this trigger does not exist yet, and nothing on production is dropped.
CREATE TRIGGER zz_store_on_for_a_new_organization
  AFTER INSERT ON iam.organizations
  FOR EACH ROW EXECUTE FUNCTION custom._store_on_for_a_new_organization();

CREATE OR REPLACE FUNCTION custom.assert_store_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:d:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The switch is a PRODUCT switch and never the security boundary (§6 fact two's REVOKEs
  -- are). While it resolves false the store belongs to the campaign that owns it, and the
  -- only legitimate writer is the role that owns custom.record.
  if custom.store_is_open(p_organization_id) then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  -- Read the owner from the catalogue, never as a role literal (rule 15), so the door
  -- cannot drift from the table it guards.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  -- ── LIMITS-FIX 2026-09-21: THE SENTENCE NAMES WHAT TO DO, NOT WHAT A LANE KNOWS. ───────
  -- Real-data crew D made three organizations, followed the guide's own steps, and met
  -- this refusal on `custom.record_write` several calls in: it named a knob, a campaign
  -- checklist and a database role, and nothing a person could act on. Worse, it arrived at
  -- the WRITE rather than at the first door touched, so the crew had already built a table
  -- and its fields before being told the store was never on. The switch is unchanged and
  -- the door is exactly as closed; what changes is that the refusal says whose organization
  -- it is about and where the switch lives.
  raise exception 'This organization has not turned the record store on yet, so % is not taking writes.',
    coalesce(nullif(btrim(p_door), ''), 'it')
    using errcode = '42501',
          hint = 'Open Database Settings for this organization and turn the record store on (the custom/system_enabled switch); everything you have already made is kept and starts working. Organizations created from 2026-09-21 have it on the moment they exist - this one was made before that. Until it is on, this store takes writes only from the role that owns custom.record, through every door: it is a closed door, not a quiet one.';
end;
$function$

;
