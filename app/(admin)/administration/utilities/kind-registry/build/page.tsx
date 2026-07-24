// Kind Builder — the admin surface that drives the `kind_architect` agent to
// build a whole kind end to end from a data structure (schema, live component,
// skill, content blocks, activation) in one pass. Super-admin gated by the
// (admin) layout. The run itself opens in /chat so tool calls stream visibly.

import type { Metadata } from "next";
import KindBuilderClient from "@/features/content-ir/admin/KindBuilderClient";

export const metadata: Metadata = {
  title: "Build a Kind",
  description:
    "Hand the admin builder agent a data structure; it builds and activates the whole kind end to end.",
};

export default function KindBuilderPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto bg-textured">
      <KindBuilderClient />
    </div>
  );
}
