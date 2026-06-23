"use client";

/**
 * AgentCreateAppWindow
 *
 * Floating window wrapping `CreateAgentAppForm`. Lets the user publish a new
 * agent app backed by the currently active agent. Replaces the previous
 * coming-soon placeholder — the overlay id (`agentCreateAppWindow`) and
 * registry slug (`agent-create-app-window`) are preserved so existing
 * dispatchers (`openOverlay({ overlayId: "agentCreateAppWindow", ... })`) and
 * persisted sessions keep working.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  useAppDispatch,
  useAppSelector,
} from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectAgentById,
  selectLiveAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";
import { AgentComingSoonContent } from "@/features/agents/components/coming-soon/AgentComingSoonContent";
import { CreateAgentAppForm } from "@/features/agent-apps/components/CreateAgentAppForm";
import type { AgentOption } from "@/features/agent-apps/components/SearchableAgentSelect";
import type { CreateAgentAppInput } from "@/features/agent-apps/types";
import { toast } from "@/lib/toast-service";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AgentCreateAppWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
}

const WINDOW_ID = "agent-create-app-window";
const OVERLAY_ID = "agentCreateAppWindow";

interface CreatedApp {
  id: string;
  slug: string;
  name: string;
}

export default function AgentCreateAppWindow({
  isOpen,
  onClose,
  agentId,
}: AgentCreateAppWindowProps) {
  if (!isOpen) return null;

  return <AgentCreateAppWindowInner onClose={onClose} agentId={agentId ?? null} />;
}

function AgentCreateAppWindowInner({
  onClose,
  agentId,
}: {
  onClose: () => void;
  agentId: string | null;
}) {
  // When an admin creates an app for a builtin/system agent, the app belongs
  // to the system (scope="global"), not to the admin personally. Surface that
  // context as a header chip (read-only) instead of a banner in the body.
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const presetAgent = useAppSelector((state) =>
    agentId ? selectAgentById(state, agentId) : null,
  );
  const publishAsGlobal = Boolean(
    isAdmin && presetAgent?.agentType === "builtin",
  );

  return (
    <WindowPanel
      id={WINDOW_ID}
      title="Create Agent App"
      onClose={onClose}
      width={640}
      height={720}
      minWidth={480}
      minHeight={520}
      overlayId={OVERLAY_ID}
      bodyClassName="p-0"
      actionsLeft={
        publishAsGlobal ? (
          <span
            title="Publishing as a system app — visible to every user on the platform."
            className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-200"
          >
            System app
          </span>
        ) : undefined
      }
    >
      <CreateAppWindowBody agentId={agentId} onClose={onClose} />
    </WindowPanel>
  );
}

function CreateAppWindowBody({
  agentId,
  onClose,
}: {
  agentId: string | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const presetAgent = useAppSelector((state) =>
    agentId ? selectAgentById(state, agentId) : null,
  );
  const liveAgents = useAppSelector(selectLiveAgents);

  // When an admin creates an app for a builtin/system agent, the app belongs
  // to the system (scope="global"), not to the admin personally. Forgetting
  // this would leak a system-scoped workflow into the admin's personal
  // catalogue.
  const publishAsGlobal = Boolean(
    isAdmin && presetAgent?.agentType === "builtin",
  );

  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedApp | null>(null);

  // The form's SearchableAgentSelect expects an `AgentOption[]` list. Build
  // it lazily from the Redux agent list; when the window is opened for a
  // specific agent and that agent isn't in the list yet, seed it so the
  // form can default to it.
  useEffect(() => {
    // Ensure the agents list is hydrated so the picker has options even if
    // the user opened this window directly without visiting the list.
    if (liveAgents.length === 0) {
      dispatch(initializeChatAgents());
    }
  }, [dispatch, liveAgents.length]);

  const agentOptions = useMemo<AgentOption[]>(() => {
    const base: AgentOption[] = liveAgents
      .filter((a) => !!a.id && !!a.name)
      .map((a) => ({
        id: a.id as string,
        name: a.name as string,
        description: a.description ?? null,
        category: a.category ?? null,
        isPublic: a.isPublic ?? false,
      }));

    // If the preset agent is missing from the list (e.g. it's a builtin or
    // not in the user's default scope), splice it in at the top so the form
    // can preselect it.
    if (presetAgent && !base.some((a) => a.id === presetAgent.id)) {
      base.unshift({
        id: presetAgent.id,
        name: presetAgent.name ?? "Untitled agent",
        description: presetAgent.description ?? null,
        category: presetAgent.category ?? null,
        isPublic: presetAgent.isPublic ?? false,
      });
    }
    return base;
  }, [liveAgents, presetAgent]);

  const handleSubmit = useCallback(
    async (input: CreateAgentAppInput) => {
      setSubmitting(true);
      try {
        const res = await fetch("/api/agent-apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            scope: publishAsGlobal ? "global" : input.scope ?? "user",
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          const msg =
            payload.error ?? `Failed to create agent app (${res.status})`;
          throw new Error(
            payload.details ? `${msg}: ${payload.details}` : msg,
          );
        }

        const app = (await res.json()) as {
          id: string;
          slug: string;
          name: string;
        };
        toast.success("Agent app created!");
        setCreated({ id: app.id, slug: app.slug, name: app.name });
      } catch (err) {
        // Re-throw so the form can show the error state.
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [publishAsGlobal],
  );

  // Empty-state when the window was opened without an agent context and the
  // user also has no agents to pick from yet.
  if (!agentId && agentOptions.length === 0) {
    return (
      <AgentComingSoonContent
        icon={AppWindow}
        title="No agents available"
        description="Create or open an agent first, then use this window to publish it as an app."
        agentId={null}
      />
    );
  }

  if (created) {
    const editorHref = publishAsGlobal
      ? `/administration/agent-apps/edit/${created.id}`
      : `/agents/${agentId ?? ""}/apps/${created.id}`;
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center px-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <div className="text-base font-semibold text-foreground">
            {created.name}
          </div>
          <p className="text-xs text-muted-foreground max-w-sm">
            {publishAsGlobal
              ? "System app saved as a draft — visible to every user once published."
              : "Your agent app is saved as a draft. Open the editor to tweak the layout, component code, and publishing settings."}
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 pt-2 flex-wrap justify-center",
          )}
        >
          <Button asChild variant="default" size="sm" className="gap-1.5">
            <Link href={editorHref} onClick={onClose}>
              Open editor
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link
              href={`/p/${created.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Preview
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <CreateAgentAppForm
          agents={agentOptions}
          onSubmit={handleSubmit}
          onCancel={onClose}
          busy={submitting}
          defaultAgentId={presetAgent?.id ?? null}
          defaultName={presetAgent?.name ?? ""}
        />
      </div>
      {submitting && (
        <div className="border-t border-border px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          Creating agent app…
        </div>
      )}
    </div>
  );
}
