"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DuplicateShortcutModal } from "@/features/agent-shortcuts/components/DuplicateShortcutModal";
import { PromoteToGlobalModal } from "@/features/agent-shortcuts/components/PromoteToGlobalModal";
import { ShortcutForm } from "@/features/agent-shortcuts/components/ShortcutForm";
import { ShortcutList } from "@/features/agent-shortcuts/components/ShortcutList";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import type {
  AgentShortcut,
  AgentShortcutRecord,
} from "@/features/agents/redux/agent-shortcuts/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

const SCOPE = "user" as const;

export default function UserShortcutsPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const isAdmin = useAppSelector(selectIsSuperAdmin);

  const { categories } = useAgentShortcuts({ scope: SCOPE });

  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateTarget, setDuplicateTarget] =
    useState<AgentShortcutRecord | null>(null);
  const [promoteTarget, setPromoteTarget] =
    useState<AgentShortcutRecord | null>(null);

  const promoteSourceCategory = useMemo(() => {
    if (!promoteTarget) return null;
    return categories.find((c) => c.id === promoteTarget.categoryId) ?? null;
  }, [promoteTarget, categories]);

  const handleEdit = (shortcut: AgentShortcutRecord) => {
    startTransition(() => {
      router.push(`/agents/shortcuts/edit/${shortcut.id}`);
    });
  };

  const handleCreate = () => setCreateOpen(true);
  const handleDuplicate = (shortcut: AgentShortcutRecord) =>
    setDuplicateTarget(shortcut);
  const handlePromoteToGlobal = (shortcut: AgentShortcutRecord) =>
    setPromoteTarget(shortcut);

  const handleCreateSuccess = (id: string | null) => {
    setCreateOpen(false);
    if (id) {
      startTransition(() => {
        router.push(`/agents/shortcuts/edit/${id}`);
      });
    }
  };

  const handleDuplicateSuccess = (newId: string) => {
    setDuplicateTarget(null);
    startTransition(() => {
      router.push(`/agents/shortcuts/edit/${newId}`);
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
        onPromoteToGlobal={isAdmin ? handlePromoteToGlobal : undefined}
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

      {promoteTarget && (
        <PromoteToGlobalModal
          isOpen={!!promoteTarget}
          onClose={() => setPromoteTarget(null)}
          onSuccess={handlePromoteSuccess}
          shortcut={promoteTarget as AgentShortcut}
          sourceCategory={promoteSourceCategory}
        />
      )}
    </div>
  );
}
