"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { getInitiative } from "./service";
import { InitiativeEditorDialog } from "./InitiativeEditorDialog";
import type { Initiative } from "./types";

export function InitiativeDetail({ id }: { id: string }) {
  const [row, setRow] = useState<Initiative | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let live = true;
    getInitiative(id)
      .then((value) => {
        if (live) setRow(value);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id]);
  if (loading) return <LoadingSurface label="Loading initiative…" />;
  if (!row)
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <h1 className="font-semibold">Initiative not found</h1>
          <Button asChild variant="link">
            <Link href="/marketing/initiatives">Back to initiatives</Link>
          </Button>
        </div>
      </div>
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
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link
              href="/marketing/initiatives"
              aria-label="Back to initiatives"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="truncate text-sm font-semibold">{row.name}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ShareButton
            resourceType="marketing_initiative"
            resourceId={row.id}
            resourceName={row.name}
            size="sm"
            showStatus={false}
          />
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </PageHeader>
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
