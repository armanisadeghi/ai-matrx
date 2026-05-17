"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import {
  ValueMappingEditor,
  type MappingTarget,
} from "@/features/surfaces/components/ValueMappingEditor";
import { listSurfaceValues } from "@/features/surfaces/services/surfaces.service";
import {
  isValueMappingMap,
  type SurfaceValue,
  type ValueMappingMap,
} from "@/features/surfaces/types";

interface Props {
  toolId: string;
  surfaceName: string;
  onClose: () => void;
  onSaved: () => void;
}

const sb = () => createClient();

function jsonSchemaToTargets(parameters: unknown): MappingTarget[] {
  if (!parameters || typeof parameters !== "object") return [];
  const p = parameters as Record<string, unknown>;
  const props = (p.properties as Record<string, unknown> | undefined) ?? {};
  const required = Array.isArray(p.required)
    ? new Set(p.required.filter((x): x is string => typeof x === "string"))
    : new Set<string>();

  const out: MappingTarget[] = [];
  for (const [name, raw] of Object.entries(props)) {
    if (!raw || typeof raw !== "object") continue;
    const def = raw as Record<string, unknown>;
    const jsonType =
      typeof def.type === "string"
        ? (def.type as string)
        : Array.isArray(def.type) && def.type.length > 0
          ? String(def.type[0])
          : "string";

    let valueType: SurfaceValue["valueType"];
    switch (jsonType) {
      case "number":
      case "integer":
        valueType = "number";
        break;
      case "boolean":
        valueType = "boolean";
        break;
      case "array":
        valueType = "array";
        break;
      case "object":
        valueType = "object";
        break;
      default:
        valueType = "string";
    }

    out.push({
      name,
      type: valueType,
      description:
        typeof def.description === "string" ? def.description : undefined,
      required: required.has(name),
    });
  }
  return out;
}

export function ToolArgMappingsEditorDialog({
  toolId,
  surfaceName,
  onClose,
  onSaved,
}: Props) {
  const [targets, setTargets] = useState<MappingTarget[]>([]);
  const [mappings, setMappings] = useState<ValueMappingMap>({});
  const [surfaceValues, setSurfaceValues] = useState<SurfaceValue[]>([]);
  const [toolName, setToolName] = useState<string>(toolId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = sb();
        const [toolRes, bindingRes, vals] = await Promise.all([
          supabase
            .from("tl_def")
            .select("id, name, parameters")
            .eq("id", toolId)
            .single(),
          supabase
            .from("tl_def_surface")
            .select("tool_id, surface_name, arg_mappings")
            .eq("tool_id", toolId)
            .eq("surface_name", surfaceName)
            .single(),
          listSurfaceValues(surfaceName),
        ]);

        if (cancelled) return;

        if (toolRes.error) throw toolRes.error;
        if (bindingRes.error) throw bindingRes.error;

        const tool = toolRes.data;
        const binding = bindingRes.data;

        setToolName(tool.name ?? toolId);
        setTargets(jsonSchemaToTargets(tool.parameters));
        const raw = binding?.arg_mappings;
        setMappings(isValueMappingMap(raw) ? (raw as ValueMappingMap) : {});
        setSurfaceValues(vals);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load tool");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [toolId, surfaceName]);

  const onSave = async () => {
    setBusy(true);
    try {
      const { error: writeErr } = await sb()
        .from("tl_def_surface")
        .update({ arg_mappings: mappings as unknown as never })
        .eq("tool_id", toolId)
        .eq("surface_name", surfaceName);
      if (writeErr) throw writeErr;
      toast.success("Tool argument mappings saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-baseline gap-2">
              <span>Edit arg mappings</span>
              <span className="text-xs text-muted-foreground font-normal">
                <span className="font-mono">{toolName}</span> on{" "}
                <span className="font-mono">{surfaceName}</span>
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto space-y-3 pr-1">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && (
            <>
              <p className="text-[11px] text-muted-foreground">
                Bind tool arguments to surface-provided values, set fixed
                literals, or leave them to the model. Tool flows don&apos;t
                support &ldquo;Prompt user&rdquo;.
              </p>
              <ValueMappingEditor
                targets={targets}
                value={mappings}
                onChange={setMappings}
                availableSurfaceValues={surfaceValues}
                hidePromptUser
                disabled={busy}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSave()} disabled={busy || loading}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
