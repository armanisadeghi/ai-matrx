"use client";

import { use } from "react";
import { ShortcutDirectResolver } from "@/features/agent-shortcuts/components/ShortcutDirectResolver";

export default function UserShortcutDirectPage({
  params,
}: {
  params: Promise<{ shortcutId: string }>;
}) {
  const { shortcutId } = use(params);

  return (
    <div className="h-full overflow-hidden">
      <ShortcutDirectResolver shortcutId={shortcutId} mode="user" />
    </div>
  );
}
