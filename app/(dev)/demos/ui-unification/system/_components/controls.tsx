"use client";

import { useState } from "react";
import { TapTargetButtonGroup } from "@ai-matrx/tap-target";
import { ArrowDownUpTapButton, LayoutGridTapButton, ListTapButton } from "@ai-matrx/tap-target/buttons";
import { Search } from "lucide-react";
import { MeasuredBare, UnifiedToolbar } from "../../_components/one-control";
import { Group, Section, Segmented, UcSelect } from "./kit";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="px-[3px] text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const FULL = { width: "calc(100% - var(--matrx-tap-gap))" } as const;

function SystemForm() {
  const [owner, setOwner] = useState("ana");
  const [visibility, setVisibility] = useState<"private" | "team" | "org">("team");
  return (
    <form className="flex w-full max-w-md flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
      <Field label="Project name">
        <label className="uc-field" style={FULL}>
          <input defaultValue="Launch plan" aria-label="Project name" />
        </label>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Owner">
          <UcSelect
            label="Owner"
            value={owner}
            onChange={setOwner}
            width="calc(100% - var(--matrx-tap-gap))"
            options={[
              { value: "ana", label: "Ana Ruiz" },
              { value: "ben", label: "Ben Ortiz" },
              { value: "dana", label: "Dana Reyes" },
            ]}
          />
        </Field>
        <Field label="Due">
          <label className="uc-field" style={FULL}>
            <input type="date" defaultValue="2026-10-30" aria-label="Due" />
          </label>
        </Field>
      </div>
      <Field label="Visible to">
        <div className="uc-row">
          <Segmented
            label="Visible to"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "private", label: "Only me" },
              { value: "team", label: "Team" },
              { value: "org", label: "Organization" },
            ]}
          />
        </div>
      </Field>
      <MeasuredBare>
        <span className="flex-1" />
        <button type="button" className="uc-btn uc-btn-quiet">
          Cancel
        </button>
        <button type="submit" className="uc-btn uc-btn-primary">
          Save
        </button>
      </MeasuredBare>
    </form>
  );
}

function FilterBar() {
  const [lane, setLane] = useState<"all" | "mine" | "shared">("all");
  const [status, setStatus] = useState("any");
  const [view, setView] = useState<"list" | "grid">("list");
  return (
    <MeasuredBare className="uc-row rounded-lg border border-border bg-card px-[3px] py-[3px]">
        <Segmented
          label="Access"
          value={lane}
          onChange={setLane}
          options={[
            { value: "all", label: "All" },
            { value: "mine", label: "Mine" },
            { value: "shared", label: "Shared" },
          ]}
        />
        <UcSelect
          label="Status"
          value={status}
          onChange={setStatus}
          width="7rem"
          options={[
            { value: "any", label: "Any status" },
            { value: "live", label: "Live" },
            { value: "draft", label: "Draft" },
            { value: "failed", label: "Failed" },
          ]}
        />
        <label className="uc-field" style={{ width: "10rem" }}>
          <Search aria-hidden />
          <input placeholder="Filter" aria-label="Filter" />
        </label>
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
