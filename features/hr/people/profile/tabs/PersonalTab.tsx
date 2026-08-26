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

import Link from "next/link";
import { AlertTriangle, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { cn } from "@/lib/utils";

import {
  SensitiveFieldList,
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
import { MoreSection } from "../MoreSection";

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

const PRIVATE_FIELDS: readonly HrFieldSpec<HrProfilePrivate>[] = [
  {
    name: "ssn_last4",
    label: "Social Security number",
    hint: "Last four digits. The full number is behind an audited request.",
    format: (value) => (value ? `•••-••-${String(value)}` : null),
    emptyLabel: "Not collected",
  },
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
  className,
}: {
  profile: HrEmployeeProfile;
  className?: string;
}) {
  const personal = profile.personal;
  const priv = personal.private ?? null;

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
        <NotCollected />
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

          <SensitiveFieldList source={priv} specs={PRIVATE_FIELDS} />

          {/* The SSN door. Present only when the last-4 itself is. */}
          {"ssn_last4" in priv ? <SsnRevealDoor /> : null}

          <HomeAddress priv={priv} />
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
 */
function NotCollected() {
  return (
    <section className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <h3 className="text-sm font-semibold text-foreground">Personal details</h3>
      <p className="text-sm text-muted-foreground">
        Not collected. Nobody has recorded personal details for this person —
        which is normal for a contractor who supplied only a W-9.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 sm:min-h-9"
        onClick={() => void announceComingSoon("hr.people.custom-fields")}
      >
        Collect personal details
      </Button>
    </section>
  );
}

/**
 * THE SSN DOOR. A door, not a toggle: it takes a justification, it is audited,
 * the value comes back once and is never cached. The endpoint
 * (`POST /api/hr/identity/{id}/ssn/reveal`) is specified and not built, so the
 * door is a registered promise rather than a control that silently does nothing.
 */
function SsnRevealDoor() {
  return (
    <button
      type="button"
      onClick={() => void announceComingSoon("hr.people.ssn-reveal")}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
      Request the full number
    </button>
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
