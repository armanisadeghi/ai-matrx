"use client";

import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, AlertCircle } from "lucide-react";
import { extractErrorMessage } from "@/utils/errors";
import { aiModelService } from "../service";
import type {
  AiModel,
  AiModelInsert,
  AiProvider,
  ProviderModelEntry,
} from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerEntry: ProviderModelEntry | null;
  providerId: string;
  providerName: string | null;
  provider: AiProvider | undefined;
  localModels: AiModel[];
  onCreated: (model: AiModel, openEditor: boolean) => void;
};

const formatNum = (n?: number | null) => (n == null ? "—" : n.toLocaleString());

export default function AddProviderModelDialog({
  open,
  onOpenChange,
  providerEntry,
  providerId,
  providerName,
  provider,
  localModels,
  onCreated,
}: Props) {
  const [templateId, setTemplateId] = useState<string>("");
  const [nameOverride, setNameOverride] = useState<string>("");
  const [commonNameOverride, setCommonNameOverride] = useState<string>("");
  const [modelClassOverride, setModelClassOverride] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize editable fields whenever a new providerEntry is opened.
  React.useEffect(() => {
    if (!open || !providerEntry) return;
    setNameOverride(providerEntry.id);
    setCommonNameOverride(
      providerEntry.display_name &&
        providerEntry.display_name !== providerEntry.id
        ? providerEntry.display_name
        : providerEntry.id,
    );
    setModelClassOverride("");
    setTemplateId("");
    setError(null);
  }, [open, providerEntry]);

  // Sort templates: same-provider first (by id match or by name match), then everything else.
  const templateOptions = useMemo(() => {
    const sameProvider = localModels.filter(
      (m) =>
        m.model_provider === providerId ||
        (providerName &&
          m.provider?.toLowerCase() === providerName.toLowerCase()),
    );
    const otherProvider = localModels.filter((m) => !sameProvider.includes(m));
    const sortByName = (a: AiModel, b: AiModel) =>
      (a.common_name ?? a.name).localeCompare(b.common_name ?? b.name);
    return {
      same: [...sameProvider].sort(sortByName),
      other: [...otherProvider].sort(sortByName),
    };
  }, [localModels, providerId, providerName]);

  // Default to the first same-provider, non-deprecated model.
  React.useEffect(() => {
    if (!open || templateId) return;
    const firstSameProvider = templateOptions.same.find(
      (m) => !m.is_deprecated,
    );
    if (firstSameProvider) {
      setTemplateId(firstSameProvider.id);
    }
  }, [open, templateOptions.same, templateId]);

  const template = useMemo(
    () => localModels.find((m) => m.id === templateId) ?? null,
    [localModels, templateId],
  );

  // Auto-fill model_class from template (only if user hasn't overridden it).
  React.useEffect(() => {
    if (!template) return;
    setModelClassOverride((prev) => prev || template.model_class);
  }, [template]);

  const ctxFromProvider = providerEntry?.max_input_tokens ?? null;
  const maxOutFromProvider = providerEntry?.max_tokens ?? null;

  const canSubmit =
    !!providerEntry &&
    !!template &&
    nameOverride.trim().length > 0 &&
    modelClassOverride.trim().length > 0 &&
    !submitting;

  const handleCreate = async (openEditor: boolean) => {
    if (!providerEntry || !template) return;
    setSubmitting(true);
    setError(null);
    try {
      // Spread template (without id), then override with provider-synced fields.
      const { id: _id, ...templateRest } = template;
      const payload: AiModelInsert = {
        ...templateRest,
        name: nameOverride.trim(),
        common_name: commonNameOverride.trim() || null,
        model_class: modelClassOverride.trim(),
        provider: providerName ?? template.provider,
        model_provider: providerId,
        context_window: ctxFromProvider ?? template.context_window ?? null,
        max_tokens: maxOutFromProvider ?? template.max_tokens ?? null,
        is_primary: false,
        is_deprecated: false,
      } as AiModelInsert;

      const created = await aiModelService.create(payload);
      onCreated(created, openEditor);
      onOpenChange(false);
    } catch (err) {
      console.error("[AddProviderModelDialog] create failed", err);
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!providerEntry) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent
        className="max-w-3xl p-0 flex flex-col max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => submitting && e.preventDefault()}
      >
        <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add provider model to database
          </DialogTitle>
          <DialogDescription className="text-xs">
            Provider info is auto-synced. Pick an existing model to copy class /
            pricing / controls / constraints from.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-5">
            {/* ── Provider-synced section ── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  From provider sync
                </h3>
                <Badge
                  variant="outline"
                  className="text-[9px] h-4 px-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300"
                >
                  {providerName ?? "—"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="apm-name" className="text-xs">
                    name (provider model id)
                  </Label>
                  <Input
                    id="apm-name"
                    value={nameOverride}
                    onChange={(e) => setNameOverride(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="apm-common" className="text-xs">
                    common_name (display)
                  </Label>
                  <Input
                    id="apm-common"
                    value={commonNameOverride}
                    onChange={(e) => setCommonNameOverride(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    context_window
                  </p>
                  <p className="text-xs font-mono">
                    {formatNum(ctxFromProvider)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    max_tokens
                  </p>
                  <p className="text-xs font-mono">
                    {formatNum(maxOutFromProvider)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">provider</p>
                  <p className="text-xs font-mono">{providerName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    model_provider
                  </p>
                  <p
                    className="text-[10px] font-mono text-muted-foreground truncate"
                    title={providerId}
                  >
                    {providerId.slice(0, 8)}…
                  </p>
                </div>
              </div>
            </section>

            {/* ── Template selector ── */}
            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Copy remaining fields from
                </h3>
              </div>

              <div className="space-y-1">
                <Label htmlFor="apm-template" className="text-xs">
                  Template model
                </Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger id="apm-template" className="h-8 text-xs">
                    <SelectValue placeholder="Select a similar model…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateOptions.same.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                          Same provider
                        </div>
                        {templateOptions.same.map((m) => (
                          <SelectItem
                            key={m.id}
                            value={m.id}
                            className="text-xs"
                          >
                            <span className="font-medium">
                              {m.common_name ?? m.name}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              ({m.model_class}
                              {m.api_class ? ` / ${m.api_class}` : ""})
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {templateOptions.other.length > 0 && (
                      <>
                        <div className="px-2 py-1 mt-1 text-[10px] font-semibold uppercase text-muted-foreground border-t">
                          Other providers
                        </div>
                        {templateOptions.other.map((m) => (
                          <SelectItem
                            key={m.id}
                            value={m.id}
                            className="text-xs"
                          >
                            <span className="font-medium">
                              {m.common_name ?? m.name}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              ({m.provider ?? "—"} · {m.model_class})
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {template && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="apm-class" className="text-xs">
                      model_class
                      <span className="text-muted-foreground ml-1">
                        (editable — often differs from name)
                      </span>
                    </Label>
                    <Input
                      id="apm-class"
                      value={modelClassOverride}
                      onChange={(e) => setModelClassOverride(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Inherited from template
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <InheritedField
                        label="api_class"
                        value={template.api_class ?? "—"}
                      />
                      <InheritedField
                        label="is_premium"
                        value={String(template.is_premium ?? false)}
                      />
                      <InheritedField
                        label="endpoints"
                        value={
                          template.endpoints
                            ? `${template.endpoints.length} item(s)`
                            : "—"
                        }
                      />
                      <InheritedField
                        label="pricing"
                        value={
                          template.pricing
                            ? `${template.pricing.length} tier(s)`
                            : "—"
                        }
                      />
                      <InheritedField
                        label="controls"
                        value={
                          template.controls
                            ? `${Object.keys(template.controls).length} key(s)`
                            : "—"
                        }
                      />
                      <InheritedField
                        label="constraints"
                        value={
                          template.constraints
                            ? `${template.constraints.length} rule(s)`
                            : "—"
                        }
                      />
                      <InheritedField
                        label="capabilities"
                        value={
                          template.capabilities
                            ? Array.isArray(template.capabilities)
                              ? `${template.capabilities.length} item(s)`
                              : `${Object.keys(template.capabilities).length} key(s)`
                            : "—"
                        }
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-1 border-t">
                      You can adjust all of these in the full editor after
                      creation.
                    </p>
                  </div>
                </>
              )}
            </section>

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t shrink-0 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate(false)}
            disabled={!canSubmit}
            className="h-8 text-xs"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Create"
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => handleCreate(true)}
            disabled={!canSubmit}
            className="h-8 text-xs"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Create & Edit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InheritedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] text-muted-foreground w-24 shrink-0">
        {label}
      </span>
      <span className="text-xs font-mono truncate" title={value}>
        {value}
      </span>
    </div>
  );
}
