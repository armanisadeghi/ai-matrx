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
import { Archive, AlertTriangle, Factory, Loader2, Pencil, Plus, RotateCcw, Save, X } from "lucide-react";

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

import {
  setHrEstablishmentArchived,
  updateHrEmployerProfile,
  upsertHrEstablishment,
} from "../../service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
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
  flagIsOpen,
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

/** "2:41 PM" for a save today, the date otherwise. */
function savedWhen(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  return at.toDateString() === today.toDateString()
    ? at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : at.toLocaleDateString();
}

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

  /** The ONE archive — the row menu, the dialog and `update_establishments`. */
  const archiveEstablishment = async (id: string) => {
    const result = await setHrEstablishmentArchived({ id, archived: true });
    if (!result.ok) throw new Error(refusalText(result));
    structure.refresh();
  };

  /** Asks first, naming what archiving does. Returns true when archived. */
  const confirmArchive = async (row: { id: string; name: string }) => {
    const ok = await confirm({
      title: `Archive ${row.name}?`,
      description:
        "It leaves this list and stops counting as a reporting site for EEO-1 and OSHA. Its record and history are kept.",
      confirmLabel: "Archive",
    });
    if (!ok) return false;
    try {
      await archiveEstablishment(row.id);
      toast.success(`${row.name} archived.`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    }
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
          run: async (plan: ReturnType<typeof parseUpdateEstablishments>[number]) => {
            const edited = plan.changed.some((k) => k !== "archived");
            const ref = edited
              ? await saveEstablishment(plan.input, plan.id)
              : { id: plan.id, name: plan.previousName };
            if (plan.archive) await archiveEstablishment(plan.id);
            return ref;
          },
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
        title="Employer"
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
          locationEstablishmentIds={usedEstablishmentIds}
          onEdit={(row) =>
            setEditor({ mode: "edit", id: row.id, input: establishmentToInput(row) })
          }
          onArchive={(row) => void confirmArchive(row)}
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
                  jurisdictions={jurisdictions ?? []}
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
                <ApplicabilitySection
                  profile={profile}
                  jurisdictions={jurisdictions ?? []}
                  onDeclare={declare}
                />
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
                  onArchive={async (current) => {
                    if (!current.id) return;
                    const name = current.input.name.trim() || "this establishment";
                    if (await confirmArchive({ id: current.id, name })) setEditor(null);
                  }}
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
  onArchive,
  children,
}: {
  onEdit: (row: HrEstablishment) => void;
  onArchive: (row: HrEstablishment) => void;
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

  const sectionText = (section: string): string | null => {
    if (!profile) return null;
    const identity = identityFromProfile(profile);
    if (section === "identity") {
      return [
        `Legal name: ${identity.legal_name}`,
        identity.dba_name ? `Doing business as: ${identity.dba_name}` : null,
        identity.entity_form ? `Entity form: ${identity.entity_form}` : null,
        identity.formation_state ? `Formation state: ${identity.formation_state}` : null,
        `Primary address: ${formatAddress(identity.primary_address) || "not set"}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (section === "address") {
      return `Primary address: ${formatAddress(identity.primary_address) || "not set"}`;
    }
    if (section === "laws") {
      return applicabilityFlags(profile)
        .map((flag) => `${flag.label}: ${flagValueText(flag)}`)
        .join("\n");
    }
    if (section === "establishments") {
      return establishments.length
        ? establishments.map((e) => e.name).join("\n")
        : "No establishments";
    }
    return null;
  };

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
        if (!row) {
          // Outside a row: the right-clicked SECTION is the content — never the
          // page's first text field.
          const section = target?.closest("[data-hr-section]")?.getAttribute("data-hr-section");
          const text = section ? sectionText(section) : null;
          return text ? { content: text } : null;
        }
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
                    id: "hr-establishment-archive",
                    label: "Archive",
                    icon: Archive,
                    disabled: rowUsed,
                    description: rowUsed ? "A location still uses it — unlink it first" : undefined,
                    onSelect: () => onArchive(clickedRow),
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
  jurisdictions,
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
  jurisdictions: ReadonlyArray<JurisdictionOption>;
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
    <section aria-labelledby="hr-employer-identity" data-hr-section="identity" className="py-6">
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
          <UsStateSelect
            id="formation-state"
            value={form.formation_state}
            jurisdictions={jurisdictions}
            onChange={(code) => set("formation_state", code)}
          />
        </Field>
        <Field
          label="EIN"
          htmlFor="ein"
          help="Nine digits. Once saved it is never shown in a browser; typing one replaces what is stored."
          error={einCheck && !einCheck.ok ? einCheck.why : undefined}
        >
          {/* A tax identifier: plain input on purpose — no dictation, no copy menu. */}
          <Input
            id="ein"
            value={ein}
            inputMode="numeric"
            autoComplete="off"
            onChange={(event) => onEinChange(formatEinInput(event.target.value))}
            aria-invalid={Boolean(einCheck && !einCheck.ok)}
            aria-describedby="ein-hint"
            // Same surface as the ProInputs beside it — a grey box here read as disabled.
            className="bg-transparent text-base sm:text-sm"
          />
          {/* Under the input, never between label and input — the input stays on
              its row's line with the fields beside it. */}
          <p id="ein-hint" className="mt-1 text-xs text-muted-foreground">
            {knownLastFour
              ? `Ends in ${knownLastFour}. Type a new one to replace it.`
              : "Never shown once saved. Typing one replaces it."}
          </p>
        </Field>
      </div>

      <h2
        id="hr-employer-address"
        data-hr-section="address"
        className="mt-6 text-sm font-semibold text-foreground"
      >
        Primary address
      </h2>
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
        <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3 lg:col-span-3">
          <Field label="State" htmlFor="addr-region">
            <UsStateSelect
              id="addr-region"
              value={form.primary_address.region}
              jurisdictions={jurisdictions}
              onChange={(code) => setAddress("region", code)}
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
            <CountrySelect
              id="addr-country"
              value={form.primary_address.country}
              jurisdictions={jurisdictions}
              onChange={(code) => setAddress("country", code)}
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
              ? `Saved ${savedWhen(profile.updated_at)}`
              : null}
        </span>
      </div>
    </section>
  );
}

// ── Applicability ───────────────────────────────────────────────────────────

function ApplicabilitySection({
  profile,
  jurisdictions,
  onDeclare,
}: {
  jurisdictions: ReadonlyArray<JurisdictionOption>;
  profile: HrEmployerProfileRead;
  onDeclare: (requests: HrDeclarationRequest[]) => Promise<unknown>;
}) {
  const flags = applicabilityFlags(profile);
  return (
    <section aria-labelledby="hr-employer-laws" data-hr-section="laws" className="py-6">
      <h2
        id="hr-employer-laws"
        className="text-sm font-semibold text-foreground"
        title="Not established means nobody has counted or declared it yet — it is not a no."
      >
        Which laws apply
      </h2>
      <ul className="mt-2 divide-y divide-border">
        {flags.map((flag) => (
          <ApplicabilityRow
            key={flag.key}
            flag={flag}
            jurisdictions={jurisdictions}
            onDeclare={onDeclare}
          />
        ))}
      </ul>
    </section>
  );
}

function ApplicabilityRow({
  flag,
  jurisdictions,
  onDeclare,
}: {
  flag: HrApplicabilityFlag;
  jurisdictions: ReadonlyArray<JurisdictionOption>;
  onDeclare: (requests: HrDeclarationRequest[]) => Promise<unknown>;
}) {
  const [declaring, setDeclaring] = useState(false);
  const [reason, setReason] = useState("");
  const [states, setStates] = useState<string[]>(Array.isArray(flag.value) ? flag.value : []);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const isList = flag.key === "everify_required_states";
  const open = flagIsOpen(flag);

  const declare = async (applies: boolean) => {
    let requests: HrDeclarationRequest[];
    try {
      requests = parseDeclarations([
        isList
          ? { flag: flag.key, states: applies ? states : [], reason }
          : { flag: flag.key as HrDeclarableKey, applies, reason },
      ]);
    } catch (err) {
      setWhy(
        err instanceof Error
          ? err.message.replace(/Item 1: /g, "").replace(/ Nothing was changed\.$/, "")
          : String(err),
      );
      return;
    }
    setBusy(true);
    setWhy(null);
    try {
      await onDeclare(requests);
      setDeclaring(false);
      setReason("");
      toast.success(
        isList
          ? `${flag.label}: declared ${applies && states.length ? states.join(", ") : "none required"}.`
          : `${flag.label}: declared ${applies ? "applies" : "does not apply"}.`,
      );
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
    : flag.derivation;

  const stateOptions = jurisdictions.filter(
    (j) => j.level === "state" && /^US-[A-Z]{2}$/.test(j.jurisdiction_key),
  );

  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{flag.label}</p>
          <p className="text-sm text-muted-foreground">{flag.test}</p>
          {basis ? <p className="text-sm text-muted-foreground">{basis}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={open ? "outline" : flag.isDeclared ? "default" : "secondary"}
            className="text-xs"
          >
            {flagValueText(flag)}
          </Badge>
          {declaring ? null : (
            <Button type="button" size="sm" variant="outline" onClick={() => setDeclaring(true)}>
              Declare
            </Button>
          )}
        </div>
      </div>

      {declaring ? (
        <div className="mt-3 space-y-2">
          {isList ? (
            <Field label="States that require E-Verify" htmlFor={`declare-states-${flag.key}`}>
              <div className="flex flex-wrap items-center gap-2">
                {states.map((code) => (
                  <Badge key={code} variant="secondary" className="gap-1 text-xs">
                    {code}
                    <button
                      type="button"
                      aria-label={`Remove ${code}`}
                      className="rounded-sm hover:text-foreground"
                      onClick={() => setStates(states.filter((c) => c !== code))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Select
                  value=""
                  onValueChange={(code) => setStates([...new Set([...states, code])].sort())}
                >
                  <SelectTrigger
                    id={`declare-states-${flag.key}`}
                    className="w-44 text-base sm:text-sm"
                  >
                    <SelectValue placeholder="Add a state" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {stateOptions.map((j) => (
                      <SelectItem key={j.id} value={j.jurisdiction_key.slice(3)}>
                        {j.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Field>
          ) : null}
          <Field
            label={
              flag.derivation
                ? "Why are you overriding the counted answer?"
                : "What is this declaration based on?"
            }
            htmlFor={`declare-${flag.key}`}
          >
            <ProTextarea
              id={`declare-${flag.key}`}
              value={reason}
              rows={2}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {why ? <ErrorNotice size="inline" className="text-sm" message={why} /> : null}
          <div className="flex flex-wrap gap-2">
            {isList ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || states.length === 0}
                  onClick={() => declare(true)}
                >
                  Declare these states
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => declare(false)}
                >
                  Declare none required
                </Button>
              </>
            ) : (
              <>
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
              </>
            )}
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

// ── Standard state / country selects (from HR's own jurisdiction list) ───────

type JurisdictionOption = { id: string; name: string; jurisdiction_key: string; level: string };

function UsStateSelect({
  id,
  value,
  jurisdictions,
  onChange,
}: {
  id: string;
  value: string;
  jurisdictions: ReadonlyArray<JurisdictionOption>;
  onChange: (code: string) => void;
}) {
  const states = jurisdictions.filter(
    (j) => j.level === "state" && /^US-[A-Z]{2}$/.test(j.jurisdiction_key),
  );
  const known = states.some((j) => j.jurisdiction_key.slice(3) === value);
  return (
    <Select value={value || NOT_SET} onValueChange={(v) => onChange(v === NOT_SET ? "" : v)}>
      <SelectTrigger id={id} className="text-base sm:text-sm">
        <SelectValue placeholder="Not set" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NOT_SET}>Not set</SelectItem>
        {states.map((j) => (
          <SelectItem key={j.id} value={j.jurisdiction_key.slice(3)}>
            {j.name}
          </SelectItem>
        ))}
        {value && !known ? <SelectItem value={value}>{value}</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}

function CountrySelect({
  id,
  value,
  jurisdictions,
  onChange,
}: {
  id: string;
  value: string;
  jurisdictions: ReadonlyArray<JurisdictionOption>;
  onChange: (code: string) => void;
}) {
  // HR is US-only today: the countries offered are the national jurisdictions it knows.
  const countries = jurisdictions.filter((j) => /^[A-Z]{2}$/.test(j.jurisdiction_key));
  const known = countries.some((j) => j.jurisdiction_key === value);
  return (
    <Select value={value || NOT_SET} onValueChange={(v) => onChange(v === NOT_SET ? "" : v)}>
      <SelectTrigger id={id} className="text-base sm:text-sm">
        <SelectValue placeholder="Not set" />
      </SelectTrigger>
      <SelectContent>
        {countries.map((j) => (
          <SelectItem key={j.id} value={j.jurisdiction_key}>
            {j.name}
          </SelectItem>
        ))}
        {value && !known ? <SelectItem value={value}>{value}</SelectItem> : null}
      </SelectContent>
    </Select>
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
    <section
      aria-labelledby="hr-employer-establishments"
      data-hr-section="establishments"
      className="py-6"
    >
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
          detail={{ enabled: false }}
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
  onArchive,
  onSave,
}: {
  onArchive: (editor: EstablishmentEditor) => Promise<void>;
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
              <UsStateSelect
                id="est-region"
                value={input.address.region}
                jurisdictions={jurisdictions}
                onChange={(code) => setAddress("region", code)}
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
          {editor?.mode === "edit" ? (
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => {
                if (editor) void onArchive(editor);
              }}
              disabled={busy}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
          ) : null}
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
