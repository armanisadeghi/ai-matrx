// features/hr/settings/employer/HrEmployerPanel.tsx
//
// ROUTE 68 — THE EMPLOYER OF RECORD. Identity · address · which laws apply ·
// establishments · tax registrations. Surface: `matrx-user/hr-employer`.
//
// ── 🚨 THE WRITE DOOR (fixed 2026-09-27) ───────────────────────────────────
// Every save goes through `updateHrEmployerProfile` → `hr_employer_profile_update`.
// Until 2026-09-27 this panel sent `hr_structure_upsert('employer_profile' | …)`, which
// refuses every kind but department/location/job_title — Save and every Declare
// button raised and nothing had ever been saved. The pure rules (address shape,
// declarations, agent-write parsing, the surface scope) live in
// `employer-profile-model.ts`, unit-tested.
//
// ── 🚨 THE EIN, AND WHY THERE IS NO MASK ───────────────────────────────────
// `platform.entity_types` declares `client_excluded_columns = {ein}` for
// `hr_employer_profile`; the browser never receives the EIN, not even a last-4. A mask
// over a value we do not hold would be a lie shaped like a security control (§1.3:
// ABSENT, NEVER MASKED). The panel renders `ein_last4` the moment the server publishes
// it. Typing a new EIN replaces the stored one; an agent can never set it.
//
// ── 🚨 TAX REGISTRATIONS HAVE NO READ DOOR ─────────────────────────────────
// `hr_tax_registration` is not in `hr._door_spec`, so no browser can read one. The
// section says so rather than rendering an empty list that reads as "none".

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Factory, Loader2, Pencil, Plus, RotateCcw, Save } from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Input } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/official/Field";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import type { ContextMenuExtraItem } from "@/features/context-menu-v3/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { SURFACE_LAYER_ATTRIBUTE } from "@/features/surfaces/runtime/window-forms";
import {
  HR_EMPLOYER_SURFACE_NAME,
  createHrEmployerScope,
} from "@/features/surfaces/manifests/hr-employer.manifest";

import { updateHrEmployerProfile, upsertHrEstablishment } from "../../service";
import type { HrDenied, HrFailed } from "../../types";
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
import {
  EMPTY_ESTABLISHMENT,
  HR_ENTITY_FORMS,
  establishmentPayload,
  establishmentProblems,
  establishmentToInput,
  mergeEstablishmentDraft,
  parseCreateEstablishments,
  parseUpdateEstablishments,
  type HrEstablishmentInput,
  applicabilityFlags,
  buildHrEmployerScope,
  declarationPayload,
  flagLabel,
  flagValueText,
  formatAddress,
  identityEquals,
  identityFromProfile,
  identityPayload,
  identityProblems,
  mergeIdentityDraft,
  parseDeclarations,
  type HrDeclarableKey,
  type HrDeclarationRequest,
  type HrEmployerAddress,
  type HrEmployerIdentityForm,
} from "./employer-profile-model";

/** The Add / Edit establishment dialog, when open. */
type EstablishmentEditor = {
  mode: "create" | "edit";
  id: string | null;
  input: HrEstablishmentInput;
};

/** Radix Select cannot hold "" as an item value; this stands for "not set". */
const NOT_SET = "__not_set__";

function refusalText(result: HrDenied | HrFailed): string {
  return result.kind === "denied"
    ? result.detail || `The server refused this change (${result.reason}).`
    : result.message;
}

// ── The panel ───────────────────────────────────────────────────────────────

