"use client";

// features/applets/embed/DataPage.tsx — A PAGE BUILT FROM TABLES, DRAWN IN PLACE.
//
// The host half of `@ai-matrx/applets/react`'s `<DataPage id>` (an Applet places a records-ui page — a dashboard
// record whose `presentation.kind` is 'page' — inside itself; the host's `renderDataPage` draws it with this) and
// the start page's own page. This is NOT a Space (a Space is a `content.document` page; lexicon). Nested Applets are the
// package's `<Applet id>`. Data reach is the viewer's own: the page reads through the store's doors under
// her session, so an Applet sees nothing she could not open herself.

import { PageScreen } from "@ai-matrx/records-ui";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useRecordsDataSource } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { MakeMount } from "@/features/make/MakeMount";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function DataPage({ id }: { id: string }) {
  const userId = useAppSelector(selectUserId);
  const dataSource = useRecordsDataSource();
  const where = useObjectOrganization(dataSource, id);
  if (!userId) return <p className="text-xs text-muted-foreground">Sign in to see this page.</p>;
  if (where.state === "resolving") return <p className="text-xs text-muted-foreground">Opening the page…</p>;
  if (where.state === "not-given") return <p className="text-xs text-muted-foreground">This page has not been shared with you.</p>;
  if (where.state === "unavailable") return <p className="text-xs text-destructive">{where.why}<ErrorAlchemyMenu error={where.why} /></p>;
  return (
    <MakeMount organizationId={where.organizationId}>
      <PageScreen pageId={id} viewerUserId={userId} />
    </MakeMount>
  );
}
