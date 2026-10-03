"use client";

// features/window-panels/detail/DetailCustomFieldsSection.tsx
//
// The Detail host's ONE custom-fields binding (lane 7 STANDARD-TABLES W5): `@ai-matrx/detail` renders
// `customFields.Section` after Fields on every record with an entity token — window, docked panel,
// the /detail page and the record peek canvas tab. The section reads the row's organization itself.
// A token whose table takes no custom fields shows nothing (the Detail body's "absent, never empty").

import { EntityCustomFields } from "@/features/unified-data/components/EntityCustomFields";

export function DetailCustomFieldsSection({ token, id }: { token: string; id: string }) {
  return <EntityCustomFields entityToken={token} recordId={id} absentWhenNotApplicable />;
}
