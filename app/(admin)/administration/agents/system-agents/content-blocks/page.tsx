"use client";

import React from "react";
import { ContentBlocksManager } from "@/components/admin/ContentBlocksManager";

// ONE canonical block editor (skill.render_definition) — the same manager the
// /administration/utilities/content-blocks page renders.
export default function AdminContentBlocksPage() {
  return (
    <div className="h-full w-full overflow-auto">
      <ContentBlocksManager />
    </div>
  );
}
