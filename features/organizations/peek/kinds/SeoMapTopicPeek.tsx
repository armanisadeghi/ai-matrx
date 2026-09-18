"use client";

/**
 * SeoMapTopicPeek — a quick read of ONE topical-map topic.
 *
 * A peek is handed a platform id; the map reasons in slugs. `seo.map_topic`
 * translates one into the other (`useMapTopicRow`), and everything after that
 * is the SAME `TopicDetailBody` the floating panel and the drawer render — the
 * peek adds a frame, never a second rendering of a topic.
 */

import React from "react";
import { ListTree } from "lucide-react";

import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useMapTopicRow } from "@/features/marketing/seo/topical-map/hooks";
import { TopicDetailBody } from "@/features/marketing/seo/topical-map/panel/TopicDetailBody";

import { PeekDialog } from "../PeekDialog";
import type { PeekProps } from "../types";

export default function SeoMapTopicPeek({ id, open, onClose }: PeekProps) {
  const topic = useMapTopicRow(id, open);

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={topic.data?.name || "Topic"}
      icon={<ListTree className="h-4 w-4 text-muted-foreground" />}
      token="seo_map_topic"
      id={id}
      loading={topic.isPending}
    >
      {topic.isPending ? (
        <SuspenseLoader centered={false} message="Loading this topic…" />
      ) : topic.data ? (
        /* PHASE 0: the body reads the topic out of the topical-map slice, so a
           peek opened over a map whose tree this session has not loaded says so
           in words rather than pretending. Lane D makes the body self-loading;
           this frame does not change when it does. */
        <TopicDetailBody
          mapId={topic.data.map_id}
          slug={topic.data.slug}
          siteId={null}
          host="peek"
          readOnly
        />
      ) : (
        /* Denied, deleted, missing, or a stale session — the gate resolves
           which one and offers the way forward. Never guess. */
        <AccessGate token="seo_map_topic" id={id} />
      )}
    </PeekDialog>
  );
}
