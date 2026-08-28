"use client";

/**
 * ListingPanel — the generated listing, displayed for human approval with
 * last-mile edits. Approving marks the draft approved and moves the item to
 * `listed`; approved listings export as CSV or JSON (publishing via
 * marketplace APIs is future scope, deliberately absent).
 */

import React from "react";
import { CheckCircle2, Download, FileJson } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { PipelineItem } from "../../pipeline-service";
import type { ListingDraft } from "../../pipeline-types";
import {
  CommitField,
  CommitTextArea,
  EditableRows,
  PanelSection,
} from "./panel-primitives";

function downloadBlob(fileName: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function listingToCsv(item: PipelineItem, listing: Partial<ListingDraft>): string {
  const specifics = (listing.itemSpecifics ?? [])
    .map((s) => `${s.name}: ${s.value}`)
    .join("; ");
  const header = [
    "sku",
    "marketplace",
    "title",
    "subtitle",
    "description",
    "bullets",
    "price",
    "currency",
    "condition",
    "category",
    "item_specifics",
  ];
  const row = [
    item.code ?? "",
    listing.marketplace ?? "",
    listing.title ?? "",
    listing.subtitle ?? "",
    listing.description ?? "",
    (listing.bullets ?? []).join(" | "),
    listing.price != null ? String(listing.price) : "",
    listing.currency ?? "USD",
    listing.condition ?? "",
    listing.category ?? "",
    specifics,
  ];
  return `${header.join(",")}\n${row.map(csvEscape).join(",")}`;
}

export function ListingPanel({
  item,
  listing,
  onEdit,
  onApprove,
}: {
  item: PipelineItem;
  listing: Partial<ListingDraft>;
  onEdit: (patch: Partial<ListingDraft>) => void;
  onApprove: () => Promise<void>;
}) {
  const approved = listing.approved === true;
  const baseName = (item.code ?? item.id).replace(/[^A-Za-z0-9_-]+/g, "-");

  return (
    <PanelSection
      title="Listing"
      badge={
        approved ? (
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </span>
        ) : undefined
      }
      actions={
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() =>
              downloadBlob(
                `listing-${baseName}.json`,
                "application/json",
                JSON.stringify({ sku: item.code, ...listing }, null, 2),
              )
            }
          >
            <FileJson className="mr-1 h-3.5 w-3.5" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() =>
              downloadBlob(
                `listing-${baseName}.csv`,
                "text/csv",
                listingToCsv(item, listing),
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            CSV
          </Button>
          {!approved && (
            <Button size="sm" className="h-8" onClick={() => void onApprove()}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Approve
            </Button>
          )}
        </div>
      }
    >
      {Object.keys(listing).length === 0 && (
        <p className="text-sm text-muted-foreground">
          No listing generated yet — the generation agent writes its draft
          here once the item reaches this stage.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_7rem]">
        <CommitField
          label="Title"
          value={listing.title ?? ""}
          onCommit={(v) => onEdit({ title: v })}
        />
        <CommitField
          label="Marketplace"
          value={listing.marketplace ?? ""}
          placeholder="eBay"
          onCommit={(v) => onEdit({ marketplace: v })}
        />
        <CommitField
          label="Price"
          type="number"
          value={listing.price != null ? String(listing.price) : ""}
          onCommit={(v) => onEdit({ price: v ? Number(v) : undefined })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <CommitField
          label="Condition"
          value={listing.condition ?? ""}
          placeholder="Used — very good"
          onCommit={(v) => onEdit({ condition: v })}
        />
        <CommitField
          label="Category"
          value={listing.category ?? ""}
          onCommit={(v) => onEdit({ category: v })}
        />
        <CommitField
          label="Subtitle"
          value={listing.subtitle ?? ""}
          onCommit={(v) => onEdit({ subtitle: v })}
        />
      </div>

      <CommitTextArea
        label="Description"
        value={listing.description ?? ""}
        onCommit={(v) => onEdit({ description: v })}
        rows={6}
      />

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Bullet points
        </p>
        <EditableRows
          rows={(listing.bullets ?? []).map((b) => ({ text: b }))}
          onChange={(rows) => onEdit({ bullets: rows.map((r) => r.text) })}
          empty="No bullets."
          addLabel="Add bullet"
          makeNew={() => ({ text: "" })}
          render={(row, update) => (
            <CommitField
              value={row.text}
              onCommit={(v) => update({ text: v })}
            />
          )}
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Item specifics
        </p>
        <EditableRows
          rows={listing.itemSpecifics ?? []}
          onChange={(rows) => onEdit({ itemSpecifics: rows })}
          empty="No item specifics."
          addLabel="Add specific"
          makeNew={() => ({ name: "", value: "" })}
          render={(row, update) => (
            <div className="grid grid-cols-[12rem_1fr] gap-2">
              <CommitField
                value={row.name}
                placeholder="Brand, MPN, Color…"
                onCommit={(v) => update({ ...row, name: v })}
              />
              <CommitField
                value={row.value}
                onCommit={(v) => update({ ...row, value: v })}
              />
            </div>
          )}
        />
      </div>
    </PanelSection>
  );
}
