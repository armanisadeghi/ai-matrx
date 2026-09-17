// app/(core)/masterwork/[id]/sources/kept/[sourceKey]/page.tsx
//
// ONE kept source, in full — the words themselves.
//
// `?rule=<rule_id>` is THE JUMP: a rule links here and its own verbatim quotes
// are lit up and scrolled to. The param is in the URL rather than in component
// state so the jump is linkable and survives a reload, which is what makes
// "show me where this rule came from" something a person can send to somebody
// else.

"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";
import { KeptSourcePanel } from "@/features/masterwork/kept-sources/KeptSourcePanel";

export default function KeptSourceRoute({
  params,
}: {
  params: Promise<{ id: string; sourceKey: string }>;
}) {
  const { id, sourceKey } = use(params);
  const ruleId = useSearchParams().get("rule");
  return (
    <RulebookLaneRoute rulebookId={id} lane="sources" title="Kept material">
      {({ rulebook }) => (
        <KeptSourcePanel
          rulebookId={id}
          sourceKey={decodeURIComponent(sourceKey)}
          rules={rulebook.rules ?? []}
          highlightRuleId={ruleId}
        />
      )}
    </RulebookLaneRoute>
  );
}
