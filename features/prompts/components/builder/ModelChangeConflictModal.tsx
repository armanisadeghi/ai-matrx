"use client";

import React, { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    XCircle,
    AlertTriangle,
    CheckCircle2,
    Lightbulb,
    ArrowRight,
    RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PromptSettings } from "@/features/prompts/types/core";
import { NormalizedControls } from "@/features/prompts/hooks/useModelControls";

export interface ConflictItem {
    key: string;
    currentValue: unknown;
    newModelDefault: unknown;
    reason: "unsupported_key" | "value_out_of_range" | "invalid_enum_value";
    description: string;
}

export interface ModelChangeConflictData {
    prevModelName: string;
    newModelName: string;
    newModelId: string;
    currentSettings: PromptSettings;
    supportedKeys: string[];
    conflicts: ConflictItem[];
    newModelControls: NormalizedControls | null;
}

interface ModelChangeConflictModalProps {
    isOpen: boolean;
    onClose: () => void;
    conflictData: ModelChangeConflictData | null;
    onConfirm: (resolvedSettings: PromptSettings) => void;
}

// ─── Resolution modes ─────────────────────────────────────────────────────────

type ResolutionMode = "keep_all" | "auto_resolve" | "remove_only" | "custom";

const RESOLUTION_MODES: { id: ResolutionMode; label: string; recommended?: boolean }[] = [
    { id: "keep_all",     label: "Keep All" },
    { id: "auto_resolve", label: "Auto-Resolve", recommended: true },
    { id: "remove_only",  label: "Remove Only" },
    { id: "custom",       label: "Custom" },
];

// ─── Param alias hints ────────────────────────────────────────────────────────

