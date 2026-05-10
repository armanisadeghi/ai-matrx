"use client";

/**
 * ShellBasedCreateAgentAppForm — no-code create path.
 *
 * Pick a built-in shell (chat / form_to_result / widget) and tweak the
 * common config; submit creates an `aga_apps` row with `shell_kind` set
 * and an empty `component_code`. The renderer then dispatches to the
 * built-in shell at run time, so the agent's variable definitions and
 * the chosen layout do all the work — no AI generation, no Babel
 * sandbox, no editor required.
 *
 * Sits alongside the existing AutoCreateAgentAppForm (AI generates
 * custom UI) and CreateAgentAppForm (manual full-control). All three
 * are presented as tabs from CreateAgentAppFormWrapper.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ShellPicker } from "@/features/agent-apps/components/builder/ShellPicker";
import { ShellConfigPanel } from "@/features/agent-apps/components/builder/ShellConfigPanel";
import { toast } from "@/lib/toast-service";
import {
  generateSlugCandidates,
  validateSlugsInBatch,
} from "@/features/agent-apps/services/slug-service";
import type {
  AgentAppShellConfigCommon,
  AgentAppShellKind,
} from "@/features/agent-apps/types";

interface ShellBasedCreateAgentAppFormProps {
  agent: { id: string; name?: string; description?: string | null };
  onSuccess?: (appId: string) => void;
}

export function ShellBasedCreateAgentAppForm({
  agent,
  onSuccess,
}: ShellBasedCreateAgentAppFormProps) {
  const router = useRouter();
  const [name, setName] = useState<string>(agent.name ?? "");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState<string>("");
  const [slugBusy, setSlugBusy] = useState(false);
  const [shellKind, setShellKind] = useState<AgentAppShellKind>(
    "form_to_result",
  );
  const [shellConfig, setShellConfig] = useState<AgentAppShellConfigCommon>({
    autoRun: false,
    allowChat: false,
    compact: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest a slug whenever the name changes (debounced via useEffect tick).
  useEffect(() => {
    let cancelled = false;
    if (!name.trim()) {
      setSlug("");
      return;
    }
    setSlugBusy(true);
    (async () => {
      try {
        const candidates = generateSlugCandidates(name);
        const { available } = await validateSlugsInBatch(candidates);
        if (cancelled) return;
        if (available.length > 0) {
          setSlug(available[0]);
        } else {
          // Fallback to the last candidate (slug-service appends a random
          // suffix when needed).
          setSlug(candidates[candidates.length - 1] ?? "");
        }
      } catch {
        if (!cancelled) setSlug("");
      } finally {
        if (!cancelled) setSlugBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Per-shell config defaults that map naturally to the chosen layout.
  useEffect(() => {
    if (shellKind === "chat") {
      setShellConfig((prev) => ({ ...prev, allowChat: true }));
    } else if (shellKind === "form_to_result") {
      setShellConfig((prev) => ({ ...prev, allowChat: prev.allowChat ?? false }));
    } else if (shellKind === "widget") {
      setShellConfig((prev) => ({ ...prev, compact: true }));
    }
  }, [shellKind]);

  const canSubmit = useMemo(
    () =>
      Boolean(
        agent?.id &&
          name.trim() &&
          slug.trim() &&
          !slugBusy &&
          !submitting,
      ),
    [agent?.id, name, slug, slugBusy, submitting],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agent.id,
          slug,
          name: name.trim(),
          tagline: tagline.trim() || undefined,
          description: description.trim() || undefined,
          shell_kind: shellKind,
          shell_config: shellConfig,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Create failed (HTTP ${res.status})`);
      }
      const created = (await res.json()) as { id: string };
      toast.success("App created.");
      onSuccess?.(created.id);
      router.push(`/agent-apps/${created.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create app";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    agent.id,
    slug,
    name,
    tagline,
    description,
    shellKind,
    shellConfig,
    onSuccess,
    router,
  ]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">
          From a Shell <span className="text-primary">— no code needed</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick a layout and {agent?.name ?? "the agent"} does the rest. Variables,
          streaming, history, and follow-up come from the shell.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                App name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. ${agent?.name ?? "My App"}`}
                disabled={submitting}
                className="text-[16px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Slug
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/-+/g, "-")
                        .replace(/^-+|-+$/g, ""),
                    )
                  }
                  placeholder="my-app"
                  disabled={submitting}
                  className="text-[16px] font-mono"
                />
                {slugBusy && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Tagline
            </Label>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="One-line description (optional)"
              disabled={submitting}
              className="text-[16px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Description
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Longer description shown on the public page (optional)"
              disabled={submitting}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <Label className="text-base font-semibold">Layout</Label>
            <p className="text-xs text-muted-foreground mt-1">
              How users see and interact with the app. Pick "Fully custom" only
              if you want to write the whole UI yourself — for that, use the
              other tabs.
            </p>
          </div>
          <ShellPicker
            value={shellKind}
            onChange={setShellKind}
            disabled={submitting}
          />
          <div className="border-t border-border/60 pt-4">
            <ShellConfigPanel
              shellKind={shellKind}
              value={shellConfig}
              onChange={setShellConfig}
              disabled={submitting}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="lg"
          className="gap-2"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4" />
          )}
          {submitting ? "Creating…" : "Create app"}
        </Button>
      </div>
    </div>
  );
}
