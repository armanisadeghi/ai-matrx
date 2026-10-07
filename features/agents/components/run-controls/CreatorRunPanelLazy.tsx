"use client";
// The creator panel enters chat's run column through the CreatorRunPanel slot; loaded on demand
// (admin-gated, heavy), exactly as chat's own next/lazy wrapper loaded it before B1.
import dynamic from "next/dynamic";

const LazyCreatorRunPanel = dynamic(
  () => import("./CreatorRunPanel").then((m) => ({ default: m.CreatorRunPanel })),
  { ssr: false, loading: () => null },
);

/** The slot's shape: chat names the conversations and surface; the tab subset is the builder's own. */
export function CreatorRunPanelLazy({
  tabs: _tabs,
  ...props
}: {
  conversationId: string;
  displayConversationId?: string;
  surfaceKey: string;
  tabs?: string[];
}) {
  return <LazyCreatorRunPanel {...props} />;
}
