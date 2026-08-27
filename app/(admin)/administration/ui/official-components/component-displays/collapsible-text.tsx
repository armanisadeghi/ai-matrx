"use client";

import { useState } from "react";
import {
  CollapsibleText,
  CollapsibleTextGroupControls,
} from "@/components/official/CollapsibleText";
import { ComponentDisplayWrapper } from "../component-usage";
import type { ComponentEntry } from "../parts/component-list";

const SAMPLE = [
  "Long activity and note bodies stay easy to scan without losing their original line breaks.",
  "The preview shows four lines, then fades naturally into the card background.",
  "Each item can be opened independently.",
  "Group controls can expand or collapse every item in a timeline at once.",
  "Short text is measured and never receives a pointless disclosure control.",
].join("\n\n");

export default function CollapsibleTextDisplay({
  component,
}: {
  component?: ComponentEntry;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!component) return null;

  return (
    <ComponentDisplayWrapper
      component={component}
      description="Measured multiline text that preserves a compact four-line preview with a professional fade and controlled expansion state."
      code={`const [expanded, setExpanded] = useState(false);

<CollapsibleTextGroupControls
  allExpanded={expanded}
  anyExpanded={expanded}
  onExpandAll={() => setExpanded(true)}
  onCollapseAll={() => setExpanded(false)}
/>
<CollapsibleText
  expanded={expanded}
  onExpandedChange={setExpanded}
>
  {body}
</CollapsibleText>`}
    >
      <div className="w-full max-w-xl space-y-2 rounded-md border border-border bg-card p-3">
        <div className="flex justify-end">
          <CollapsibleTextGroupControls
            allExpanded={expanded}
            anyExpanded={expanded}
            onExpandAll={() => setExpanded(true)}
            onCollapseAll={() => setExpanded(false)}
          />
        </div>
        <CollapsibleText
          expanded={expanded}
          onExpandedChange={setExpanded}
          className="text-sm leading-relaxed text-foreground"
        >
          {SAMPLE}
        </CollapsibleText>
      </div>
    </ComponentDisplayWrapper>
  );
}
