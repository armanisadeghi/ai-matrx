"use client";

// features/hr/people/profile/tabs/PersonalTab.tsx — SPEC-EMPLOYEES §2.3.2
//
// EVERY FIELD ON THIS TAB GOES THROUGH `<SensitiveFieldList>` / `<SensitiveField>`.
// There is not one `{canSee && …}` in this file, and there cannot be: those
// components take a SOURCE OBJECT and a KEY, never a value, so "render a dash
// where the legal name would be" is not expressible.
//
// THREE FACTS THAT LOOK IDENTICAL IF YOU ARE CARELESS, AND MUST NOT:
//
//   1. THE KEY IS ABSENT      → this viewer has no access. Render NOTHING.
//   2. THE KEY IS PRESENT, EMPTY → they may see it; nobody filled it in.
//      Renders "Not provided".
//   3. `private_state === 'not_collected'` → there is no `hr.employee_private`
//      ROW AT ALL (a contractor who supplied only a W-9). Renders an explicit
//      "Not collected" with an add door — NEVER a grid of blank fields that
//      read as empty values.
//
// SSN IS LAST-4 FOR EVERY VIEWER INCLUDING `hr_owner`. The full value is an
// audited DOOR with a required justification, returned once, never cached —
// never a toggle, never a reveal-on-hover, never in component state.

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { updateHrEmployee } from "@/features/hr/service";

import {
  SensitiveFieldList,
  SensitiveGrid,
  SensitiveSection,
} from "../../../shared/SensitiveField";
import type { HrFieldSpec } from "../../../shared/useVisibleFields";
import { hasAnyVisibleField } from "../../../shared/useVisibleFields";
import type {
  HrEmployeeProfile,
  HrProfilePersonal,
  HrProfilePrivate,
} from "../../../types";
import { formatFullDate } from "../../shared/HrStatusChip";
/**
 * What a person may edit on their own record, in the order they read it.
 *
 * `source` says which half of the payload carries the value — `personal` is the
 * directory-tier block, `confidential` the confidential one — because §1.3 sends them
 * separately and a field absent from its bag is not rendered at all.
 *
 * Deliberately NOT every self-writable column: `photo_file_id` needs an uploader
 * rather than a text box, and `directory_opt_out` is a boolean with its own switch
 * below. A text input over either would be a worse control than none.
 */
import { SsnField } from "../../identity/SsnField";
import { SelfServiceToggle } from "@/features/hr/me/SelfServiceToggle";
import { useSelfUpdate } from "@/features/hr/me/useSelfUpdate";
import { SelfServiceField } from "@/features/hr/me/SelfServiceField";
import { SelfServiceAddressField } from "@/features/hr/me/SelfServiceAddressField";
import { usePendingFieldRequests } from "@/features/hr/me/usePendingFieldRequests";
import { HR_SELF_SERVICE_DEFAULTS } from "@/features/hr/me/selfServicePolicy";
import { MoreSection } from "../MoreSection";
import { PlatformAccessSection } from "../PlatformAccessSection";

// ── Field specs — data, so they can be reordered and reused ─────────────────

const IDENTITY_FIELDS: readonly HrFieldSpec<HrProfilePersonal>[] = [
  { name: "legal_first_name", label: "Legal first name" },
  { name: "legal_middle_name", label: "Legal middle name" },
  { name: "legal_last_name", label: "Legal last name" },
  { name: "legal_name_suffix", label: "Suffix" },
  { name: "preferred_first_name", label: "Preferred first name" },
  { name: "preferred_last_name", label: "Preferred last name" },
  { name: "pronouns", label: "Pronouns" },
];

const CONTACT_FIELDS: readonly HrFieldSpec<HrProfilePersonal>[] = [
  {
    name: "work_email",
    label: "Work email",
    href: (value) => (typeof value === "string" ? `mailto:${value}` : null),
  },
  {
    name: "work_phone",
    label: "Work phone",
    href: (value) => (typeof value === "string" ? `tel:${value}` : null),
  },
];

