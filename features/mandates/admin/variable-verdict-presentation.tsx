import {
  PropertyRow,
  StatusToken,
} from "@/components/official/ConfigurationFields";
import { displayLabelForKey } from "@/features/agents/utils/variable-utils";
import type { RebindVariableImpact } from "./rebind-impact";
import type { MandateVariableVerdict } from "./service";

type PresentedVerdict = RebindVariableImpact | MandateVariableVerdict;

const VERDICT_COPY: Record<
  RebindVariableImpact["verdict"] | MandateVariableVerdict["verdict"],
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

/** One verdict presentation shared by the rebind guard and the live code-truth
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
    <ul className="space-y-2">
      {visible.map((item) => {
        const fact = presentation(item);
        return (
          <li
            key={`${fact.name}-${item.verdict}-${fact.codeName}`}
            className="min-w-0 rounded border border-border p-2"
          >
            <PropertyRow
              label="Input"
              value={displayLabelForKey(fact.codeName)}
            />
            <PropertyRow
              label="Target"
              value={
                fact.suggestedMapping
                  ? displayLabelForKey(fact.suggestedMapping)
                  : displayLabelForKey(fact.name)
              }
            />
            <PropertyRow
              label="Preliminary flow check"
              value={
                <StatusToken
                  status={
                    fact.blocking || fact.copy.tone === "bad"
                      ? "error"
                      : fact.copy.tone === "warn"
                        ? "caution"
                        : "ok"
                  }
                  label={fact.copy.label}
                />
              }
              help={fact.message ?? undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}
