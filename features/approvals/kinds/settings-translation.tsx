"use client";

/**
 * `settings_translation` — a settings-translation cell that needs a person:
 * proposed by the drafting agent, probe or ingest, or carrying a conflict or a
 * provider rejection (contract K4, common-docs/projects/settings-translation).
 *
 * 🚨 A VIEW, NEVER A SECOND STORE. The rows are read live from
 * `ai.translation_cell` — the single store of approval truth — exactly as the
 * grid at /administration/ai/ai-models/translations reads them. Nothing is
 * copied into `platform.assists`; approving here replays the grid's own human
 * door (`ai.save_translation_cell`, which stamps the approver), and rejecting
 * archives through `ai.archive_translation_cell`. Missing cells (no rule at
 * all) are not rows here — there is nothing to approve until someone writes
 * one; the grid lists them.
 *
 * Only a platform admin sees these rows: the reader asks the database's own
 * gate (`is_platform_admin`), the same one the doors enforce.
 *
 * MODE 1: a proposed cell is already on the wire (D12 — review never blocks a
 * request); the queue is where a person confirms or replaces it afterwards.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLink from "@/components/navigation/AppLink";
import { useAppDispatch } from "@/lib/redux/hooks";
import { reloadAiCatalog } from "@/features/ai-models/catalogReload";
import {
  archiveTranslationCell,
  isPlatformAdmin,
  readTranslationBundle,
  saveTranslationCell,
} from "@/features/ai-models/translation/data";
import { cellNeedsYou, summarizeRule } from "@/features/ai-models/translation/model";
import type { TranslationBundle, TranslationCellRow } from "@/features/ai-models/translation/types";
import { extractErrorMessage } from "@/utils/errors";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalOutcome,
  ApprovalRowPlace,
  ApprovalSource,
} from "../types";

const KIND_ID = "settings_translation";
const GRID_HREF = "/administration/ai/ai-models/translations";
/** Shared with the grid so a decision here refreshes the grid and the reverse. */
const GRID_QUERY_KEY = ["ai-models", "translation-grid"] as const;

type TranslationItem = ApprovalItem & { cell: TranslationCellRow; reach: number };

function ownerLabel(bundle: TranslationBundle, cell: TranslationCellRow): string {
  if (cell.layer === "api") {
    const api = bundle.apis.find((a) => a.id === cell.layer_owner_id);
    return api?.display_name || api?.name || "an API";
  }
  if (cell.layer === "profile") {
    return bundle.profiles.find((p) => p.id === cell.layer_owner_id)?.name ?? "a settings profile";
  }
  return bundle.offerings.find((o) => o.id === cell.layer_owner_id)?.model_name ?? "one model";
}

function toItem(bundle: TranslationBundle, cell: TranslationCellRow): TranslationItem {
  const reach = bundle.compiled.filter((r) => r.cell_id === cell.id).length;
  const owner = ownerLabel(bundle, cell);
  const why = cell.rejection_fingerprint ? "Rejected" : cell.conflict ? "Conflict" : "Proposed";
  const models = reach === 1 ? "1 model" : `${reach} models`;
  return {
    key: `${KIND_ID}:${cell.id}`,
    kindId: KIND_ID,
    cell,
    reach,
    badge: why,
    mode: "mode_1",
    headline: `${cell.setting_key} on ${owner} — ${summarizeRule(cell.rule)}`,
    acceptEffect: `Approves this rule as it stands for ${models}.`,
    rejectEffect:
      cell.state === "approved"
        ? "Nothing — an approved rule is replaced in the grid, never archived from here."
        : `Archives this rule; the layer below takes over for ${models}.`,
    proposedBy:
      cell.source === "agent" ? "Drafting agent" : cell.source === "probe" ? "Live probe" : cell.source === "ingest" ? "Provider facts" : null,
    proposedAt: cell.updated_at,
    doors: (
      <AppLink
        href={`${GRID_HREF}?tab=needs`}
        className="text-primary underline-offset-2 hover:underline"
      >
        Open in the grid
      </AppLink>
    ),
  };
}

function useSource(): ApprovalSource {
  const admin = useQuery({
    queryKey: ["ai-models", "translation-grid", "is-platform-admin"],
    queryFn: isPlatformAdmin,
    staleTime: 5 * 60_000,
  });
  const read = useQuery({
    queryKey: GRID_QUERY_KEY,
    queryFn: readTranslationBundle,
    enabled: admin.data === true,
    staleTime: 30_000,
  });
  const bundle = read.data?.status === "ready" ? read.data.bundle : null;
  const items = bundle ? bundle.cells.filter(cellNeedsYou).map((c) => toItem(bundle, c)) : [];
  return {
    items,
    total: items.length,
    loading: admin.isLoading || (admin.data === true && read.isLoading),
    error: read.error,
    refetch: () => void read.refetch(),
    moreHref: GRID_HREF,
    moreLabel: "Open the translation grid",
  };
}

function useDecisions(): ApprovalDecisions {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const settle = async (changed: number) => {
    if (changed > 0) await dispatch(reloadAiCatalog());
    void queryClient.invalidateQueries({ queryKey: GRID_QUERY_KEY });
  };
  return {
    acceptItems: async (items, reason) => {
      const outcome: ApprovalOutcome = { applied: 0, failures: [] };
      for (const item of items as TranslationItem[]) {
        try {
          await saveTranslationCell({
            layer: item.cell.layer,
            ownerId: item.cell.layer_owner_id,
            settingKey: item.cell.setting_key,
            rule: item.cell.rule,
            rationale: reason,
          });
          outcome.applied += 1;
        } catch (error) {
          outcome.failures.push({ key: item.key, message: extractErrorMessage(error) });
        }
      }
      await settle(outcome.applied);
      return outcome;
    },
    rejectItems: async (items) => {
      const outcome: ApprovalOutcome = { applied: 0, failures: [] };
      for (const item of items as TranslationItem[]) {
        if (item.cell.state === "approved") {
          outcome.failures.push({
            key: item.key,
            message: "This rule is approved — replace it in the translation grid.",
          });
          continue;
        }
        try {
          await archiveTranslationCell(item.cell.id);
          outcome.applied += 1;
        } catch (error) {
          outcome.failures.push({ key: item.key, message: extractErrorMessage(error) });
        }
      }
      await settle(outcome.applied);
      return outcome;
    },
  };
}

/** This kind reads `ai.translation_cell`, never the assists ledger. */
const RENDERS_NO_LEDGER_ROW = () => false;
const PLACES_NO_LEDGER_ROW = (): ApprovalRowPlace | null => null;

export const settingsTranslationKind: ApprovalKind = {
  id: KIND_ID,
  rendersRow: RENDERS_NO_LEDGER_ROW,
  rowElsewhere: PLACES_NO_LEDGER_ROW,
  label: "Model setting translation",
  accept: {
    label: "Approve",
    keepsReason: true,
    reasonPrompt: "Note (optional)",
  },
  reject: {
    label: "Archive",
    keepsReason: false,
  },
  useSource,
  useDecisions,
};
