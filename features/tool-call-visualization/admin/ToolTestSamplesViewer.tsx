"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ThumbsUp,
    ThumbsDown,
    Minus,
    Copy,
    Check,
    Loader2,
    BookmarkCheck,
    BookmarkX,
    Pencil,
    ChevronDown,
    DollarSign,
    FileCode2,
} from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ProTextarea } from "@/components/official/ProTextarea";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { type Tables, type TablesUpdate } from "@/types/database.types";
import { isJsonArray, isJsonObject, type JsonObject } from "@/types/json";

// ─── Types ───────────────────────────────────────────────────────────────────

type ToolTestSample = Tables<{ schema: "tool" }, "test_sample">;
type ToolTestSamplePatch = Pick<
  TablesUpdate<{ schema: "tool" }, "test_sample">,
  "admin_comments" | "is_success" | "use_for_component"
>;

interface ToolTestSamplesViewerProps {
    toolName: string;
    toolId: string;
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ content, label = "Copy" }: { content: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        if (!content) return;
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // ignore
        }
    };
    return (
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2 gap-1" onClick={handleCopy} disabled={!content}>
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : label}
        </Button>
    );
}

// ─── Expandable JSON Block ────────────────────────────────────────────────────

function JsonBlock({ label, data, defaultExpanded = false }: { label: string; data: unknown; defaultExpanded?: boolean }) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const json = JSON.stringify(data, null, 2) ?? "null";
    const preview = json.slice(0, 120) + (json.length > 120 ? "…" : "");

    return (
        <div className="rounded border border-border bg-muted/30 text-xs">
            <button
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setExpanded((p) => !p)}
            >
                <span className="font-mono font-medium text-muted-foreground">{label}</span>
                <div className="flex items-center gap-2">
                    {!expanded && (
                        <span className="font-mono text-foreground/60 max-w-[240px] truncate">{preview}</span>
                    )}
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90" />}
                </div>
            </button>
            {expanded && (
                <div className="border-t border-border">
                    <div className="flex justify-end px-2 py-1 border-b border-border">
                        <CopyButton content={json} label="Copy JSON" />
                    </div>
                    <pre className="p-3 font-mono whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto text-foreground/80">
                        {json}
                    </pre>
                </div>
            )}
        </div>
    );
}

// ─── Inline Edit Row ──────────────────────────────────────────────────────────

interface InlineEditRowProps {
    sample: ToolTestSample;
    onUpdate: (id: string, patch: ToolTestSamplePatch) => Promise<void>;
}

