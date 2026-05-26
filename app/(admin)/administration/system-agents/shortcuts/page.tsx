"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DuplicateShortcutModal } from "@/features/agent-shortcuts/components/DuplicateShortcutModal";
import { ImportShortcutsBrowserModal } from "@/features/agent-shortcuts/components/ImportShortcutsBrowserModal";
import { PromoteToGlobalModal } from "@/features/agent-shortcuts/components/PromoteToGlobalModal";
import { ShortcutForm } from "@/features/agent-shortcuts/components/ShortcutForm";
import { ShortcutList } from "@/features/agent-shortcuts/components/ShortcutList";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import type {
  AgentShortcut,
  AgentShortcutCategory,
  AgentShortcutRecord,
} from "@/features/agent-shortcuts/types";
import {
  shortcutRowToFrontend,
  type AdminNonGlobalShortcutRow,
} from "@/features/agents/redux/agent-shortcuts/thunks";

interface PromoteTargetState {
  shortcut: AgentShortcut;
  sourceCategory: AgentShortcutCategory | null;
}

const SCOPE = "global" as const;

export default function AdminShortcutsPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const { categories } = useAgentShortcuts({ scope: SCOPE });

  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateTarget, setDuplicateTarget] =
    useState<AgentShortcutRecord | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<PromoteTargetState | null>(
    null,
  );

  const handleEdit = (shortcut: AgentShortcutRecord) => {
    startTransition(() => {
      router.push(`/administration/system-agents/edit/${shortcut.id}`);
    });
  };

  const handleCreate = () => setCreateOpen(true);
  const handleDuplicate = (shortcut: AgentShortcutRecord) =>
    setDuplicateTarget(shortcut);

  const handleCreateSuccess = (id: string | null) => {
    setCreateOpen(false);
    if (id) {
      startTransition(() => {
        router.push(`/administration/system-agents/edit/${id}`);
      });
    }
  };

  const handleDuplicateSuccess = (newId: string) => {
    setDuplicateTarget(null);
    startTransition(() => {
      router.push(`/administration/system-agents/edit/${newId}`);
    });
  };

  const handleImportSelect = (row: AdminNonGlobalShortcutRow) => {
    setImporterOpen(false);
    setPromoteTarget({
      shortcut: shortcutRowToFrontend(row),
      sourceCategory: null,
    });
  };

  const handlePromoteSuccess = (newId: string) => {
    setPromoteTarget(null);
    startTransition(() => {
      router.push(`/administration/system-agents/edit/${newId}`);
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <ShortcutList
        scope={SCOPE}
        onCreate={handleCreate}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        toolbarSlot={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImporterOpen(true)}
          >
            <DownloadCloud className="h-4 w-4 mr-2" />
            Import from Shortcut
          </Button>
        }
      />

      <ShortcutForm
        scope={SCOPE}
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleCreateSuccess}
        shortcut={null}
        categories={categories}
      />

      {duplicateTarget && (
        <DuplicateShortcutModal
          scope={SCOPE}
          isOpen={!!duplicateTarget}
          onClose={() => setDuplicateTarget(null)}
          onSuccess={handleDuplicateSuccess}
          shortcut={duplicateTarget as AgentShortcut}
          categories={categories}
        />
      )}

      <ImportShortcutsBrowserModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
        onSelect={handleImportSelect}
      />

      {promoteTarget && (
        <PromoteToGlobalModal
          isOpen={!!promoteTarget}
          onClose={() => setPromoteTarget(null)}
          onSuccess={handlePromoteSuccess}
          shortcut={promoteTarget.shortcut}
          sourceCategory={promoteTarget.sourceCategory}
        />
      )}
    </div>
  );
}
