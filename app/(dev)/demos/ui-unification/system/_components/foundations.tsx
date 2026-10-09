"use client";

import { useState } from "react";
import { TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import { FilterTapButton, ArrowDownUpTapButton, MoreHorizontalTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MeasuredBare } from "../../_components/one-control";
import { Group, Section } from "./kit";
import { Badge, Button, SearchField, SegmentedControl, Select } from "@ai-matrx/design-system/controls";

const TYPE = [
  { px: 16, cls: "text-base font-semibold", use: "Marketing and dialog titles", sample: "Client onboarding" },
  { px: 13, cls: "text-[0.8125rem] font-semibold", use: "Titles, labels, controls", sample: "Quarterly client report" },
  { px: 12, cls: "text-xs", use: "Secondary text", sample: "Projects group your agents and files" },
  { px: 11, cls: "text-[0.6875rem] text-muted-foreground", use: "Meta", sample: "Updated 2h ago · Ana Ruiz" },
] as const;

const SURFACES = [
  { name: "background", cls: "bg-background" },
  { name: "card", cls: "bg-card" },
  { name: "muted", cls: "bg-muted" },
  { name: "accent", cls: "bg-accent" },
  { name: "border", cls: "bg-border" },
  { name: "primary", cls: "bg-primary" },
  { name: "foreground", cls: "bg-foreground" },
  { name: "muted-fg", cls: "bg-muted-foreground" },
] as const;

const STATUS_ROLES = [
  { tone: "success", label: "Success", swatch: "bg-success" },
  { tone: "warning", label: "Warning", swatch: "bg-warning" },
  { tone: "destructive", label: "Destructive", swatch: "bg-destructive" },
  { tone: "info", label: "Info", swatch: "bg-info" },
  { tone: "neutral", label: "Neutral", swatch: "bg-muted-foreground" },
] as const;

function Swatch({ cls, name }: { cls: string; name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn("size-5 shrink-0 rounded-md border border-border", cls)} aria-hidden />
      <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">{name}</span>
    </div>
  );
}

export function Foundations() {
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [status, setStatus] = useState("open");
  return (
    <Section id="foundations" title="Foundations">
      <Group label="Type · 11 / 12 / 13 / 16">
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {TYPE.map((t) => (
            <div key={t.px} className="flex min-h-9 items-center gap-3 px-3 py-1.5">
              <span className="w-7 shrink-0 font-mono text-[0.6875rem] text-muted-foreground">{t.px}</span>
              <span className={cn("min-w-0 flex-1 truncate text-foreground", t.cls)}>{t.sample}</span>
              <span className="hidden shrink-0 text-[0.6875rem] text-muted-foreground sm:block">{t.use}</span>
            </div>
          ))}
        </div>
      </Group>

      <div className="grid gap-6 md:grid-cols-2">
        <Group label="Surfaces and text">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
            {SURFACES.map((s) => (
              <Swatch key={s.name} cls={s.cls} name={s.name} />
            ))}
          </div>
        </Group>
        <Group label="Status tints">
          <div className="flex flex-col gap-2">
            {STATUS_ROLES.map((s) => (
              <div key={s.tone} className="flex items-center gap-2">
                <span className={cn("size-5 shrink-0 rounded-md", s.swatch)} aria-hidden />
                <span className="w-20 shrink-0 font-mono text-[0.6875rem] text-muted-foreground">{s.tone}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
            ))}
          </div>
        </Group>
      </div>

      <Group label="Radius">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="h-9 w-14 rounded-lg border border-border bg-card" aria-hidden />
            <span className="text-xs text-muted-foreground">8px · cards, panels</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-7 w-14 rounded-full border border-border bg-card" aria-hidden />
            <span className="text-xs text-muted-foreground">Capsule · controls</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-[1.125rem] w-12 rounded-md border border-border bg-muted" aria-hidden />
            <span className="text-xs text-muted-foreground">6px · badges</span>
          </div>
        </div>
      </Group>

      <Group label="The one control · 28px, 3px half-gap each">
        <MeasuredBare>
          <Button variant="primary">
            <Plus aria-hidden /> New
          </Button>
          <Button variant="outline">Export</Button>
          <Button variant="quiet">Cancel</Button>
          <SearchField style={{ width: "9rem" }} placeholder="Search" aria-label="Search" />
          <Select
            aria-label="Status"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
            style={{ width: "6.5rem" }}
          />
          <SegmentedControl
            aria-label="Scope"
            value={scope}
            onValueChange={setScope}
            data={[
              { value: "all", label: "All" },
              { value: "mine", label: "Mine" },
            ]}
          />
          <TapTargetButtonGroup surface="solid">
            <FilterTapButton variant="group" ariaLabel="Filter" />
            <ArrowDownUpTapButton variant="group" ariaLabel="Sort" />
          </TapTargetButtonGroup>
          <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
        </MeasuredBare>
      </Group>
    </Section>
  );
}
