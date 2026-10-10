"use client";

// features/spaces/data/AutomationsDoor.tsx — THE DOOR to the Automations panel for pages outside Spaces
// (a table's ⋯ → Built on it → Automations). Named in scripts/check-spaces-fence.mjs ENTRY_POINTS.
//
//   <AutomationsDoor tableId={id} organizationId={orgId} fields={fields} />
//
// The panel needs no Spaces store (it reads the records client and the knob scope only), so the door is
// a plain props component behind ONE next/dynamic edge: a page that never opens it loads none of it.
//
// BUILD GRAPH (code-splitting Method B): add no other import here and no second dynamic edge.

import dynamic from "next/dynamic";
import type { Field } from "@ai-matrx/records/react";

const AutomationsPanel = dynamic(() => import("./Automations").then((m) => m.AutomationsPanel), { ssr: false });

export function AutomationsDoor(props: { tableId: string; organizationId: string | null; fields: Field[] }) {
  return <AutomationsPanel {...props} />;
}
