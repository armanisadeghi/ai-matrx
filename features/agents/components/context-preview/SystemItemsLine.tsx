/**
 * THE "System items" line of the context compare (lane CONTEXT-VALUES-NAMED).
 *
 * A System (platform) context item reaches an agent only when something names
 * it: the agent's own bindings, the platform's default list, or an explicit
 * pick. The server reports which were named, by what, and which side delivered
 * each (`compare.system_items`); this line shows that, and how many unnamed
 * items were held back — never evaluated, never fed.
 */

import type { components } from "@/types/python-generated/api-types";

type SystemItems = components["schemas"]["ContextSystemItems"];

export function SystemItemsLine({ items }: { items?: SystemItems | null }) {
  if (!items) return null;
  const named = items.named ?? [];
  const withheld = items.withheld ?? [];
  return (
    <div className="mt-1.5 text-xs" data-compare-system-items={named.length}>
      <p className="font-medium text-foreground">System items</p>
      {named.length === 0 ? (
        <p className="text-muted-foreground">None delivered — nothing named one.</p>
      ) : (
        <ul className="mt-0.5 space-y-0.5">
          {named.map((n) => (
            <li
              key={n.context_item_id ?? n.key ?? ""}
              className="text-muted-foreground"
              data-system-item={n.key ?? ""}
            >
              <span className="font-mono text-foreground">{n.key}</span>
              {" — named by "}
              {(n.named_by ?? []).join(", ")}
              {" · "}
              {n.old && n.new ? "both sides" : n.old ? "current system only" : "record store only"}
            </li>
          ))}
        </ul>
      )}
      {withheld.length > 0 ? (
        <p className="mt-0.5 text-muted-foreground" data-system-items-withheld={withheld.length}>
          {withheld.length} unnamed System item{withheld.length === 1 ? " was" : "s were"} not fed
          and not evaluated: {withheld.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
