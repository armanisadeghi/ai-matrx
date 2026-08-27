// features/hr/settings/employer/HrEmployerPanel.tsx
//
// ROUTE 68 — THE EMPLOYER OF RECORD. Identity · establishments · tax registrations ·
// applicability flags.
//
// ── 🚨 THE EIN, AND WHY THERE IS NO MASK ───────────────────────────────────
// SPEC-EMPLOYEES §2.4 asks for the EIN "masked to last-4 with an audited reveal".
// The shipped door cannot do either half: `platform.entity_types` declares
// `client_excluded_columns = {ein}` for `hr_employer_profile`, and `hr._project_row`
// deletes every excluded column before the envelope is built. So the browser never
// receives the EIN, never receives a last-4 of it, and a "reveal" returns the same
// row minus the same column.
//
// A mask over a value we do not hold would be a lie shaped like a security control.
// §1.3 already rules on the alternative: ABSENT, NEVER MASKED — with a worded
// existence statement where the viewer is entitled to know the value exists. That is
// what renders. The moment the server publishes `ein_last4` (or a reveal door), the
// last-4 lights up on its own: the panel renders whichever of `ein_last4` / `ein`
// the envelope actually carries.
//
// ── 🚨 TAX REGISTRATIONS HAVE NO READ DOOR AT ALL ─────────────────────────
// `hr_tax_registration` is a real table with a real entity token, and it is NOT in
// `hr._door_spec` — so `hr_confidential_get`/`_list` raise "not an audited-tier
// token" for it, and the `hr` schema is not in PostgREST. There is no way to read a
// tax registration from a browser today. The section says so rather than rendering
// an empty list that reads as "this employer has none", which is the one lie a
// compliance surface must never tell.
//
// ── THE EDGE, STATED ON THE PAGE ───────────────────────────────────────────
// Changing the legal name does NOT rewrite issued letters, notices or exports —
// those carry their own snapshots taken at the moment they were produced.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Factory,
  Info,
  Landmark,
  Loader2,
  Save,
  ScrollText,
  Scale,
} from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

import { upsertHrStructure } from "../../service";
import { isHrDenied } from "../../types";
import { hrSettingsHref } from "../../routes";
import { useHrContext } from "../../shared/useHrContext";
import { checkEin, einLastFour, formatEinInput } from "../activation/ein";
import { fetchHrEmployerProfile } from "../service";
import { useHrSettingsStructure } from "../hooks/useHrSettingsStructure";
import { HrSettingsShell } from "../HrSettingsShell";
import type {
  HrApplicabilityFlag,
  HrEmployerProfileRead,
  HrEstablishment,
} from "../types";

// ── Applicability derivation ────────────────────────────────────────────────

/**
 * Build each flag's DERIVATION SENTENCE from `applicability_basis` + headcount.
 *
 * A flag with no basis renders "Nobody has established this yet" — never a confident
 * `false`. The difference matters: "we counted and you are under 50" and "nobody has
 * counted" carry completely different obligations, and a UI that renders them
 * identically is how an employer misses an FMLA notice requirement.
 */
function applicabilityFlags(profile: HrEmployerProfileRead): HrApplicabilityFlag[] {
  const basis = (profile.applicability_basis ?? {}) as Record<
    string,
    { as_of?: string; count?: number; declared_by?: string; reason?: string } | undefined
  >;

  const headcountLine =
    profile.headcount_total !== null && profile.headcount_asof_date
      ? `Derived: ${profile.headcount_total} employees as of ${profile.headcount_asof_date}`
      : null;

  const build = (
    key: HrApplicabilityFlag["key"],
    label: string,
    test: string,
    value: boolean | string[] | null,
    derived: string | null,
  ): HrApplicabilityFlag => {
    const entry = basis[key];
    const declaredBy = entry?.declared_by ?? null;
    return {
      key,
      label,
      test,
      value,
      derivation: entry?.as_of && entry?.count !== undefined
        ? `Derived: ${entry.count} employees as of ${entry.as_of}`
        : derived,
      isDeclared: Boolean(declaredBy),
      declaredBy,
      declaredReason: entry?.reason ?? null,
    };
  };

  return [
    build(
      "is_fmla_covered",
      "FMLA covered employer",
      "50 or more employees for 20 or more workweeks in the current or preceding calendar year.",
      profile.is_fmla_covered,
      headcountLine,
    ),
    build(
      "is_aca_ale",
      "ACA applicable large employer",
      "50 or more full-time-equivalent employees in the preceding calendar year.",
      profile.is_aca_ale,
      headcountLine,
    ),
    build(
      "is_eeo1_filer",
      "EEO-1 filer",
      "100 or more employees, or a federal contractor with 50 or more.",
      profile.is_eeo1_filer,
      headcountLine,
    ),
    build(
      "is_federal_contractor",
      "Federal contractor",
      "Holds a covered federal contract or subcontract. This is declared, not counted.",
      profile.is_federal_contractor,
      null,
    ),
    build(
      "everify_required_states",
      "E-Verify required",
      "States that require E-Verify enrolment for some or all employers.",
      profile.everify_required_states ?? [],
      null,
    ),
  ];
}

