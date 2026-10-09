// features/applets/format.ts
//
// Shared formatters + copy summaries for applets surfaces. Centralizes:
//   - formatNumber / formatDateTime — previously duplicated across
//     applet-listings/AppletListCard.tsx, route/AppletOverviewContent.tsx,
//     route/AppletVersionsContent.tsx, and the version snapshot page.
//   - humanApplet / appBrief — the `human` text used by <CopyButtons> on
//     rows/cards across the grid, admin table, panel, and dashboard.
//   - appletKpis / appletAdminKpis — the page KPI strips (see below).
//   - The FORM-surface view builders (settings tab, admin edit page, metadata
//     modal, rate-limit editor): what-I-see payloads built from LIVE input
//     state, per THE WHAT-I-SEE LAW in the `agent-copy` skill.
//
// Any surface showing an app row/card should import from here rather than
// hand-rolling its own formatter or summary string.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { publishedToWebLabel } from "@/lib/row-access";
import {
  formatCount,
  formatPercentFromFraction,
  isKnownNumber,
  UNKNOWN_DISPLAY,
} from "@/lib/format/honest";
import { formatAbsoluteDate, formatCost, type CostUnit } from "@ai-matrx/kit/format";
import { currentCostUnit } from "@/components/cost/costUnit";

/**
 * "1.2k" / "3m" style compact number, matching the app's existing style.
 *
 * A SCREEN NEVER LIES. `aga_apps.total_executions` is nullable, and the
 * original `if (!n || n <= 0) return "0"` printed a confident "0" for a
 * counter nobody has measured. Unknown is the em-dash; a REAL zero — and a
 * real negative, which would be a genuine data problem worth seeing — still
 * prints as itself.
 */
export function formatNumber(n: number | null | undefined): string {
  if (!isKnownNumber(n)) return UNKNOWN_DISPLAY;
  if (n <= 0) return String(n);
  return formatCount(n, { style: "compact" });
}

