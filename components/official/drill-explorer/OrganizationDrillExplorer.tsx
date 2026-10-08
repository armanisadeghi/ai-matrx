"use client";

// components/official/drill-explorer/OrganizationDrillExplorer.tsx — A MEMBER PAGE'S DRILL-DOWN OVER A
// DECLARED INVOKER DEFINITION (lane DRILL-WAVE3). The page's rows are decided by the signed-in person's
// own row security, so a member counts her organizations' rows and no one else's. The organization is a
// visible page control (`?org_filter=`, default All organizations) — never the active organization.
// The page keeps its server-paged list (editing, approval, boards); this is the numbers one control away.

import type { ReactNode } from "react";

import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import { DrillOrList } from "@/components/official/drill-explorer/DrillOrList";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";

export interface OrganizationDrillExplorerProps {
  /** The declared definition's key. */
  definition: string;
  title: string;
  rootLabel: string;
  /** The page's own rows, shown first; the explorer is one control away. */
  list: ReactNode;
  /** What the control that returns to the list is called ("Deals"). */
  listLabel: string;
  headline: { measure: string; also?: string[] };
  rowNoun: string;
  countMeasure: string;
  location: string;
  firstQuestion?: MatrxDrillQuestion;
  dataAttribute: string;
}

function ExplorerBody(props: Omit<OrganizationDrillExplorerProps, "list" | "listLabel"> & { extras: ReactNode }) {
  const [orgFilter, setOrgFilter] = useOrgFilterParam([]);
  return (
    <DrillExplorer
      source={{ kind: "entity", token: props.definition }}
      lane="organization"
      // org-fallback-deliberate: a member's explorer asks with no organization — every organization she is in; her row rules decide each row
      organizationId={null}
      title={props.title}
      rootLabel={props.rootLabel}
      {...(props.firstQuestion ? { firstQuestion: props.firstQuestion } : {})}
      headline={props.headline}
      rowNoun={props.rowNoun}
      countMeasure={props.countMeasure}
      location={props.location}
      {...(orgFilter ? { pageWhere: { organization: orgFilter } } : {})}
      headerExtras={
        <>
          <EntityOrgFilter orgId={orgFilter} onChange={setOrgFilter} />
          {props.extras}
        </>
      }
      dataAttributes={{ [props.dataAttribute]: "organization" }}
    />
  );
}

export function OrganizationDrillExplorer({ list, listLabel, ...rest }: OrganizationDrillExplorerProps) {
  return (
    <DrillOrList
      definition={rest.definition}
      listLabel={listLabel}
      firstScreen="list"
      organizationId={null}
      list={list}
      renderDrill={(extras) => <ExplorerBody {...rest} extras={extras} />}
    />
  );
}
