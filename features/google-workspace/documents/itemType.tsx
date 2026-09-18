"use client";

/**
 * Docs Plane A/C — the Linked document's ONE registration.
 *
 * `workbench.google_document` (aidream migration 0766, live 2026-09-17) joins
 * THE item-presentation registry here, so a connected Doc opens in the Detail
 * primitive as a window (the default), a docked panel, or `/detail/google_document/<id>`
 * from this single entry — no bespoke Google document screen anywhere.
 *
 * The registry's generic registration already gives the type its header, its
 * doors, the associations section, the history section and the health strip's
 * producer. This file adds only what is TRUE OF THIS RECORD and nothing else:
 *
 *   * a typed loader over the real table (the generic one is an untyped
 *     `select('*')` for arbitrary tables);
 *   * a curated field list — the generic one would print the whole cached
 *     document as a field (V-16 N5);
 *   * the health strip's REAL SUBJECT: the connector's grant AND this row's own
 *     `sync_status`, because a perfectly healthy Google connection can still be
 *     refusing this one file;
 *   * the body + Append composer, as the record type's own section.
 */

import { FileText } from "lucide-react";

import type { ItemTypeConfig } from "@/features/item-presentation/registry";
import type { EnrichedItem } from "@/features/item-presentation/types";
import type { DetailRecordType, DetailRow, DetailSeed } from "@/lib/detail/types";

import { GoogleDocumentPanel } from "./GoogleDocumentPanel";
import {
  asGoogleDocumentRow,
  googleDocumentDetailRow,
  googleDocumentFields,
  GOOGLE_DOCUMENT_TYPE,
  mimeKindLabel,
  syncStatusOf,
} from "./record";
import { readGoogleDocumentRow, refreshGoogleDocument } from "./service";
import { announceDocumentRefreshed } from "./refreshBus";
import type { GoogleDocumentRow } from "./types";

function titleOf(row: DetailRow | null, seed: DetailSeed | null): string {
  const typed = asGoogleDocumentRow(row);
  return typed?.title?.trim() || seed?.name?.trim() || "Untitled Google file";
}

/**
 * 🚨 THE STRIP TELLS THE TRUTH ABOUT **THIS FILE**, NOT ONLY ABOUT THE ACCOUNT.
 *
 * The generic producer answers from the connector product's health, which is the
 * right answer for "can anything refresh?" — and the wrong answer alone: Google
 * answers 404 or 403 for a single file that was deleted, moved out of our reach
 * or un-shared while every other file on the same grant keeps refreshing. The
 * server records exactly that on the row (`sync_status` = `unavailable` with its
 * reason) and never deletes the record. So when the row says unavailable, the
 * strip says so in the row's own words, whatever the account's health is.
 *
 * It also fills in `onRefresh`, which is the primitive's own Refresh control: the
 * one refresh path for this record, announced on the bus so the body below
 * re-reads instead of the button appearing to do nothing.
 */
