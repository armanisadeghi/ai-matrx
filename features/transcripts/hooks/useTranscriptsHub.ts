"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type {
  HubSectionId,
  TranscriptHubItem,
} from "@/features/transcripts/types/hub";
import {
  fetchCleanupHubPage,
  fetchProcessorHubPage,
  fetchSessionHubPage,
  fetchUnsortedHubPage,
} from "@/features/transcripts/service/transcriptsHubService";

type SectionState = {
  items: TranscriptHubItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  initialized: boolean;
};

const EMPTY_SECTION: SectionState = {
  items: [],
  page: -1,
  hasMore: true,
  loading: false,
  error: null,
  initialized: false,
};

function initialSections(): Record<HubSectionId, SectionState> {
  return {
    processor: { ...EMPTY_SECTION },
    session: { ...EMPTY_SECTION },
    cleanup: { ...EMPTY_SECTION },
    unsorted: { ...EMPTY_SECTION },
  };
}

export function useTranscriptsHub() {
  const userId = useAppSelector(selectUserId);
  const [sections, setSections] =
    useState<Record<HubSectionId, SectionState>>(initialSections);

  const loadPage = useCallback(
    async (sectionId: HubSectionId, page: number, append: boolean) => {
      setSections((prev) => ({
        ...prev,
        [sectionId]: {
          ...prev[sectionId],
          loading: true,
          error: null,
        },
      }));

      try {
        let result;
        switch (sectionId) {
          case "processor":
            result = await fetchProcessorHubPage(page);
            break;
          case "session":
            result = await fetchSessionHubPage(page);
            break;
          case "cleanup":
            result = await fetchCleanupHubPage(page);
            break;
          case "unsorted":
            if (!userId) {
              result = { items: [], hasMore: false };
              break;
            }
            result = await fetchUnsortedHubPage(userId, page);
            break;
        }

        setSections((prev) => {
          const prior = prev[sectionId];
          const merged = append
            ? [...prior.items, ...result.items]
            : result.items;
          return {
            ...prev,
            [sectionId]: {
              items: merged,
              page,
              hasMore: result.hasMore,
              loading: false,
              error: null,
              initialized: true,
            },
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load items";
        setSections((prev) => ({
          ...prev,
          [sectionId]: {
            ...prev[sectionId],
            loading: false,
            error: message,
            hasMore: false,
            initialized: true,
          },
        }));
      }
    },
    [userId],
  );

  const loadMore = useCallback(
    (sectionId: HubSectionId) => {
      const section = sections[sectionId];
      if (section.loading || !section.hasMore) return;
      void loadPage(sectionId, section.page + 1, true);
    },
    [sections, loadPage],
  );

  const refreshSection = useCallback(
    (sectionId: HubSectionId) => {
      void loadPage(sectionId, 0, false);
    },
    [loadPage],
  );

  useEffect(() => {
    if (!userId) return;
    const ids: HubSectionId[] = ["processor", "session", "cleanup", "unsorted"];
    for (const id of ids) {
      void loadPage(id, 0, false);
    }
  }, [loadPage, userId]);

  return { sections, loadMore, refreshSection };
}