// ── The panel ───────────────────────────────────────────────────────────────

export function HrEmployerPanel() {
  const { active, orgRef } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  const [profile, setProfile] = useState<HrEmployerProfileRead | null>(null);
  // Derived, never set synchronously in an effect body (react-hooks/set-state-in-effect).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);

  const structure = useHrSettingsStructure(organizationId);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const result = await fetchHrEmployerProfile({ organizationId });
      if (cancelled) return;
      if (result.ok) {
        setProfile(result.data.profile);
        setError(null);
      } else {
        setError(result);
      }
      setLoadedFor(organizationId);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, reload]);

  return (
    <HrSettingsShell
      section="employer"
      title="Employer of record"
      description="The legal entity that employs people here."
      loading={
        (organizationId !== null && loadedFor !== organizationId) || structure.isLoading
      }
      error={error}
      operation="This employer's profile"
      onRetry={() => setReload((n) => n + 1)}
    >
      <div className="space-y-6 p-4 sm:p-6">
        {profile === null ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                No employer profile came back for this organization
              </h2>
              <p className="text-sm text-muted-foreground">
                HR says this employer is set up, but the audited read returned no
                profile row — which usually means the record is not reachable by your
                capabilities rather than that it is missing. Send this screen to
                whoever runs HR here.
              </p>
            </div>
          </div>
        ) : (
          <>
            <IdentitySection
              profile={profile}
              onSaved={() => setReload((n) => n + 1)}
            />
            <ApplicabilitySection
              profile={profile}
              onSaved={() => setReload((n) => n + 1)}
            />
            <EstablishmentsSection
              establishments={structure.structure?.establishments ?? []}
              locationEstablishmentIds={
                new Set(
                  (structure.structure?.locations ?? [])
                    .map((location) => location.establishment_id)
                    .filter((id): id is string => Boolean(id)),
                )
              }
              orgRef={orgRef}
            />
            <TaxRegistrationsSection />
          </>
        )}
      </div>
    </HrSettingsShell>
  );
}

// ── Identity ────────────────────────────────────────────────────────────────

