"use client";

/**
 * AgentShortcutEditor
 *
 * Standalone (non-modal) shortcut editor used at
 * `/agents/[id]/shortcuts/new` and `/agents/[id]/shortcuts/[shortcutId]`.
 *
 * Wraps the shared `ShortcutForm` in `variant="inline"` so the same 600+ line
 * form is reused across the modal and the full-page route.
 *
 * - `shortcutId === "new"` → create mode, scope defaults to `"user"` with the
 *   agent id pre-filled.
 * - Any other id → edit mode. If the shortcut isn't resolvable (wrong scope,
 *   missing RLS, etc.) an error card is shown with a link back to the list.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { ShortcutForm } from "@/features/agent-shortcuts/components/ShortcutForm";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { selectShortcutById } from "@/features/agents/redux/agent-shortcuts/selectors";
import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";
import type { AgentScope } from "@/features/agent-shortcuts/constants";
import type { ShortcutFormData } from "@/features/agent-shortcuts/types";

interface AgentShortcutEditorProps {
  agentId: string;
  agentName: string;
  /** Either a real shortcut UUID, or the literal string `"new"` for creation. */
  shortcutId: string;
  /** Base path for back-to-list navigation. Defaults to `/agents` (user route).
   *  Admin route passes `/administration/agents/system-agents/agents`. */
  basePath?: string;
}

export function AgentShortcutEditor({
  agentId,
  agentName,
  shortcutId,
  basePath = "/agents",
}: AgentShortcutEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isCreate = shortcutId === "new";
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const agent = useAppSelector((state) => selectAgentById(state, agentId));

  // When an admin creates a shortcut for a builtin/system agent, it belongs
  // to the system (global scope). Plain users, or regular agents → user scope.
  const createModeDefaultScope: AgentScope =
    agent?.agentType === "builtin" && isAdmin ? "global" : "user";

  // We pre-hydrate both scopes so the page works whether the shortcut is
  // user-owned or global. When creating we default to `"user"`; when editing
  // we resolve the scope from the shortcut itself.
  const userQuery = useAgentShortcuts({ scope: "user" });
  const globalQuery = useAgentShortcuts({ scope: "global" });

  const loadedShortcut = useAppSelector((state) =>
    isCreate ? null : selectShortcutById(state, shortcutId),
  );

  const isLoading = userQuery.isLoading || globalQuery.isLoading;
  const fetchError = userQuery.error || globalQuery.error;

  // Resolve the scope to feed `useAgentShortcutCrud`. Creating → derived from
  // agent type (admin + builtin → global, else user); editing → inferred from
  // the shortcut's ownership columns.
  const { scope, scopeId, categories } = useMemo(() => {
    if (isCreate) {
      return {
        scope: createModeDefaultScope,
        scopeId: undefined as string | undefined,
        categories:
          createModeDefaultScope === "global"
            ? globalQuery.categories
            : userQuery.categories,
      };
    }

    if (!loadedShortcut) {
      return {
        scope: "user" as AgentScope,
        scopeId: undefined,
        categories: userQuery.categories,
      };
    }

    if (loadedShortcut.taskId) {
      return {
        scope: "task" as AgentScope,
        scopeId: loadedShortcut.taskId,
        categories: [],
      };
    }
    if (loadedShortcut.projectId) {
      return {
        scope: "project" as AgentScope,
        scopeId: loadedShortcut.projectId,
        categories: [],
      };
    }
    if (loadedShortcut.organizationId) {
      return {
        scope: "organization" as AgentScope,
        scopeId: loadedShortcut.organizationId,
        categories: [],
      };
    }
    if (loadedShortcut.userId) {
      return {
        scope: "user" as AgentScope,
        scopeId: undefined,
        categories: userQuery.categories,
      };
    }
    return {
      scope: "global" as AgentScope,
      scopeId: undefined,
      categories: globalQuery.categories,
    };
  }, [
    isCreate,
    loadedShortcut,
    userQuery.categories,
    globalQuery.categories,
    createModeDefaultScope,
  ]);

  const goToList = () => {
    startTransition(() => {
      router.push(`${basePath}/${agentId}/shortcuts`);
    });
  };

  const handleClose = () => {
    goToList();
  };

  const handleSuccess = (nextId: string | null) => {
    if (nextId === null) {
      // Deleted — return to the list.
      goToList();
      return;
    }
    if (isCreate) {
      // Just created → replace the `new` URL with the real id so refresh works.
      startTransition(() => {
        router.replace(`${basePath}/${agentId}/shortcuts/${nextId}`);
      });
      return;
    }
    if (nextId !== shortcutId) {
      startTransition(() => {
        router.replace(`${basePath}/${agentId}/shortcuts/${nextId}`);
      });
    }
  };

  // ── Create-mode initial values — pin the shortcut to this agent ────────
  //
  // We default `useLatest` to FALSE (pin to current version). The
  // AgentVersionPicker auto-resolves the live agent's current version id
  // once it loads history, so by the time the user hits save the record
  // points at a concrete version and can't be silently broken by an agent
  // update. A user who wants floating behavior can flip the switch on
  // in the form.
  const initialValues: Partial<ShortcutFormData> | undefined = isCreate
    ? { agentId, useLatest: false, agentVersionId: null }
    : undefined;

  // ── Loading + error states ─────────────────────────────────────────────
  if (!isCreate && isLoading && !loadedShortcut) {
    return (
      <Card className="mx-auto mt-12 w-full max-w-md">
        <CardContent className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading shortcut…
        </CardContent>
      </Card>
    );
  }

  if (!isCreate && !loadedShortcut) {
    return (
      <Card className="mx-auto mt-12 w-full max-w-md border-destructive/30">
        <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
          <div className="p-3 bg-destructive/10 rounded-full">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground mb-1">
              Shortcut not found
            </h2>
            <p className="text-xs text-muted-foreground">
              This shortcut doesn&apos;t exist, or isn&apos;t visible to you.
              {fetchError ? ` (${fetchError})` : null}
            </p>
          </div>
          <Link href={`${basePath}/${agentId}/shortcuts`}>
            <Button size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to shortcuts
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full overflow-y-auto pt-12">
      <ShortcutForm
        variant="inline"
        scope={scope}
        scopeId={scopeId}
        onClose={handleClose}
        onSuccess={handleSuccess}
        shortcut={(loadedShortcut as AgentShortcut | null) ?? null}
        categories={categories}
        initialValues={initialValues}
      />
    </div>
  );
}