function refineHealth(base: DetailRecordType): DetailRecordType["health"] {
  const inner = base.health ?? null;
  return async (row, ctx) => {
    const typed = asGoogleDocumentRow(row);
    const produced = inner ? await inner(row, ctx) : null;
    if (ctx.signal.aborted) return null;
    const refresh = typed
      ? async () => {
          await refreshGoogleDocument({
            fileId: typed.external_id,
            organizationId: typed.organization_id,
          });
          announceDocumentRefreshed(typed.id);
        }
      : null;
    const status = typed ? syncStatusOf(typed) : null;
    if (typed && status === "detached") {
      // 🚨 THE TERMINAL STATE IS NOT A FAILURE, AND IT OFFERS NO CONTROL THAT
      // CANNOT WORK. The person kept this record as AI Matrx data: the grant
      // behind it is fine (so not `blocked`, not `revoked`), a Refresh would be
      // refused by the server with a 409, and a Reconnect repairs nothing. So the
      // strip states the choice and offers neither — a button that cannot work is
      // a control that does nothing (law 4).
      return {
        ...(produced ?? { source: "Google" }),
        source: produced?.source ?? "Google",
        lastRefreshedAt: typed.synced_at,
        grant: "ok",
        grantDetail:
          typed.sync_status_reason?.trim() ||
          "Kept as AI Matrx data: this record no longer refreshes from Google and keeps what it had.",
        openAtSourceHref: typed.external_url,
        onRefresh: null,
        onReconnect: null,
      };
    }
    const unavailable = status !== null ? status !== "available" : false;
    const fileSentence =
      typed && unavailable
        ? typed.sync_status_reason?.trim() ||
          "Google would not give us this file the last time we asked, and did not say why."
        : null;
    if (!produced) {
      // The connector could not be read at all (or does not recognise the row).
      // The record still knows its own state, and silence would be the strip
      // disappearing exactly when it matters most.
      if (!typed) return null;
      return {
        source: "Google",
        lastRefreshedAt: typed.synced_at,
        grant: unavailable ? "unknown" : "ok",
        grantDetail:
          fileSentence ??
          "This file is kept in step with Google; we could not check the connection behind it just now.",
        openAtSourceHref: typed.external_url,
        onRefresh: refresh,
      };
    }
    if (!unavailable) return { ...produced, onRefresh: refresh };
    return {
      ...produced,
      // `unknown` is the vocabulary's honest word for "the grant is not the
      // problem, this file is" — `revoked` would send the person to reconnect
      // something a reconnect cannot repair.
      grant: produced.grant === "ok" ? "unknown" : produced.grant,
      grantDetail: [fileSentence, produced.grantDetail].filter(Boolean).join(" "),
      onRefresh: refresh,
    };
  };
}

/** The refinement the registry hands to `resolveItemDetailType`. */
export function refineGoogleDocumentDetail(base: DetailRecordType): DetailRecordType {
  return {
    ...base,
    load: async (id, signal) => {
      const row: GoogleDocumentRow | null = await readGoogleDocumentRow(id, signal);
      if (!row) return { notFound: true };
      return { row: googleDocumentDetailRow(row) };
    },
    title: titleOf,
    fields: (row) => {
      const typed = asGoogleDocumentRow(row);
      return typed ? googleDocumentFields(typed, new Date()) : [];
    },
    health: refineHealth(base),
    extraSections: (row) => {
      const typed = asGoogleDocumentRow(row);
      if (!typed) return [];
      return [
        {
          id: "google-document",
          label: mimeKindLabel(typed.mime_kind),
          content: <GoogleDocumentPanel initialRow={typed} />,
        },
      ];
    },
  };
}

/**
 * The registry entry. `entityToken` is omitted because the item type and the
 * entity token are the same word — `google_document` is a registered
 * `platform.entity_types` token (migration 0766), which is what gives the record
 * its route, its peek, its associations and its history.
 */
export const GOOGLE_DOCUMENT_ITEM_TYPE: ItemTypeConfig = {
  type: GOOGLE_DOCUMENT_TYPE,
  label: "Google file",
  icon: FileText,
  accent: {
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/20",
  },
  // The card's own read, so an item card an agent emits shows the real title and
  // the real owner instead of the model's guess. Same row, same masking view.
  enrich: async (_client, id): Promise<EnrichedItem> => {
    const row = await readGoogleDocumentRow(id);
    if (!row) return { notFound: true };
    return {
      name: row.title,
      about: row.owner_email ? `Owned by ${row.owner_email} in Google` : mimeKindLabel(row.mime_kind),
      details: [
        { label: "Kind", value: mimeKindLabel(row.mime_kind) },
        {
          label: "In Google",
          value: syncStatusOf(row) === "available" ? "Reachable" : "Not reachable right now",
        },
      ],
    };
  },
  refineDetail: refineGoogleDocumentDetail,
};
