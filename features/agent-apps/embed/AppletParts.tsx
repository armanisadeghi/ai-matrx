"use client";

// features/agent-apps/embed/AppletParts.tsx — WHAT AN APPLET MAY PLACE INSIDE ITSELF.
//
// v7 APPS-ON-DATA item 3 (Arman's endgame, 2026-10-02: applets nest, and mix a person's own data with
// platform features). An applet's code imports these from "@/applets" (allowed-imports.ts):
//   <DataPage id="<page id>" />   a page built from tables, read and written as the VIEWER
//   <Applet id="<app id>" />      another applet, drawn in place by the one app renderer
// Data reach is the viewer's own: the page reads through the store's doors under her session, so an
// applet sees nothing she could not open herself.

import { PageScreen } from "@ai-matrx/records-ui";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useRecordsDataSource } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { MakeMount } from "@/features/make/MakeMount";
import AppletInPage from "./AppletInPage";

export function DataPage({ id }: { id: string }) {
  const userId = useAppSelector(selectUserId);
  const dataSource = useRecordsDataSource();
  const where = useObjectOrganization(dataSource, id);
  if (!userId) return <p className="text-xs text-muted-foreground">Sign in to see this page.</p>;
  if (where.state === "resolving") return <p className="text-xs text-muted-foreground">Opening the page…</p>;
  if (where.state === "not-given") return <p className="text-xs text-muted-foreground">This page has not been shared with you.</p>;
  if (where.state === "unavailable") return <p className="text-xs text-destructive">{where.why}</p>;
  return (
    <MakeMount organizationId={where.organizationId}>
      <PageScreen pageId={id} viewerUserId={userId} />
    </MakeMount>
  );
}

export function Applet({ id }: { id: string }) {
  return <AppletInPage appId={id} />;
}