export function HrEmployerPanel() {
  const { active, employers, orgRef } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const organizationName =
    employers.find((e) => e.organization_id === organizationId)?.name ?? null;

  const [profile, setProfile] = useState<HrEmployerProfileRead | null>(null);
  const [form, setForm] = useState<HrEmployerIdentityForm | null>(null);
  const [ein, setEin] = useState("");
  // Derived, never set synchronously in an effect body (react-hooks/set-state-in-effect).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  /** The identity as last loaded — a reload keeps unsaved edits instead of wiping them. */
  const lastSaved = useRef<HrEmployerIdentityForm | null>(null);

  const structure = useHrSettingsStructure(organizationId);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const result = await fetchHrEmployerProfile({ organizationId });
      if (cancelled) return;
      if (result.ok) {
        const next = result.data.profile;
        const fresh = next ? identityFromProfile(next) : null;
        const previous = lastSaved.current;
        setForm((current) =>
          current && previous && fresh && !identityEquals(current, previous) ? current : fresh,
        );
        lastSaved.current = fresh;
        setProfile(next);
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

  const saved = profile ? identityFromProfile(profile) : null;
  const einCheck = ein.trim() === "" ? null : checkEin(ein);
  const dirty = Boolean(form && saved && (!identityEquals(form, saved) || ein.trim() !== ""));

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const loading =
    (organizationId !== null && loadedFor !== organizationId) || structure.isLoading;
  const loadStatus: "loading" | "loaded" | "failed" | "no_profile" = error
    ? "failed"
    : loadedFor !== organizationId
      ? "loading"
      : profile
        ? "loaded"
        : "no_profile";

  const establishments = structure.structure?.establishments ?? null;
  /** Establishment ids a location points at. */
  const usedEstablishmentIds = new Set(
    (structure.structure?.locations ?? [])
      .map((location) => location.establishment_id)
      .filter((id): id is string => Boolean(id)),
  );

  const jurisdictions = structure.structure?.jurisdictions ?? null;
  const [editor, setEditor] = useState<EstablishmentEditor | null>(null);

  /** The ONE establishment save — the dialog's Save and both agent targets. */
  const saveEstablishment = async (input: HrEstablishmentInput, id: string | null) => {
    if (!organizationId) throw new Error("No employer is open.");
    const result = await upsertHrEstablishment({
      organization_id: organizationId,
      ...(id ? { id } : {}),
      ...establishmentPayload(input),
    });
    if (!result.ok) throw new Error(refusalText(result));
    const savedId = String(result.data.establishment_id ?? id ?? "");
    structure.refresh();
    return { id: savedId, name: input.name.trim() };
  };

  const getScope = () =>
    createHrEmployerScope(
      buildHrEmployerScope({
        organization: organizationId ? { id: organizationId, name: organizationName } : null,
        loadStatus,
        profile: loadStatus === "loaded" ? profile : null,
        form: loadStatus === "loaded" ? form : null,
        establishments: structure.isLoading ? null : establishments,
        jurisdictions: structure.isLoading ? null : jurisdictions,
        establishmentEditor: editor,
      }),
    );

  /** The ONE save for declarations — the page's Declare button and the agent target. */
  const declare = async (requests: HrDeclarationRequest[]) => {
    if (!profile) throw new Error("The employer profile has not loaded yet.");
    const result = await updateHrEmployerProfile({
      organization_id: profile.organization_id,
      ...declarationPayload(profile, requests, new Date().toISOString()),
    });
    if (!result.ok) throw new Error(refusalText(result));
    setReload((n) => n + 1);
    return result.data;
  };

  const getWriteHandlers = () => ({
    ...collectionWriteHandlers(
      {
        plural: "establishments",
        singular: "establishment",
        create: {
          parse: (value) =>
            parseCreateEstablishments(value, establishments ?? [], jurisdictions ?? []),
          run: (input: HrEstablishmentInput) => saveEstablishment(input, null),
          nameOf: (input: HrEstablishmentInput) => input.name,
        },
        update: {
          parse: (value) =>
            parseUpdateEstablishments(value, establishments ?? [], jurisdictions ?? []),
          run: (plan: ReturnType<typeof parseUpdateEstablishments>[number]) =>
            saveEstablishment(plan.input, plan.id),
          nameOf: (plan: ReturnType<typeof parseUpdateEstablishments>[number]) =>
            plan.previousName,
          changedOf: (plan: ReturnType<typeof parseUpdateEstablishments>[number]) =>
            plan.changed,
        },
      },
      refuseSurfaceWrite,
    ),
    establishment_draft: {
      validate: (value: unknown) => {
        if (!jurisdictions) refuseSurfaceWrite("The establishment list has not loaded yet.");
        mergeEstablishmentDraft(
          editor?.mode === "create" ? editor.input : EMPTY_ESTABLISHMENT,
          value,
          jurisdictions ?? [],
        );
      },
      apply: (value: unknown) => {
        const input = mergeEstablishmentDraft(
          editor?.mode === "create" ? editor.input : EMPTY_ESTABLISHMENT,
          value,
          jurisdictions ?? [],
        );
        setEditor({ mode: "create", id: null, input });
        return {
          summary:
            "The New establishment dialog is open and filled in. Nothing is saved until the person presses Save.",
          data: establishmentPayload(input),
        };
      },
    },
    employer_identity_draft: {
      validate: (value: unknown) => {
        if (!form) refuseSurfaceWrite("The employer profile has not loaded yet.");
        mergeIdentityDraft(form as HrEmployerIdentityForm, value);
      },
      apply: (value: unknown) => {
        if (!form) refuseSurfaceWrite("The employer profile has not loaded yet.");
        const next = mergeIdentityDraft(form as HrEmployerIdentityForm, value);
        setForm(next);
        return {
          summary:
            "The Identity form is filled in. Nothing is saved until the person presses Save changes.",
          data: { ...next, primary_address: formatAddress(next.primary_address) },
        };
      },
    },
    applicability_declarations: {
      validate: (value: unknown) => {
        if (!profile) refuseSurfaceWrite("The employer profile has not loaded yet.");
        parseDeclarations(value);
      },
      apply: async (value: unknown) => {
        const requests = parseDeclarations(value);
        const ack = await declare(requests);
        return {
          summary: `Saved: ${requests
            .map((r) => `${flagLabel(r.flag)} ${r.applies ? "applies" : "does not apply"}`)
            .join("; ")}.`,
          data: { employer_profile_id: ack.employer_profile_id ?? profile?.id, declared: requests },
        };
      },
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={HR_EMPLOYER_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      <HrSettingsShell
        section="employer"
        title="Employer of record"
        loading={loading}
        error={error}
        operation="This employer's profile"
        onRetry={() => setReload((n) => n + 1)}
      >
        <EmployerContextMenu
          profile={profile}
          establishments={establishments ?? []}
          orgRef={orgRef}
          getScope={getScope}
          onEdit={(row) =>
            setEditor({ mode: "edit", id: row.id, input: establishmentToInput(row) })
          }
          locationEstablishmentIds={usedEstablishmentIds}
        >
          <div className="matrx-touch-targets divide-y divide-border px-4 pb-8 sm:px-6">
            {profile === null || form === null || saved === null ? (
              <div
                role="alert"
                className="my-4 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0 space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">
                    No employer profile came back for this organization
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    HR is set up here, but the profile could not be read with your access.
                    Send this screen to whoever runs HR for this employer.
                  </p>
                </div>
                <ErrorAlchemyMenu className="ml-auto" />
              </div>
            ) : (
              <>
                <IdentitySection
                  form={form}
                  saved={saved}
                  profile={profile}
                  ein={ein}
                  einCheck={einCheck}
                  dirty={dirty}
                  onChange={setForm}
                  onEinChange={setEin}
                  onDiscard={() => {
                    setForm(saved);
                    setEin("");
                  }}
                  onSaved={() => {
                    setEin("");
                    lastSaved.current = null;
                    setForm(null);
                    setReload((n) => n + 1);
                  }}
                />
                <ApplicabilitySection profile={profile} onDeclare={declare} />
                <EstablishmentsSection
                  establishments={establishments ?? []}
                  locationEstablishmentIds={usedEstablishmentIds}
                  orgRef={orgRef}
                  onAdd={() =>
                    setEditor({ mode: "create", id: null, input: { ...EMPTY_ESTABLISHMENT } })
                  }
                  onEdit={(row) =>
                    setEditor({ mode: "edit", id: row.id, input: establishmentToInput(row) })
                  }
                />
                <EstablishmentDialog
                  editor={editor}
                  jurisdictions={jurisdictions ?? []}
                  others={(establishments ?? []).filter((e) => e.id !== editor?.id)}
                  onChange={(input) => setEditor((current) => (current ? { ...current, input } : current))}
                  onClose={() => setEditor(null)}
                  onSave={async (current) => {
                    await saveEstablishment(current.input, current.id);
                    toast.success(
                      current.mode === "create"
                        ? `${current.input.name.trim()} added.`
                        : `${current.input.name.trim()} saved.`,
                    );
                    setEditor(null);
                  }}
                />
                <section aria-labelledby="hr-employer-tax" className="py-6">
                  <h2 id="hr-employer-tax" className="text-sm font-semibold text-foreground">
                    Tax registrations
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tax registrations can&apos;t be shown here yet. That is not the same as
                    having none.
                  </p>
                </section>
              </>
            )}
          </div>
        </EmployerContextMenu>
      </HrSettingsShell>
    </SurfaceRuntimeProvider>
  );
}

// ── The right-click menu — one for the whole page, rows delegated ───────────

function EmployerContextMenu({
  profile,
  establishments,
  locationEstablishmentIds,
  orgRef,
  getScope,
  onEdit,
  children,
}: {
  onEdit: (row: HrEstablishment) => void;
  profile: HrEmployerProfileRead | null;
  establishments: HrEstablishment[];
  locationEstablishmentIds: Set<string>;
  orgRef: string | null;
  getScope: () => ReturnType<typeof createHrEmployerScope>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [clickedRow, setClickedRow] = useState<HrEstablishment | null>(null);
  const summary = profile
    ? [
        profile.legal_name,
        profile.dba_name ? `doing business as ${profile.dba_name}` : null,
        formatAddress(identityFromProfile(profile).primary_address) || null,
      ]
        .filter(Boolean)
        .join(" — ")
    : "";
  const rowUsed = Boolean(clickedRow && locationEstablishmentIds.has(clickedRow.id));

  return (
    <NonEditableContextMenu
      sourceFeature="hr"
      surfaceName={HR_EMPLOYER_SURFACE_NAME}
      menuVersion={1}
      getApplicationScope={getScope}
      contentSource={{ type: "raw" }}
      contextData={{ content: summary }}
      entity={
        profile
          ? { type: "hr_employer_profile", id: profile.id, title: profile.legal_name }
          : undefined
      }
      resolveContextOnOpen={(target) => {
        const id = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
        const row = (id && establishments.find((r) => r.id === id)) || null;
        setClickedRow(row);
        if (!row) return null;
        return {
          content: `${row.name}${row.is_headquarters ? " (headquarters)" : ""}`,
          [CONTEXT_MENU_ENTITY_KEY]: {
            type: "hr_establishment",
            id: row.id,
            title: row.name,
          },
        };
      }}
      extraSections={
        clickedRow
          ? [
              {
                id: "hr-establishment-row",
                label: "This establishment",
                anchor: "after-compare",
                items: [
                  {
                    kind: "item",
                    id: "hr-establishment-edit",
                    label: "Edit",
                    icon: Pencil,
                    onSelect: () => onEdit(clickedRow),
                  },
                  {
                    kind: "item",
                    id: "hr-establishment-see-locations",
                    label: "See locations",
                    icon: Factory,
                    disabled: !rowUsed,
                    description: rowUsed ? undefined : "No location uses this establishment",
                    onSelect: () => {
                      router.push(hrSettingsHref("structure", { org: orgRef }));
                    },
                  },
                ] satisfies ContextMenuExtraItem[],
              },
            ]
          : []
      }
    >
      <div className="contents">{children}</div>
    </NonEditableContextMenu>
  );
}

// ── Identity ────────────────────────────────────────────────────────────────

function IdentitySection({
  form,
  saved,
  profile,
  ein,
  einCheck,
  dirty,
  onChange,
  onEinChange,
  onDiscard,
  onSaved,
}: {
  form: HrEmployerIdentityForm;
  saved: HrEmployerIdentityForm;
  profile: HrEmployerProfileRead;
  ein: string;
  einCheck: ReturnType<typeof checkEin> | null;
  dirty: boolean;
  onChange: (next: HrEmployerIdentityForm) => void;
  onEinChange: (next: string) => void;
  onDiscard: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  // Whatever the envelope carried, if anything. Today it carries neither.
  const knownLastFour =
    profile.ein_last4 ??
    einLastFour((profile as unknown as { ein?: string | null }).ein ?? null);

  const problems = identityProblems(form);
  const set = <K extends keyof HrEmployerIdentityForm>(key: K, value: HrEmployerIdentityForm[K]) =>
    onChange({ ...form, [key]: value });
  const setAddress = (key: keyof HrEmployerAddress, value: string) =>
    onChange({ ...form, primary_address: { ...form.primary_address, [key]: value } });

  const save = async () => {
    if (problems.length > 0) {
      setWhy(problems.join(" "));
      return;
    }
    if (einCheck && !einCheck.ok) {
      setWhy(einCheck.why);
      return;
    }
    setBusy(true);
    setWhy(null);
    const result = await updateHrEmployerProfile({
      organization_id: profile.organization_id,
      ...identityPayload(form),
      // Only sent when a new one was typed. An empty box never clears the EIN.
      ...(einCheck?.ok ? { ein: einCheck.value } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setWhy(refusalText(result));
      return;
    }
    toast.success("Employer profile saved.");
    onSaved();
  };

  const entityKnown = HR_ENTITY_FORMS.some((option) => option.value === form.entity_form);

  return (
    <section aria-labelledby="hr-employer-identity" className="py-6">
      <h2 id="hr-employer-identity" className="text-sm font-semibold text-foreground">
        Identity
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Legal name"
          htmlFor="legal-name"
          required
          value={form.legal_name}
          help="Letters, notices and exports already issued keep the name they were issued with."
        >
          <ProInput
            id="legal-name"
            value={form.legal_name}
            onChange={(event) => set("legal_name", event.target.value)}
          />
        </Field>
        <Field label="Doing business as" htmlFor="dba-name" optional>
          <ProInput
            id="dba-name"
            value={form.dba_name}
            onChange={(event) => set("dba_name", event.target.value)}
          />
        </Field>
        <Field label="Entity form" htmlFor="entity-form">
          <Select
            value={form.entity_form || NOT_SET}
            onValueChange={(value) => set("entity_form", value === NOT_SET ? "" : value)}
          >
            <SelectTrigger id="entity-form" className="text-base sm:text-sm">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOT_SET}>Not set</SelectItem>
              {HR_ENTITY_FORMS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              {form.entity_form && !entityKnown ? (
                <SelectItem value={form.entity_form}>{form.entity_form}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Formation state"
          htmlFor="formation-state"
          optional
          help="The state the entity was formed in — two letters, like DE."
        >
          <ProInput
            id="formation-state"
            value={form.formation_state}
            maxLength={2}
            autoCapitalize="characters"
            onChange={(event) => set("formation_state", event.target.value.toUpperCase())}
          />
        </Field>
        <Field
          label="EIN"
          htmlFor="ein"
          description={
            knownLastFour
              ? `On file, ending ${knownLastFour}. Type a new one to replace it.`
              : "On file and never shown. Type a new one to replace it."
          }
          error={einCheck && !einCheck.ok ? einCheck.why : undefined}
        >
          {/* A tax identifier: plain input on purpose — no dictation, no copy menu. */}
          <Input
            id="ein"
            value={ein}
            inputMode="numeric"
            autoComplete="off"
            placeholder="12-3456789"
            onChange={(event) => onEinChange(formatEinInput(event.target.value))}
            aria-invalid={Boolean(einCheck && !einCheck.ok)}
            className="text-base sm:text-sm"
          />
        </Field>
      </div>

      <h3 className="mt-6 text-sm font-medium text-foreground">Primary address</h3>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Street" htmlFor="addr-line1" className="sm:col-span-2 lg:col-span-1">
          <ProInput
            id="addr-line1"
            value={form.primary_address.line1}
            autoComplete="address-line1"
            onChange={(event) => setAddress("line1", event.target.value)}
          />
        </Field>
        <Field label="Suite or unit" htmlFor="addr-line2" optional>
          <ProInput
            id="addr-line2"
            value={form.primary_address.line2}
            autoComplete="address-line2"
            onChange={(event) => setAddress("line2", event.target.value)}
          />
        </Field>
        <Field label="City" htmlFor="addr-city">
          <ProInput
            id="addr-city"
            value={form.primary_address.city}
            autoComplete="address-level2"
            onChange={(event) => setAddress("city", event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-3 gap-4 sm:col-span-2 lg:col-span-3 lg:grid-cols-6">
          <Field label="State" htmlFor="addr-region">
            <ProInput
              id="addr-region"
              value={form.primary_address.region}
              maxLength={2}
              autoComplete="address-level1"
              onChange={(event) => setAddress("region", event.target.value.toUpperCase())}
            />
          </Field>
          <Field label="ZIP" htmlFor="addr-postal">
            <ProInput
              id="addr-postal"
              value={form.primary_address.postal_code}
              inputMode="numeric"
              autoComplete="postal-code"
              onChange={(event) => setAddress("postal_code", event.target.value)}
            />
          </Field>
          <Field label="Country" htmlFor="addr-country">
            <ProInput
              id="addr-country"
              value={form.primary_address.country}
              maxLength={2}
              autoComplete="country"
              onChange={(event) => setAddress("country", event.target.value.toUpperCase())}
            />
          </Field>
        </div>
      </div>

      {why ? <ErrorNotice size="inline" className="mt-4 text-sm" message={why} /> : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save changes
        </Button>
        {dirty ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Discard
          </Button>
        ) : null}
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {dirty
            ? "Unsaved changes"
            : identityEquals(form, saved) && profile.updated_at
              ? `Saved ${new Date(profile.updated_at).toLocaleDateString()}`
              : null}
        </span>
      </div>
    </section>
  );
}

// ── Applicability ───────────────────────────────────────────────────────────

function ApplicabilitySection({
  profile,
  onDeclare,
}: {
  profile: HrEmployerProfileRead;
  onDeclare: (requests: HrDeclarationRequest[]) => Promise<unknown>;
}) {
  const flags = applicabilityFlags(profile);
  return (
    <section aria-labelledby="hr-employer-laws" className="py-6">
      <h2 id="hr-employer-laws" className="text-sm font-semibold text-foreground">
        Which laws apply
      </h2>
      <ul className="mt-2 divide-y divide-border">
        {flags.map((flag) => (
          <ApplicabilityRow key={flag.key} flag={flag} onDeclare={onDeclare} />
        ))}
      </ul>
    </section>
  );
}

function ApplicabilityRow({
  flag,
  onDeclare,
}: {
  flag: HrApplicabilityFlag;
  onDeclare: (requests: HrDeclarationRequest[]) => Promise<unknown>;
}) {
  const [declaring, setDeclaring] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const isList = Array.isArray(flag.value);

  const declare = async (applies: boolean) => {
    let requests: HrDeclarationRequest[];
    try {
      requests = parseDeclarations([
        { flag: flag.key as HrDeclarableKey, applies, reason },
      ]);
    } catch {
      setWhy("Say why in a sentence. An undocumented override is an audit finding.");
      return;
    }
    setBusy(true);
    setWhy(null);
    try {
      await onDeclare(requests);
      setDeclaring(false);
      setReason("");
      toast.success(`${flag.label}: declared ${applies ? "applies" : "does not apply"}.`);
    } catch (err) {
      setWhy(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const basis = flag.isDeclared
    ? `Declared${flag.declaredAt ? ` ${new Date(flag.declaredAt).toLocaleDateString()}` : ""}${
        flag.declaredReason ? ` — ${flag.declaredReason}` : ""
      }`
    : (flag.derivation ?? "Nobody has counted or declared this yet — that is not a no.");

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{flag.label}</p>
          <p className="text-sm text-muted-foreground">{flag.test}</p>
          <p className="text-sm text-muted-foreground">{basis}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={flag.value === null ? "outline" : flag.isDeclared ? "default" : "secondary"}
            className="text-xs"
          >
            {flagValueText(flag.value)}
          </Badge>
          {isList || declaring ? null : (
            <Button type="button" size="sm" variant="outline" onClick={() => setDeclaring(true)}>
              Declare
            </Button>
          )}
        </div>
      </div>

      {declaring ? (
        <div className="mt-3 space-y-2">
          <Field label="Why are you overriding the counted answer?" htmlFor={`declare-${flag.key}`}>
            <ProTextarea
              id={`declare-${flag.key}`}
              value={reason}
              rows={2}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Counsel advised us we are covered from 1 January."
            />
          </Field>
          {why ? <ErrorNotice size="inline" className="text-sm" message={why} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => declare(true)}>
              Declare it applies
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => declare(false)}
            >
              Declare it does not
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDeclaring(false);
                setWhy(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ── Establishments ──────────────────────────────────────────────────────────

function EstablishmentsSection({
  establishments,
  locationEstablishmentIds,
  orgRef,
  onAdd,
  onEdit,
}: {
  onAdd: () => void;
  onEdit: (row: HrEstablishment) => void;
  establishments: HrEstablishment[];
  /** Establishment ids a location points at. */
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
      accessorFn: (row) => (locationEstablishmentIds.has(row.id) ? "In use" : "Not used"),
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
          <span className="text-sm text-muted-foreground">Not used</span>
        ),
    },
  ];

  return (
    <section aria-labelledby="hr-employer-establishments" className="py-6">
      <div className="flex items-center justify-between gap-2">
        <h2 id="hr-employer-establishments" className="text-sm font-semibold text-foreground">
          Establishments
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add establishment
        </Button>
      </div>
      {establishments.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          None. An employer that reports as one site does not need any.
        </p>
      ) : (
      <div className="mt-3">
        <MatrxDataTable
          data={establishments}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={10}
          urlState={{ id: "hr-establishments" }}
          toolbar={{ search: true, searchPlaceholder: "Search establishments" }}
          onRowOpen={(row) => onEdit(row)}
        />
      </div>
      )}
    </section>
  );
}

// ── The Add / Edit establishment dialog ─────────────────────────────────────

function EstablishmentDialog({
  editor,
  jurisdictions,
  others,
  onChange,
  onClose,
  onSave,
}: {
  editor: EstablishmentEditor | null;
  jurisdictions: ReadonlyArray<{ id: string; name: string; jurisdiction_key: string; level: string }>;
  others: ReadonlyArray<{ name: string }>;
  onChange: (input: HrEstablishmentInput) => void;
  onClose: () => void;
  onSave: (editor: EstablishmentEditor) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const input = editor?.input ?? EMPTY_ESTABLISHMENT;
  const set = <K extends keyof HrEstablishmentInput>(key: K, value: HrEstablishmentInput[K]) =>
    onChange({ ...input, [key]: value });
  const setAddress = (key: keyof HrEmployerAddress, value: string) =>
    onChange({ ...input, address: { ...input.address, [key]: value } });

  const save = async () => {
    if (!editor) return;
    const problems = establishmentProblems(editor.input, others, jurisdictions);
    if (problems.length > 0) {
      setWhy(problems.join(" "));
      return;
    }
    setBusy(true);
    setWhy(null);
    try {
      await onSave(editor);
    } catch (err) {
      setWhy(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={editor !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setWhy(null);
          onClose();
        }
      }}
    >
      <DialogContent
        className="matrx-touch-targets max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        {...{ [SURFACE_LAYER_ATTRIBUTE]: HR_EMPLOYER_SURFACE_NAME }}
      >
        <DialogHeader>
          <DialogTitle>
            {editor?.mode === "edit" ? `Edit ${input.name || "establishment"}` : "New establishment"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="est-name" required value={input.name}>
            <ProInput
              id="est-name"
              value={input.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>
          <Field label="Jurisdiction" htmlFor="est-jurisdiction" required value={input.jurisdiction_id}>
            <Select
              value={input.jurisdiction_id || undefined}
              onValueChange={(value) => set("jurisdiction_id", value)}
            >
              <SelectTrigger id="est-jurisdiction" className="text-base sm:text-sm">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {jurisdictions.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="NAICS code" htmlFor="est-naics" optional>
            <ProInput
              id="est-naics"
              value={input.naics_code}
              inputMode="numeric"
              onChange={(event) => set("naics_code", event.target.value)}
            />
          </Field>
          <Field label="EEO-1 establishment id" htmlFor="est-eeo1" optional>
            <ProInput
              id="est-eeo1"
              value={input.eeo1_establishment_id}
              onChange={(event) => set("eeo1_establishment_id", event.target.value)}
            />
          </Field>
          <Field label="OSHA establishment name" htmlFor="est-osha" optional>
            <ProInput
              id="est-osha"
              value={input.osha_establishment_name}
              onChange={(event) => set("osha_establishment_name", event.target.value)}
            />
          </Field>
          <Field label="Annual average employees" htmlFor="est-avg" optional>
            <ProInput
              id="est-avg"
              value={input.annual_average_employees}
              inputMode="numeric"
              onChange={(event) => set("annual_average_employees", event.target.value)}
            />
          </Field>
          <Field label="Street" htmlFor="est-line1" optional className="sm:col-span-2">
            <ProInput
              id="est-line1"
              value={input.address.line1}
              onChange={(event) => setAddress("line1", event.target.value)}
            />
          </Field>
          <Field label="City" htmlFor="est-city" optional>
            <ProInput
              id="est-city"
              value={input.address.city}
              onChange={(event) => setAddress("city", event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="State" htmlFor="est-region" optional>
              <ProInput
                id="est-region"
                value={input.address.region}
                maxLength={2}
                onChange={(event) => setAddress("region", event.target.value.toUpperCase())}
              />
            </Field>
            <Field label="ZIP" htmlFor="est-postal" optional>
              <ProInput
                id="est-postal"
                value={input.address.postal_code}
                inputMode="numeric"
                onChange={(event) => setAddress("postal_code", event.target.value)}
              />
            </Field>
          </div>
          <div className="matrx-tap-area flex items-center gap-3 sm:col-span-2">
            <Switch
              id="est-hq"
              checked={input.is_headquarters}
              onCheckedChange={(checked) => set("is_headquarters", checked)}
            />
            <Label htmlFor="est-hq" className="text-sm">
              Headquarters
            </Label>
          </div>
        </div>

        {why ? <ErrorNotice size="inline" className="text-sm" message={why} /> : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
