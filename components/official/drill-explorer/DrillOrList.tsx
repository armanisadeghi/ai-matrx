"use client";

// components/official/drill-explorer/DrillOrList.tsx — A PAGE'S DRILL-DOWN BESIDE ITS ROW LIST (lane
// DRILL-WAVE2-B). A page whose rows carry actions the explorer does not reproduce (row menus, resolve,
// editing, exports, source filters) keeps its list; the explorer is the page's first screen and the list
// is one control away, in the address (`rows=1`). While the definition is not on this database yet the
// page shows its list with one plain line saying so — never a blank screen and never a broken explorer.

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { pushAppHref } from "@/lib/deployment/navigate";
import { supabase } from "@/utils/supabase/client";

type Presence = "reading" | "present" | "absent";

/** Is this declared definition on the database the app talks to? (`platform.drill_describe` answers or refuses.) */
export function useDrillDefinitionPresent(definition: string, organizationId: string | null = SYSTEM_ORGANIZATION_ID): Presence {
  const [state, setState] = useState<Presence>("reading");
  useEffect(() => {
    let cancelled = false;
    void supabase
      .schema("platform")
      .rpc("drill_describe", { p_organization_id: organizationId, p_source: { kind: "entity", token: definition } })
      .then(({ error }) => {
        if (!cancelled) setState(error ? "absent" : "present");
      });
    return () => {
      cancelled = true;
    };
  }, [definition, organizationId]);
  return state;
}

const switchClass = "underline-offset-2 hover:underline";

export function DrillOrList({
  definition,
  listLabel,
  renderDrill,
  list,
  listParams = [],
  firstScreen = "drill",
  organizationId = SYSTEM_ORGANIZATION_ID,
}: {
  definition: string;
  /** What the list is called on its control ("Request list"). */
  listLabel: string;
  /** The explorer; `extras` is the control that opens the list, for the explorer's header row. */
  renderDrill: (extras: ReactNode) => ReactNode;
  list: ReactNode;
  /** Address parameters that belong to the list (an alarm link's `kind`): while one is present the list opens, not the explorer. */
  listParams?: readonly string[];
  /** Which screen opens first. A page that is mostly editing opens its list and offers the explorer (`drill=1`). */
  firstScreen?: "drill" | "list";
  /** Who the presence check is asked for: the platform organization in admin (default); `null` on a member page, where it means every organization she is in. */
  organizationId?: string | null;
}) {
  const presence = useDrillDefinitionPresent(definition, organizationId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const showList =
    firstScreen === "list" ? params.get("drill") !== "1" : params.get("rows") === "1" || listParams.some((k) => params.has(k));
  const go = (href: string) => pushAppHref(router, href);

  if (presence === "reading") return <div className="p-4"><div className="h-96 animate-pulse rounded-md bg-muted/50" /></div>;

  if (presence === "absent") {
    return (
      <div className="flex h-full min-h-0 flex-col" data-drill-absent={definition}>
        <p className="shrink-0 border-b px-4 py-1.5 text-xs text-muted-foreground">Drill-down is not on this database yet.</p>
        <div className="min-h-0 flex-1">{list}</div>
      </div>
    );
  }

  if (showList && firstScreen === "list") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-1.5 text-xs text-muted-foreground">
          <button type="button" className={switchClass} onClick={() => go(`${pathname}?drill=1`)} data-drill-open="">
            Drill-down
          </button>
        </div>
        <div className="min-h-0 flex-1">{list}</div>
      </div>
    );
  }

  if (showList) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-1.5 text-xs text-muted-foreground">
          <button type="button" className={switchClass} onClick={() => go(pathname)} data-drill-open="">
            Drill-down
          </button>
        </div>
        <div className="min-h-0 flex-1">{list}</div>
      </div>
    );
  }

  return (
    <>
      {renderDrill(
        <button type="button" className={switchClass} onClick={() => go(firstScreen === "list" ? pathname : `${pathname}?rows=1`)} data-drill-list="">
          {listLabel}
        </button>,
      )}
    </>
  );
}
