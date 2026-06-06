"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { updateScope } from "@/features/agent-context/redux/scope/scopesSlice";
import type { Scope } from "@/features/agent-context/redux/scope/types";
import { toSlug, isValidSlug } from "@/features/scope-system/utils/slugify";

interface ScopeAdvancedSectionProps {
  scope: Scope;
}

/**
 * Advanced (one-click-away) editor for a scope's URL slug and free-form
 * `settings` JSON. Both persist through the `update_scope` RPC (which already
 * accepts `p_slug` and `p_settings`). Kept behind a disclosure so the common
 * path (name / description / values) stays uncluttered.
 */
export function ScopeAdvancedSection({ scope }: ScopeAdvancedSectionProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [slug, setSlug] = useState(scope.slug ?? "");
  const [settingsText, setSettingsText] = useState(() =>
    JSON.stringify(scope.settings ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  async function handleSave() {
    const trimmedSlug = slug.trim();
    if (trimmedSlug && !isValidSlug(trimmedSlug)) {
      toast.error("URL slug must be lowercase letters, numbers, and hyphens");
      return;
    }
    let parsedSettings: Record<string, unknown>;
    try {
      parsedSettings = settingsText.trim() ? JSON.parse(settingsText) : {};
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }
    if (
      parsedSettings === null ||
      typeof parsedSettings !== "object" ||
      Array.isArray(parsedSettings)
    ) {
      setJsonError("Settings must be a JSON object, e.g. { }");
      return;
    }
    setJsonError(null);
    setBusy(true);
    try {
      await dispatch(
        updateScope({
          scope_id: scope.id,
          slug: trimmedSlug || undefined,
          settings: parsedSettings,
        }),
      ).unwrap();
      toast.success("Advanced settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-6 py-4 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Advanced
        <span className="text-xs font-normal">URL slug, settings (JSON)</span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5 border-t border-border pt-5">
          <div className="space-y-1.5">
            <Label className="text-xs">URL slug</Label>
            <div className="flex gap-2">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={toSlug(scope.name) || "url-slug"}
                style={{ fontSize: "16px" }}
                disabled={busy}
                className="flex-1 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSlug(toSlug(scope.name))}
                disabled={busy || !scope.name.trim()}
              >
                Auto
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Human-readable segment in this scope&apos;s URL. Must be unique
              within its scope type.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Settings (JSON)</Label>
            <ProTextarea
              value={settingsText}
              onChange={(e) => setSettingsText(e.target.value)}
              minHeight={140}
              autoGrow
              className="font-mono text-sm"
              placeholder="{ }"
              disabled={busy}
            />
            {jsonError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 inline-flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {jsonError}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Free-form configuration stored on the scope. Must be a JSON object.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={busy} size="sm">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save advanced settings
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
