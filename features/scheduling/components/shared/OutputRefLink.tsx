// features/scheduling/components/shared/OutputRefLink.tsx
//
// Deep-link to whatever the run produced. `output_ref.kind` IS a canonical
// entity token, so the route comes from the entity registry via `EntityRef` —
// there is no private route table here. Kinds with no registered route
// (`capture`, `workflow_run`: no entity token, and `/scraper/captures/{id}` /
// `/workflows/runs/{id}` are not real routes) render as plain text until the
// registry gains an `hrefFor` for them. A fabricated link that 404s is worse
// than no link.

"use client";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { OutputRef } from "../../types";

interface Props {
  outputRef: OutputRef | null;
}

export function OutputRefLink({ outputRef }: Props) {
  if (!outputRef) return null;

  // This sits inside an expandable run row on the schedule detail page, so
  // opening the output must not cost the user the run history they are reading:
  // `openInNewTab` is a real `target="_blank"` anchor, which also keeps
  // middle-click and cmd-click working — the hand-rolled `window.open` this
  // replaces had neither, and popup blockers can eat it.
  return (
    <EntityRef
      token={outputRef.kind}
      id={outputRef.id}
      name={labelFor(outputRef)}
      alwaysShowActions
      openInNewTab
      className="text-xs text-muted-foreground"
    />
  );
}

function labelFor(ref: OutputRef): string {
  switch (ref.kind) {
    case "conversation":
      return "conversation";
    case "capture":
      return "capture";
    case "workflow_run":
      return "workflow run";
    default:
      return ref.kind;
  }
}