const PARAM_ALIASES: Record<string, string[]> = {
    max_tokens:            ["max_output_tokens", "max_completion_tokens", "max_new_tokens"],
    max_output_tokens:     ["max_tokens", "max_completion_tokens", "max_new_tokens"],
    max_completion_tokens: ["max_tokens", "max_output_tokens"],
    max_new_tokens:        ["max_tokens", "max_output_tokens"],
    stop:                  ["stop_sequences"],
    stop_sequences:        ["stop"],
    top_k:                 ["top_k_tokens"],
    top_k_tokens:          ["top_k"],
    presence_penalty:      ["repetition_penalty"],
    repetition_penalty:    ["presence_penalty"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function getAliasHint(key: string, controls: NormalizedControls | null): string | null {
    if (!controls) return null;
    const aliases = PARAM_ALIASES[key];
    if (!aliases) return null;
    return aliases.find((alias) => alias in (controls as unknown as Record<string, unknown>)) ?? null;
}

function getActionForMode(
    mode: ResolutionMode,
    conflict: ConflictItem,
    customActions: Record<string, "keep" | "reset">
): "keep" | "reset" {
    switch (mode) {
        case "keep_all":    return "keep";
        case "auto_resolve": return "reset";
        case "remove_only": return conflict.reason === "unsupported_key" ? "reset" : "keep";
        case "custom":      return customActions[conflict.key] ?? "keep";
    }
}

function computeResolvedSettings(
    mode: ResolutionMode,
    conflictData: ModelChangeConflictData,
    customActions: Record<string, "keep" | "reset">
): PromptSettings {
    const resolved: Record<string, unknown> = { ...conflictData.currentSettings };
    for (const conflict of conflictData.conflicts) {
        if (getActionForMode(mode, conflict, customActions) === "reset") {
            if (
                conflict.reason !== "unsupported_key" &&
                conflict.newModelDefault !== undefined &&
                conflict.newModelDefault !== null
            ) {
                resolved[conflict.key] = conflict.newModelDefault;
            } else {
                delete resolved[conflict.key];
            }
        }
    }
    return resolved as PromptSettings;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ModelChangeConflictModal({
    isOpen,
    onClose,
    conflictData,
    onConfirm,
}: ModelChangeConflictModalProps) {
    const [mode, setMode] = useState<ResolutionMode>("auto_resolve");
    const [customActions, setCustomActions] = useState<Record<string, "keep" | "reset">>({});

    React.useEffect(() => {
        setMode("auto_resolve");
        setCustomActions({});
    }, [conflictData]);

    const conflicts = conflictData?.conflicts ?? [];
    const unsupportedConflicts = conflicts.filter((c) => c.reason === "unsupported_key");
    const invalidValueConflicts = conflicts.filter((c) => c.reason !== "unsupported_key");
    const hasConflicts = conflicts.length > 0;

    const resolvedActions = useMemo(() => {
        const result: Record<string, "keep" | "reset"> = {};
        for (const c of conflicts) {
            result[c.key] = getActionForMode(mode, c, customActions);
        }
        return result;
    }, [mode, conflicts, customActions]);

    const willRemoveCount = conflicts.filter((c) => resolvedActions[c.key] === "reset" && c.reason === "unsupported_key").length;
    const willResetCount  = conflicts.filter((c) => resolvedActions[c.key] === "reset" && c.reason !== "unsupported_key").length;
    const willKeepCount   = conflicts.filter((c) => resolvedActions[c.key] === "keep").length;

    // Toggle a single row — auto-promotes to custom mode
    const toggleRowAction = (key: string) => {
        const current = resolvedActions[key] ?? "keep";
        const next = current === "keep" ? "reset" : "keep";
        setCustomActions((prev) => ({ ...prev, [key]: next }));
        setMode("custom");
    };

    const handleConfirm = () => {
        if (!conflictData) return;
        onConfirm(computeResolvedSettings(mode, conflictData, customActions));
    };

    if (!conflictData) return null;

    return (
        <TooltipProvider delayDuration={200}>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-3xl max-h-[88dvh] flex flex-col gap-0 p-0">

                    {/* ── Header ── */}
                    <DialogHeader className="px-5 py-3 border-b border-border shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            Model Switch — Settings Review
                        </DialogTitle>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{conflictData.prevModelName}</span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="font-medium text-foreground">{conflictData.newModelName}</span>
                            {hasConflicts ? (
                                <>
                                    <span>·</span>
                                    {unsupportedConflicts.length > 0 && (
                                        <span className="text-red-500 dark:text-red-400">{unsupportedConflicts.length} unsupported</span>
                                    )}
                                    {unsupportedConflicts.length > 0 && invalidValueConflicts.length > 0 && <span>·</span>}
                                    {invalidValueConflicts.length > 0 && (
                                        <span className="text-amber-500 dark:text-amber-400">{invalidValueConflicts.length} incompatible</span>
                                    )}
                                    <span>·</span>
                                    <span className="text-green-600 dark:text-green-400">{conflictData.supportedKeys.length} ok</span>
                                </>
                            ) : (
                                <>
                                    <span>·</span>
                                    <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                                        <CheckCircle2 className="w-3 h-3" /> all compatible
                                    </span>
                                </>
                            )}
                        </div>
                    </DialogHeader>

                    <ScrollArea className="flex-1 overflow-auto min-h-0">
                        <div className="px-5 py-4 space-y-4">

                            {/* ── No conflicts ── */}
                            {!hasConflicts && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                                    <p className="text-xs text-green-800 dark:text-green-200">
                                        All {conflictData.supportedKeys.length} settings are compatible. No changes needed.
                                    </p>
                                </div>
                            )}

                            {/* ── Conflicts ── */}
                            {hasConflicts && (
                                <>
                                    {/* Mode selector + outcome — single row */}
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">
                                            Resolve by:
                                        </span>
                                        <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted/50 border border-border">
                                            {RESOLUTION_MODES.map((m) => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onClick={() => setMode(m.id)}
                                                    className={cn(
                                                        "relative text-[11px] px-2.5 py-1 rounded font-medium transition-all whitespace-nowrap",
                                                        mode === m.id
                                                            ? "bg-background border border-border text-foreground shadow-sm"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    {m.label}
                                                    {m.recommended && mode !== m.id && (
                                                        <span className="ml-1 text-[8px] text-primary font-bold">★</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                        {/* Live tally */}
                                        <div className="flex items-center gap-2 text-[11px] ml-auto">
                                            {willRemoveCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                                                    <XCircle className="w-3 h-3" />{willRemoveCount} removed
                                                </span>
                                            )}
                                            {willResetCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                    <RefreshCw className="w-3 h-3" />{willResetCount} reset
                                                </span>
                                            )}
                                            {willKeepCount > 0 && (
                                                <span className="text-muted-foreground">{willKeepCount} kept</span>
                                            )}
                                            {willRemoveCount === 0 && willResetCount === 0 && (
                                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                                    <CheckCircle2 className="w-3 h-3" /> no changes
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Table */}
                                    <div className="rounded-lg border border-border overflow-hidden text-xs">
                                        {/* Header */}
                                        <div
                                            className="grid items-center bg-muted/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border gap-2"
                                            style={{ gridTemplateColumns: "16px minmax(0,1fr) 120px 130px 70px" }}
                                        >
                                            <div />
                                            <div>Setting</div>
                                            <div>Current Value</div>
                                            <div>New Default</div>
                                            <div className="text-right">Action</div>
                                        </div>

                                        {unsupportedConflicts.length > 0 && (
                                            <>
                                                <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50/60 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900/40 text-[10px] font-semibold text-red-600 dark:text-red-400">
                                                    <XCircle className="w-3 h-3 shrink-0" />
                                                    Not supported by {conflictData.newModelName}
                                                </div>
                                                {unsupportedConflicts.map((conflict) => (
                                                    <ConflictTableRow
                                                        key={conflict.key}
                                                        conflict={conflict}
                                                        action={resolvedActions[conflict.key] ?? "keep"}
                                                        newModelName={conflictData.newModelName}
                                                        aliasHint={getAliasHint(conflict.key, conflictData.newModelControls)}
                                                        onToggle={() => toggleRowAction(conflict.key)}
                                                    />
                                                ))}
                                            </>
                                        )}

                                        {invalidValueConflicts.length > 0 && (
                                            <>
                                                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                                    Value out of range for {conflictData.newModelName}
                                                </div>
                                                {invalidValueConflicts.map((conflict) => (
                                                    <ConflictTableRow
                                                        key={conflict.key}
                                                        conflict={conflict}
                                                        action={resolvedActions[conflict.key] ?? "keep"}
                                                        newModelName={conflictData.newModelName}
                                                        aliasHint={null}
                                                        onToggle={() => toggleRowAction(conflict.key)}
                                                    />
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Compatible settings */}
                            {conflictData.supportedKeys.length > 0 && (
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                                        Compatible — unchanged ({conflictData.supportedKeys.length})
                                    </p>
                                    <div className="flex flex-wrap gap-1 px-2 py-1.5 rounded-md bg-muted/20 border border-border">
                                        {conflictData.supportedKeys.map((key) => (
                                            <Badge key={key} variant="secondary" className="text-[10px] font-mono py-0 h-5 leading-none">
                                                {key}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    <Separator />

                    {/* ── Footer ── */}
                    <DialogFooter className="px-5 py-3 flex-row items-center justify-between gap-2 shrink-0">
                        <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
                            Cancel — Undo Switch
                        </Button>
                        <Button size="sm" onClick={handleConfirm} className="text-xs gap-1.5">
                            {hasConflicts ? <RefreshCw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            {hasConflicts ? "Apply & Switch" : "Switch Model"}
                        </Button>
                    </DialogFooter>

                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}

// ─── Conflict table row ───────────────────────────────────────────────────────

interface ConflictTableRowProps {
    conflict: ConflictItem;
    action: "keep" | "reset";
    newModelName: string;
    aliasHint: string | null;
    onToggle: () => void;
}

function ConflictTableRow({ conflict, action, newModelName, aliasHint, onToggle }: ConflictTableRowProps) {
    const isUnsupported = conflict.reason === "unsupported_key";
    const actionLabel = action === "keep" ? "Keep" : isUnsupported ? "Remove" : "Reset";

    return (
        <div
            className={cn(
                "grid items-center px-3 py-1.5 border-b border-border/40 last:border-b-0 gap-2 text-xs hover:bg-muted/20 transition-colors",
                isUnsupported ? "bg-red-50/20 dark:bg-red-950/10" : "bg-amber-50/20 dark:bg-amber-950/10"
            )}
            style={{ gridTemplateColumns: "16px minmax(0,1fr) 120px 130px 70px" }}
        >
            {/* Status icon */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center justify-center cursor-help">
                        {isUnsupported
                            ? <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-64 text-xs">{conflict.description}</TooltipContent>
            </Tooltip>

            {/* Setting name */}
            <div className="flex items-center gap-1.5 min-w-0">
                <code className="font-mono font-medium text-foreground bg-muted px-1.5 py-0.5 rounded truncate min-w-0 block">
                    {conflict.key}
                </code>
                {aliasHint && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="shrink-0 cursor-help">
                                <Lightbulb className="w-3.5 h-3.5 text-blue-400 hover:text-blue-500 transition-colors" />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                            <span className="font-semibold">{newModelName}</span> may use{" "}
                            <code className="font-mono bg-muted px-0.5 rounded">{aliasHint}</code> instead.
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>

            {/* Current value */}
            <div className="min-w-0 overflow-hidden">
                <code className="font-mono text-foreground bg-muted px-1 py-0.5 rounded block truncate">
                    {formatValue(conflict.currentValue)}
                </code>
            </div>

            {/* New default */}
            <div className="min-w-0 overflow-hidden">
                {isUnsupported ? (
                    <span className="italic text-muted-foreground/60 text-[10px]">not supported</span>
                ) : conflict.newModelDefault !== undefined && conflict.newModelDefault !== null ? (
                    <code className="font-mono text-foreground bg-muted px-1 py-0.5 rounded block truncate">
                        {formatValue(conflict.newModelDefault)}
                    </code>
                ) : (
                    <span className="italic text-muted-foreground/60 text-[10px]">no default</span>
                )}
            </div>

            {/* Action toggle — always clickable */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={onToggle}
                    className={cn(
                        "text-[11px] px-2 py-0.5 rounded border transition-all font-medium cursor-pointer whitespace-nowrap",
                        action === "reset"
                            ? isUnsupported
                                ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-200"
                                : "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-200"
                            : "bg-muted/60 border-border text-muted-foreground hover:bg-muted"
                    )}
                >
                    {actionLabel}
                </button>
            </div>
        </div>
    );
}

