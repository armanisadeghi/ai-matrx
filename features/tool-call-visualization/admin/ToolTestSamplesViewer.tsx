"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    FlaskConical,
    BookmarkCheck,
    BookmarkX,
    Pencil,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    AlertCircle,
    DollarSign,
    FileCode2,
} from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToolTestSample {
    id: string;
    tool_id: string | null;
    tool_name: string;
    tested_by: string | null;
    arguments: Record<string, unknown>;
    raw_stream_events: unknown[];
    final_payload: Record<string, unknown> | null;
    admin_comments: string | null;
    is_success: boolean | null;
    use_for_component: boolean;
    created_at: string;
    updated_at: string;
}

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
    const json = JSON.stringify(data, null, 2);
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
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
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
    onUpdate: (id: string, patch: Partial<ToolTestSample>) => Promise<void>;
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
                <Textarea
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
                <table className="w-full text-[11px]">
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
    onUpdate: (id: string, patch: Partial<ToolTestSample>) => Promise<void>;
}

function SampleCard({ sample, index, onUpdate }: SampleCardProps) {
    const fp = sample.final_payload;

    // final_payload structure:
    // { status, output: { full_result, model_facing_result }, metadata: { output_schema, cost_estimate, ... }, ... }
    const output = fp && typeof fp === "object" && "output" in fp
        ? (fp.output as Record<string, unknown>)
        : null;

    const metadata = fp && typeof fp === "object" && "metadata" in fp
        ? (fp.metadata as Record<string, unknown>)
        : null;

    const fullResult = output && "full_result" in output
        ? (output.full_result as Record<string, unknown>)
        : null;

    const toolOutput = fullResult && "output" in fullResult
        ? fullResult.output
        : null;

    const modelFacingResult = output && "model_facing_result" in output
        ? (output.model_facing_result as Record<string, unknown>)
        : null;

    const modelFacingContent = modelFacingResult && "content" in modelFacingResult
        ? (modelFacingResult.content as string)
        : null;

    const outputSchema = metadata && "output_schema" in metadata
        ? metadata.output_schema
        : null;

    const costEstimate = metadata && "cost_estimate" in metadata
        ? (metadata.cost_estimate as CostEstimate)
        : null;

    const durationMs = fullResult && "duration_ms" in fullResult
        ? (fullResult.duration_ms as number)
        : null;

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
                        <span className="font-mono">{(durationMs / 1000).toFixed(2)}s</span>
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
                        Stream ({sample.raw_stream_events?.length ?? 0})
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
                    {sample.raw_stream_events?.length > 0 ? (
                        <JsonBlock label={`raw_stream_events (${sample.raw_stream_events.length})`} data={sample.raw_stream_events} defaultExpanded />
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">No stream events captured.</p>
                    )}
                </TabsContent>

                {/* Raw final payload tab */}
                <TabsContent value="raw" className="p-3 mt-0">
                    {fp ? (
                        <JsonBlock label="final_payload (raw)" data={fp} defaultExpanded />
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

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .schema("tool").from("test_sample")
                .select("*")
                .or(`tool_name.eq.${toolName},tool_id.eq.${toolId}`)
                .order("created_at", { ascending: false });

            if (error) throw new Error(error.message);
            setSamples((data as ToolTestSample[]) ?? []);
        } catch (err) {
            toast({ title: "Failed to load samples", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toolName, toolId, toast]);

    useEffect(() => { load(); }, [load]);

    const handleUpdate = useCallback(async (id: string, patch: Partial<ToolTestSample>) => {
        const { error } = await supabase
            .schema("tool").from("test_sample")
            .update(patch)
            .eq("id", id);

        if (error) {
            toast({ title: "Update failed", description: error.message, variant: "destructive" });
            throw new Error(error.message);
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

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                    <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold truncate">{toolName}</span>
                    <Badge variant="outline" className="text-[11px] shrink-0">{samples.length} sample{samples.length !== 1 ? "s" : ""}</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 px-2 gap-1 text-xs shrink-0">
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Filter bar */}
            {!loading && samples.length > 0 && (
                <div className="flex-shrink-0 px-4 py-2.5 border-b border-border">
                    <FilterBar active={filter} onChange={setFilter} counts={counts} />
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : samples.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <AlertCircle className="h-8 w-8" />
                        <p className="text-sm">No test samples saved yet for this tool.</p>
                        <p className="text-xs text-center max-w-xs">
                            Run a test on the Tool Testing Dashboard and click &ldquo;Save Sample&rdquo; to capture a response here.
                        </p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                        <p className="text-sm">No samples match the current filter.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((sample, i) => (
                            <SampleCard key={sample.id} sample={sample} index={i} onUpdate={handleUpdate} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
