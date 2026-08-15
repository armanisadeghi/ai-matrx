// features/agent-apps/format.ts
//
// Shared formatters + copy summaries for agent-apps surfaces. Centralizes:
//   - formatNumber / formatDateTime — previously duplicated across
//     agent-app-listings/AgentAppCard.tsx, route/AgentAppOverviewContent.tsx,
//     route/AgentAppVersionsContent.tsx, and the version snapshot page.
//   - humanAgentApp / appBrief — the `human` text used by <CopyButtons> on
//     rows/cards across the grid, admin table, panel, and dashboard.
//   - agentAppKpis / agentAppAdminKpis — the page KPI strips (see below).
//   - The FORM-surface view builders (settings tab, admin edit page, metadata
//     modal, rate-limit editor): what-I-see payloads built from LIVE input
//     state, per THE WHAT-I-SEE LAW in the `agent-copy` skill.
//
// Any surface showing an app row/card should import from here rather than
// hand-rolling its own formatter or summary string.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { visibilityLabelShort } from "@/lib/visibility/labels";

/** "1.2k" / "3m" style compact number, matching the app's existing style. */
export function formatNumber(n: number | null | undefined): string {
  if (!n || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/** Locale date+time string, tolerant of bad/missing ISO input. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Minimal shape the summary builders need. `AgentAppCardModel`,
 * `AgentAppAdminView`, and `AgentAppSummary` (and the raw `AgentApp` record)
 * all satisfy this structurally — no explicit import/cast required at
 * callsites.
 */
export interface AppSummaryLike {
  id: string;
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  status?: string;
  visibility?: string | null;
  is_featured?: boolean | null;
  is_verified?: boolean | null;
  total_executions?: number | null;
  success_rate?: number | null;
  updated_at?: string;
}

/** Multi-line human-readable summary of a single app — per-row/card copy. */
export function humanAgentApp(app: AppSummaryLike): string {
  const lines = [
    `${app.name} (${app.slug})`,
    app.tagline || null,
    [
      app.status ? `Status: ${app.status}` : null,
      app.visibility ? visibilityLabelShort(app.visibility) : null,
      app.is_featured ? "Featured" : null,
      app.is_verified ? "Verified" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    app.category ? `Category: ${app.category}` : null,
    `Runs: ${formatNumber(app.total_executions)}${
      typeof app.success_rate === "number"
        ? ` · ${Math.round(app.success_rate * 100)}% success`
        : ""
    }`,
    app.description || null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** One-line brief — used by compact "briefs" aiVariants on lists/tables. */
export function appBrief(app: AppSummaryLike): string {
  const bits = [
    app.name,
    `(${app.slug})`,
    app.status ? `— ${app.status}` : null,
    app.category ? `· ${app.category}` : null,
    `· ${formatNumber(app.total_executions)} runs`,
    typeof app.success_rate === "number"
      ? `· ${Math.round(app.success_rate * 100)}% success`
      : null,
  ].filter(Boolean);
  return bits.join(" ");
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE KPI STRIPS
// ═══════════════════════════════════════════════════════════════════════════
//
// THE PAGE-KPI RULE (agent-copy skill): every payload from a page carries that
// page's leading metric strip VERBATIM — the same numbers, formatted the way
// the page formats them — in the body AND the envelope `attributes`. The agent
// must never have to recompute what the user is already looking at.
//
// There are TWO functions here rather than one because the two agent-app record
// pages render the SAME underlying metrics with DIFFERENT formatting, and
// "verbatim" means what THIS page shows:
//   - the /agent-apps/[id] entity stat strip  → compact `formatNumber`, whole %
//   - the admin edit page's Analytics card    → `toLocaleString`, `$x.xxxx`
// Collapsing them into one formatter would make one of the two pages' payloads
// disagree with its own screen, which is the exact defect the rule exists for.

/** Fields the KPI builders read. Every app row/view satisfies it structurally. */
export interface AgentAppKpiLike {
  status?: string;
  visibility?: string | null;
  total_executions?: number | null;
  unique_users_count?: number | null;
  success_rate?: number | null;
  total_cost?: number | null;
  last_execution_at?: string | null;
}

export type AgentAppKpis = Record<string, string | number>;

/**
 * The entity stat strip as `/agent-apps/[id]` renders it — the numbers the user
 * carried in from Overview into Run / Code / Versions / Settings.
 * Mirrors `AgentAppOverviewContent`'s StatChip row.
 */
export function agentAppKpis(app: AgentAppKpiLike): AgentAppKpis {
  const kpis: AgentAppKpis = {
    runs: formatNumber(app.total_executions),
    success:
      typeof app.success_rate === "number"
        ? `${Math.round(app.success_rate * 100)}%`
        : "—",
  };
  if (app.unique_users_count != null) {
    kpis.users = formatNumber(app.unique_users_count);
  }
  if (typeof app.total_cost === "number" && app.total_cost > 0) {
    kpis.cost = `$${app.total_cost.toFixed(2)}`;
  }
  if (app.status) kpis.status = app.status;
  if (app.visibility) kpis.visibility = app.visibility;
  return kpis;
}

/**
 * The Analytics card as the ADMIN edit page renders it, verbatim — including
 * its own `toLocaleString` / 0-dp percent / 4-dp dollar formatting, which
 * deliberately differs from the entity strip above.
 */
export function agentAppAdminKpis(app: AgentAppKpiLike): AgentAppKpis {
  return {
    runs: (app.total_executions ?? 0).toLocaleString(),
    users: (app.unique_users_count ?? 0).toLocaleString(),
    success: `${((app.success_rate ?? 0) * 100).toFixed(0)}%`,
    cost: `$${(app.total_cost ?? 0).toFixed(4)}`,
  };
}

/** Render a KPI map the way the strip reads on screen: "runs: 1.2k · success: 98%". */
export function kpiLine(kpis: AgentAppKpis): string {
  return Object.entries(kpis)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`)
    .join(" · ");
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM SURFACES — what-I-see payloads built from LIVE input state
// ═══════════════════════════════════════════════════════════════════════════
//
// THE RULE (Arman, 2026-08-12): LIVE state, never saved rows. A form-heavy
// page's form values ARE the payload; copying the fetched row after the user
// edited a field is lying to the agent. Every view below is built INSIDE the
// click handler from the component's current input state, and carries an
// explicit `unsaved_changes` diff against the saved record.

/** One editable field: what the input holds NOW vs what the row holds. */
export interface AgentAppFieldDraft {
  /** Column name, e.g. "tagline". */
  field: string;
  /** The label the form renders beside it, e.g. "Tagline". */
  label: string;
  /** Current input value — what the user is looking at. */
  live: string;
  /** The saved value on the fetched record. */
  saved: string;
}

/** A save the form will refuse, and the exact sentence the user gets told. */
export interface AgentAppSaveBlocker {
  field: string;
  label: string;
  /** Verbatim — the same string the toast/inline error renders. */
  message: string;
}

const draftIsDirty = (draft: AgentAppFieldDraft) => draft.live !== draft.saved;

const showValue = (value: string) => (value === "" ? "(empty)" : value);

/** "Tagline: "old" → "new"" — the unsaved diff, one line per changed field. */
function draftDiffLines(drafts: AgentAppFieldDraft[]): string[] {
  return drafts
    .filter(draftIsDirty)
    .map(
      (draft) =>
        `${draft.label}: ${showValue(draft.saved)} → ${showValue(draft.live)}`,
    );
}

function draftData(drafts: AgentAppFieldDraft[]) {
  return drafts.map((draft) => ({
    field: draft.field,
    label: draft.label,
    live_value: draft.live,
    saved_value: draft.saved,
    unsaved: draftIsDirty(draft),
  }));
}

// ── /agent-apps/[id]/settings ──────────────────────────────────────────────

/**
 * The Settings tab exactly as rendered. `drafts` are the per-field staged
 * inputs (Name / Tagline / Description / the three rate limits) that show a
 * Save button when dirty; `committed` are the controls that write straight
 * through on change (category, tags, agent binding, shell, branding, status,
 * visibility, hierarchy) so their rendered value IS the saved value.
 */
export interface AgentAppSettingsView {
  app: AppSummaryLike & AgentAppKpiLike;
  /** Which tab is open — the slice of the form the user is actually in. */
  activeTab: string;
  drafts: AgentAppFieldDraft[];
  /** Field currently saving, if any (its Save button shows a spinner). */
  savingField: string | null;
  /** Validation that will reject the pending save, with verbatim messages. */
  saveBlockers: AgentAppSaveBlocker[];
  /** Controls with no staging step — rendered value equals saved value. */
  committed: Record<string, unknown>;
  publicUrl: string;
}

export function agentAppSettingsHuman(view: AgentAppSettingsView): string {
  const kpis = agentAppKpis(view.app);
  const diffs = draftDiffLines(view.drafts);
  const lines: string[] = [
    `${view.app.name} (${view.app.slug}) — Settings › ${view.activeTab}`,
    kpiLine(kpis),
    "",
    "Form values (LIVE — what is in the inputs right now):",
    ...view.drafts.map(
      (draft) =>
        `- ${draft.label}: ${showValue(draft.live)}${
          draftIsDirty(draft) ? "  [UNSAVED]" : ""
        }`,
    ),
  ];

  if (diffs.length > 0) {
    lines.push(
      "",
      `UNSAVED CHANGES (${diffs.length}) — not written until each field's Save is clicked:`,
      ...diffs.map((diff) => `• ${diff}`),
    );
  } else {
    lines.push("", "No unsaved changes.");
  }

  if (view.saveBlockers.length > 0) {
    lines.push(
      "",
      `SAVE BLOCKED (${view.saveBlockers.length}):`,
      ...view.saveBlockers.map(
        (blocker) => `• ${blocker.label}: ${blocker.message}`,
      ),
    );
  }

  if (view.savingField) lines.push("", `Saving "${view.savingField}"…`);

  lines.push(
    "",
    "Saved directly on change (no draft step):",
    ...Object.entries(view.committed).map(
      ([key, value]) =>
        `- ${key.replaceAll("_", " ")}: ${
          value === null || value === undefined || value === ""
            ? "—"
            : Array.isArray(value)
              ? value.join(", ") || "—"
              : String(value)
        }`,
    ),
    "",
    `Public URL: ${view.publicUrl}`,
  );
  return lines.join("\n");
}

export function agentAppSettingsAgentPayload(
  view: AgentAppSettingsView,
): AgentPayloadInput {
  const kpis = agentAppKpis(view.app);
  const unsaved = view.drafts.filter(draftIsDirty);
  return {
    kind: "agent-app-settings-form",
    location: `AI Matrx — Agent App — ${view.app.name} — Settings`,
    description:
      "The agent-app Settings form as the user sees it right now: the open tab, the LIVE values in every staged input (which may differ from the saved row), an explicit unsaved-changes diff, any save-blocking validation, and the controls that save on change.",
    data: {
      app: {
        id: view.app.id,
        name: view.app.name,
        slug: view.app.slug,
        status: view.app.status,
        visibility: view.app.visibility,
      },
      // The page's leading metrics, carried verbatim per the page-KPI rule.
      page_kpis: kpis,
      active_tab: view.activeTab,
      form: {
        note: "LIVE input values at copy time. Each field saves independently — a value here is NOT in the database until that field's Save button is clicked.",
        fields: draftData(view.drafts),
        unsaved_changes: draftDiffLines(view.drafts),
        saving_field: view.savingField,
        save_blockers: view.saveBlockers,
      },
      saved_on_change: view.committed,
      public_url: view.publicUrl,
    },
    summary: agentAppSettingsHuman(view),
    attributes: {
      ...kpis,
      id: view.app.id,
      slug: view.app.slug,
      tab: view.activeTab,
      unsaved_changes: unsaved.length,
      save_blockers: view.saveBlockers.length,
    },
  };
}

// ── /administration/agents/agent-apps/edit/[id] ────────────────────────────

/**
 * The admin edit page as rendered. Its Metadata / Analytics / Timestamps cards
 * read the fetched row directly — there is no draft layer at page level, so
 * those values honestly ARE the saved values. The draft layers live in the
 * metadata modal and the rate-limit editor, whose own copy controls carry
 * their live state; this view records whether either is currently open so the
 * agent knows an unsaved edit may exist beside these numbers.
 */
export interface AgentAppAdminEditView {
  app: AppSummaryLike & AgentAppKpiLike;
  activeTab: string;
  metadataModalOpen: boolean;
  metadata: Record<string, unknown>;
  moderation: Record<string, unknown>;
  timestamps: Record<string, string>;
}

export function agentAppAdminEditHuman(view: AgentAppAdminEditView): string {
  const kpis = agentAppAdminKpis(view.app);
  const renderEntries = (entries: Record<string, unknown>) =>
    Object.entries(entries).map(([key, value]) => {
      const shown =
        value === null || value === undefined || value === ""
          ? "—"
          : Array.isArray(value)
            ? value.join(", ") || "—"
            : String(value);
      return `- ${key.replaceAll("_", " ")}: ${shown}`;
    });

  return [
    `Editing ${view.app.name} [${view.app.status}] — /p/${view.app.slug}`,
    `Analytics: ${kpiLine(kpis)}`,
    `Tab: ${view.activeTab === "code" ? "Component Code" : "Admin Controls"}`,
    "",
    "Metadata:",
    ...renderEntries(view.metadata),
    "",
    "Admin moderation:",
    ...renderEntries(view.moderation),
    "",
    "Timestamps:",
    ...renderEntries(view.timestamps),
    ...(view.metadataModalOpen
      ? [
          "",
          'The "Edit name / tagline" dialog is OPEN — it may hold unsaved edits that are not reflected above. Copy from inside the dialog to capture them.',
        ]
      : []),
  ].join("\n");
}

export function agentAppAdminEditAgentPayload(
  view: AgentAppAdminEditView,
): AgentPayloadInput {
  const kpis = agentAppAdminKpis(view.app);
  return {
    kind: "agent-app-admin-edit",
    location: "AI Matrx Admin — Agent Apps — Edit",
    description:
      "The admin agent-app edit page as the user sees it: the Analytics KPI card, the Metadata / Admin Moderation / Timestamps cards, and which tab is open. Page-level fields render the saved row directly; the metadata dialog and rate-limit editor own the draft layers and carry their own live-state copy controls.",
    data: {
      app: {
        id: view.app.id,
        name: view.app.name,
        slug: view.app.slug,
        status: view.app.status,
        visibility: view.app.visibility,
      },
      // The Analytics card, verbatim — this page's leading metric strip.
      page_kpis: kpis,
      active_tab: view.activeTab,
      metadata: view.metadata,
      admin_moderation: view.moderation,
      timestamps: view.timestamps,
      metadata_dialog_open: view.metadataModalOpen,
      unsaved_changes: view.metadataModalOpen
        ? ["The metadata dialog is open and may hold unsaved edits — not captured in this page-level payload."]
        : [],
    },
    summary: agentAppAdminEditHuman(view),
    attributes: {
      ...kpis,
      id: view.app.id,
      slug: view.app.slug,
      status: view.app.status,
      tab: view.activeTab,
      metadata_dialog_open: view.metadataModalOpen,
    },
  };
}

// ── The "Edit name / tagline" dialog (UpdateAgentAppModal) ─────────────────

/**
 * The metadata dialog's LIVE draft. `error` is the red `text-destructive`
 * sentence the dialog renders after a failed save — the highest-value content
 * on the surface, captured verbatim.
 */
export interface AgentAppMetadataFormView {
  app: AppSummaryLike & AgentAppKpiLike;
  drafts: AgentAppFieldDraft[];
  saving: boolean;
  /** Verbatim rendered error text, or null when none is shown. */
  error: string | null;
  /** KPI strip of the page the dialog is open on top of. */
  kpis: AgentAppKpis;
}

export function agentAppMetadataFormHuman(
  view: AgentAppMetadataFormView,
): string {
  const diffs = draftDiffLines(view.drafts);
  const lines = [
    `Edit metadata — ${view.app.name} (${view.app.slug})`,
    kpiLine(view.kpis),
    "",
    "Dialog values (LIVE — unsaved until “Save Changes”):",
    ...view.drafts.map(
      (draft) =>
        `- ${draft.label}: ${showValue(draft.live)}${
          draftIsDirty(draft) ? "  [UNSAVED]" : ""
        }`,
    ),
  ];
  if (diffs.length > 0) {
    lines.push("", `UNSAVED CHANGES (${diffs.length}):`, ...diffs.map((d) => `• ${d}`));
  } else {
    lines.push("", "No unsaved changes.");
  }
  if (view.error) {
    lines.push("", `ERROR SHOWN IN DIALOG: ${view.error}`);
  }
  if (view.saving) lines.push("", "Saving…");
  return lines.join("\n");
}

export function agentAppMetadataFormAgentPayload(
  view: AgentAppMetadataFormView,
): AgentPayloadInput {
  const unsaved = draftDiffLines(view.drafts);
  return {
    kind: "agent-app-metadata-form",
    location: "AI Matrx Admin — Agent Apps — Edit — Metadata dialog",
    description:
      "The agent-app metadata dialog exactly as rendered: the LIVE values in the Name / Tagline / Description / Status inputs, the unsaved diff against the saved record, and the verbatim error text if a save just failed.",
    data: {
      app: { id: view.app.id, name: view.app.name, slug: view.app.slug },
      page_kpis: view.kpis,
      form: {
        note: "LIVE dialog values at copy time — not written until “Save Changes” succeeds.",
        fields: draftData(view.drafts),
        unsaved_changes: unsaved,
        saving: view.saving,
        // The red sentence under the fields. Errors first — this is the
        // single highest-value thing on the surface when it is present.
        error_shown: view.error,
      },
    },
    summary: agentAppMetadataFormHuman(view),
    attributes: {
      ...view.kpis,
      id: view.app.id,
      slug: view.app.slug,
      unsaved_changes: unsaved.length,
      has_error: view.error !== null,
    },
  };
}

// ── The inline rate-limit editor (AgentAppAdminActions) ────────────────────

export interface AgentAppRateLimitFormView {
  app: AppSummaryLike & AgentAppKpiLike;
  /** True while the inline editor is open; its inputs are then a draft layer. */
  editing: boolean;
  drafts: AgentAppFieldDraft[];
  kpis: AgentAppKpis;
}

export function agentAppRateLimitHuman(
  view: AgentAppRateLimitFormView,
): string {
  const diffs = draftDiffLines(view.drafts);
  const lines = [
    `Rate limits — ${view.app.name} (${view.app.slug})`,
    kpiLine(view.kpis),
    "",
    view.editing
      ? "Editor OPEN — values below are LIVE inputs, unsaved until Save:"
      : "Editor closed — values below are the saved record:",
    ...view.drafts.map(
      (draft) =>
        `- ${draft.label}: ${showValue(draft.live)}${
          view.editing && draftIsDirty(draft) ? "  [UNSAVED]" : ""
        }`,
    ),
  ];
  if (view.editing && diffs.length > 0) {
    lines.push("", `UNSAVED CHANGES (${diffs.length}):`, ...diffs.map((d) => `• ${d}`));
  }
  return lines.join("\n");
}

export function agentAppRateLimitAgentPayload(
  view: AgentAppRateLimitFormView,
): AgentPayloadInput {
  const unsaved = view.editing ? draftDiffLines(view.drafts) : [];
  return {
    kind: "agent-app-rate-limits",
    location: "AI Matrx Admin — Agent Apps — Edit — Rate limits",
    description:
      "The agent-app rate-limit controls as rendered: the LIVE input values while the editor is open (with an unsaved diff against the saved record), or the saved values when it is closed.",
    data: {
      app: { id: view.app.id, name: view.app.name, slug: view.app.slug },
      page_kpis: view.kpis,
      form: {
        note: view.editing
          ? "LIVE input values at copy time — unsaved until Save is clicked."
          : "Editor is closed; these are the saved values.",
        editing: view.editing,
        fields: draftData(view.drafts),
        unsaved_changes: unsaved,
      },
    },
    summary: agentAppRateLimitHuman(view),
    attributes: {
      ...view.kpis,
      id: view.app.id,
      slug: view.app.slug,
      editing: view.editing,
      unsaved_changes: unsaved.length,
    },
  };
}
