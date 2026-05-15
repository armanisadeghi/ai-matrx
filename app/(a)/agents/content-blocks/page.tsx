"use client";

import React, { useState } from "react";
import { ContentBlockForm } from "@/features/agent-shortcuts/components/ContentBlockForm";
import { ContentBlockList } from "@/features/agent-shortcuts/components/ContentBlockList";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import type { AgentContentBlockDef as AgentContentBlock } from "@/features/agents/redux/agent-content-blocks/types";

const SCOPE = "user" as const;

export default function UserContentBlocksPage() {
  const { categories } = useAgentShortcuts({ scope: SCOPE });

  const [formOpen, setFormOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<AgentContentBlock | null>(
    null,
  );

  const handleCreate = () => {
    setEditingBlock(null);
    setFormOpen(true);
  };

  const handleEdit = (block: AgentContentBlock) => {
    setEditingBlock(block);
    setFormOpen(true);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <ContentBlockList
        scope={SCOPE}
        onCreate={handleCreate}
        onEdit={handleEdit}
      />

      <ContentBlockForm
        scope={SCOPE}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => setFormOpen(false)}
        contentBlock={editingBlock}
        categories={categories}
      />
    </div>
  );
}
