"use client";

/**
 * THE CRM ROW'S ACTIONS — ONE definition of "what you can do to a CRM row",
 * shared by every CRM surface that shows one.
 *
 * Mirrors `features/marketing/seo/keyword/keyword-actions.tsx`: a CRM table
 * adds a right-click menu by calling `useCrmRowMenu(...)` once, handing the
 * pane's `NonEditableContextMenu` its `resolveContextOnOpen` and putting its
 * `section` in `extraSections`. Every surface then offers the same doors, the
 * same readable content and the same entity — never a bespoke per-page menu.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. This module only *describes* a row (its
 * identity, its readable text, its doors). Anything that WRITES (delete,
 * status change, remove-from-list, add-to-outreach-list) stays on the page
 * that already owns that state and rides in as an optional `extraItems`
 * callback — the same delegate shape the keyword module uses.
 *
 * And no fake items: a door that cannot open for the right-clicked row (a
 * member whose party the reader cannot see) is simply absent, never an item
 * that silently no-ops.
 */

import { useState } from "react";

import {
  Copy,
  ExternalLink,
  Globe,
  Hash,
  Link2,
  PhoneCall,
  SquareArrowOutUpRight,
  Users,
} from "lucide-react";

import { toast } from "@/lib/toast";
import { itemMenuConfigToExtraSections } from "@/components/official/item/itemMenuToV3";
import {
  resolveItemMenuConfig,
  type ItemMenuConfigInput,
} from "@/components/official/item/types";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuEntityRef,
  type ContextMenuExtraItem,
  type ContextMenuExtraSection,
  type ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";

// ---------------------------------------------------------------------------
// The one thing every CRM surface can say about a right-clicked row.
// ---------------------------------------------------------------------------

export type CrmMenuTargetKind =
  "party" | "deal" | "outreach-list" | "outreach-member";

export interface CrmMenuTarget {
  kind: CrmMenuTargetKind;
  /** The record's own id (the member row id for `outreach-member`). */
  id: string;
  /** What the row calls itself, exactly as shown. */
  title: string;
  /** The record's door. `null` when this row names nothing openable. */
  href: string | null;
  /** The record as readable text — what Copy as / Export / AI actions carry. */
  lines: string[];
  /** A second door, when the record has one (a list's call queue). */
  secondaryHref?: { href: string; label: string } | null;
  /** The CRM party behind an outreach member, when the reader can see it. */
  partyId?: string | null;
  /** Web domain on a company/person row, when the row carries one. */
  domain?: string | null;
}

/**
 * THE ROW'S OWN ENTITY — what a delegated table menu hands v3 so **Attach To**
 * targets the record that was right-clicked, not the pane. Returned under
 * `CONTEXT_MENU_ENTITY_KEY` by `useCrmRowMenu`'s resolver.
 *
 * No `resourceType`: CRM records are not shareable resources today, so Share
 * correctly stays hidden (an absent item, never a fake one). An outreach
 * MEMBER attaches as the party it points at — the join row is plumbing, and
 * attaching to plumbing is a broken edge — so a member with no readable party
 * returns `null` and Attach hides.
 */
export function crmEntityRef(
  target: CrmMenuTarget | null,
): ContextMenuEntityRef | null {
  if (!target) return null;
  switch (target.kind) {
    case "party":
      return { type: "party", id: target.id, title: target.title };
    case "deal":
      return { type: "crm_deal", id: target.id, title: target.title };
    case "outreach-list":
      return { type: "crm_outreach_list", id: target.id, title: target.title };
    case "outreach-member":
      return target.partyId
        ? { type: "party", id: target.partyId, title: target.title }
        : null;
  }
}

/** The record as readable text — the menu's `content` value. */
export function crmMenuContent(target: CrmMenuTarget | null): string {
  if (!target) return "";
  return [target.title, ...target.lines.filter(Boolean)].join("\n");
}

// ---------------------------------------------------------------------------
// Target builders — one per CRM row shape. Each is a pure description.
// ---------------------------------------------------------------------------

export function partyMenuTarget(row: {
  id: string;
  display_name: string;
  party_kind: string | null;
  job_title?: string | null;
  primary_domain?: string | null;
  do_not_contact?: boolean | null;
  employer?: { display_name: string } | null;
}): CrmMenuTarget {
  const kindLabel = row.party_kind === "person" ? "Person" : "Company";
  return {
    kind: "party",
    id: row.id,
    title: row.display_name,
    href: `/crm/${row.id}`,
    domain: row.primary_domain ?? null,
    lines: [
      kindLabel,
      row.job_title ? `Title: ${row.job_title}` : "",
      row.employer ? `Employer: ${row.employer.display_name}` : "",
      row.primary_domain ? `Domain: ${row.primary_domain}` : "",
      row.do_not_contact ? "Do not contact" : "",
    ],
  };
}

