"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { PlusTapButton, ListTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { DuplicateShortcutModal } from "@/features/agent-shortcuts/components/DuplicateShortcutModal";
import { PromoteToGlobalModal } from "@/features/agent-shortcuts/components/PromoteToGlobalModal";
import { ShortcutList } from "@/features/agent-shortcuts/components/ShortcutList";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import type {
  AgentShortcut,
  AgentShortcutRecord,
} from "@ai-matrx/chat/agents/redux/agent-shortcuts/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAdminFeature } from "@/lib/redux/selectors/userSelectors";
import { pushAppHref } from "@/lib/deployment/navigate";

const SCOPE = "user" as const;
const NEW_SHORTCUT_HREF = "/agents/shortcuts/new";

export default function UserShortcutsPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const isAdmin = useAppSelector((s) => selectAdminFeature(s, "agent.global-shortcut"));

  const { categories } = useAgentShortcuts({ scope: SCOPE });

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

  // ONE create path: the dedicated /agents/shortcuts/new page (a real door —
  // new-tab-able, bookmarkable), shared by the header button and the empty state.
  const handleCreate = () => {
    startTransition(() => {
      router.push(NEW_SHORTCUT_HREF);
    });
  };
  const handleDuplicate = (shortcut: AgentShortcutRecord) =>
    setDuplicateTarget(shortcut);
  const handlePromoteToGlobal = (shortcut: AgentShortcutRecord) =>
    setPromoteTarget(shortcut);

  const handleDuplicateSuccess = (newId: string) => {
    setDuplicateTarget(null);
    startTransition(() => {
      router.push(`/agents/shortcuts/edit/${newId}`);
    });
  };

  const handlePromoteSuccess = (newId: string) => {
    setPromoteTarget(null);
    startTransition(() => {
      pushAppHref(router, `/administration/agents/system-agents/edit/${newId}`);
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <RouteHeader
        left={
          <>
            <h1 className="type-title text-foreground truncate">
              My Shortcuts
            </h1>
          </>
        }
        right={
          <>
            <ListTapButton
              href="/agents/shortcuts/all"
              ariaLabel="Browse all shortcuts"
              tooltip="Browse all shortcuts"
            />
            <PlusTapButton
              variant="solid"
              label="New shortcut"
              href={NEW_SHORTCUT_HREF}
              ariaLabel="New shortcut"
            />
          </>
        }
      />

      <div className="flex-1 min-h-0 pt-[var(--shell-header-h)]">
        <ShortcutList
          doorHrefFor={(s) => `/agents/shortcuts/edit/${s.id}`}
          scope={SCOPE}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onPromoteToGlobal={isAdmin ? handlePromoteToGlobal : undefined}
          hideTitleBar
        />
      </div>

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
