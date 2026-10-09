"use client";

/**
 * Navigation: underline tabs for page sections, a capsule for filters, and
 * the four page-top templates (pending the owner's pick) as compact mocks.
 * Glass appears once, on the full-bleed bar that floats over the canvas.
 */

import { useState, type ReactNode } from "react";
import { TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import {
  ChevronLeftTapButton,
  MaximizeTapButton,
  UndoTapButton,
  RedoTapButton,
} from "@ai-matrx/design-system/tap-target/buttons";
import { Copy, Inbox, ListChecks, Plus, Search, Settings, Shapes, Share2 } from "lucide-react";
import { HeaderSpecimen } from "@/features/shell/components/header/templates/HeaderSpecimen";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { TabsByPurpose } from "../../_components/round2";
import { Group, ROWS, STATUS, Section } from "./kit";
import { Badge, Button, ControlRow, SearchField, SegmentedControl, Select } from "@ai-matrx/design-system/controls";

function Mock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group label={label}>
      <div className="relative h-56 overflow-hidden rounded-lg border border-border bg-background">{children}</div>
    </Group>
  );
}

function MarketingTop() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-10 items-center gap-2 border-b border-border pl-3 pr-[3px]">
        <span className="text-[0.8125rem] font-semibold">AI Matrx</span>
        <span className="flex-1" />
        <span className="hidden px-[3px] text-xs text-muted-foreground sm:inline">Pricing</span>
        <Button variant="quiet">Sign in</Button>
        <Button variant="primary">Start free</Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <div className="text-xl font-semibold tracking-tight">Your expertise, made reliable</div>
        <div className="text-xs text-muted-foreground">Build AI that works the way you do</div>
        <ControlRow className="mt-1 justify-center">
          <Button variant="primary">Start free</Button>
          <Button variant="outline">See how it works</Button>
        </ControlRow>
      </div>
    </div>
  );
}

function ModuleHomeTop() {
  const [lane, setLane] = useState<"all" | "mine" | "shared">("all");
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-10 items-center gap-2 border-b border-border pl-3 pr-[3px]">
        <span className="text-[0.8125rem] font-semibold">Forms</span>
        <span className="text-[0.6875rem] text-muted-foreground">{ROWS.length}</span>
        <span className="flex-1" />
        <Button variant="primary">
          <Plus aria-hidden /> New
        </Button>
      </div>
      <ControlRow className="border-b border-border px-[3px] py-[3px]">
        <SegmentedControl
          aria-label="Access"
          value={lane}
          onValueChange={setLane}
          data={[
            { value: "all", label: "All" },
            { value: "mine", label: "Mine" },
            { value: "shared", label: "Shared" },
          ]}
        />
        <span className="flex-1" />
        <SearchField style={{ width: "8rem" }} placeholder="Search" aria-label="Search forms" />
        <Select
          aria-label="Organization"
          style={{ width: "9.75rem" }}
          value="all"
          onValueChange={() => {}}
          options={[{ value: "all", label: "All organizations" }]}
        />
      </ControlRow>
      <ul className="divide-y divide-border">
        {ROWS.slice(0, 3).map((r) => (
          <li key={r.id} className="flex min-h-9 items-center gap-2 px-3">
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{r.name}</span>
            <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The REAL internal-page template (RecordPageHeader) in a stand-in shell
 *  band — never a mock of it. One line: back, parents, the record (last
 *  crumb), modes, actions. */
function InternalTop() {
  const [mode, setMode] = useState("/forms/r2?view=questions");
  return (
    <div className="flex h-full flex-col">
      <HeaderSpecimen>
        <RecordPageHeader
          backHref="/forms"
          parents={[
            {
              label: "Forms",
              href: "/forms",
              optionsLabel: "Modules",
              options: [
                { label: "Forms", href: "/forms", active: true },
                { label: "Tables", href: "/tables" },
              ],
            },
          ]}
          record={{
            name: "Intake form — dental",
            siblings: ROWS.map((r) => ({ label: r.name, href: `/forms/${r.id}`, active: r.id === "r2" })),
          }}
          modes={[
            { name: "Questions", href: "/forms/r2?view=questions", icon: ListChecks },
            { name: "Responses", href: "/forms/r2?view=responses", icon: Inbox },
            { name: "Settings", href: "/forms/r2?view=settings", icon: Settings },
          ]}
          activeModeHref={mode}
          onModeSelect={setMode}
          actions={[
            { label: "Share", icon: Share2, onPress: () => {} },
            { label: "Duplicate", icon: Copy, onPress: () => {} },
          ]}
        />
      </HeaderSpecimen>
      <div className="flex flex-col gap-2 p-3">
        <div className="h-3 w-3/5 rounded bg-muted" />
        <div className="h-3 w-2/5 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  );
}

function FullBleedTop() {
  return (
    <div className="absolute inset-0" data-matrx-glass-plane="">
      <div
        aria-hidden
        className="absolute inset-0 bg-muted/40"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(var(--muted-foreground) / 0.25) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      <div aria-hidden className="absolute left-[18%] top-[42%] h-12 w-24 rounded-lg border border-border bg-card shadow-sm" />
      <div aria-hidden className="absolute left-[52%] top-[58%] h-12 w-28 rounded-lg border border-border bg-card shadow-sm" />
      <div aria-hidden className="absolute right-[12%] top-[34%] flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
        <Shapes className="size-4" />
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center px-[3px] pt-[3px]">
        <ChevronLeftTapButton ariaLabel="Back" />
        <span className="flex-1" />
        <TapTargetButtonGroup>
          <UndoTapButton variant="group" ariaLabel="Undo" />
          <RedoTapButton variant="group" ariaLabel="Redo" />
        </TapTargetButtonGroup>
        <MaximizeTapButton ariaLabel="Full screen" />
      </div>
    </div>
  );
}

export function Navigation() {
  return (
    <Section id="navigation" title="Navigation">
      <Group label="Section tabs and filter capsule">
        <TabsByPurpose />
      </Group>
      <div className="grid gap-6 md:grid-cols-2">
        <Mock label="Page top · marketing">
          <MarketingTop />
        </Mock>
        <Mock label="Page top · module home (all list)">
          <ModuleHomeTop />
        </Mock>
        <Mock label="Page top · internal page">
          <InternalTop />
        </Mock>
        <Mock label="Page top · full-bleed, glass floats">
          <FullBleedTop />
        </Mock>
      </div>
    </Section>
  );
}
