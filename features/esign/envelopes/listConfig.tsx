"use client";

// features/esign/envelopes/listConfig.tsx — /esign as an entity-list config (lib/entity-list).

import type { EntityListConfig } from "@/lib/entity-list/config";
import { ENVELOPE_COLUMNS } from "./columns";
import { fetchEnvelopeFacets, fetchEnvelopeListPage, fetchEnvelopeScopeCounts } from "./service";
import { useEnvelopeRowActions } from "./useEnvelopeRowActions";
import { ENVELOPE_LIST_SCOPES, envelopeHref, statusLabel, type EnvelopeListRow } from "./types";

export const envelopeListConfig: EntityListConfig<EnvelopeListRow> = {
  surfaceKey: "esign-envelopes-browse",
  registryToken: "esign_envelope",
  entityLabel: { singular: "envelope", plural: "envelopes" },
  sourceFeature: "documents",
  scopes: ENVELOPE_LIST_SCOPES,
  service: {
    fetchPage: fetchEnvelopeListPage,
    fetchCounts: fetchEnvelopeScopeCounts,
    fetchFacets: fetchEnvelopeFacets,
  },
  columns: ENVELOPE_COLUMNS,
  prefsVersion: 2,
  getRowId: (row) => row.id,
  getRowName: (row) => row.title,
  door: { hrefFor: envelopeHref },
  useRowActions: useEnvelopeRowActions,
  facetSections: [],
  copy: {
    label: "Envelope",
    listLabel: "Envelopes",
    location: "/esign",
    rowKind: "envelope",
    listKind: "envelope-list",
    humanRow: (row) =>
      row.status === "draft"
        ? `${row.title} — Draft, created ${row.created_at}`
        : `${row.title} — ${statusLabel(row.status)}, signed ${row.signed_count} of ${row.signer_count}`,
  },
  emptyState: {
    title: "Nothing sent for signature yet",
    description: "Send a PDF and track every signature here.",
  },
};
