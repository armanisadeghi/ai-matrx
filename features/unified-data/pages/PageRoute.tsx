"use client";

// features/unified-data/pages/PageRoute.tsx — v6 lane 11, wave D: ONE PAGE BUILT FROM TABLES.
//
// /data/pages/<id> opens a page; /data/pages/new?table=<id> makes one on that table (its
// starter: the table's records and a record panel) and replaces the address with the new page's.
// The page's organization is the store's answer (`custom.where_id_opens` — for a new page, the
// table's), never the active organization. The screen itself is records-ui's `PageScreen`, mounted
// through the same host every record-store surface binds (`MakeMount`: share, members, references,
// files).

import { useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { Button } from "@ai-matrx/design-system/controls";
import { PageScreen } from "@ai-matrx/records-ui";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useRecordsDataSource } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { MakeMount } from "@/features/make/MakeMount";
import { useStartPage } from "@/features/start/useStartPage";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const PAGES_HOME = "/data/pages";

export function PageRoute({ pageId }: { pageId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const userId = useAppSelector(selectUserId);
  const dataSource = useRecordsDataSource();
  const making = pageId === "new";
  const tableId = making ? search.get("table") : null;
  const where = useObjectOrganization(dataSource, making ? tableId : pageId);
  const back = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(PAGES_HOME);
  }, [router]);

  const header = ({ name, actions }: { name: string; actions: ReactNode }) => (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton onClick={back} ariaLabel="Back" />
          <span className="truncate px-1.5 text-sm font-medium text-foreground">{name}</span>
        </>
      }
      right={
        <>
          {making ? null : <MakeStartPage pageId={pageId} />}
          {actions}
        </>
      }
    />
  );
  const fallbackHeader = (
    <RouteHeader
      fallback
      left={
        <>
          <ChevronLeftTapButton onClick={back} ariaLabel="Back" />
          <span className="truncate px-1.5 text-sm font-medium text-foreground">Page</span>
        </>
      }
    />
  );

  let body: ReactNode;
  if (!userId || where.state === "resolving") {
    body = <OrganizationContextNotice state="resolving" what="Pages" />;
  } else if (making && !tableId) {
    body = <p className="text-sm text-muted-foreground">Open a table to make a page on it.</p>;
  } else if (where.state === "not-given") {
    // A page and a table are both records of the store (token `record`).
    body = (
      <AccessGate
        token="record"
        id={(making ? tableId : pageId) ?? ""}
        onRetry={where.retry}
        fallbackHref={PAGES_HOME}
        fallbackLabel="Back to pages"
      />
    );
  } else if (where.state === "unavailable") {
    body = <p className="text-sm text-destructive">{where.why}<ErrorAlchemyMenu error={where.why} /></p>;
  } else {
    body = (
      <MakeMount organizationId={where.organizationId}>
        <PageScreen
          {...(making ? { newOnTable: tableId } : { pageId })}
          viewerUserId={userId}
          startEditing={search.get("edit") === "1"}
          onCreated={(id) => router.replace(`/data/pages/${id}?edit=1`)}
          onArchived={() => router.push(PAGES_HOME)}
          header={header}
        />
      </MakeMount>
    );
  }

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      {fallbackHeader}
      <div className="h-full overflow-y-auto px-3 pb-6 pt-2">{body}</div>
    </div>
  );
}

/** "Make start page": this page becomes the person's /start (v7 APPS-ON-DATA item 3). */
function MakeStartPage({ pageId }: { pageId: string }) {
  const start = useStartPage();
  if (start.pageId === pageId) {
    return (
      <Button variant="quiet" asChild>
        <Link href="/start">Your start page</Link>
      </Button>
    );
  }
  return (
    <Button variant="quiet" disabled={start.loading} onClick={() => void start.choose(pageId)}>
      Make start page
    </Button>
  );
}
