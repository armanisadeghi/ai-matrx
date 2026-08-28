"use client";

/**
 * ResearchPanel — the product-research artifact, human-correctable:
 * identity (confirmed product OR the candidate set), description,
 * marketplaces, channel pricing, the weight-ranked price factors, unknowns
 * (each convertible into a HITL question), and sources.
 */

import React from "react";
import { CircleHelp, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type {
  PriceFactor,
  ResearchCandidate,
  ResearchResult,
} from "../../pipeline-types";
import {
  CommitField,
  CommitTextArea,
  EditableRows,
  PanelSection,
  SelectField,
} from "./panel-primitives";

const WEIGHTS = [1, 2, 3, 4, 5].map((w) => ({
  value: String(w),
  label: `${w}`,
}));

export function ResearchPanel({
  research,
  onEdit,
  onMakeQuestion,
}: {
  research: Partial<ResearchResult>;
  onEdit: (patch: Partial<ResearchResult>) => void;
  onMakeQuestion: (prompt: string, context?: string) => Promise<void>;
}) {
  const identity = research.identity ?? { confirmed: false };
  const marketplaces = research.marketplaces ?? [];
  const pricing = research.pricing ?? [];
  const priceFactors = research.priceFactors ?? [];
  const unknowns = research.unknowns ?? [];
  const sources = research.sources ?? [];

  return (
    <PanelSection title="Product research">
      {/* Identity */}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Identity</p>
          <SelectField
            value={identity.confirmed ? "confirmed" : "candidates"}
            options={[
              { value: "confirmed", label: "Confirmed" },
              { value: "candidates", label: "Candidate set" },
            ]}
            onChange={(v) =>
              onEdit({
                identity: { ...identity, confirmed: v === "confirmed" },
              })
            }
            className="h-8 w-40"
          />
        </div>
        {identity.confirmed ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <CommitField
              label="Name"
              value={identity.product?.name ?? ""}
              onCommit={(v) =>
                onEdit({
                  identity: {
                    ...identity,
                    product: { ...identity.product, name: v },
                  },
                })
              }
            />
            <CommitField
              label="Brand"
              value={identity.product?.brand ?? ""}
              onCommit={(v) =>
                onEdit({
                  identity: {
                    ...identity,
                    product: {
                      ...(identity.product ?? { name: "" }),
                      brand: v,
                    },
                  },
                })
              }
            />
            <CommitField
              label="Model"
              value={identity.product?.model ?? ""}
              onCommit={(v) =>
                onEdit({
                  identity: {
                    ...identity,
                    product: {
                      ...(identity.product ?? { name: "" }),
                      model: v,
                    },
                  },
                })
              }
            />
            <CommitField
              label="Part #"
              value={identity.product?.partNumber ?? ""}
              onCommit={(v) =>
                onEdit({
                  identity: {
                    ...identity,
                    product: {
                      ...(identity.product ?? { name: "" }),
                      partNumber: v,
                    },
                  },
                })
              }
            />
          </div>
        ) : (
          <EditableRows
            rows={identity.candidates ?? []}
            onChange={(rows) =>
              onEdit({ identity: { ...identity, candidates: rows } })
            }
            empty="No candidates yet — an acceptable outcome is a valid candidate set."
            addLabel="Add candidate"
            makeNew={(): ResearchCandidate => ({ name: "" })}
            render={(row, update) => (
              <div className="grid grid-cols-[1fr_10rem_1fr] gap-2">
                <CommitField
                  value={row.name}
                  placeholder="Candidate product"
                  onCommit={(v) => update({ ...row, name: v })}
                />
                <CommitField
                  value={row.partNumber ?? ""}
                  placeholder="Part #"
                  onCommit={(v) => update({ ...row, partNumber: v })}
                />
                <CommitField
                  value={row.note ?? ""}
                  placeholder="How to tell"
                  onCommit={(v) => update({ ...row, note: v })}
                />
              </div>
            )}
          />
        )}
      </div>

      <CommitTextArea
        label="Product description"
        value={research.description ?? ""}
        placeholder="Core details that drive where and how to list…"
        onCommit={(v) => onEdit({ description: v })}
        rows={3}
      />

      {/* Price factors — the hints that guide everything downstream */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Price factors (weight 5 = deciding factor)
        </p>
        <EditableRows
          rows={priceFactors}
          onChange={(rows) => onEdit({ priceFactors: rows })}
          empty="No factors yet."
          addLabel="Add factor"
          makeNew={() =>
            ({ factor: "", weight: 3, kind: "product_specific" }) as PriceFactor
          }
          render={(row, update) => (
            <div className="grid grid-cols-[1fr_4.5rem_9rem_1fr] items-center gap-2">
              <CommitField
                value={row.factor}
                placeholder="Memory capacity, exact part #…"
                onCommit={(v) => update({ ...row, factor: v })}
              />
              <SelectField
                value={String(row.weight)}
                options={WEIGHTS}
                onChange={(v) =>
                  update({ ...row, weight: Number(v) as PriceFactor["weight"] })
                }
                className={cn(
                  row.weight >= 4 && "border-warning text-warning",
                )}
              />
              <SelectField
                value={row.kind}
                options={[
                  { value: "generic", label: "Generic" },
                  { value: "product_specific", label: "Product-specific" },
                ]}
                onChange={(v) => update({ ...row, kind: v as never })}
              />
              <CommitField
                value={row.note ?? ""}
                placeholder="Note"
                onCommit={(v) => update({ ...row, note: v })}
              />
            </div>
          )}
        />
      </div>

      {/* Pricing */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Pricing by channel
        </p>
        <EditableRows
          rows={pricing}
          onChange={(rows) => onEdit({ pricing: rows })}
          empty="No pricing gathered yet."
          addLabel="Add channel"
          makeNew={(): NonNullable<ResearchResult["pricing"]>[number] => ({
            channel: "",
            currency: "USD",
          })}
          render={(row, update) => (
            <div className="grid grid-cols-[10rem_6rem_6rem_1fr] gap-2">
              <CommitField
                value={row.channel}
                placeholder="eBay sold, Amazon…"
                onCommit={(v) => update({ ...row, channel: v })}
              />
              <CommitField
                type="number"
                value={row.priceLow != null ? String(row.priceLow) : ""}
                placeholder="Low"
                onCommit={(v) =>
                  update({ ...row, priceLow: v ? Number(v) : undefined })
                }
              />
              <CommitField
                type="number"
                value={row.priceHigh != null ? String(row.priceHigh) : ""}
                placeholder="High"
                onCommit={(v) =>
                  update({ ...row, priceHigh: v ? Number(v) : undefined })
                }
              />
              <CommitField
                value={row.note ?? ""}
                placeholder="Sell-through, condition assumptions…"
                onCommit={(v) => update({ ...row, note: v })}
              />
            </div>
          )}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Marketplaces */}
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Marketplaces
          </p>
          <EditableRows
            rows={marketplaces}
            onChange={(rows) => onEdit({ marketplaces: rows })}
            empty="None identified."
            addLabel="Add marketplace"
            makeNew={() => ({ name: "", relevance: "primary" as const })}
            render={(row, update) => (
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <CommitField
                  value={row.name}
                  placeholder="eBay, Amazon, Walmart…"
                  onCommit={(v) => update({ ...row, name: v })}
                />
                <SelectField
                  value={row.relevance}
                  options={[
                    { value: "primary", label: "Primary" },
                    { value: "secondary", label: "Secondary" },
                  ]}
                  onChange={(v) => update({ ...row, relevance: v as never })}
                />
              </div>
            )}
          />
        </div>
        {/* Sources */}
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Sources
          </p>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sources recorded.</p>
          ) : (
            <ul className="space-y-1">
              {sources.map((sourceEntry, i) => (
                <li key={i} className="flex items-center gap-1.5 text-sm">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {sourceEntry.url ? (
                    <a
                      href={sourceEntry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-primary hover:underline"
                    >
                      {sourceEntry.label || sourceEntry.url}
                    </a>
                  ) : (
                    <span className="truncate">{sourceEntry.label}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Unknowns → questions */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Unknown — needs human confirmation
        </p>
        <EditableRows
          rows={unknowns}
          onChange={(rows) => onEdit({ unknowns: rows })}
          empty="Nothing outstanding."
          addLabel="Add unknown"
          makeNew={(): NonNullable<ResearchResult["unknowns"]>[number] => ({
            question: "",
            blocking: false,
          })}
          render={(row, update) => (
            <div className="flex items-center gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-[1fr_7rem] gap-2">
                <CommitField
                  value={row.question}
                  placeholder="What needs confirming?"
                  onCommit={(v) => update({ ...row, question: v })}
                />
                <SelectField
                  value={row.blocking ? "blocking" : "nice"}
                  options={[
                    { value: "blocking", label: "Blocking" },
                    { value: "nice", label: "Nice to know" },
                  ]}
                  onChange={(v) =>
                    update({ ...row, blocking: v === "blocking" })
                  }
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                disabled={!row.question.trim()}
                onClick={() => void onMakeQuestion(row.question, row.why)}
              >
                <CircleHelp className="mr-1 h-3.5 w-3.5" />
                Ask
              </Button>
            </div>
          )}
        />
      </div>
    </PanelSection>
  );
}