function IdentitySection({
  profile,
  onSaved,
}: {
  profile: HrEmployerProfileRead;
  onSaved: () => void;
}) {
  const [legalName, setLegalName] = useState(profile.legal_name);
  const [dbaName, setDbaName] = useState(profile.dba_name ?? "");
  const [entityForm, setEntityForm] = useState(profile.entity_form ?? "");
  const [formationState, setFormationState] = useState(profile.formation_state ?? "");
  const [ein, setEin] = useState("");
  const [address, setAddress] = useState(() =>
    JSON.stringify(profile.primary_address ?? {}, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  // Whatever the envelope carried, if anything. Today it carries neither.
  const knownLastFour =
    profile.ein_last4 ??
    einLastFour((profile as unknown as { ein?: string | null }).ein ?? null);

  const einCheck = ein.trim() === "" ? null : checkEin(ein);

  const save = async () => {
    if (einCheck && !einCheck.ok) {
      setWhy(einCheck.why);
      return;
    }
    let parsedAddress: unknown;
    try {
      parsedAddress = JSON.parse(address) as unknown;
    } catch {
      setWhy("The primary address is not valid JSON.");
      return;
    }

    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "employer_profile",
      payload: {
        id: profile.id,
        organization_id: profile.organization_id,
        legal_name: legalName.trim(),
        dba_name: dbaName.trim() || null,
        entity_form: entityForm.trim() || null,
        formation_state: formationState.trim() || null,
        primary_address: parsedAddress,
        // Only sent when the admin actually typed a new one. An empty box must never
        // be read as "clear the EIN".
        ...(einCheck?.ok ? { ein: einCheck.value } : {}),
        expected_version: profile.version,
      },
    });
    setBusy(false);

    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    setEin("");
    toast.success("The employer profile is saved.");
    onSaved();
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Identity</h2>
          <p className="text-sm text-muted-foreground">
            One employer profile per organization — this is that one.
          </p>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="legal-name" className="text-sm font-medium">
              Legal name
            </Label>
            <Input
              id="legal-name"
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dba-name" className="text-sm font-medium">
              Doing business as
            </Label>
            <Input
              id="dba-name"
              value={dbaName}
              onChange={(event) => setDbaName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entity-form" className="text-sm font-medium">
              Entity form
            </Label>
            <Input
              id="entity-form"
              value={entityForm}
              onChange={(event) => setEntityForm(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="formation-state" className="text-sm font-medium">
              Formation state
            </Label>
            <Input
              id="formation-state"
              value={formationState}
              onChange={(event) => setFormationState(event.target.value)}
            />
          </div>
        </div>

        {/* 🚨 THE EIN — absent, never masked. See the file header. */}
        <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3">
          <Label htmlFor="ein" className="text-sm font-medium">
            EIN
          </Label>
          {knownLastFour ? (
            <p className="font-mono text-sm text-foreground">••-•••{knownLastFour}</p>
          ) : (
            <p className="text-sm text-foreground">
              This employer&apos;s EIN is on file and is not returned to a browser —
              not in full and not in part. It is used server-side for payroll exports,
              W-2s and new-hire reports. Typing a new one below replaces it.
            </p>
          )}
          <Input
            id="ein"
            value={ein}
            inputMode="numeric"
            placeholder="Type a new EIN to replace it — 12-3456789"
            onChange={(event) => setEin(formatEinInput(event.target.value))}
            aria-invalid={Boolean(einCheck && !einCheck.ok)}
            className="max-w-[16rem]"
          />
          {einCheck && !einCheck.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {einCheck.why}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nine digits, written NN-NNNNNNN. Leave blank to keep the current number.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="primary-address" className="text-sm font-medium">
            Primary address
          </Label>
          <Textarea
            id="primary-address"
            value={address}
            rows={6}
            className="font-mono text-xs"
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>

        {/* The edge, stated on the page */}
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border p-3">
          <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Changing the legal name here does <span className="font-medium">not</span>{" "}
            rewrite letters, notices or exports that have already been issued. Each of
            those carries the name that was true when it was produced, which is what
            makes them evidence.
          </p>
        </div>

        {why ? (
          <p role="alert" className="text-sm text-destructive">
            {why}
          </p>
        ) : null}

        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={busy}
          className="min-h-11 sm:min-h-9"
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save identity
        </Button>
      </div>
    </section>
  );
}

// ── Applicability flags ─────────────────────────────────────────────────────

function ApplicabilitySection({
  profile,
  onSaved,
}: {
  profile: HrEmployerProfileRead;
  onSaved: () => void;
}) {
  const flags = applicabilityFlags(profile);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <Scale className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Which laws apply</h2>
          <p className="text-sm text-muted-foreground">
            Each of these is derived from what the system can count. Where the count is
            wrong or the answer is not countable, an admin declares it — and that
            declaration is recorded with who made it and why.
          </p>
        </div>
      </header>
      <ul className="divide-y divide-border">
        {flags.map((flag) => (
          <ApplicabilityRow
            key={flag.key}
            flag={flag}
            profile={profile}
            onSaved={onSaved}
          />
        ))}
      </ul>
    </section>
  );
}

function ApplicabilityRow({
  flag,
  profile,
  onSaved,
}: {
  flag: HrApplicabilityFlag;
  profile: HrEmployerProfileRead;
  onSaved: () => void;
}) {
  const [declaring, setDeclaring] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const isList = Array.isArray(flag.value);
  const valueText = isList
    ? (flag.value as string[]).length
      ? (flag.value as string[]).join(", ")
      : "None"
    : flag.value === true
      ? "Yes"
      : flag.value === false
        ? "No"
        : "Not established";

  const declare = async (next: boolean) => {
    if (reason.trim().length < 4) {
      setWhy("Say why in a sentence. An undocumented override is an audit finding.");
      return;
    }
    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "employer_profile_applicability",
      payload: {
        id: profile.id,
        organization_id: profile.organization_id,
        flag: flag.key,
        value: next,
        reason: reason.trim(),
        expected_version: profile.version,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this declaration (${result.reason}).`
          : result.message,
      );
      return;
    }
    setDeclaring(false);
    setReason("");
    toast.success(`${flag.label} is now declared for this employer.`);
    onSaved();
  };

  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{flag.label}</p>
          <p className="text-sm text-muted-foreground">{flag.test}</p>
        </div>
        <Badge variant={flag.isDeclared ? "default" : "secondary"} className="shrink-0">
          {valueText}
        </Badge>
      </div>

      {/* 🚨 THE DERIVATION IS ALWAYS RENDERED — never a bare true/false. */}
      <p className="text-sm text-muted-foreground">
        {flag.isDeclared ? (
          <>
            Declared by {flag.declaredBy ?? "an administrator"}
            {flag.declaredReason ? ` — ${flag.declaredReason}` : ""}.
          </>
        ) : flag.derivation ? (
          flag.derivation
        ) : (
          "Nobody has established this yet. That is different from a 'no' — nothing has been counted or declared."
        )}
      </p>

      {isList ? null : declaring ? (
        <div className="space-y-2">
          <Label htmlFor={`declare-${flag.key}`} className="text-sm font-medium">
            Why are you overriding the derived answer?
          </Label>
          <Textarea
            id={`declare-${flag.key}`}
            value={reason}
            rows={2}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Counsel advised us we are covered from 1 January."
          />
          {why ? (
            <p role="alert" className="text-sm text-destructive">
              {why}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => declare(true)}
              className="min-h-11 sm:min-h-9"
            >
              Declare it applies
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => declare(false)}
              className="min-h-11 sm:min-h-9"
            >
              Declare it does not
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setDeclaring(false)}
              className="min-h-11 sm:min-h-9"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDeclaring(true)}
          className="min-h-11 sm:min-h-9"
        >
          Declare this instead
        </Button>
      )}
    </li>
  );
}

// ── Establishments ──────────────────────────────────────────────────────────

function EstablishmentsSection({
  establishments,
  locationEstablishmentIds,
  orgRef,
}: {
  establishments: HrEstablishment[];
  /** Establishment ids a location points at — those cannot be deleted. */
  locationEstablishmentIds: Set<string>;
  orgRef: string | null;
}) {
  const columns: MatrxColumnDef<HrEstablishment>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Establishment",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{row.name}</span>
          {row.is_headquarters ? (
            <span className="block text-xs text-muted-foreground">Headquarters</span>
          ) : null}
        </span>
      ),
    },
    { id: "naics", accessorKey: "naics_code", header: "NAICS", mobileHidden: true },
    {
      id: "eeo1",
      accessorKey: "eeo1_establishment_id",
      header: "EEO-1 id",
      mobileHidden: true,
    },
    {
      id: "osha",
      accessorKey: "osha_establishment_name",
      header: "OSHA name",
      mobileHidden: true,
    },
    {
      id: "employees",
      accessorKey: "annual_average_employees",
      header: "Annual average employees",
      mobileHidden: true,
    },
    {
      id: "referenced",
      accessorFn: (row) =>
        locationEstablishmentIds.has(row.id) ? "In use" : "Not referenced",
      header: "Locations",
      filter: "select",
      cell: (row) =>
        locationEstablishmentIds.has(row.id) ? (
          <Link
            href={hrSettingsHref("structure", { org: orgRef })}
            className="text-sm text-foreground underline-offset-2 hover:underline"
          >
            In use — see locations
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Not referenced</span>
        ),
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <Factory className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Establishments</h2>
          <p className="text-sm text-muted-foreground">
            The physical sites this employer reports on for EEO-1 and OSHA. An
            establishment a location points at cannot be deleted — remove the
            location&apos;s link first.
          </p>
        </div>
      </header>
      <div className="p-4">
        <MatrxDataTable
          data={establishments}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={10}
          urlState={{ id: "hr-establishments" }}
          toolbar={{ search: true, searchPlaceholder: "Search establishments" }}
          emptyState={{
            title: "No establishments yet",
            description:
              "An employer with one site does not need one. Add them when EEO-1 or OSHA reporting asks you to report per site.",
          }}
        />
      </div>
    </section>
  );
}

// ── Tax registrations — the honest gap ──────────────────────────────────────

function TaxRegistrationsSection() {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Tax registrations</h2>
          <p className="text-sm text-muted-foreground">
            One per jurisdiction and kind — the account numbers withholding and
            unemployment filings are made under.
          </p>
        </div>
      </header>
      <div className="flex items-start gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          There is no read path to tax registrations from a browser yet — the record
          type is not registered on the audited-door list, so nothing can fetch one.
          This section is deliberately empty rather than showing a list that would read
          as &quot;this employer has none&quot;, which for a compliance record is the
          worse of the two mistakes. It fills itself in the moment the door is
          registered.
        </p>
      </div>
    </section>
  );
}