function InlineEditRow({ sample, onUpdate }: InlineEditRowProps) {
    const [editing, setEditing] = useState(false);
    const [comments, setComments] = useState(sample.admin_comments ?? "");
    const [isSuccess, setIsSuccess] = useState<boolean | null>(sample.is_success);
    const [useForComponent, setUseForComponent] = useState(sample.use_for_component);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onUpdate(sample.id, {
                admin_comments: comments.trim() || null,
                is_success: isSuccess,
                use_for_component: useForComponent,
            });
            setEditing(false);
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setComments(sample.admin_comments ?? "");
        setIsSuccess(sample.is_success);
        setUseForComponent(sample.use_for_component);
        setEditing(false);
    };

    if (!editing) {
        return (
            <div className="flex items-center gap-3 flex-wrap">
                {/* Success badge */}
                {sample.is_success === true && (
                    <Badge variant="outline" className="text-[11px] gap-1 text-success border-success/40">
                        <ThumbsUp className="h-3 w-3" />
                        Success
                    </Badge>
                )}
                {sample.is_success === false && (
                    <Badge variant="outline" className="text-[11px] gap-1 text-destructive border-destructive/40">
                        <ThumbsDown className="h-3 w-3" />
                        Failure
                    </Badge>
                )}
                {sample.is_success === null && (
                    <Badge variant="outline" className="text-[11px] gap-1 text-muted-foreground">
                        <Minus className="h-3 w-3" />
                        Unset
                    </Badge>
                )}

                {/* Use for component */}
                {sample.use_for_component ? (
                    <Badge variant="secondary" className="text-[11px] gap-1">
                        <BookmarkCheck className="h-3 w-3" />
                        Use for component
                    </Badge>
                ) : (
                    <Badge variant="outline" className="text-[11px] gap-1 text-muted-foreground">
                        <BookmarkX className="h-3 w-3" />
                        Not marked
                    </Badge>
                )}

                {sample.admin_comments && (
                    <span className="text-xs text-muted-foreground italic truncate max-w-[280px]">
                        &ldquo;{sample.admin_comments}&rdquo;
                    </span>
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] gap-1 ml-auto"
                    onClick={() => setEditing(true)}
                >
                    <Pencil className="h-3 w-3" />
                    Edit
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-3 p-3 rounded border border-border bg-muted/20">
            <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Success?</Label>
                <div className="flex gap-1.5">
                    <Button
                        size="sm"
                        variant={isSuccess === true ? "default" : "outline"}
                        className="h-7 text-xs px-2.5 gap-1 flex-1"
                        onClick={() => setIsSuccess(isSuccess === true ? null : true)}
                    >
                        <ThumbsUp className="h-3 w-3" />
                        Yes
                    </Button>
                    <Button
                        size="sm"
                        variant={isSuccess === null ? "secondary" : "outline"}
                        className="h-7 text-xs px-2.5 gap-1 flex-1"
                        onClick={() => setIsSuccess(null)}
                    >
                        <Minus className="h-3 w-3" />
                        Unset
                    </Button>
                    <Button
                        size="sm"
                        variant={isSuccess === false ? "destructive" : "outline"}
                        className="h-7 text-xs px-2.5 gap-1 flex-1"
                        onClick={() => setIsSuccess(isSuccess === false ? null : false)}
                    >
                        <ThumbsDown className="h-3 w-3" />
                        No
                    </Button>
                </div>
            </div>

            <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Comments</Label>
                <ProTextarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Admin notes about this sample…"
                    className="text-xs min-h-[56px] resize-none"
                />
            </div>

            <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground cursor-pointer" htmlFor={`ufc-${sample.id}`}>
                    Use for component
                </Label>
                <Switch
                    id={`ufc-${sample.id}`}
                    checked={useForComponent}
                    onCheckedChange={setUseForComponent}
                    className="scale-75 origin-right"
                />
            </div>

            <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={handleCancel} disabled={saving}>
                    Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs px-3 gap-1" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    {saving ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}

// ─── Cost Estimate Display ────────────────────────────────────────────────────

interface CostModel {
    model: string;
    api: string;
    input_price_per_million: number;
    estimated_cost_usd: number;
}

interface CostEstimate {
    char_count: number;
    estimated_tokens: number;
    chars_per_token: number;
    models: CostModel[];
}

function jsonObjectField(value: JsonObject | null, field: string): JsonObject | null {
    const candidate = value?.[field];
    return isJsonObject(candidate) ? candidate : null;
}

function stringField(value: JsonObject | null, field: string): string | null {
    const candidate = value?.[field];
    return typeof candidate === "string" ? candidate : null;
}

function numberField(value: JsonObject | null, field: string): number | null {
    const candidate = value?.[field];
    return typeof candidate === "number" ? candidate : null;
}

function parseCostEstimate(value: unknown): CostEstimate | null {
    if (!isJsonObject(value)) return null;
    const charCount = numberField(value, "char_count");
    const estimatedTokens = numberField(value, "estimated_tokens");
    const charsPerToken = numberField(value, "chars_per_token");
    const models = value.models;
    if (
        charCount === null ||
        estimatedTokens === null ||
        charsPerToken === null ||
        !isJsonArray(models)
    ) {
        return null;
    }
    const parsedModels: CostModel[] = [];
    for (const model of models) {
        if (!isJsonObject(model)) return null;
        const name = stringField(model, "model");
        const api = stringField(model, "api");
        const inputPrice = numberField(model, "input_price_per_million");
        const estimatedCost = numberField(model, "estimated_cost_usd");
        if (
            name === null ||
            api === null ||
            inputPrice === null ||
            estimatedCost === null
        ) {
            return null;
        }
        parsedModels.push({
            model: name,
            api,
            input_price_per_million: inputPrice,
            estimated_cost_usd: estimatedCost,
        });
    }
    return {
        char_count: charCount,
        estimated_tokens: estimatedTokens,
        chars_per_token: charsPerToken,
        models: parsedModels,
    };
}

function sampleStatus(sample: ToolTestSample): "Success" | "Failure" | "Unset" {
    if (sample.is_success === true) return "Success";
    if (sample.is_success === false) return "Failure";
    return "Unset";
}

function CostEstimatePanel({ cost }: { cost: CostEstimate }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono">{cost.estimated_tokens.toLocaleString()} tokens</span>
                <span>·</span>
                <span className="font-mono">{cost.char_count.toLocaleString()} chars</span>
                <span>·</span>
                <span className="font-mono">{cost.chars_per_token} chars/token</span>
            </div>
            <div className="rounded border border-border overflow-hidden">
                <table className="text-[11px]">
                    <thead>
                        <tr className="bg-muted/50 border-b border-border">
                            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Model</th>
                            <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">API</th>
                            <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">$/M tokens</th>
                            <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Est. Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cost.models.map((m) => (
                            <tr key={m.model} className="border-b border-border last:border-0 hover:bg-muted/30">
                                <td className="px-3 py-1.5 font-mono text-foreground">{m.model}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{m.api}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">${m.input_price_per_million.toFixed(2)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-foreground font-medium">${m.estimated_cost_usd.toFixed(6)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Sample Card ──────────────────────────────────────────────────────────────

interface SampleCardProps {
    sample: ToolTestSample;
    index: number;
    onUpdate: (id: string, patch: ToolTestSamplePatch) => Promise<void>;
}

function SampleCard({ sample, index, onUpdate }: SampleCardProps) {
    const finalPayload = sample.final_payload;
    const fp = isJsonObject(finalPayload) ? finalPayload : null;
    const rawStreamEvents = isJsonArray(sample.raw_stream_events)
        ? sample.raw_stream_events
        : [];

    // final_payload structure:
    // { status, output: { full_result, model_facing_result }, metadata: { output_schema, cost_estimate, ... }, ... }
    const output = jsonObjectField(fp, "output");
    const metadata = jsonObjectField(fp, "metadata");
    const fullResult = jsonObjectField(output, "full_result");
    const toolOutput = fullResult?.output ?? null;
    const modelFacingResult = jsonObjectField(output, "model_facing_result");
    const modelFacingContent = stringField(modelFacingResult, "content");
    const outputSchema = metadata?.output_schema ?? null;
    const costEstimate = parseCostEstimate(metadata?.cost_estimate);
    const durationMs = numberField(fullResult, "duration_ms");

    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                        #{index + 1}
                    </span>
                    {sample.is_success === true && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                            <ThumbsUp className="h-3 w-3" />
                            Success
                        </span>
                    )}
                    {sample.is_success === false && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
                            <ThumbsDown className="h-3 w-3" />
                            Failure
                        </span>
                    )}
                    {sample.use_for_component && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5 h-4 px-1.5">
                            <BookmarkCheck className="h-2.5 w-2.5" />
                            Component
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {durationMs !== null && (
                        <span className="font-mono">
                            {formatDurationMs(durationMs, { style: "compact" })}
                        </span>
                    )}
                    <span>{formatDistanceToNow(new Date(sample.created_at), { addSuffix: true })}</span>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="annotations" className="flex-1">
                <TabsList className="w-full rounded-none border-b border-border bg-transparent h-8 px-3 gap-1 justify-start overflow-x-auto">
                    <TabsTrigger value="annotations" className="text-[11px] h-7 px-2.5 data-[state=active]:bg-muted shrink-0">
                        Annotations
                    </TabsTrigger>
                    <TabsTrigger value="arguments" className="text-[11px] h-7 px-2.5 data-[state=active]:bg-muted shrink-0">
                        Arguments
                    </TabsTrigger>
                    <TabsTrigger value="result" className="text-[11px] h-7 px-2.5 data-[state=active]:bg-muted shrink-0">
                        Result
                    </TabsTrigger>
                    {modelFacingContent && (
                        <TabsTrigger value="model" className="text-[11px] h-7 px-2.5 data-[state=active]:bg-muted shrink-0">
                            Model
                        </TabsTrigger>
                    )}
                    {outputSchema != null && (
                        <TabsTrigger value="schema" className="text-[11px] h-7 px-2.5 data-[state=active]:bg-muted shrink-0 gap-1">
                            <FileCode2 className="h-3 w-3" />
                            Schema
                        </TabsTrigger>
                    )}
                    {costEstimate && (
                        <TabsTrigger value="cost" className="text-[11px] h-7 px-2.5 data-[state=active]:bg-muted shrink-0 gap-1">
                            <DollarSign className="h-3 w-3" />
                            Cost
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="stream" className="text-[11px] h-7 px-2.5 data-[state=active]:bg-muted shrink-0">
                        Stream ({rawStreamEvents.length})
                    </TabsTrigger>
                    <TabsTrigger value="raw" className="text-[11px] h-7 px-2.5 data-[state=active]:bg-muted shrink-0">
                        Raw
                    </TabsTrigger>
                </TabsList>

                {/* Annotations tab */}
                <TabsContent value="annotations" className="p-3 mt-0">
                    <InlineEditRow sample={sample} onUpdate={onUpdate} />
                </TabsContent>

                {/* Arguments tab */}
                <TabsContent value="arguments" className="p-3 mt-0">
                    <JsonBlock label="arguments" data={sample.arguments} defaultExpanded />
                </TabsContent>

                {/* Result tab — shows actual tool output */}
                <TabsContent value="result" className="p-3 mt-0 space-y-2">
                    {toolOutput ? (
                        <>
                            <JsonBlock label="output" data={toolOutput} defaultExpanded />
                            {fullResult && (
                                <JsonBlock label="full_result" data={fullResult} />
                            )}
                        </>
                    ) : fullResult ? (
                        <JsonBlock label="full_result" data={fullResult} defaultExpanded />
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">No result captured.</p>
                    )}
                </TabsContent>

                {/* Model-facing content tab */}
                {modelFacingContent && (
                    <TabsContent value="model" className="p-3 mt-0 space-y-2">
                        <div className="rounded border border-border bg-muted/30">
                            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                                <span className="text-[11px] font-mono font-medium text-muted-foreground">
                                    model_facing_result.content
                                </span>
                                <CopyButton content={modelFacingContent} label="Copy" />
                            </div>
                            <pre className="p-3 text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-96 overflow-y-auto">
                                {modelFacingContent}
                            </pre>
                        </div>
                        {modelFacingResult && (
                            <JsonBlock label="model_facing_result" data={modelFacingResult} />
                        )}
                    </TabsContent>
                )}

                {/* Output schema tab */}
                {outputSchema != null && (
                    <TabsContent value="schema" className="p-3 mt-0">
                        <JsonBlock label="output_schema" data={outputSchema} defaultExpanded />
                    </TabsContent>
                )}

                {/* Cost estimate tab */}
                {costEstimate && (
                    <TabsContent value="cost" className="p-3 mt-0">
                        <CostEstimatePanel cost={costEstimate} />
                    </TabsContent>
                )}

                {/* Stream tab */}
                <TabsContent value="stream" className="p-3 mt-0">
                    {rawStreamEvents.length > 0 ? (
                        <JsonBlock label={`raw_stream_events (${rawStreamEvents.length})`} data={rawStreamEvents} defaultExpanded />
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">No stream events captured.</p>
                    )}
                </TabsContent>

                {/* Raw final payload tab */}
                <TabsContent value="raw" className="p-3 mt-0">
                    {finalPayload !== null ? (
                        <JsonBlock label="final_payload (raw)" data={finalPayload} defaultExpanded />
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">No payload captured.</p>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

type FilterType = "all" | "success" | "failure" | "unset" | "component";

function FilterBar({ active, onChange, counts }: {
    active: FilterType;
    onChange: (f: FilterType) => void;
    counts: Record<FilterType, number>;
}) {
    const filters: { key: FilterType; label: string }[] = [
        { key: "all", label: "All" },
        { key: "success", label: "Success" },
        { key: "failure", label: "Failure" },
        { key: "unset", label: "Unset" },
        { key: "component", label: "For Component" },
    ];

    return (
        <div className="flex flex-wrap gap-1.5">
            {filters.map(({ key, label }) => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                        active === key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                    }`}
                >
                    {label}
                    <span className={`text-[10px] ${active === key ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {counts[key]}
                    </span>
                </button>
            ))}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ToolTestSamplesViewer({ toolName, toolId }: ToolTestSamplesViewerProps) {
    const { toast } = useToast();
    const [samples, setSamples] = useState<ToolTestSample[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>("all");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .schema("tool").from("test_sample")
                .select("*")
                .or(`tool_name.eq.${toolName},tool_id.eq.${toolId}`)
                .order("created_at", { ascending: false });

            if (error) throw operationFailed("load the test samples", error);
            const nextSamples = data ?? [];
            setSamples(nextSamples);
            // The pre-table view showed every sample card and its workflow by
            // default. Keep that scan path while making each record independently
            // collapsible through the shared multi-expanded-detail contract.
            setExpandedIds(new Set(nextSamples.map((sample) => sample.id)));
        } catch (err) {
            toast({ title: "Failed to load samples", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toolName, toolId, toast]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void load();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const handleUpdate = useCallback(async (id: string, patch: ToolTestSamplePatch) => {
        const { error } = await supabase
            .schema("tool").from("test_sample")
            .update(patch)
            .eq("id", id);

        if (error) {
            const failure = operationFailed("update that sample", error);
            toast({ title: "Update failed", description: failure.message, variant: "destructive" });
            throw failure;
        }

        setSamples((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
        toast({ title: "Sample updated" });
    }, [toast]);

    const counts: Record<FilterType, number> = {
        all: samples.length,
        success: samples.filter((s) => s.is_success === true).length,
        failure: samples.filter((s) => s.is_success === false).length,
        unset: samples.filter((s) => s.is_success === null).length,
        component: samples.filter((s) => s.use_for_component).length,
    };

    const filtered = samples.filter((s) => {
        if (filter === "success") return s.is_success === true;
        if (filter === "failure") return s.is_success === false;
        if (filter === "unset") return s.is_success === null;
        if (filter === "component") return s.use_for_component;
        return true;
    });

    const columns: MatrxColumnDef<ToolTestSample>[] = [
        {
            id: "status",
            header: "Status",
            accessorFn: sampleStatus,
            filter: "select",
            filterOptions: [
                { value: "Success", label: "Success" },
                { value: "Failure", label: "Failure" },
                { value: "Unset", label: "Unset" },
            ],
            width: 110,
            cell: (sample) => {
                const status = sampleStatus(sample);
                return (
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-[11px] gap-1",
                            status === "Success" && "text-success border-success/40",
                            status === "Failure" && "text-destructive border-destructive/40",
                            status === "Unset" && "text-muted-foreground",
                        )}
                    >
                        {status === "Success" ? <ThumbsUp className="h-3 w-3" /> : status === "Failure" ? <ThumbsDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        {status}
                    </Badge>
                );
            },
        },
        {
            id: "component",
            header: "Component",
            accessorKey: "use_for_component",
            filter: "boolean",
            width: 120,
            cell: (sample) => (
                <Badge variant={sample.use_for_component ? "secondary" : "outline"} className="text-[11px] gap-1">
                    {sample.use_for_component ? <BookmarkCheck className="h-3 w-3" /> : <BookmarkX className="h-3 w-3" />}
                    {sample.use_for_component ? "Use for component" : "Not marked"}
                </Badge>
            ),
        },
        {
            id: "comments",
            header: "Admin comments",
            accessorFn: (sample) => sample.admin_comments ?? "",
            width: 320,
            cell: (sample) => (
                <span className="block max-w-[320px] truncate text-xs text-muted-foreground" title={sample.admin_comments ?? undefined}>
                    {sample.admin_comments ? `“${sample.admin_comments}”` : "—"}
                </span>
            ),
        },
        {
            id: "tested_by",
            header: "Tested by",
            accessorFn: (sample) => sample.tested_by ?? "",
            width: 180,
            cell: (sample) => <span className="text-xs">{sample.tested_by ?? "—"}</span>,
        },
        {
            id: "created_at",
            header: "Captured",
            accessorKey: "created_at",
            filter: "date",
            width: 170,
            cell: (sample) => (
                <span className="text-xs text-muted-foreground" title={sample.created_at}>
                    {formatDistanceToNow(new Date(sample.created_at), { addSuffix: true })}
                </span>
            ),
        },
    ];

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="min-h-0 flex-1 p-4">
                <MatrxDataTable<ToolTestSample>
                    tableId="tool-test-samples"
                    data={filtered}
                    columns={columns}
                    getRowId={(sample) => sample.id}
                    isLoading={loading && samples.length === 0}
                    isFetching={loading && samples.length > 0}
                    defaultSort={{ id: "created_at", direction: "desc" }}
                    toolbar={{
                        title: `${toolName} test samples`,
                        searchPlaceholder: "Search samples…",
                        leading: !loading && samples.length > 0 ? <FilterBar active={filter} onChange={setFilter} counts={counts} /> : undefined,
                        refresh: { onRefresh: load },
                    }}
                    coverage={{
                        noun: "test sample",
                        answeredBy: "client",
                        cap: 1000,
                        loaded: samples.length,
                    }}
                    detail={{ enabled: false }}
                    window={{ enabled: false }}
                    copy={false}
                    emptyState={{
                        title: samples.length === 0
                            ? "No test samples saved yet for this tool."
                            : "No samples match the current filter.",
                        description: samples.length === 0
                            ? "Run a test on the Tool Testing Dashboard and save the response to capture it here."
                            : undefined,
                    }}
                    expandedDetail={{
                        expandedIds,
                        onExpandedIdsChange: setExpandedIds,
                        render: (sample) => (
                            <SampleCard
                                sample={sample}
                                index={filtered.findIndex((item) => item.id === sample.id)}
                                onUpdate={handleUpdate}
                            />
                        ),
                    }}
                    rowActions={(sample, controls) => (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={controls.toggleExpanded}
                        >
                            {controls.isExpanded ? "Collapse" : "Inspect"}
                        </Button>
                    )}
                />
            </div>
        </div>
    );
}
