"use client";

import React, { use, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Eye, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShortcutById } from "@/features/agents/redux/agent-shortcuts/selectors";
import { DuplicateShortcutModal } from "@/features/agent-shortcuts/components/DuplicateShortcutModal";
import { ShortcutForm } from "@/features/agent-shortcuts/components/ShortcutForm";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import type { AgentShortcut } from "@/features/agent-shortcuts/types";
import { useOrgShortcutsContext } from "../../OrgShortcutsContext";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
const SCOPE = "organization" as const;

export default function OrgEditShortcutPage({
  params,
}: {
  params: Promise<{ orgId: string; id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const { orgId, organizationId, canWrite } = useOrgShortcutsContext();

  const { shortcuts, categories, isLoading } = useAgentShortcuts({
    scope: SCOPE,
    scopeId: organizationId,
  });
  const shortcut = useAppSelector((state) => selectShortcutById(state, id));

  const [formOpen, setFormOpen] = useState(true);
  const [duplicateTarget, setDuplicateTarget] = useState<AgentShortcut | null>(
    null,
  );

  const listHref = `/organizations/${orgId}/shortcuts/shortcuts`;

  const goToList = () => {
    startTransition(() => {
      router.push(listHref);
    });
  };

  const handleClose = () => {
    setFormOpen(false);
    goToList();
  };

  const handleSuccess = (nextId: string | null) => {
    if (nextId && nextId !== id) {
      startTransition(() => {
        router.push(`/organizations/${orgId}/shortcuts/edit/${nextId}`);
      });
      return;
    }
    if (nextId === null) {
      goToList();
    }
  };

  const handleDuplicate = canWrite
    ? (src: AgentShortcut) => setDuplicateTarget(src)
    : undefined;

  const handleDuplicateSuccess = (newId: string) => {
    setDuplicateTarget(null);
    startTransition(() => {
      router.push(`/organizations/${orgId}/shortcuts/edit/${newId}`);
    });
  };

  const shortcutInList = shortcuts.find((s) => s.id === id) ?? null;
  const resolved = shortcut ?? shortcutInList ?? null;

  if (isLoading && !resolved) {
    return (
      <div className="h-full flex items-center justify-center bg-textured">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading shortcut…
        </div>
      </div>
    );
  }

  if (!resolved) {
    return (
      <AccessGate
        token="agent_shortcut"
        id={id}
        fallbackHref={listHref}
        fallbackLabel="Back to shortcuts"
      />
    );
  }

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              onClick={goToList}
              ariaLabel="Back to shortcuts"
            />
            <span className="flex min-w-0 items-center gap-2 px-1.5">
              <span className="truncate max-w-[55vw] sm:max-w-[220px] text-sm font-medium text-foreground">
                {canWrite ? "Editing" : "Viewing"} {resolved.label}
              </span>
              {!canWrite && (
                <Badge
                  variant="outline"
                  className="text-[11px] inline-flex items-center gap-1 shrink-0"
                >
                  <Eye className="h-3 w-3" />
                  Read-only
                </Badge>
              )}
            </span>
          </>
        }
      />
      <div className="h-full overflow-hidden flex flex-col bg-textured">
      <div className="flex-1 overflow-hidden flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardContent className="p-6 space-y-2 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">
              {canWrite ? "Shortcut editor" : "Shortcut details"}
            </div>
            {canWrite ? (
              <>
                <p>
                  The shortcut editor is open as a modal. Close it to return to
                  the shortcut list.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFormOpen(true)}
                  disabled={formOpen}
                >
                  Re-open editor
                </Button>
              </>
            ) : (
              <>
                <p>
                  You are viewing this organization shortcut in read-only mode.
                  Only organization admins and owners can edit shortcuts.
                </p>
                <div className="rounded-md border border-border p-3 bg-card/50 space-y-1.5 text-xs">
                  <div>
                    <span className="text-muted-foreground">Label:</span>{" "}
                    <span className="text-foreground font-medium">
                      {resolved.label}
                    </span>
                  </div>
                  {resolved.description && (
                    <div>
                      <span className="text-muted-foreground">
                        Description:
                      </span>{" "}
                      <span className="text-foreground">
                        {resolved.description}
                      </span>
                    </div>
                  )}
                  {resolved.keyboardShortcut && (
                    <div>
                      <span className="text-muted-foreground">Hotkey:</span>{" "}
                      <span className="text-foreground font-mono">
                        {resolved.keyboardShortcut}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    <span className="text-foreground">
                      {resolved.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={goToList}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Back to shortcuts
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {canWrite && (
        <ShortcutForm
          scope={SCOPE}
          scopeId={organizationId}
          isOpen={formOpen}
          onClose={handleClose}
          onSuccess={handleSuccess}
          shortcut={resolved}
          categories={categories}
          onDuplicate={handleDuplicate}
        />
      )}

      {canWrite && duplicateTarget && (
        <DuplicateShortcutModal
          scope={SCOPE}
          scopeId={organizationId}
          isOpen={!!duplicateTarget}
          onClose={() => setDuplicateTarget(null)}
          onSuccess={handleDuplicateSuccess}
          shortcut={duplicateTarget}
          categories={categories}
        />
      )}
      </div>
    </>
  );
}
