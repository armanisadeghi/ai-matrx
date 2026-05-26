"use client";

import React, { use, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const [isPending, startTransition] = useTransition();

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
      <div className="h-[calc(100vh-2.5rem)] flex items-center justify-center bg-textured">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading shortcut...
        </div>
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="h-[calc(100vh-2.5rem)] flex items-center justify-center p-6 bg-textured">
        <Card className="max-w-md w-full border-destructive/30">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-destructive/10 rounded-full">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                Shortcut not found
              </h2>
              <p className="text-sm text-muted-foreground">
                This shortcut doesn&apos;t exist in your personal shortcuts.
              </p>
            </div>
            <Link href="/agents/shortcuts">
              <Button size="sm">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to shortcuts
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 px-4 h-12 border-b border-border bg-card flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={goToList}
          disabled={isPending}
          className="-ml-2"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <ArrowLeft className="h-4 w-4 mr-1.5" />
          )}
          Back to shortcuts
        </Button>
        <div className="text-sm text-muted-foreground truncate">
          Editing{" "}
          <span className="font-medium text-foreground">{resolved.label}</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex items-center justify-center p-6">
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
    </div>
  );
}
