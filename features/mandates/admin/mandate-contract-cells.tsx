"use client";

/**
 * Contract-driven Inputs / Output cells, shared by the console table and the
 * drawer's facts panel.
 *
 * THE PROMISE RULE (Arman, 2026-08-14): a mandate's I/O display renders the
 * CONTRACT — the required variables in, and the output promise out (a
 * registered kind, or the required output keys). "text" with no explanation
 * is banned: an unspecified output is a visible amber gap, never a neutral
 * value, because nobody trusts a mandate with "text" — it's a blog post, a
 * verdict, a classification IN text, and the mandate should say which.
 */

import { Badge } from "@/components/ui/badge";
import type { MandateRow } from "./mandate-health";

const KIND_REGISTRY_BASE = "/administration/utilities/kind-registry";
const CONTRACT_BADGE_CLASS =
  "h-auto min-h-5 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] px-1.5 py-0.5 text-left text-[10px] leading-tight";

/**
 * The mandate's declared inputs as chips, plus the ever-present free-text
 * channel.
 *
 * 🚨 THE PROVISION IS THE INPUT DECLARATION (Wave 1C, 2026-08-22). This cell
 * read ONLY `requiredVariables`, which is exactly the field a mandate with a
 * Provision no longer has: `enforced_holder_contract` STRIPS
 * `required_variables` once a provision is declared, because the Provision
 * replaced it. So the better a mandate's input side got, the more confidently
 * this cell announced "user text only" — 2026-08-29 that was 74 mandates, and
 * every one of them was a lie about a real, declared, typed offer.
 *
 * `offeredValues` is the Provision's offer, passed by whoever loaded it
 * (fetchProvisions). Precedence is provision-first, because a mandate that has
 * one has nothing else. When a mandate names a provision whose offer has not
 * loaded yet we say so and name the key — never "user text only", which would
 * be the same lie with a shorter render path.
 */
export function MandateInputsCell({
  row,
  maxChips = 4,
  offeredValues,
}: {
  row: MandateRow;
  maxChips?: number;
  /** The offered value names of `row.provisionKey`, when they have loaded. */
  offeredValues?: readonly string[];
}) {
  const fromProvision = Boolean(row.provisionKey);
  const variables =
    fromProvision && offeredValues ? [...offeredValues] : row.requiredVariables;

  if (variables.length === 0) {
    if (fromProvision) {
      // Has an input declaration; we just do not hold its values yet.
      return (
        <span
          className="text-xs text-muted-foreground"
          title={`Inputs are declared by the Provision "${row.provisionKey}" — open the mandate to see every offered value.`}
        >
          <span className="font-mono text-[10px]">{row.provisionKey}</span>
        </span>
      );
    }
    return (
      <span
        className="text-xs text-muted-foreground"
        title="This mandate declares no required variables and no Provision — it runs on the user's message alone."
      >
        user text only
      </span>
    );
  }
  const shown = variables.slice(0, maxChips);
  const hidden = variables.length - shown.length;
  const label = fromProvision
    ? `Offered by ${row.provisionKey}: ${variables.join(", ")} — a mandate consumes what it needs; user text rides every run on top.`
    : `Required variables: ${variables.join(", ")} — plus optional user text on every run.`;
  return (
    <div className="flex flex-wrap items-center gap-1" title={label}>
      {shown.map((name) => (
        <Badge
          key={name}
          variant="outline"
          className={`${CONTRACT_BADGE_CLASS} font-mono`}
        >
          {name}
        </Badge>
      ))}
      {hidden > 0 && (
        <span className="text-[10px] text-muted-foreground">+{hidden}</span>
      )}
      <span className="text-[10px] text-muted-foreground">+ user text</span>
    </div>
  );
}

/** The output promise: a registered kind (a door), the required output keys,
 * or a loud amber gap — never a bare "text". */
export function MandateOutputCell({
  row,
  maxChips = 4,
}: {
  row: MandateRow;
  maxChips?: number;
}) {
  const kind = row.mandate.output_kind;
  if (kind) {
    return (
      <a
        href={`${KIND_REGISTRY_BASE}/${kind}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Registered content kind "${kind}" — open its definition`}
        className="inline-flex max-w-full"
      >
        <Badge
          variant="secondary"
          className={`${CONTRACT_BADGE_CLASS} font-mono hover:bg-secondary/80 hover:text-secondary-foreground`}
        >
          {kind}
        </Badge>
      </a>
    );
  }
  const keys = row.requiredOutputKeys;
  if (keys.length > 0) {
    const shown = keys.slice(0, maxChips);
    const hidden = keys.length - shown.length;
    return (
      <div
        className="flex flex-wrap items-center gap-1"
        title={`No registered kind, but the contract requires these output keys: ${keys.join(", ")}.`}
      >
        {shown.map((key) => (
          <Badge
            key={key}
            variant="outline"
            className={`${CONTRACT_BADGE_CLASS} font-mono`}
          >
            {key}
          </Badge>
        ))}
        {hidden > 0 && (
          <span className="text-[10px] text-muted-foreground">+{hidden}</span>
        )}
      </div>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`${CONTRACT_BADGE_CLASS} border-amber-500/40 bg-amber-500/10 text-amber-600`}
      title="This mandate promises nothing about its output — no registered kind and no required output keys. That is a contract gap: consumers can't know what they'll get."
    >
      unspecified
    </Badge>
  );
}