export function dealMenuTarget(
  row: {
    id: string;
    name: string;
    amount?: number | string | null;
    currency?: string | null;
    status?: string | null;
    party?: { id: string; display_name: string } | null;
  },
  stageName?: string | null,
): CrmMenuTarget {
  return {
    kind: "deal",
    id: row.id,
    title: row.name,
    href: `/crm/deals/${row.id}`,
    partyId: row.party?.id ?? null,
    lines: [
      stageName ? `Stage: ${stageName}` : "",
      row.status ? `Status: ${row.status}` : "",
      row.amount != null && row.amount !== ""
        ? `Amount: ${row.amount}${row.currency ? ` ${row.currency}` : ""}`
        : "",
      row.party ? `Party: ${row.party.display_name}` : "",
    ],
  };
}

export function outreachListMenuTarget(row: {
  id: string;
  name: string;
  description?: string | null;
  list_kind?: string | null;
  status?: string | null;
  members?: { count: number }[];
}): CrmMenuTarget {
  const count = row.members?.[0]?.count;
  return {
    kind: "outreach-list",
    id: row.id,
    title: row.name,
    href: `/crm/outreach-lists/${row.id}`,
    secondaryHref: {
      href: `/crm/outreach-lists/${row.id}/dial`,
      label: "Open call queue",
    },
    lines: [
      row.description ?? "",
      row.list_kind ? `Kind: ${row.list_kind}` : "",
      row.status ? `Status: ${row.status}` : "",
      typeof count === "number" ? `Members: ${count.toLocaleString()}` : "",
    ],
  };
}

export function outreachMemberMenuTarget(
  row: {
    id: string;
    status?: string | null;
    notes?: string | null;
    party?: {
      id: string;
      display_name: string;
      party_kind: string | null;
      job_title?: string | null;
      do_not_contact?: boolean | null;
    } | null;
  },
  listName?: string | null,
): CrmMenuTarget {
  const party = row.party;
  return {
    kind: "outreach-member",
    id: row.id,
    title: party?.display_name ?? "Member you cannot see",
    href: party ? `/crm/${party.id}` : null,
    partyId: party?.id ?? null,
    lines: [
      listName ? `List: ${listName}` : "",
      party?.job_title ? `Title: ${party.job_title}` : "",
      row.status ? `Status: ${row.status}` : "",
      row.notes ? `Notes: ${row.notes}` : "",
      party?.do_not_contact ? "Do not contact" : "",
    ],
  };
}

// ---------------------------------------------------------------------------
// The resolver every CRM table hands `resolveContextOnOpen`.
// ---------------------------------------------------------------------------

/**
 * ONE MENU PER PANE. `MatrxDataTable` stamps `data-row-id` on every row, so the
 * pane's single menu reads the right-clicked row off the DOM, records it in
 * state, and answers with that row's content + entity.
 *
 * 🚨 The clicked row lands in STATE, not a ref: `resolveContextOnOpen` fires
 * before `MenuContent` mounts, so the setState re-render is what lets the
 * section's items describe the row that was actually clicked (same mechanism
 * `ItemContextMenu` uses for its lazy configs). A ref would leave the items
 * one right-click stale.
 *
 * Right-clicking the toolbar or empty space resolves to `null` — the menu
 * still opens with the pane's own values (Copy / AI / Export), which is right.
 */
export interface CrmRowMenu {
  /** Hand straight to `NonEditableContextMenu.resolveContextOnOpen`. */
  resolveContextOnOpen: (
    element: HTMLElement | null,
  ) => ResolvedContextMenuContext | null;
  /** Hand straight to `NonEditableContextMenu.extraSections`. */
  sections: ContextMenuExtraSection[];
  /** The row the menu is open on — for a surface that needs it directly. */
  target: CrmMenuTarget | null;
}

export interface CrmRowMenuOptions<T extends { id: string }> {
  /** The rows currently on screen, read at open time (never captured). */
  rows: () => T[];
  toTarget: (row: T) => CrmMenuTarget;
  /** Section heading. Defaults to the record's own noun. */
  label?: string;
  /**
   * The row's EXISTING "…" menu config — the page's own verbs (delete,
   * restore, status change, remove from list). Reused verbatim through
   * `itemMenuConfigToExtraSections`, so the right-click menu and the "…"
   * button can never drift apart and no write path is re-implemented here.
   */
  rowMenu?: (row: T) => ItemMenuConfigInput;
  /** Anything genuinely local to ONE surface (e.g. "Add to outreach list"). */
  extraItems?: (target: CrmMenuTarget) => ContextMenuExtraItem[];
}

