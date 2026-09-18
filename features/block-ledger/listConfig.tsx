"use client";

// features/block-ledger/listConfig.tsx
//
// THE BLOCK LEDGER as an entity-list surface: /acquisition/blocks.
//
// One register for every failed acquisition anywhere on the platform — the scraper,
// the server browser, the capture ladder, the catalog adapters, the export reader,
// the file readers and the connected accounts all write into it, and this is where a
// person reads it, narrows it and acts on it in bulk.

import { RotateCw, Send } from "lucide-react";
import { toast } from "@/lib/toast";
import type { EntityListConfig } from "@/lib/entity-list/config";
import type { EntityBulkSelection } from "@/lib/entity-list/selection";
import { BLOCK_COLUMNS } from "./columns";
import { blockLedgerService } from "./service";
import { useBlockRowActions } from "./useBlockRowActions";
import { retryBlocks, sendBlocksToOwnBrowser } from "./actions";
import {
  ENGINE_LABELS,
  RUNG_LABELS,
  SOURCE_TYPE_LABELS,
  STATUS_LABELS,
  canGoToYourBrowser,
  isRetryable,
  labelFor,
  type AcquisitionBlock,
} from "./types";

/**
 * 🚨 A BULK ACTION HERE ONLY EVER SEES THE TICKED ROWS.
 *
 * `selectAllMatching` is deliberately OFF. Retrying re-fetches real pages and
 * spends the organization's scraper budget; "everything matching" over a register
 * that can hold thousands is one click from a bill nobody chose
 * (`common-docs/policies/destructive-and-expensive-actions.md`). A person who
 * genuinely wants a hundred can tick a page of a hundred and see the number in the
 * confirm before it runs.
 */
export const BLOCK_LEDGER_LIST_CONFIG: EntityListConfig<AcquisitionBlock> = {
  surfaceKey: "acquisition-blocks",
  entityLabel: { singular: "block", plural: "blocks" },
  sourceFeature: "scraper",
  // A block belongs to an organization, not to a person — everyone in the org
  // should see the same wall. One honest scope beats four tabs that never differ.
  scopes: ["mine"],
  service: blockLedgerService,
  columns: BLOCK_COLUMNS,
  prefsVersion: 1,
  prefsDefaults: { sort: "last_seen_at", direction: "desc", pageSize: 50 },
  getRowId: (row) => row.id,
  getRowName: (row) =>
    row.input_label?.trim() || row.input_ref.replace(/^https?:\/\//, ""),
  useRowActions: useBlockRowActions,
  // No archive axis: a block is resolved or it is not, and `status` already
  // carries that. No deep search: there is no body to search inside.
  supportsArchived: false,
  urlState: true,

  bulkActions: [
    {
      id: "retry",
      label: "Try again",
      icon: RotateCw,
      confirm: (selection: EntityBulkSelection<AcquisitionBlock>) => {
        const retryable = selection.rows.filter(isRetryable);
        const skipped = selection.rows.length - retryable.length;
        return {
          title:
            retryable.length === 1
              ? "Run this page through the ladder again?"
              : `Run ${retryable.length} pages through the ladder again?`,
          description:
            `This really re-fetches ${retryable.length === 1 ? "the page" : "them"} — the scraper first, then our server browser if it can help — and spends this organization's scraping budget to do it. Anything that hits the same wall comes back here with one more occurrence.` +
            (skipped > 0
              ? ` ${skipped === 1 ? "1 block needs" : `${skipped} blocks need`} a decision rather than another attempt, so ${skipped === 1 ? "it will be" : "they will be"} skipped.`
              : ""),
          confirmLabel: "Run it again",
        };
      },
      run: async (selection: EntityBulkSelection<AcquisitionBlock>) => {
        const outcome = await retryBlocks(selection.rows);
        toast.info(outcome.sentence);
        return { message: outcome.sentence, refresh: outcome.refresh };
      },
    },
    {
      id: "send-to-own-browser",
      label: "Send to my browser",
      icon: Send,
      variant: "outline",
      confirm: (selection: EntityBulkSelection<AcquisitionBlock>) => {
        const eligible = selection.rows.filter(canGoToYourBrowser);
        return {
          title:
            eligible.length === 1
              ? "Send this page to your own browser?"
              : `Send ${eligible.length} pages to your own browser?`,
          description:
            eligible.length === 0
              ? "None of these is a page your own browser could read — a browser beats a sign-in, a paywall or a bot wall, not a missing file or a protected book. Nothing will be queued."
              : `Your own Chrome opens ${eligible.length === 1 ? "it" : "them"} with your sessions, unattended, through the Matrx extension. Nothing is typed for you and no credential is ever entered.`,
          confirmLabel: "Send them",
        };
      },
      run: async (selection: EntityBulkSelection<AcquisitionBlock>) => {
        const outcome = await sendBlocksToOwnBrowser(selection.rows);
        toast.info(outcome.sentence);
        return { message: outcome.sentence, refresh: outcome.refresh };
      },
    },
  ],
  bulkSelection: { noun: "block", selectAllMatching: false },

  facetSections: [
    {
      facet: "source_type",
      filterId: "source_type",
      label: "Source",
      noneLabel: "Unknown",
      formatValue: (value) => labelFor(SOURCE_TYPE_LABELS, value),
    },
    {
      facet: "engine",
      filterId: "engine",
      label: "Engine",
      noneLabel: "Unknown",
      formatValue: (value) => labelFor(ENGINE_LABELS, value),
    },
    {
      facet: "rung",
      filterId: "rung",
      label: "Rung reached",
      noneLabel: "Not on the ladder",
      formatValue: (value) => labelFor(RUNG_LABELS, value),
    },
    {
      facet: "status",
      filterId: "status",
      label: "Status",
      noneLabel: "Unknown",
      formatValue: (value) => labelFor(STATUS_LABELS, value),
    },
    {
      facet: "error_class",
      filterId: "error_class",
      label: "What happened",
      noneLabel: "Unknown",
      searchPlaceholder: "Find a kind of wall",
    },
  ],
  noneLabels: {
    source_type: "Unknown",
    engine: "Unknown",
    rung: "Not on the ladder",
    status: "Unknown",
    error_class: "Unknown",
  },

  emptyState: {
    title: "Nothing has been blocked",
    description:
      "Every fetch, file and connected account this organization has tried came back readable. When one does not, it lands here by itself — with the exact words it refused with and what would unblock it.",
  },
};