/*
  🚨 `ssn_last4` IS DELIBERATELY NOT IN THIS LIST. It is the only private field with
  three states rather than two — nothing on file and you may record one, nothing on
  file and you may not, or a number on file with an audited way to see it — and a
  spec-driven row can only render "value or empty label". It gets its own row below,
  inside the same grid, so it still reads as one field among the others.
*/
const SELF_SERVICE_FIELDS: readonly {
  field: string;
  source: "personal" | "confidential";
}[] = [
  { field: "preferred_first_name", source: "personal" },
  { field: "preferred_last_name", source: "personal" },
  { field: "pronouns", source: "personal" },
  { field: "work_phone", source: "personal" },
  { field: "personal_email", source: "confidential" },
  { field: "personal_phone", source: "confidential" },
  // `self_request_approval` — these render the pending state, not an instant save.
  { field: "legal_first_name", source: "personal" },
  { field: "legal_last_name", source: "personal" },
];

const PRIVATE_FIELDS: readonly HrFieldSpec<HrProfilePrivate>[] = [
  {
    name: "home_address_effective_from",
    label: "Home address effective from",
    format: (value) => formatFullDate(String(value)),
    hint: "Downstream jurisdiction stamps key on this date, not on today.",
  },
  {
    name: "work_authorization_expires_on",
    label: "Work authorization expires",
    format: (value) => formatFullDate(String(value)),
  },
];

