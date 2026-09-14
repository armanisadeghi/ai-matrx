-- masterwork_rule_draft — THE VALUE CONTRACT for the Rulebook surface's
-- `rule_draft` write target (residue 2 of
-- aidream/docs/handoffs/delegated-surface-tools-2026-09-12.md, wall W49).
--
-- WHY. `rule_draft` is a structured (object) write target with no registered
-- kind, so the only validator between an agent's value and the Expert's
-- Add/Edit Rule dialog was the page handler's own throw, and the only thing
-- telling the model what to send was prose. `pnpm check:surface-drift` counts
-- exactly that gap (the VALUE-CONTRACT RATCHET) and this row closes one of
-- them. The One-Type Law forbids an inline JSON Schema on a target: a target
-- NAMES a registered kind, so the kind has to exist first.
--
-- THE SHAPE IS DERIVED FROM THE VALIDATOR, NOT FROM A NICER IDEA. Every field
-- mirrors what the ONE shared validator
-- (matrx-frontend features/masterwork/agent-context/ruleDraftInput.ts,
-- `requireRuleDraftInput`) actually accepts: `mode` is the only required
-- field, everything else is optional, and the enums are the live
-- RULE_ACTION_KINDS / RULE_POLICY_LEVELS constants. Two of the validator's
-- checks are facts about the OPEN Rulebook rather than about the shape
-- (`rule_id` must name a rule that exists; `section` must be one of that
-- Rulebook's codes) and deliberately stay with the validator.
--
-- The column payloads below are CONVERTER-EMITTED, never hand-written:
--   npx tsx scripts/shape/emit-kind-rows.ts masterwork_rule_draft
-- from the compiled schema in
-- matrx-frontend features/content-ir/kinds/masterwork-rule-draft.ts.
--
-- Rows: kind_definition + the canonical kind_example (structural leg) + a
-- source='db' web output component (render leg). `is_active` is NOT written
-- here — it is flipped only by content_ir.set_kind_activation, which runs the
-- dual gate. Idempotent: re-running updates in place.


insert into content_ir.kind_definition (
    kind, label, authoring_owner, data, emitted_block_schema,
    emitted_json_schema, emitted_fingerprint, organization_id, visibility, metadata
) values (
    'masterwork_rule_draft',
    'Rule Draft',
    'ts',
    $sql$[{"name":"mode","required":true,"description":"REQUIRED. \"new\" proposes a rule that does not exist yet; \"edit\" revises one that does and must carry rule_id.","type":"enum","values":["new","edit"]},{"name":"rule_id","description":"With mode \"edit\": the id of a rule that already exists in the open Rulebook. Ignored in mode \"new\".","type":"string"},{"name":"name","description":"The rule's short name, as it will read in the Rulebook.","type":"string"},{"name":"statement","description":"The rule itself, in one or two sentences.","type":"string"},{"name":"rationale","description":"Why the rule matters.","type":"string"},{"name":"detection","description":"How you would catch someone breaking it.","type":"string"},{"name":"quote","description":"The Expert's own verbatim words this rule came from, when there are any.","type":"string"},{"name":"severity","description":"How bad breaking this rule is.","type":"enum","values":["critical","major","minor"]},{"name":"section","description":"One of the section codes of the Rulebook that is open right now. The page refuses a code it does not have.","type":"string"},{"name":"isPolicy","description":"true for a DECISION rule — expert judgment under uncertainty, which carries precondition, nextAction, actionKind, cost and risk. false (or absent) for an ordinary rule.","type":"boolean"},{"name":"precondition","description":"DECISION rules: what is already known at the moment this rule applies.","type":"string"},{"name":"nextAction","description":"DECISION rules: the ONE next move to make.","type":"string"},{"name":"actionKind","description":"DECISION rules: what kind of move the next action is.","type":"enum","values":["ask","examine","test","image","treat","observe","refer","wait","commit"]},{"name":"cost","description":"DECISION rules: the cost OF THE ACTION, not of the situation.","type":"enum","values":["low","medium","high"]},{"name":"risk","description":"DECISION rules: the risk OF THE ACTION, not of the situation.","type":"enum","values":["low","medium","high"]}]$sql$::jsonb,
    $sql${"type":"object","properties":{"mode":{"type":"string","enum":["new","edit"],"description":"REQUIRED. \"new\" proposes a rule that does not exist yet; \"edit\" revises one that does and must carry rule_id."},"rule_id":{"type":"string","description":"With mode \"edit\": the id of a rule that already exists in the open Rulebook. Ignored in mode \"new\"."},"name":{"type":"string","description":"The rule's short name, as it will read in the Rulebook."},"statement":{"type":"string","description":"The rule itself, in one or two sentences."},"rationale":{"type":"string","description":"Why the rule matters."},"detection":{"type":"string","description":"How you would catch someone breaking it."},"quote":{"type":"string","description":"The Expert's own verbatim words this rule came from, when there are any."},"severity":{"type":"string","enum":["critical","major","minor"],"description":"How bad breaking this rule is."},"section":{"type":"string","description":"One of the section codes of the Rulebook that is open right now. The page refuses a code it does not have."},"isPolicy":{"type":"boolean","description":"true for a DECISION rule — expert judgment under uncertainty, which carries precondition, nextAction, actionKind, cost and risk. false (or absent) for an ordinary rule."},"precondition":{"type":"string","description":"DECISION rules: what is already known at the moment this rule applies."},"nextAction":{"type":"string","description":"DECISION rules: the ONE next move to make."},"actionKind":{"type":"string","enum":["ask","examine","test","image","treat","observe","refer","wait","commit"],"description":"DECISION rules: what kind of move the next action is."},"cost":{"type":"string","enum":["low","medium","high"],"description":"DECISION rules: the cost OF THE ACTION, not of the situation."},"risk":{"type":"string","enum":["low","medium","high"],"description":"DECISION rules: the risk OF THE ACTION, not of the situation."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"masterwork_rule_draft"}},"required":["__kind","mode"],"additionalProperties":false}$sql$::jsonb,
    $sql${"type":"object","properties":{"mode":{"type":"string","enum":["new","edit"],"description":"REQUIRED. \"new\" proposes a rule that does not exist yet; \"edit\" revises one that does and must carry rule_id."},"rule_id":{"type":"string","description":"With mode \"edit\": the id of a rule that already exists in the open Rulebook. Ignored in mode \"new\"."},"name":{"type":"string","description":"The rule's short name, as it will read in the Rulebook."},"statement":{"type":"string","description":"The rule itself, in one or two sentences."},"rationale":{"type":"string","description":"Why the rule matters."},"detection":{"type":"string","description":"How you would catch someone breaking it."},"quote":{"type":"string","description":"The Expert's own verbatim words this rule came from, when there are any."},"severity":{"type":"string","enum":["critical","major","minor"],"description":"How bad breaking this rule is."},"section":{"type":"string","description":"One of the section codes of the Rulebook that is open right now. The page refuses a code it does not have."},"isPolicy":{"type":"boolean","description":"true for a DECISION rule — expert judgment under uncertainty, which carries precondition, nextAction, actionKind, cost and risk. false (or absent) for an ordinary rule."},"precondition":{"type":"string","description":"DECISION rules: what is already known at the moment this rule applies."},"nextAction":{"type":"string","description":"DECISION rules: the ONE next move to make."},"actionKind":{"type":"string","enum":["ask","examine","test","image","treat","observe","refer","wait","commit"],"description":"DECISION rules: what kind of move the next action is."},"cost":{"type":"string","enum":["low","medium","high"],"description":"DECISION rules: the cost OF THE ACTION, not of the situation."},"risk":{"type":"string","enum":["low","medium","high"],"description":"DECISION rules: the risk OF THE ACTION, not of the situation."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"masterwork_rule_draft"}},"required":["__kind","mode"],"additionalProperties":false}$sql$::jsonb,
    $sql$1n1-1ejjacja6ngi5$sql$,
    '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
    'public',
    '{}'::jsonb
)
on conflict (kind) where deleted_at is null do update set
    label = excluded.label,
    authoring_owner = excluded.authoring_owner,
    data = excluded.data,
    emitted_block_schema = excluded.emitted_block_schema,
    emitted_json_schema = excluded.emitted_json_schema,
    emitted_fingerprint = excluded.emitted_fingerprint,
    visibility = excluded.visibility;

-- The structural leg: one canonical example per kind@version. The
-- kind_example_recompute_validation trigger DERIVES validation_status on every
-- write — never write it by hand.
insert into content_ir.kind_example (
    kind_definition_id, kind_version, data, label, description, source,
    is_canonical, organization_id
)
select d.id, d.version,
    $sample${
      "__kind": "masterwork_rule_draft",
      "mode": "new",
      "name": "Stop the intake when the reported onset does not match the record",
      "statement": "When the person's account of when this started disagrees with what the file says, stop the intake and reconcile the two before anything else is decided.",
      "rationale": "Every later judgment is dated from the onset. A wrong start date quietly invalidates the whole chain, and it is cheap to fix at the start and expensive to fix later.",
      "detection": "The intake record shows a decision made after two different onset dates appear in the same file with no note reconciling them.",
      "quote": "If the dates don't line up, I stop right there. Everything after that is built on the date.",
      "severity": "critical",
      "isPolicy": true,
      "precondition": "Two different onset dates are on file and nothing has reconciled them.",
      "nextAction": "Ask the person directly which date is right and write down how the disagreement was resolved.",
      "actionKind": "ask",
      "cost": "low",
      "risk": "low"
    }$sample$::jsonb,
    'Canonical rule draft',
    'A decision rule proposed in "new" mode, carrying every field the shared validator accepts.',
    'authored', true,
    '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
from content_ir.kind_definition d
where d.kind = 'masterwork_rule_draft' and d.deleted_at is null
on conflict (kind_definition_id, kind_version) where is_canonical and deleted_at is null
do update set data = excluded.data,
              label = excluded.label,
              description = excluded.description;

-- The render leg: a source='db' web output card. DB-authored rather than
-- compiled because nothing in matrx-frontend routes a rule draft through
-- block-dispatch — a compiled key nothing reaches is a dangling key, not a
-- component (pnpm check:shapes:components).
insert into content_ir.kind_component (
    kind_definition_id, platform, role, component_key, source, component_source,
    is_default, is_active, sort_order, organization_id, semver, notes
)
select d.id, 'web', 'output', 'masterwork_rule_draft_card', 'db',
    $sql$import React from "react";

/* ---------------------------------------------------------------------------
 * MasterworkRuleDraftCard — output card for the `masterwork_rule_draft` kind.
 *
 * A rule draft is a PROPOSAL, never a saved rule: an agent stages it into the
 * Expert's Add/Edit Rule dialog and the Expert alone decides whether it is
 * ever saved. The card says that out loud in its header rather than dressing a
 * proposal as a rule.
 *
 * Portable floor: React + inline styles only, light/dark safe (currentColor,
 * transparent backgrounds, rgba borders). Streaming-first: every field is
 * optional, so the card renders whatever has landed and never blanks.
 * ------------------------------------------------------------------------ */

const BORDER = "1px solid rgba(128,128,128,.28)";

const SEVERITY_TONES = {
  critical: { fg: "rgb(190,52,52)", ring: "rgba(239,68,68,.5)", bg: "rgba(239,68,68,.12)" },
  major: { fg: "rgb(180,124,8)", ring: "rgba(245,158,11,.5)", bg: "rgba(245,158,11,.14)" },
  minor: { fg: "rgb(16,150,109)", ring: "rgba(16,185,129,.45)", bg: "rgba(16,185,129,.12)" },
};

const LEVEL_LABELS = { low: "Low", medium: "Medium", high: "High" };

const ACTION_KIND_LABELS = {
  ask: "Ask",
  examine: "Examine",
  test: "Test",
  image: "Image",
  treat: "Treat",
  observe: "Observe",
  refer: "Refer",
  wait: "Wait",
  commit: "Commit",
};

function toStr(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch (e) {
    return "";
  }
}

function Chip({ label, value, tone }) {
  const ring = (tone && tone.ring) || "rgba(128,128,128,.4)";
  const bg = (tone && tone.bg) || "rgba(128,128,128,.1)";
  const fg = (tone && tone.fg) || "currentColor";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 5,
        border: "1px solid " + ring,
        background: bg,
        color: fg,
        borderRadius: 999,
        padding: "2px 9px",
        fontSize: 11.5,
        lineHeight: 1.6,
      }}
    >
      <span style={{ opacity: 0.65, fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
        {label}
      </span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: ".07em",
          textTransform: "uppercase",
          opacity: 0.55,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, opacity: 0.92 }}>{children}</div>
    </div>
  );
}

