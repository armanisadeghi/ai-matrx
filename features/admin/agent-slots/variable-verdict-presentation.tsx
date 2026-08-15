import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RepinVariableImpact } from "./repin-impact";
import type { SlotVariableVerdict } from "./service";

type PresentedVerdict = RepinVariableImpact | SlotVariableVerdict;

const VERDICT_COPY: Record<
  RepinVariableImpact["verdict"] | SlotVariableVerdict["verdict"],
  { label: string; tone: "bad" | "warn" | "ok" }
> = {
  lost: { label: "stops reaching the agent", tone: "bad" },
  unsupplied_required: { label: "required, nothing supplies it", tone: "bad" },
  rename_candidate: { label: "same value, different name", tone: "warn" },
  default_available: { label: "agent default will be used", tone: "ok" },
  ok: { label: "code and agent agree", tone: "ok" },
  renamed: { label: "mapped from code", tone: "ok" },
  default_used: { label: "agent default used", tone: "ok" },
  intentionally_blank: { label: "intentionally blank", tone: "ok" },
  spilled_to_user_input: { label: "passed as user text", tone: "warn" },
  dropped: { label: "code value is dropped", tone: "warn" },
  missing_from_code: { label: "required value missing from code", tone: "bad" },
  required_unmapped: { label: "required variable unmapped", tone: "bad" },
  type_mismatch: { label: "types disagree", tone: "warn" },
};

function presentation(item: PresentedVerdict) {
  if ("name" in item) {
    return {
      name: item.name,
      codeName: item.name,
      suggestedMapping: item.suggestedMapping,
      message: null,
      blocking:
        item.verdict === "lost" || item.verdict === "unsupplied_required",
      copy: VERDICT_COPY[item.verdict],
    };
  }
  return {
    name: item.variable,
    codeName: item.code_name ?? item.variable,
    suggestedMapping:
      item.code_name && item.code_name !== item.variable
        ? item.variable
        : undefined,
    message: item.message,
    blocking: item.blocking ?? false,
    copy: VERDICT_COPY[item.verdict],
  };
}

/** One verdict presentation shared by the repin guard and the live code-truth
 * facts. Server messages remain intact; the label only makes the enum human. */
export function VariableVerdictList({
  items,
  hideOk = false,
}: {
  items: PresentedVerdict[];
  hideOk?: boolean;
}) {
  const visible = hideOk
    ? items.filter((item) => item.verdict !== "ok")
    : items;
  if (visible.length === 0) return null;
  return (
    <ul className="space-y-1 rounded border border-border bg-muted/30 p-2">
      {visible.map((item) => {
        const fact = presentation(item);
        return (
          <li
            key={`${fact.name}-${item.verdict}-${fact.codeName}`}
            className="flex flex-wrap items-center gap-1.5 py-0.5"
          >
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              {fact.codeName}
            </code>
            {fact.suggestedMapping && (
              <>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {fact.suggestedMapping}
                </code>
              </>
            )}
            <Badge
              variant={fact.blocking || fact.copy.tone === "bad" ? "destructive" : "outline"}
              className="h-4 px-1 text-[10px]"
            >
              {fact.copy.label}
            </Badge>
            {fact.message && (
              <span className="basis-full text-[11px] text-muted-foreground">
                {fact.message}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