/** Days until an ISO day, or null when it is not a day. */
function daysUntil(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const target = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function PersonalTab({
  profile,
  onChanged,
  className,
}: {
  profile: HrEmployeeProfile;
  /** Re-read after a self-service write, so the panel shows stored truth. */
  onChanged?: () => void;
  className?: string;
}) {
  const personal = profile.personal;
  const priv = personal.private ?? null;

  /*
    🚨 SELF-SERVICE IS THE SAME PROFILE, NOT A SECOND SURFACE. `/hr/me` renders this
    very component with `viewer === "self"` — there is no separate "my profile"
    implementation, and the moment there were two they would drift.
  */
  const isSelf = profile.viewer === "self";
  const selfUpdate = useSelfUpdate({
    employeeId: profile.header.employee_id,
    onApplied: () => onChanged?.(),
  });
  /*
    🚨 TWO TARGETS, TWO HOOKS — AND SENDING THEM ALL TO ONE WAS A DEFECT.
    `hr.field_policy` is keyed by `(target_token, column_name)`. `personal_email`,
    `personal_phone`, `home_address` and `mailing_address` are seeded under
    `hr_employee_private`, whose row has its OWN id — not the employee's. Every
    confidential field here was being sent with `p_token = 'hr_employee'` and the
    employee id, so `hr_self_update` looked up a policy that does not exist for that
    token, fell to its fail-closed arm, and refused them as UNKNOWN FIELDS: "personal
    email is not a field on your record", about a field printed on the same screen.
    Two of the controls on this panel could never have saved.
  */
  const privateRowId =
    priv && typeof (priv as Record<string, unknown>).id === "string"
      ? ((priv as Record<string, unknown>).id as string)
      : null;
  const selfUpdatePrivate = useSelfUpdate({
    token: "hr_employee_private",
    employeeId: privateRowId,
    onApplied: () => onChanged?.(),
  });
  /** The door a field belongs to, decided by where its policy row lives. */
  const updaterFor = (source: "personal" | "confidential") =>
    source === "confidential" ? selfUpdatePrivate : selfUpdate;
  /*
    §7.2's open requests, keyed by field. `SelfServiceField` renders the REQUESTED
    value for any field that has one — never the stored value as if nothing happened,
    and never the new value as if HR had agreed.
  */
  const pending = usePendingFieldRequests(profile.header.employment_id ?? null);

  const expiryDays = daysUntil(priv?.work_authorization_expires_on);
  const expiringSoon = expiryDays !== null && expiryDays <= 90;

  return (
    <div className={cn("space-y-6 p-3 sm:p-4", className)}>
      {/* A section with no accessible fields renders NO HEADING. */}
      <SensitiveSection
        source={personal}
        names={IDENTITY_FIELDS.map((field) => field.name)}
        title="Name"
      >
        <SensitiveFieldList source={personal} specs={IDENTITY_FIELDS} />
        <FormerNames personal={personal} />
      </SensitiveSection>

      <SensitiveSection
        source={personal}
        names={CONTACT_FIELDS.map((field) => field.name)}
        title="Contact"
      >
        <SensitiveFieldList source={personal} specs={CONTACT_FIELDS} />
      </SensitiveSection>

      {/* ── The Confidential half ─────────────────────────────────────────── */}
      {personal.private_state === "not_collected" ? (
        <NotCollected
          employeeId={profile.header.employee_id}
          canCreate={profile.capabilities.includes("identity.write")}
          onCreated={() => onChanged?.()}
        />
      ) : priv && hasAnyVisibleField(priv, PRIVATE_FIELDS.map((f) => f.name)) ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Personal details
            </h3>
            <span className="text-[0.6875rem] text-muted-foreground">
              Opening this tab is recorded in this person&apos;s access log.
            </span>
          </div>

          {expiringSoon ? (
            <WorkAuthorizationWarning
              days={expiryDays ?? 0}
              expiresOn={String(priv.work_authorization_expires_on)}
            />
          ) : null}

          {/*
            🚨 THE WIRE DECIDES WHETHER THIS ROW EXISTS AT ALL. `"ssn_last4" in priv`
            is the server's own §1.3 verdict — a viewer it did not send the key to
            (a peer) gets no row, no label and no control, because the whole
            `private` block never reached them. `SsnField` then decides which of its
            three states to show, and `SsnRevealDoor` withholds the reveal again for
            anyone without `ssn.reveal`. Three gates, none of them redundant: the
            wire, the field policy, and the reveal capability.
          */}
          <SensitiveGrid>
            {"ssn_last4" in priv ? (
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-medium text-muted-foreground">
                  Social Security number
                </div>
                <SsnField
                  employeeId={profile.header.employee_id}
                  organizationId={profile.organization_id}
                  capabilities={profile.capabilities}
                  viewer={profile.viewer}
                  last4={
                    typeof priv.ssn_last4 === "string" && priv.ssn_last4
                      ? priv.ssn_last4
                      : null
                  }
                />
              </div>
            ) : null}
          </SensitiveGrid>

          <SensitiveFieldList source={priv} specs={PRIVATE_FIELDS} />

          {/*
            HR and managers read the address here; the SUBJECT gets the editable
            one below, in "Yours to change". Rendering both to the same person
            would print the address twice and put the live control under a dead
            copy of itself.
          */}
          {isSelf ? null : <HomeAddress priv={priv} />}
        </section>
      ) : null}

      {/*
        Platform access — the only place an employee can be offered a login.
        It renders itself away entirely for a viewer the server did not send
        `login_user_id` to, so §1.3's absence is decided on the wire, not here.
      */}
      <PlatformAccessSection profile={profile} />

      {/*
        🚨 SELF-SERVICE, AND THE REASON `SelfServiceField` EXISTS AT ALL.

        It shipped complete — with §7.2's pending-request rule, the three render
        states, and `hr_self_update` wired behind it — and was imported ONLY as a
        type, so `/hr/me` was a read-only mirror of a record its owner could not
        touch. This is the same shape that hid `SelfServiceToggle` and confused the
        party card; a grep-guard test now fails the build on a fourth instance.

        Which control each field gets is `HR_SELF_SERVICE_DEFAULTS`, reconciled today
        against the seeded `hr.field_policy` rows. It is a RENDERING HINT and never a
        decision: `hr_self_update` splits the patch itself, applies `self_free`
        immediately, turns `self_request_approval` into one workflow request per
        approver action, and REJECTS anything else NAMING EACH FIELD.
      */}
      {isSelf ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Yours to change
          </h3>
          <SensitiveGrid>
            {SELF_SERVICE_FIELDS.map(({ field, source }) => {
              const bag = source === "confidential" ? priv : personal;
              // §1.3 still decides existence: a key the server did not send is not
              // a field, so it is not rendered — the same gate as every other row.
              if (!bag || !(field in bag)) return null;
              const raw = (bag as Record<string, unknown>)[field];
              const updater = updaterFor(source);
              return (
                <SelfServiceField
                  key={field}
                  field={field}
                  value={typeof raw === "string" ? raw : null}
                  policy={
                    HR_SELF_SERVICE_DEFAULTS[field] ?? "read_only"
                  }
                  pending={pending.byField[field] ?? null}
                  saving={updater.saving}
                  onSave={(name, next) => updater.save(name, next)}
                />
              );
            })}
          </SensitiveGrid>

          {/*
            🚨 THE ADDRESS, WHICH IS THE WHOLE REASON §7.2 EXISTS. It was rendered
            read-only behind a sentence explaining that changing it needs approval —
            with no way to ask. A rule stated and not offered is not a rule, it is a
            dead end: the person is told what would happen if they could act, and then
            cannot act. `SelfServiceAddressField` is the control that sentence implied,
            and the `address_change` flow it opens has been there the whole time.
          */}
          {priv && "home_address" in priv ? (
            <SelfServiceAddressField
              field="home_address"
              label="Home address"
              value={(priv as Record<string, unknown>).home_address}
              pending={pending.byField.home_address ?? null}
              saving={selfUpdatePrivate.saving}
              onSave={(name, next) => selfUpdatePrivate.save(name, next)}
            />
          ) : null}
          {priv && "mailing_address" in priv ? (
            <SelfServiceAddressField
              field="mailing_address"
              label="Mailing address"
              value={(priv as Record<string, unknown>).mailing_address}
              pending={pending.byField.mailing_address ?? null}
              saving={selfUpdatePrivate.saving}
              onSave={(name, next) => selfUpdatePrivate.save(name, next)}
            />
          ) : null}
        </section>
      ) : null}

      {/*
        🚨 THE PRIVACY SWITCH IS THE PERSON'S OWN, AND ONLY THEIRS.
        `hr.field_policy` seeds `hr_employee.directory_opt_out` as `self_free` at the
        platform level, which `hr_self_update` applies immediately — no approval, no
        HR in the loop. That is the point: hiding yourself from a staff directory is
        not a request you should have to make to anybody.

        It is offered on `viewer === "self"` only. HR can SEE the flag (the field is
        on the wire for every viewer) but does not get a control here, because §7's
        self-service model gives this switch to the subject; an HR admin flipping
        somebody's privacy preference from their profile page is not a thing this
        surface should make easy.
      */}
      {isSelf ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Privacy</h3>
          <SelfServiceToggle
            field="directory_opt_out"
            label="Hide me from the directory and org chart"
            /*
              🚨 THIS SENTENCE PROMISES EXACTLY WHAT IS TRUE, AND IT HAS BEEN
              NARROWED AND WIDENED AS THAT CHANGED — twice on the chart, once more
              on the scope. It claimed the org chart before the chart honoured it,
              was cut back to the directory alone when testing showed it did not,
              widened again when `hr_org_chart` shipped its suppression, and now
              also states the LIMIT of the control.

              🚨 IT DOES NOT OVERSTATE THE CHART. She is not REMOVED from it: her
              node stays and her reports stay attached, because a gap in a reporting
              tree tells everyone exactly who is missing and where. What goes is the
              name.

              🚨 AND IT DOES NOT PRETEND TO BE A SEAL. Ruled 2026-08-27:
              `directory_opt_out` is a BROWSING control — the column's own name
              scopes it. Not-findable is the promise: the directory drops the row,
              the chart withholds the name, and no browsing surface publishes the
              id. A profile reached by a legitimately-held id still shows
              directory-tier identity under §4.2's own field rules, because people
              who already work with someone knowing their name is not the exposure
              this toggle governs. Saying "hidden from your colleagues" would be the
              comfortable sentence and a lie — and the person would find out by
              being greeted by name.
            */
            description="You won't turn up in the staff directory, and your name is hidden on the org chart — your position still shows there, because removing it would tell everyone exactly who is missing. This stops people browsing for you; it is not a disguise. Anyone you already work with — your manager, a colleague following a link from their own work — can still open your profile and see your name and role."
            value={personal.directory_opt_out === true}
            saving={selfUpdate.saving}
            onSave={(field, next) => selfUpdate.save(field, next)}
          />
        </section>
      ) : null}

      {/* Custom fields go BELOW the built-ins, never interleaved (§7.4). */}
      <MoreSection custom={personal.custom ?? null} tabLabel="Personal" />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function FormerNames({ personal }: { personal: HrProfilePersonal }) {
  if (!("former_names" in personal)) return null;
  const raw = personal.former_names;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  return (
    <div className="space-y-1 pt-2">
      <div className="text-xs font-medium text-muted-foreground">Former names</div>
      <ul className="space-y-0.5">
        {raw.map((entry, index) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          const name =
            typeof row.name === "string"
              ? row.name
              : [row.first_name, row.last_name].filter(Boolean).join(" ");
          const until = typeof row.until === "string" ? row.until : null;
          const reason = typeof row.reason === "string" ? row.reason : null;
          return (
            <li key={`${name}-${index}`} className="text-sm text-foreground">
              {name || "—"}
              {until ? (
                <span className="text-muted-foreground">
                  {" "}
                  until {formatFullDate(until)}
                </span>
              ) : null}
              {reason ? (
                <span className="text-muted-foreground"> · {reason}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * `home_address` is a jsonb blob, so it cannot ride `HrFieldSpec`'s typed path
 * without inventing a shape. It is rendered here — still key-gated, because the
 * whole block is inside a `"home_address" in priv` test.
 */
function HomeAddress({ priv }: { priv: HrProfilePrivate }) {
  if (!("home_address" in priv)) return null;
  const address = priv.home_address;
  if (!address || typeof address !== "object") {
    return (
      <div className="space-y-0.5">
        <div className="text-xs font-medium text-muted-foreground">Home address</div>
        <span className="text-sm italic text-muted-foreground">Not provided</span>
      </div>
    );
  }

  const parts = address as Record<string, unknown>;
  const lines = [
    parts.line1,
    parts.line2,
    [parts.city, parts.region, parts.postal_code].filter(Boolean).join(", "),
    parts.country,
  ]
    .filter((line): line is string => typeof line === "string" && line.trim() !== "");

  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium text-muted-foreground">Home address</div>
      {lines.length === 0 ? (
        <span className="text-sm italic text-muted-foreground">Not provided</span>
      ) : (
        <address className="text-sm not-italic text-foreground">
          {lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </address>
      )}
      <p className="text-[0.6875rem] text-muted-foreground">
        Changing a home address is a jurisdiction change, so it goes through
        approval for every role — including HR.
      </p>
    </div>
  );
}

/**
 * 🚨 NOT BLANK FIELDS. There is no `hr.employee_private` row for this person at
 * all. A grid of empty inputs would read as "we asked and they left it blank",
 * which is a different and wrong fact.
 *
 * 🚨 AND THE BUTTON NOW DOES THE THING IT NAMES. It used to call
 * `announceComingSoon("hr.people.custom-fields")` — the wrong key AND the wrong
 * idea: it popped a notice about custom fields, a different feature, at somebody
 * who had asked to record a home address. Underneath that was a real gap: no
 * surface anywhere created an `hr.employee_private` row, so a person who lacked
 * one could never acquire personal details, an address, or the self-service
 * controls that hang off them — the whole Confidential half was unreachable for
 * them, permanently and silently.
 *
 * SPEC-UI-IA: the surface that owns confidential fields owns their creation. That
 * is this panel, so creation lives here rather than in a new wizard. The door is
 * the SAME one that edits them (`hr_employee_update` inserts the row when the
 * patch carries `private` and none exists) — no new write path, no new pattern.
 */
function NotCollected({
  employeeId,
  canCreate,
  onCreated,
}: {
  employeeId: string;
  /** `identity.write` — the capability that governs the Confidential half. */
  canCreate: boolean;
  onCreated?: () => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <section className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <h3 className="text-sm font-semibold text-foreground">Personal details</h3>
      <p className="text-sm text-muted-foreground">
        Not collected. Nobody has recorded personal details for this person —
        which is normal for a contractor who supplied only a W-9.
      </p>
      {canCreate ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            // An EMPTY private patch: this starts the record, it does not invent
            // a value. The fields then render as "Not provided", which is true,
            // where before there was no field to provide anything to.
            const result = await updateHrEmployee({
              employeeId,
              patch: { private: {} },
            });
            setCreating(false);
            if (!result.ok) {
              toast.error(
                result.kind === "denied"
                  ? result.detail?.trim() ||
                      "Personal details cannot be started for this person."
                  : result.message,
              );
              return;
            }
            toast.success(
              "Personal details started. The fields are ready to fill in.",
            );
            onCreated?.();
          }}
        >
          {creating ? "Starting…" : "Collect personal details"}
        </Button>
      ) : (
        // §4.2: no dead control. Someone who cannot do it is told who can.
        <p className="text-[0.6875rem] text-muted-foreground">
          HR starts this record — it holds confidential fields.
        </p>
      )}
    </section>
  );
}

/** Inside 90 days → a warning chip with a door to the I-9 register (§2.3.2). */
function WorkAuthorizationWarning({
  days,
  expiresOn,
}: {
  days: number;
  expiresOn: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
      <span className="text-sm text-foreground">
        {days < 0
          ? `Work authorization expired on ${formatFullDate(expiresOn)}.`
          : `Work authorization expires on ${formatFullDate(expiresOn)} — ${days} ${
              days === 1 ? "day" : "days"
            } away.`}
      </span>
      <Link
        href="/hr/documents/i9"
        className="text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary"
      >
        Open the I-9 register
      </Link>
    </div>
  );
}
