"use client";

// features/mandates/browse/useMandateRowActions.tsx
//
// The ONE action list for a mandate row — table kebab, cards, rows, and
// right-click all consume the same builder. Row CLICK opens the mandate
// WINDOW in place (working-surface doctrine: the panel replaces the trip);
// the name cell's anchor and "Open page" carry the dedicated route.

import {
  AppWindow,
  ClipboardCopy,
  Copy,
  ExternalLink,
  Link2,
  UserRound,
} from "lucide-react";
import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@ai-matrx/chat/ui/item-types";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useCopyMandateAgent } from "@/features/mandates/useCopyMandateAgent";
import { mandateRoute, type MandateListRow } from "./types";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { copyToClipboard } from "@/lib/clipboard/copy";

export function useMandateRowActions(
  _list: EntityListController<MandateListRow>,
): EntityRowActionsResult<MandateListRow> {
  const openWindow = useOpenMandateWindow();
  const { copying, copyAndOpen } = useCopyMandateAgent();

  const openRowWindow = (row: MandateListRow) => {
    openWindow({
      initialMandateKey: storedMandateKey(row.mandate_key),
      mandateKeys: [storedMandateKey(row.mandate_key)],
      surfaceName: "matrx-user/agent-mandates-browse",
    });
  };

  const menuFor = (row: MandateListRow) => (): ItemMenuConfig => {
    const href = mandateRoute(row);
    const open: ItemMenuEntry[] = [
      {
        id: "open-window",
        label: "Manage here",
        icon: AppWindow,
        onSelect: () => openRowWindow(row),
      },
      { id: "open-page", label: "Open page", icon: ExternalLink, kind: "link", href },
      {
        id: "open-new-tab",
        label: "Open in new tab",
        icon: ExternalLink,
        kind: "link",
        href,
        target: "_blank",
      },
    ];

    const holder: ItemMenuEntry[] = [];
    if (row.resolved_agent_id) {
      holder.push(
        {
          id: "view-agent",
          label: "View current agent",
          icon: UserRound,
          kind: "link",
          href: `/agents/go/${row.resolved_agent_id}`,
        },
        {
          id: "duplicate-agent",
          label: copying ? "Duplicating…" : "Duplicate & customize",
          icon: Copy,
          disabled: copying,
          onSelect: () => {
            void copyAndOpen({
              defaultAgentId: row.resolved_agent_id,
              defaultAgentVersionId: row.resolved_use_latest
                ? null
                : // The pinned VERSION id isn't on the list row; the fork hook
                  // falls back to the master, which for a floating pin is the
                  // running record. Pin-exact forking lives in the workspace.
                  null,
            });
          },
        },
      );
    }

    return {
      sections: [
        { id: "open", items: open },
        { id: "holder", label: "Current agent", items: holder },
        {
          id: "copy",
          items: [
            {
              id: "copy-link",
              label: "Copy link",
              icon: Link2,
              onSelect: () => {
                void copyToClipboard(`${window.location.origin}${href}`, "Link copied.");
              },
            },
            {
              id: "copy-ai",
              label: "Copy for AI",
              icon: ClipboardCopy,
              onSelect: () => {
                void copyToClipboard(buildRecordReferenceFence({
                      type: "mandate",
                      id: row.mandate_key,
                      label: row.label,
                    }), "Reference copied for AI.");
              },
            },
          ],
        },
      ],
    };
  };

  return {
    actions: {
      menuFor,
      onOpenRow: openRowWindow,
    },
  };
}
