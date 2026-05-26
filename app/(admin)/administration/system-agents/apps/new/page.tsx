"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AppWindow,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/lib/toast-service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectBuiltinAgents,
  selectAgentsSliceStatus,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { CreateAgentAppForm } from "@/features/agent-apps/components/CreateAgentAppForm";
import type { AgentOption } from "@/features/agent-apps/components/SearchableAgentSelect";
import type { CreateAgentAppInput } from "@/features/agent-apps/types";

interface CreatedApp {
  id: string;
  slug: string;
  name: string;
}

export default function AdminNewSystemAppPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const builtins = useAppSelector(selectBuiltinAgents);
  const sliceStatus = useAppSelector(selectAgentsSliceStatus);

  useEffect(() => {
    dispatch(fetchAgentsListFull());
  }, [dispatch]);

  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedApp | null>(null);

  const agentOptions = useMemo<AgentOption[]>(
    () =>
      builtins
        .filter((a) => !!a.id && !!a.name)
        .map((a) => ({
          id: a.id as string,
          name: a.name as string,
          description: a.description ?? null,
          category: a.category ?? null,
          isPublic: true,
        })),
    [builtins],
  );

  const handleSubmit = useCallback(
    async (input: CreateAgentAppInput) => {
      setSubmitting(true);
      try {
        const res = await fetch("/api/agent-apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, scope: "global" }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          const msg =
            payload.error ?? `Failed to create system app (${res.status})`;
          throw new Error(
            payload.details ? `${msg}: ${payload.details}` : msg,
          );
        }

        const app = (await res.json()) as {
          id: string;
          slug: string;
          name: string;
        };
        toast.success("System app created!");
        setCreated({ id: app.id, slug: app.slug, name: app.name });
      } catch (err) {
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  if (sliceStatus === "loading" && builtins.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (created) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
            <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">
                {created.name}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Your system app is saved as a draft. Open the editor to tweak
                layout, component code, and publishing settings.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
              <Button asChild variant="default" size="sm">
                <Link href={`/administration/agent-apps/edit/${created.id}`}>
                  Open editor
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/p/${created.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Preview
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  router.push("/administration/system-agents/apps")
                }
              >
                Back to list
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (agentOptions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <AppWindow className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">
                No system agents yet
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Create or promote a system agent before publishing a system app.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Link href="/administration/system-agents/agents/new">
                <Button size="sm">Create system agent</Button>
              </Link>
              <Link href="/administration/system-agents/apps">
                <Button size="sm" variant="outline">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  Back
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card flex items-center gap-3">
        <Link href="/administration/system-agents/apps">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to apps
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            New System App
          </h1>
          <p className="text-xs text-muted-foreground">
            Publishes a global-scope agent app (no owner).
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-4 max-w-2xl">
          <CreateAgentAppForm
            agents={agentOptions}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/administration/system-agents/apps")}
            busy={submitting}
            defaultAgentId={null}
          />
        </div>
      </div>
    </div>
  );
}
