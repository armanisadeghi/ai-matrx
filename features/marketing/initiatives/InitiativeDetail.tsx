"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { Skeleton } from "@ai-matrx/design-system";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { getInitiative } from "./service";
import { InitiativeEditorDialog } from "./InitiativeEditorDialog";
import type { Initiative } from "./types";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export function InitiativeDetail({ id }: { id: string }) {
  const [row, setRow] = useState<Initiative | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let live = true;
    setLoadError(null);
    getInitiative(id)
      .then((value) => {
        if (live) setRow(value);
      })
      // 🚨 "Initiative not found" used to be a GUESS (2026-08-30). There was no
      // catch at all, so a permission refusal or a network blip rejected the
      // promise, left `row` null, and told the owner their own initiative does
      // not exist. The sibling change-tracking surface already learned this
      // ("the platform can tell the difference"); this one never did.
      .catch((error: unknown) => {
        if (live) setLoadError(error);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id]);
  if (loading)
    // Back + a name-sized placeholder while the initiative loads, so the
    // header is in the server HTML.
    return (
      <>
        <RouteHeader
          left={
            <>
              <ChevronLeftTapButton href="/marketing/initiatives" ariaLabel="Back to initiatives" />
              <Skeleton aria-label="Loading" className="ml-1 h-4 w-32 rounded" />
            </>
          }
        />
        <LoadingSurface label="Loading initiative…" />
      </>
    );
  if (loadError || !row)
    return (
      <AccessGate
        token="marketing_initiative"
        id={id}
        error={loadError}
        onRetry={() => window.location.reload()}
        fallbackHref="/marketing/initiatives"
        fallbackLabel="Back to initiatives"
        renderFault={(error) => (
          <QueryError error={error} onRetry={() => window.location.reload()} />
        )}
      />
    );
  const budget =
    row.budget_amount == null
      ? "No budget set"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: row.budget_currency || "USD",
        }).format(row.budget_amount);
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/marketing/initiatives" ariaLabel="Back to initiatives" />
            <h1 className="truncate text-sm font-semibold">{row.name}</h1>
          </>
        }
        right={
          <>
            <ShareButton
              resourceType="marketing_initiative"
              resourceId={row.id}
              resourceName={row.name}
              size="sm"
              showStatus={false}
            />
            <Button icon={<Pencil />} variant="primary" onClick={() => setEditing(true)} aria-label="Edit">
              Edit
            </Button>
          </>
        }
      />
      <main className="h-full overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold">{row.name}</h2>
                {row.description && (
                  <p className="mt-2 text-muted-foreground">
                    {row.description}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="capitalize">
                  {row.status}
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  {row.objective}
                </Badge>
              </div>
            </div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Brand">
              {row.brand_id ? (
                <EntityRef token="web_brand" id={row.brand_id} />
              ) : (
                "Across all brands"
              )}
            </Info>
            <Info label="Goal">{row.goal || "No goal written yet"}</Info>
            <Info label="Timeline">
              {formatDate(row.starts_on)} – {formatDate(row.ends_on)}
            </Info>
            <Info label="Budget">{budget}</Info>
          </div>
        </div>
      </main>
      <InitiativeEditorDialog
        open={editing}
        onOpenChange={setEditing}
        organizationId={row.organization_id}
        initiative={row}
        onSaved={setRow}
      />
    </>
  );
}
function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}
function formatDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "Open";
}
