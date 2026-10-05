"use client";

// features/start/StartPage.tsx — /start: THIS PERSON'S OWN START PAGE (v7 APPS-ON-DATA item 3).
//
// Arman's endgame (2026-10-02): one custom start page per person, mixing their own data and platform
// features, on the applets system with nested applets. The start page is a Page built from tables (its
// blocks: lists, records, charts, forms… and applets); an applet can hold a page in turn. Any page's
// "Make start page" sets it; /make stays the first step for making things.

import { useMemo } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { Button, EmptyState } from "@ai-matrx/design-system/controls";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { createClient } from "@/utils/supabase/client";
import { DataPage } from "@/features/agent-apps/embed/AppletParts";
import { useStartPage } from "./useStartPage";

export function StartPage() {
  const userId = useAppSelector(selectUserId);
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);
  // org-filter: write-target a changed start-page choice is saved where new things are saved; the read walks every organization
  const active = useOrganizationRequired();
  return (
    <>
      <PageHeader>
        <HeaderStructured back title="Start" />
      </PageHeader>
      <div className="h-full overflow-y-auto px-3 pb-6 pt-[calc(var(--shell-header-h)+0.75rem)]">
        {userId ? (
          // org-filter: write-target a changed start-page choice is saved here; the read walks every organization
          <RecordsMount
            letTheStoreDecideRights
            config={{ dataSource, actor: personActor(userId), organizationId: active.organizationId ?? null }}
            host={{ Link, density: "condensed" }}
          >
            <StartBody />
          </RecordsMount>
        ) : null}
      </div>
    </>
  );
}

function StartBody() {
  const start = useStartPage();
  if (start.loading) return <p className="text-sm text-muted-foreground">Opening your start page…</p>;
  if (start.pageId) return <DataPage id={start.pageId} />;
  return (
    <EmptyState
      icon={<LayoutDashboard className="h-5 w-5" aria-hidden />}
      title="No start page yet"
      line={start.error ? start.error.message : "Open any page and press Make start page."}
      action={
        <Button variant="primary" asChild>
          <Link href="/data/pages">Your pages</Link>
        </Button>
      }
    />
  );
}
