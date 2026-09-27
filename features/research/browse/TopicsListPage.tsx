"use client";

// features/research/browse/TopicsListPage.tsx
//
// /research/topics — every research topic the person can see, on the canonical
// entity-list shell (lib/entity-list). Everything topic-specific lives in
// ./listConfig.tsx; this file is the header and the page's two slots.
//
// Replaces the hand-built card grid (TopicList), which had no sort, no status
// or project filter, no saved view, no right-click menu, no agent surface of
// its own, three different "new topic" buttons, and cut every name and research
// question to two lines inside a quarter-width card.

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListController } from "@/lib/entity-list/config";
import { RESEARCH_TOPIC_LIST_CONFIG } from "./listConfig";
import { RESEARCH_TOPICS_SURFACE } from "./surface";
import type { ResearchTopicListRow } from "./types";

function newTopicHref(name?: string): string {
  const trimmed = name?.trim();
  return trimmed
    ? `/research/topics/new?topic=${encodeURIComponent(trimmed)}`
    : "/research/topics/new";
}

function NewTopicButton({ name }: { name?: string }) {
  const trimmed = name?.trim();
  return (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href={newTopicHref(trimmed)} aria-label="New research topic">
        <Plus className="h-4 w-4" />
        <span className={trimmed ? undefined : "max-sm:sr-only"}>
          {trimmed ? `New topic "${trimmed}"` : "New topic"}
        </span>
      </Link>
    </Button>
  );
}

export function TopicsListPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center justify-between gap-2">
          <h1 className="truncate text-sm font-medium">Research topics</h1>
          {/* THE DOOR LAW — every stage of research (report, condensers,
              coverage audit, tagging, page summaries) is a Mandate the person
              may re-point at their own agent; this is the door to the domain. */}
          <MandateDoorLink feature="research" label="Research agents" />
        </div>
      </PageHeader>
      <EntityListPage
        config={RESEARCH_TOPIC_LIST_CONFIG}
        surface={RESEARCH_TOPICS_SURFACE}
        headerActions={<NewTopicButton />}
        emptyAction={(list: EntityListController<ResearchTopicListRow>) => (
          // A search that found nothing offers to start that topic.
          <NewTopicButton name={list.query.search} />
        )}
      />
    </>
  );
}
