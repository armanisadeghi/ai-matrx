"use client";

import { useState } from "react";
import { TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import { ArrowDownUpTapButton, LayoutGridTapButton, ListTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { MeasuredBare, UnifiedToolbar } from "../../_components/one-control";
import { Group, Section } from "./kit";
import { Button, ControlRow, Field, SearchField, SegmentedControl, Select } from "@ai-matrx/design-system/controls";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="px-[3px] text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const FULL = { width: "calc(100% - var(--matrx-control-gap))" } as const;

function SystemForm() {
  const [owner, setOwner] = useState("ana");
  const [visibility, setVisibility] = useState<"private" | "team" | "org">("team");
  return (
    <form className="flex w-full max-w-md flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
      <FormField label="Project name">
        <Field style={FULL} defaultValue="Launch plan" aria-label="Project name" />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Owner">
          <Select
            aria-label="Owner"
            value={owner}
            onValueChange={setOwner}
            style={{ width: "calc(100% - var(--matrx-control-gap))" }}
            options={[
              { value: "ana", label: "Ana Ruiz" },
              { value: "ben", label: "Ben Ortiz" },
              { value: "dana", label: "Dana Reyes" },
            ]}
          />
        </FormField>
        <FormField label="Due">
          <Field style={FULL} type="date" defaultValue="2026-10-30" aria-label="Due" />
        </FormField>
      </div>
      <FormField label="Visible to">
        <ControlRow>
          <SegmentedControl
            aria-label="Visible to"
            value={visibility}
            onValueChange={setVisibility}
            data={[
              { value: "private", label: "Only me" },
              { value: "team", label: "Team" },
              { value: "org", label: "Organization" },
            ]}
          />
        </ControlRow>
      </FormField>
      <MeasuredBare>
        <span className="flex-1" />
        <Button variant="quiet">
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Save
        </Button>
      </MeasuredBare>
    </form>
  );
}

function FilterBar() {
  const [lane, setLane] = useState<"all" | "mine" | "shared">("all");
  const [status, setStatus] = useState("any");
  const [view, setView] = useState<"list" | "grid">("list");
  return (
    <MeasuredBare className="rounded-lg border border-border bg-card px-[3px] py-[3px]">
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
        <Select
          aria-label="Status"
          value={status}
          onValueChange={setStatus}
          style={{ width: "7rem" }}
          options={[
            { value: "any", label: "Any status" },
            { value: "live", label: "Live" },
            { value: "draft", label: "Draft" },
            { value: "failed", label: "Failed" },
          ]}
        />
        <SearchField style={{ width: "10rem" }} placeholder="Filter" aria-label="Filter" />
        <span className="flex-1" />
        <ArrowDownUpTapButton variant="transparent" ariaLabel="Sort" />
        <TapTargetButtonGroup surface="solid">
          <ListTapButton variant="group" ariaLabel="List view" pressed={view === "list"} onClick={() => setView("list")} />
          <LayoutGridTapButton variant="group" ariaLabel="Grid view" pressed={view === "grid"} onClick={() => setView("grid")} />
        </TapTargetButtonGroup>
    </MeasuredBare>
  );
}

export function Controls() {
  return (
    <Section id="controls" title="Controls">
      <Group label="Toolbar">
        <UnifiedToolbar />
      </Group>
      <Group label="Filter bar">
        <FilterBar />
      </Group>
      <Group label="Form">
        <SystemForm />
      </Group>
    </Section>
  );
}