/** Locale date+time string, tolerant of bad/missing ISO input. */
/** "9 Oct 2026, 4:44 AM" — the day and the minute, never seconds (audit M8: "10/9/2026, 4:44:06 AM"). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAbsoluteDate(iso, { dateStyle: "medium", timeStyle: "short" }, iso);
}

/**
 * Minimal shape the summary builders need. `AppletCardModel`,
 * `AppletAdminView`, and `AppletSummary` (and the raw `AppletRow` record)
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
  published_to_web?: boolean | null;
  is_featured?: boolean | null;
  is_verified?: boolean | null;
  total_executions?: number | null;
  success_rate?: number | null;
  updated_at?: string;
}

/** Multi-line human-readable summary of a single app — per-row/card copy. */
export function humanApplet(app: AppSummaryLike): string {
  const lines = [
    `${app.name} (${app.slug})`,
    app.tagline || null,
    [
      app.status ? `Status: ${app.status}` : null,
      app.published_to_web != null
        ? publishedToWebLabel(app.published_to_web)
        : null,
      app.is_featured ? "Featured" : null,
      app.is_verified ? "Verified" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    app.category ? `Category: ${app.category}` : null,
    `Runs: ${formatNumber(app.total_executions)}${
      isKnownNumber(app.success_rate)
        ? ` · ${formatPercentFromFraction(app.success_rate)} success`
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
    isKnownNumber(app.success_rate)
      ? `· ${formatPercentFromFraction(app.success_rate)} success`
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
// There are TWO functions here rather than one because the two applet record
// pages render the SAME underlying metrics with DIFFERENT formatting, and
// "verbatim" means what THIS page shows:
//   - the /applets/manage/[id] entity stat strip  → compact `formatNumber`, whole %
//   - the admin edit page's Analytics card    → `toLocaleString`, `$x.xxxx`
// Collapsing them into one formatter would make one of the two pages' payloads
// disagree with its own screen, which is the exact defect the rule exists for.

/** Fields the KPI builders read. Every app row/view satisfies it structurally. */
export interface AppletKpiLike {
  status?: string;
  published_to_web?: boolean | null;
  total_executions?: number | null;
  unique_users_count?: number | null;
  success_rate?: number | null;
  total_cost?: number | null;
  last_execution_at?: string | null;
}

export type AppletKpis = Record<string, string | number>;

/**
 * The entity stat strip as `/applets/manage/[id]` renders it — the numbers the user
 * carried in from Overview into Run / Code / Versions / Settings.
 * Mirrors `AppletOverviewContent`'s StatChip row.
 */
export function appletKpis(
  app: AppletKpiLike,
  rate: number | null,
  unit: CostUnit = currentCostUnit(),
): AppletKpis {
  const kpis: AppletKpis = {
    runs: formatNumber(app.total_executions),
    success: formatPercentFromFraction(app.success_rate),
  };
  if (app.unique_users_count != null) {
    kpis.users = formatNumber(app.unique_users_count);
  }
  // A MEASURED zero cost is information and belongs on the strip; only an
  // UNMEASURED cost is omitted. The old `> 0` test hid a real free run and
  // (with the `?? 0` twin below) turned an unknown one into "$0.00".
  if (isKnownNumber(app.total_cost)) {
    kpis.cost = formatCost(app.total_cost, { rate, unit });
  }
  if (app.status) kpis.status = app.status;
  if (app.published_to_web != null) {
    kpis.published_to_web = publishedToWebLabel(app.published_to_web);
  }
  return kpis;
}

/**
 * The Analytics card as the ADMIN edit page renders it, verbatim — including
 * its own `toLocaleString` / 0-dp percent formatting. Cost is in the viewer's
 * unit (points unless a system admin flipped the switch).
 */
export function appletAdminKpis(
  app: AppletKpiLike,
  rate: number | null,
  unit: CostUnit = currentCostUnit(),
): AppletKpis {
  return {
    runs: formatCount(app.total_executions),
    users: formatCount(app.unique_users_count),
    success: formatPercentFromFraction(app.success_rate),
    cost: formatCost(app.total_cost, { rate, unit }),
  };
}

/** Render a KPI map the way the strip reads on screen: "runs: 1.2k · success: 98%". */
export function kpiLine(kpis: AppletKpis): string {
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
export interface AppletFieldDraft {
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
export interface AppletSaveBlocker {
  field: string;
  label: string;
  /** Verbatim — the same string the toast/inline error renders. */
  message: string;
}

const draftIsDirty = (draft: AppletFieldDraft) => draft.live !== draft.saved;

const showValue = (value: string) => (value === "" ? "(empty)" : value);

/** "Tagline: "old" → "new"" — the unsaved diff, one line per changed field. */
function draftDiffLines(drafts: AppletFieldDraft[]): string[] {
  return drafts
    .filter(draftIsDirty)
    .map(
      (draft) =>
        `${draft.label}: ${showValue(draft.saved)} → ${showValue(draft.live)}`,
    );
}

function draftData(drafts: AppletFieldDraft[]) {
  return drafts.map((draft) => ({
    field: draft.field,
    label: draft.label,
    live_value: draft.live,
    saved_value: draft.saved,
    unsaved: draftIsDirty(draft),
  }));
}

// ── /applets/manage/[id]/settings ──────────────────────────────────────────────

/**
 * The Settings tab exactly as rendered. `drafts` are the per-field staged
 * inputs (Name / Tagline / Description / the three rate limits) that show a
 * Save button when dirty; `committed` are the controls that write straight
 * through on change (category, tags, agent binding, shell, branding, status,
 * published to the web, hierarchy) so their rendered value IS the saved value.
 */
export interface AppletSettingsView {
  app: AppSummaryLike & AppletKpiLike;
  /** The SUBSCRIBED points rate (`useCostDisplay().rate`) so the cost KPI fills in when it lands. */
  rate: number | null;
  /** Which tab is open — the slice of the form the user is actually in. */
  activeTab: string;
  drafts: AppletFieldDraft[];
  /** Field currently saving, if any (its Save button shows a spinner). */
  savingField: string | null;
  /** Validation that will reject the pending save, with verbatim messages. */
  saveBlockers: AppletSaveBlocker[];
  /** Controls with no staging step — rendered value equals saved value. */
  committed: Record<string, unknown>;
  publicUrl: string;
}

export function appletSettingsHuman(view: AppletSettingsView): string {
  const kpis = appletKpis(view.app, view.rate);
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

export function appletSettingsAgentPayload(
  view: AppletSettingsView,
): AgentPayloadInput {
  const kpis = appletKpis(view.app, view.rate);
  const unsaved = view.drafts.filter(draftIsDirty);
  return {
    kind: "applet-settings-form",
    location: `AI Matrx — Applet — ${view.app.name} — Settings`,
    description:
      "The applet Settings form as the user sees it right now: the open tab, the LIVE values in every staged input (which may differ from the saved row), an explicit unsaved-changes diff, any save-blocking validation, and the controls that save on change.",
    data: {
      app: {
        id: view.app.id,
        name: view.app.name,
        slug: view.app.slug,
        status: view.app.status,
        published_to_web: view.app.published_to_web ?? null,
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
    summary: appletSettingsHuman(view),
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

// ── /administration/applets/edit/[id] ────────────────────────────

/**
 * The admin edit page as rendered. Its Metadata / Analytics / Timestamps cards
 * read the fetched row directly — there is no draft layer at page level, so
 * those values honestly ARE the saved values. The draft layers live in the
 * metadata modal and the rate-limit editor, whose own copy controls carry
 * their live state; this view records whether either is currently open so the
 * agent knows an unsaved edit may exist beside these numbers.
 */
export interface AppletAdminEditView {
  app: AppSummaryLike & AppletKpiLike;
  /** The SUBSCRIBED points rate (`useCostDisplay().rate`) so the cost KPI fills in when it lands. */
  rate: number | null;
  activeTab: string;
  metadataModalOpen: boolean;
  metadata: Record<string, unknown>;
  moderation: Record<string, unknown>;
  timestamps: Record<string, string>;
}

export function appletAdminEditHuman(view: AppletAdminEditView): string {
  const kpis = appletAdminKpis(view.app, view.rate);
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
    `Editing ${view.app.name} [${view.app.status}] — /applets/${view.app.slug}`,
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

export function appletAdminEditAgentPayload(
  view: AppletAdminEditView,
): AgentPayloadInput {
  const kpis = appletAdminKpis(view.app, view.rate);
  return {
    kind: "applet-admin-edit",
    location: "AI Matrx Admin — Applets — Edit",
    description:
      "The admin applet edit page as the user sees it: the Analytics KPI card, the Metadata / Admin Moderation / Timestamps cards, and which tab is open. Page-level fields render the saved row directly; the metadata dialog and rate-limit editor own the draft layers and carry their own live-state copy controls.",
    data: {
      app: {
        id: view.app.id,
        name: view.app.name,
        slug: view.app.slug,
        status: view.app.status,
        published_to_web: view.app.published_to_web ?? null,
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
    summary: appletAdminEditHuman(view),
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

// ── The "Edit name / tagline" dialog (UpdateAppletModal) ─────────────────

/**
 * The metadata dialog's LIVE draft. `error` is the red `text-destructive`
 * sentence the dialog renders after a failed save — the highest-value content
 * on the surface, captured verbatim.
 */
export interface AppletMetadataFormView {
  app: AppSummaryLike & AppletKpiLike;
  drafts: AppletFieldDraft[];
  saving: boolean;
  /** Verbatim rendered error text, or null when none is shown. */
  error: string | null;
  /** KPI strip of the page the dialog is open on top of. */
  kpis: AppletKpis;
}

export function appletMetadataFormHuman(
  view: AppletMetadataFormView,
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

export function appletMetadataFormAgentPayload(
  view: AppletMetadataFormView,
): AgentPayloadInput {
  const unsaved = draftDiffLines(view.drafts);
  return {
    kind: "applet-metadata-form",
    location: "AI Matrx Admin — Applets — Edit — Metadata dialog",
    description:
      "The applet metadata dialog exactly as rendered: the LIVE values in the Name / Tagline / Description / Status inputs, the unsaved diff against the saved record, and the verbatim error text if a save just failed.",
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
    summary: appletMetadataFormHuman(view),
    attributes: {
      ...view.kpis,
      id: view.app.id,
      slug: view.app.slug,
      unsaved_changes: unsaved.length,
      has_error: view.error !== null,
    },
  };
}

// ── The inline rate-limit editor (AppletAdminActions) ────────────────────

export interface AppletRateLimitFormView {
  app: AppSummaryLike & AppletKpiLike;
  /** True while the inline editor is open; its inputs are then a draft layer. */
  editing: boolean;
  drafts: AppletFieldDraft[];
  kpis: AppletKpis;
}

export function appletRateLimitHuman(
  view: AppletRateLimitFormView,
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

export function appletRateLimitAgentPayload(
  view: AppletRateLimitFormView,
): AgentPayloadInput {
  const unsaved = view.editing ? draftDiffLines(view.drafts) : [];
  return {
    kind: "applet-rate-limits",
    location: "AI Matrx Admin — Applets — Edit — Rate limits",
    description:
      "The applet rate-limit controls as rendered: the LIVE input values while the editor is open (with an unsaved diff against the saved record), or the saved values when it is closed.",
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
    summary: appletRateLimitHuman(view),
    attributes: {
      ...view.kpis,
      id: view.app.id,
      slug: view.app.slug,
      editing: view.editing,
      unsaved_changes: unsaved.length,
    },
  };
}
