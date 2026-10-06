"use client";

/**
 * States: every region loads on its own with a skeleton shaped like what it
 * will show; a spinner appears only inside a busy control. Empty and error
 * share one shape: tinted icon disc, 13px title, one line, a 28px button.
 */

import { useState } from "react";
import { Skeleton } from "@ai-matrx/design-system";
import { CircleAlert, Loader2, Plus, RotateCw } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";
import { EmptyCombined } from "../../_components/round2";
import { Group, ROWS, STATUS, Section } from "./kit";
import { Badge, Button, ControlRow, SegmentedControl } from "@ai-matrx/design-system/controls";

type RegionState = "loaded" | "loading" | "empty" | "error";

function ErrorState({ size }: { size: "inline" | "block" }) {
  const block = size === "block";
  return (
    <div role="alert" className={cn("flex flex-col items-center text-center", block ? "gap-2 py-8" : "gap-1.5 py-4")}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-destructive/10 text-destructive-ink",
          block ? "size-10" : "size-8",
        )}
      >
        <CircleAlert className={block ? "size-5" : "size-4"} aria-hidden />
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-center text-[0.8125rem] font-semibold">
          Couldn&apos;t load projects
          <ErrorAlchemyMenu />
        </div>
        <div className="text-xs text-muted-foreground">The server didn&apos;t answer in time.</div>
      </div>
      <Button variant="outline" className="mt-1">
        <RotateCw aria-hidden /> Try again
      </Button>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading projects">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex min-h-9 items-center gap-2 px-3 py-1.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-[1.125rem] w-12 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function Region({ state }: { state: RegionState }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-h-9 items-center gap-2 border-b border-border pl-3 pr-[3px]">
        {state === "loading" ? (
          <Skeleton className="h-3.5 w-20" />
        ) : (
          <span className="text-[0.8125rem] font-semibold">Projects</span>
        )}
        <span className="flex-1" />
        <Button variant="outline">
          <Plus aria-hidden /> New
        </Button>
      </div>
      {state === "loading" && <RowsSkeleton />}
      {state === "empty" && <EmptyCombined size="inline" />}
      {state === "error" && <ErrorState size="inline" />}
      {state === "loaded" && (
        <ul className="divide-y divide-border">
          {ROWS.slice(0, 3).map((r) => (
            <li key={r.id} className="flex min-h-9 items-center gap-2 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8125rem] font-medium leading-4">{r.name}</div>
                <div className="truncate text-[0.6875rem] leading-4 text-muted-foreground">{r.owner}</div>
              </div>
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function States() {
  const [state, setState] = useState<RegionState>("loading");
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    window.setTimeout(() => setSaving(false), 1600);
  };
  return (
    <Section id="states" title="States">
      <Group label="One region, four states">
        <ControlRow>
          <SegmentedControl
            aria-label="Region state"
            value={state}
            onValueChange={setState}
            data={[
              { value: "loaded", label: "Loaded" },
              { value: "loading", label: "Loading" },
              { value: "empty", label: "Empty" },
              { value: "error", label: "Error" },
            ]}
          />
        </ControlRow>
        <div className="max-w-xl">
          <Region state={state} />
        </div>
      </Group>
      <div className="grid gap-6 md:grid-cols-2">
        <Group label="Empty · block">
          <div className="rounded-lg border border-border bg-card">
            <EmptyCombined size="block" />
          </div>
        </Group>
        <Group label="Error · block">
          <div className="rounded-lg border border-border bg-card">
            <ErrorState size="block" />
          </div>
        </Group>
      </div>
      <Group label="Busy control · the only place a spinner goes">
        <ControlRow>
          <Button variant="primary" onClick={save} disabled={saving} aria-busy={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {saving ? "Saving" : "Save"}
          </Button>
          <Button variant="outline" disabled>
            <Loader2 className="animate-spin" aria-hidden /> Exporting
          </Button>
        </ControlRow>
      </Group>
    </Section>
  );
}
