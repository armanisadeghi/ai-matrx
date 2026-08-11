"use client";

import React, { use, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShortcutById } from "@/features/agents/redux/agent-shortcuts/selectors";
import { DuplicateShortcutModal } from "@/features/agent-shortcuts/components/DuplicateShortcutModal";
import { ShortcutForm } from "@/features/agent-shortcuts/components/ShortcutForm";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";

const SCOPE = "user" as const;

export default function UserEditShortcutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const { shortcuts, categories, isLoading } = useAgentShortcuts({
    scope: SCOPE,
  });
  const shortcut = useAppSelector((state) => selectShortcutById(state, id));

  const [formOpen, setFormOpen] = useState(true);
  const [duplicateTarget, setDuplicateTarget] = useState<AgentShortcut | null>(
    null,
  );

  const goToList = () => {
    startTransition(() => {
      router.push("/agents/shortcuts");
    });
  };

  const handleClose = () => {
    setFormOpen(false);
    goToList();
  };

  const handleSuccess = (nextId: string | null) => {
    if (nextId && nextId !== id) {
      startTransition(() => {
        router.push(`/agents/shortcuts/edit/${nextId}`);
      });
      return;
    }
    if (nextId === null) {
      goToList();
    }
  };

  const handleDuplicate = (src: AgentShortcut) => {
    setDuplicateTarget(src);
  };

  const handleDuplicateSuccess = (newId: string) => {
    setDuplicateTarget(null);
    startTransition(() => {
      router.push(`/agents/shortcuts/edit/${newId}`);
    });
  };

  const shortcutInList = shortcuts.find((s) => s.id === id) ?? null;
  const resolved = shortcut ?? shortcutInList ?? null;

  if (isLoading && !resolved) {
    return (
      <>
        <EntityModeHeader backHref="/agents/shortcuts" entityLabel="Loading…" />
        <div className="h-full flex items-center justify-center bg-textured">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading shortcut...
          </div>
        </div>
      </>
    );
  }

  // It isn't in the caller's personal shortcuts — which is NOT the same as
  // "doesn't exist". It may be an org shortcut, someone else's, deleted, or
  // the session may have lapsed while the list loaded. The gate finds out and
  // offers a request when it's a real record with an owner.
  if (!resolved) {
    return (
      <>
        <EntityModeHeader backHref="/agents/shortcuts" entityLabel="Shortcut" />
        <div className="h-full bg-textured">
          <AccessGate
            token="agent_shortcut"
            id={id}
            fallbackHref="/agents/shortcuts"
            fallbackLabel="Your shortcuts"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <EntityModeHeader
        backHref="/agents/shortcuts"
        entityLabel={resolved.label}
      />
      <div className="h-full overflow-hidden flex items-center justify-center p-6 bg-textured">
        <Card className="max-w-lg w-full">
          <CardContent className="p-6 space-y-2 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Shortcut editor</div>
            <p>
              The shortcut editor is open as a modal. Close it to return to the
              shortcut list.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFormOpen(true)}
              disabled={formOpen}
            >
              Re-open editor
            </Button>
          </CardContent>
        </Card>
      </div>

      <ShortcutForm
        scope={SCOPE}
        isOpen={formOpen}
        onClose={handleClose}
        onSuccess={handleSuccess}
        shortcut={resolved}
        categories={categories}
        onDuplicate={handleDuplicate}
      />

      {duplicateTarget && (
        <DuplicateShortcutModal
          scope={SCOPE}
          isOpen={!!duplicateTarget}
          onClose={() => setDuplicateTarget(null)}
          onSuccess={handleDuplicateSuccess}
          shortcut={duplicateTarget}
          categories={categories}
        />
      )}
    </>
  );
}
