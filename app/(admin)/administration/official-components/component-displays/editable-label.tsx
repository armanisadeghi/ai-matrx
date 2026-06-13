"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { EditableLabel } from "@/components/official/item/EditableLabel";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

const code = `import { EditableLabel } from "@/components/official/item/EditableLabel";

// Click to edit (header titles)
<EditableLabel value={title} onCommit={setTitle} />

// Double-click to edit (rows where single click selects)
<EditableLabel value={title} activation="doubleClick" onCommit={setTitle} />

// Await mode (spinner until the save resolves; stays open on failure)
<EditableLabel value={title} commitMode="await" onCommit={saveAsync} />

// Validation blocks the commit
<EditableLabel value={title} onCommit={setTitle}
  validate={(next) => next.length < 3 ? "Too short" : null} />`;

export default function EditableLabelDisplay({ component }: ComponentDisplayProps) {
  const [click, setClick] = useState("Click me to rename");
  const [dbl, setDbl] = useState("Double-click me to rename");
  const [awaited, setAwaited] = useState("Save takes ~1.2s (await mode)");
  const [validated, setValidated] = useState("Min 3 characters");

  if (!component) return null;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Inline rename-in-place. Enter or blur commits, Esc cancels, whitespace-only falls back. Three activation modes (click / double-click / controlled), optional async 'await' mode and validation."
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 p-8">
        <Field label="activation: click (default)">
          <EditableLabel value={click} onCommit={setClick} displayClassName="text-sm font-medium" />
        </Field>
        <Field label="activation: doubleClick">
          <EditableLabel value={dbl} activation="doubleClick" onCommit={setDbl} displayClassName="text-sm font-medium" />
        </Field>
        <Field label="commitMode: await">
          <EditableLabel
            value={awaited}
            commitMode="await"
            onCommit={(next) =>
              new Promise<void>((resolve) => {
                setTimeout(() => {
                  setAwaited(next);
                  toast.success("Saved");
                  resolve();
                }, 1200);
              })
            }
            displayClassName="text-sm font-medium"
          />
        </Field>
        <Field label="validate: min 3 chars">
          <EditableLabel
            value={validated}
            onCommit={setValidated}
            validate={(next) => (next.trim().length < 3 ? "Must be at least 3 characters" : null)}
            displayClassName="text-sm font-medium"
          />
        </Field>
      </div>
    </ComponentDisplayWrapper>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="rounded-md border border-border bg-card px-2 py-1.5">{children}</div>
    </div>
  );
}