export default function MasterworkRuleDraftCard(props) {
  const data = (props && props.data) || {};

  const mode = toStr(data.mode).toLowerCase();
  const isEdit = mode === "edit";
  const ruleId = toStr(data.rule_id).trim();
  const name = toStr(data.name).trim();
  const statement = toStr(data.statement).trim();
  const rationale = toStr(data.rationale).trim();
  const detection = toStr(data.detection).trim();
  const quote = toStr(data.quote).trim();
  const section = toStr(data.section).trim();
  const severity = toStr(data.severity).toLowerCase();
  const severityTone = SEVERITY_TONES[severity];

  const isPolicy = data.isPolicy === true;
  const precondition = toStr(data.precondition).trim();
  const nextAction = toStr(data.nextAction).trim();
  const actionKind = toStr(data.actionKind).toLowerCase();
  const cost = toStr(data.cost).toLowerCase();
  const risk = toStr(data.risk).toLowerCase();
  const hasDecision = isPolicy || precondition || nextAction || actionKind;

  const heading = isEdit
    ? "Proposed change to a rule you already have"
    : "Proposed new rule";
  const subheading = isEdit
    ? ruleId
      ? "Nothing changes until you review it in the editor and save. Rule " + ruleId + "."
      : "Nothing changes until you review it in the editor and save."
    : "Nothing is saved until you review it in the editor and save it yourself.";

  return (
    <section
      style={{
        border: BORDER,
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            opacity: 0.55,
          }}
        >
          {heading}
        </div>
        <div style={{ fontSize: 16, fontWeight: 650, lineHeight: 1.35 }}>
          {name || (isEdit ? "Untitled revision" : "Untitled rule")}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>{subheading}</div>
      </header>

      {severity || section ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {severity ? (
            <Chip
              label="Severity"
              value={severity.charAt(0).toUpperCase() + severity.slice(1)}
              tone={severityTone}
            />
          ) : null}
          {section ? <Chip label="Section" value={section} /> : null}
        </div>
      ) : null}

      {statement ? <Field label="The rule">{statement}</Field> : null}
      {rationale ? <Field label="Why it matters">{rationale}</Field> : null}
      {detection ? <Field label="How you would catch a violation">{detection}</Field> : null}

      {hasDecision ? (
        <div
          style={{
            border: BORDER,
            borderRadius: 8,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 9,
            background: "rgba(128,128,128,.05)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: ".07em",
              textTransform: "uppercase",
              opacity: 0.55,
            }}
          >
            Decision rule
          </div>
          {precondition ? <Field label="When this is true">{precondition}</Field> : null}
          {nextAction ? <Field label="Do this next">{nextAction}</Field> : null}
          {actionKind || cost || risk ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {actionKind ? (
                <Chip label="Move" value={ACTION_KIND_LABELS[actionKind] || actionKind} />
              ) : null}
              {cost ? <Chip label="Cost of the action" value={LEVEL_LABELS[cost] || cost} /> : null}
              {risk ? <Chip label="Risk of the action" value={LEVEL_LABELS[risk] || risk} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {quote ? (
        <blockquote
          style={{
            margin: 0,
            borderLeft: "3px solid rgba(128,128,128,.4)",
            paddingLeft: 11,
            fontSize: 13.5,
            lineHeight: 1.6,
            opacity: 0.85,
            fontStyle: "italic",
          }}
        >
          {quote}
        </blockquote>
      ) : null}
    </section>
  );
}
$sql$,
    true, true, 100,
    '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
    '1.0.0',
    'Renders a PROPOSED rule as a proposal — the header says nothing is saved until the Expert saves it.'
from content_ir.kind_definition d
where d.kind = 'masterwork_rule_draft' and d.deleted_at is null
on conflict (kind_definition_id, platform, role) where is_default and deleted_at is null
do update set component_key = excluded.component_key,
              source = excluded.source,
              component_source = excluded.component_source,
              is_active = excluded.is_active,
              semver = excluded.semver,
              notes = excluded.notes;

