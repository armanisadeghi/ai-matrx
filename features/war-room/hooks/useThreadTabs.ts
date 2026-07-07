// features/war-room/hooks/useThreadTabs.ts
//
// DERIVED thread tabs — attachments express intent, so the tab set follows
// the content: every thread shows the core tabs, plus one `entity:${token}`
// tab per attached entity type the core tabs don't already cover (attach a
// dataset → a Datasets tab exists; detach the last one → it disappears).
// No stored tab config, no management UI, zero drift.
//
// `normalizeThreadTab` is the ONE gate every `active_tab` read goes through:
// the column is free text, so legacy/unknown values and `entity:` tabs whose
// token was never registered all collapse to "task" instead of rendering a
// dead view.

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { selectAssignmentTokenSummary } from "../redux/selectors";
import {
  THREAD_CORE_TABS,
  entityTabToken,
  type ThreadCoreTab,
  type ThreadTab,
} from "../types";

/**
 * War-room-vocabulary tokens already surfaced by a core tab — they never get
 * a derived `entity:` tab. `project` rides the task tab (anchor / effective
 * project); `conversation` is the agent tab's domain.
 */
const CORE_COVERED_TOKENS: ReadonlySet<string> = new Set([
  "task",
  "project",
  "note",
  "studio_session",
  // Files ride the Resources tab under BOTH spellings: the legacy war-room
  // alias AND the canonical token (RPC hydration returns edges as `file`, so
  // missing it spawned a confusing duplicate derived "Files" tab).
  "user_file",
  "file",
  "udt_document",
  "conversation",
]);

/** Validate any raw `active_tab` value into a renderable ThreadTab. */
export function normalizeThreadTab(
  raw: string | null | undefined,
): ThreadTab {
  if (!raw) return "task";
  if ((THREAD_CORE_TABS as readonly string[]).includes(raw)) {
    return raw as ThreadCoreTab;
  }
  const token = entityTabToken(raw);
  if (token && tryGetEntityInfo(token)) return `entity:${token}`;
  return "task";
}

/**
 * The thread's live tab set: core order + one `entity:` tab per uncovered
 * attached token (registry-known only), stable-sorted by token.
 */
export function useThreadTabs(threadId: string | null): ThreadTab[] {
  const summary = useAppSelector(selectAssignmentTokenSummary(threadId));
  const entityTabs = summary
    .filter(
      (s) => !CORE_COVERED_TOKENS.has(s.token) && tryGetEntityInfo(s.token),
    )
    .map((s) => `entity:${s.token}` as const)
    .sort();
  return [...THREAD_CORE_TABS, ...entityTabs];
}