const SECTION_LABEL: Record<CrmMenuTargetKind, string> = {
  party: "This CRM record",
  deal: "This deal",
  "outreach-list": "This outreach list",
  "outreach-member": "This member",
};

function copyToClipboard(text: string, done: string) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(done))
    .catch(() => toast.error("Could not copy to the clipboard"));
}

export function useCrmRowMenu<T extends { id: string }>(
  opts: CrmRowMenuOptions<T>,
): CrmRowMenu {
  const [clicked, setClicked] = useState<{
    row: T;
    target: CrmMenuTarget;
  } | null>(null);
  const target = clicked?.target ?? null;

  const resolveContextOnOpen = (element: HTMLElement | null) => {
    const id = element?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const row = id ? opts.rows().find((r) => r.id === id) : undefined;
    const next = row ? opts.toTarget(row) : null;
    setClicked(row && next ? { row, target: next } : null);
    if (!next) return null;
    return {
      content: crmMenuContent(next),
      [CONTEXT_MENU_ENTITY_KEY]: crmEntityRef(next),
    };
  };

  const withTarget = (fn: (t: CrmMenuTarget) => void) => () => {
    if (!target) {
      toast.error("Right-click a row to act on it.");
      return;
    }
    fn(target);
  };

  const items: ContextMenuExtraItem[] = [];

  // THE DOOR LAW: every identity this row names must open.
  if (target?.href) {
    items.push({
      kind: "link",
      id: "crm-open",
      label: "Open",
      icon: ExternalLink,
      href: target.href,
      description: "Open the full record",
    });
    items.push({
      kind: "link",
      id: "crm-open-new-tab",
      label: "Open in a new tab",
      icon: SquareArrowOutUpRight,
      href: target.href,
      target: "_blank",
      description: "Keep this list where it is",
    });
  }
  if (target?.secondaryHref) {
    items.push({
      kind: "link",
      id: "crm-open-secondary",
      label: target.secondaryHref.label,
      icon: PhoneCall,
      href: target.secondaryHref.href,
    });
  }
  // An outreach member is a join row; the person behind it is the record worth
  // opening. When the reader cannot see that person, say so instead of
  // offering a door that leads nowhere.
  if (target?.kind === "outreach-member" && !target.partyId) {
    items.push({
      kind: "item",
      id: "crm-member-no-party",
      label: "This member's record is not visible to you",
      icon: Users,
      description: "Ask the list's owner to share the CRM record",
      disabled: true,
      onSelect: () => undefined,
    });
  }

  items.push({
    kind: "item",
    id: "crm-copy-link",
    label: "Copy link",
    icon: Link2,
    description: "A link straight to this record",
    disabled: !target?.href,
    onSelect: withTarget((t) => {
      if (!t.href) return;
      copyToClipboard(`${window.location.origin}${t.href}`, "Link copied");
    }),
  });
  items.push({
    kind: "item",
    id: "crm-copy-id",
    label: "Copy ID",
    icon: Hash,
    description: "The record's id, for support and search",
    onSelect: withTarget((t) =>
      copyToClipboard(t.partyId ?? t.id, "ID copied"),
    ),
  });
  items.push({
    kind: "item",
    id: "crm-copy-record",
    label: "Copy record as text",
    icon: Copy,
    description: "Everything this row says, ready to paste",
    onSelect: withTarget((t) =>
      copyToClipboard(crmMenuContent(t), "Record copied"),
    ),
  });
  if (target?.domain) {
    const domain = target.domain;
    items.push({
      kind: "link",
      id: "crm-open-domain",
      label: `Open ${domain}`,
      icon: Globe,
      href: domain.startsWith("http") ? domain : `https://${domain}`,
      target: "_blank",
    });
  }

  if (target && opts.extraItems) items.push(...opts.extraItems(target));

  // The row's own verbs, converted from the config its "…" button already
  // uses — one definition, two affordances.
  const rowSections =
    clicked && opts.rowMenu
      ? itemMenuConfigToExtraSections(
          resolveItemMenuConfig(opts.rowMenu(clicked.row)),
        )
      : [];

  return {
    resolveContextOnOpen,
    target,
    sections: [
      {
        id: "crm-row",
        label: opts.label ?? SECTION_LABEL[target?.kind ?? "party"],
        icon: Users,
        anchor: "after-compare",
        items,
      },
      ...rowSections,
    ],
  };
}
