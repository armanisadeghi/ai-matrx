"use client";

import React, { useState, useEffect } from "react";
import {
  Code,
  Save,
  X,
  Eye,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Settings,
  FileCode,
  Layers,
  Paintbrush,
  Type,
  AlertTriangle,
  CheckCircle,
  Info,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ToolUiComponentRow } from "@/features/tool-call-visualization/dynamic/types";
import {
  getAllAvailableImports,
  getDefaultImportsForToolRenderer,
} from "@/features/tool-call-visualization/dynamic/allowed-imports";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolUiComponentEditorProps {
  toolName?: string;
  toolId?: string;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Code template
// ---------------------------------------------------------------------------

const INLINE_TEMPLATE = `import React, { useState, useMemo } from 'react';
import { Globe, ExternalLink, CheckCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function ToolInline({ entry, events, onOpenOverlay, toolGroupId }) {
    if (entry.status === "error") {
        return (
            <div className="text-xs text-rose-600 dark:text-rose-400">
                {entry.errorMessage ?? "Tool failed"}
            </div>
        );
    }

    if (entry.status !== "completed") {
        return (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{entry.latestMessage ?? "Processing..."}</span>
            </div>
        );
    }

    const result = entry.result;
    const preview = typeof result === 'string'
        ? result.slice(0, 200)
        : JSON.stringify(result, null, 2).slice(0, 200);

    return (
        <div className="space-y-2">
            <div className="text-sm text-slate-700 dark:text-slate-300">
                {preview}
            </div>
            {onOpenOverlay && (
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenOverlay(\`tool-group-\${toolGroupId}\`); }}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                    View full result
                </button>
            )}
        </div>
    );
}
`;

const OVERLAY_TEMPLATE = `import React, { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function ToolOverlay({ entry, events, onOpenOverlay, toolGroupId }) {
    const [copied, setCopied] = useState(false);

    if (entry.status !== "completed" || entry.result == null) {
        return <div className="p-4 text-slate-500">No results available.</div>;
    }

    const result = entry.result;
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <Badge variant="outline">Full Result</Badge>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
            </div>
            <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-[60dvh] whitespace-pre-wrap">
                {text}
            </pre>
        </div>
    );
}
`;

const HEADER_SUBTITLE_TEMPLATE = `export default function headerSubtitle(entry) {
    const args = entry?.arguments ?? {};
    const query = args.query ?? args.q ?? args.search;
    return typeof query === "string" ? query : null;
}
`;

const HEADER_EXTRAS_TEMPLATE = `import React from 'react';
import { CheckCircle } from 'lucide-react';

export default function headerExtras(entry) {
    if (entry?.status !== "completed") return null;

    return (
        <div className="flex items-center gap-2 text-white/90 text-xs mt-1">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Complete</span>
        </div>
    );
}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ToolUiComponentEditor({
  toolName,
  toolId,
  onSaved,
}: ToolUiComponentEditorProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("inline");
  const [existingComponent, setExistingComponent] =
    useState<ToolUiComponentRow | null>(null);
  const [markAsV2ConfirmOpen, setMarkAsV2ConfirmOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    tool_name: toolName || "",
    tool_id: toolId || null,
    display_name: "",
    results_label: "",
    inline_code: INLINE_TEMPLATE,
    overlay_code: "",
    utility_code: "",
    header_extras_code: "",
    header_subtitle_code: "",
    keep_expanded_on_stream: false,
    allowed_imports: getDefaultImportsForToolRenderer(),
    language: "tsx" as "tsx" | "jsx",
    is_active: true,
    version: "1.0.0",
    notes: "",
    contract_version: 2 as 1 | 2,
  });

  const availableImports = getAllAvailableImports();

  // Load existing component if editing
  useEffect(() => {
    if (!toolName) return;

    setIsLoading(true);
    fetch(
      `/api/admin/tool-ui-components?tool_name=${encodeURIComponent(toolName)}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.components && data.components.length > 0) {
          const comp = data.components[0] as ToolUiComponentRow;
          setExistingComponent(comp);
          setFormData({
            tool_name: comp.tool_name,
            tool_id: comp.tool_id,
            display_name: comp.display_name,
            results_label: comp.results_label || "",
            inline_code: comp.inline_code,
            overlay_code: comp.overlay_code || "",
            utility_code: comp.utility_code || "",
            header_extras_code: comp.header_extras_code || "",
            header_subtitle_code: comp.header_subtitle_code || "",
            keep_expanded_on_stream: comp.keep_expanded_on_stream,
            allowed_imports: comp.allowed_imports,
            language: (comp.language === "jsx" ? "jsx" : "tsx") as
              | "tsx"
              | "jsx",
            is_active: comp.is_active,
            version: String(comp.version),
            notes: comp.notes || "",
            contract_version: comp.contract_version === 2 ? 2 : 1,
          });
        }
      })
      .catch(() => {
        // No existing component — that's fine
      })
      .finally(() => setIsLoading(false));
  }, [toolName]);

  const handleSave = async () => {
    if (
      !formData.tool_name ||
      !formData.display_name ||
      !formData.inline_code
    ) {
      toast({
        title: "Validation Error",
        description: "Tool name, display name, and inline code are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const isUpdate = !!existingComponent;
      const url = isUpdate
        ? `/api/admin/tool-ui-components/${existingComponent.id}`
        : "/api/admin/tool-ui-components";
      const method = isUpdate ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          overlay_code: formData.overlay_code || null,
          utility_code: formData.utility_code || null,
          header_extras_code: formData.header_extras_code || null,
          header_subtitle_code: formData.header_subtitle_code || null,
          results_label: formData.results_label || null,
          notes: formData.notes || null,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to save");
      }

      const result = await response.json();
      if (!isUpdate && result.component) {
        setExistingComponent(result.component);
      }

      toast({
        title: "Success",
        description: `Component ${isUpdate ? "updated" : "created"} successfully`,
      });
      onSaved?.();
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save component",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportToggle = (importPath: string) => {
    setFormData((prev) => {
      const current = prev.allowed_imports;
      if (current.includes(importPath)) {
        return {
          ...prev,
          allowed_imports: current.filter((p) => p !== importPath),
        };
      }
      return { ...prev, allowed_imports: [...current, importPath] };
    });
  };

  const handleUseTemplate = (
    field: "overlay_code" | "header_subtitle_code" | "header_extras_code",
  ) => {
    const templates: Record<string, string> = {
      overlay_code: OVERLAY_TEMPLATE,
      header_subtitle_code: HEADER_SUBTITLE_TEMPLATE,
      header_extras_code: HEADER_EXTRAS_TEMPLATE,
    };
    setFormData((prev) => ({ ...prev, [field]: templates[field] || "" }));
  };

  const handleMarkAsV2 = () => {
    setMarkAsV2ConfirmOpen(true);
  };

  const confirmMarkAsV2 = () => {
    setFormData((prev) => ({ ...prev, contract_version: 2 }));
    toast({
      title: "Marked as v2",
      description: "Save the component to persist the contract version change.",
    });
    setMarkAsV2ConfirmOpen(false);
  };

  const contractBanner =
    formData.contract_version === 1 ? (
      <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
          <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <div>
            <div className="font-medium">
              Contract v1 — rendered as fallback only
            </div>
            <div className="text-[11px] opacity-80 mt-0.5">
              This component still uses the dead ToolCallObject shape. Rewrite
              every code field against the new contract (entry, events), then
              click &ldquo;Mark as v2&rdquo; to re-enable runtime rendering.
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 flex-shrink-0"
          onClick={handleMarkAsV2}
        >
          Mark as v2
        </Button>
      </div>
    ) : (
      <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>
          Contract v2 — canonical ToolLifecycleEntry / ToolEventPayload
        </span>
      </div>
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Mobile: Stack all sections vertically
  if (isMobile) {
    return (
      <div className="space-y-6 p-4">
        {/* Status indicator */}
        {existingComponent && (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 pb-4 border-b border-border">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>
              Editing existing component (v{existingComponent.version})
            </span>
          </div>
        )}

        {contractBanner}

        {/* Inline Code Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <FileCode className="w-4 h-4" />
            Inline Component
          </h3>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Inline Component Code (Required)</Label>
              <Badge variant="outline" className="text-[10px]">
                TSX
              </Badge>
            </div>
            <Textarea
              value={formData.inline_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  inline_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[300px] leading-relaxed"
              style={{ fontSize: "16px" }}
              placeholder="Write your inline component code here..."
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              The compact preview shown in the chat stream. Receives props:
              entry, events, onOpenOverlay, toolGroupId, isPersisted
            </p>
          </div>
        </div>

        {/* Overlay Code Section */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <Layers className="w-4 h-4" />
            Overlay Component
          </h3>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Overlay Component Code (Optional)</Label>
              {!formData.overlay_code && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleUseTemplate("overlay_code")}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Template
                </Button>
              )}
            </div>
            <Textarea
              value={formData.overlay_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  overlay_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[300px] leading-relaxed"
              style={{ fontSize: "16px" }}
              placeholder="Write overlay component code (shown in the full-screen modal)..."
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              Full detailed view shown in the modal. If not provided, the inline
              component is used.
            </p>
          </div>
        </div>

        {/* Header Functions Section */}
        <div className="space-y-6 pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <Paintbrush className="w-4 h-4" />
            Header Customization
          </h3>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Header Subtitle Function (Optional)</Label>
              {!formData.header_subtitle_code && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleUseTemplate("header_subtitle_code")}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Template
                </Button>
              )}
            </div>
            <Textarea
              value={formData.header_subtitle_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  header_subtitle_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[120px] leading-relaxed"
              style={{ fontSize: "16px" }}
              placeholder="Function that receives entry and returns a subtitle string or null..."
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Header Extras Function (Optional)</Label>
              {!formData.header_extras_code && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleUseTemplate("header_extras_code")}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Template
                </Button>
              )}
            </div>
            <Textarea
              value={formData.header_extras_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  header_extras_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[150px] leading-relaxed"
              style={{ fontSize: "16px" }}
              placeholder="Function that receives entry and returns a ReactNode for the header..."
            />
          </div>
        </div>

        {/* Utility Code Section */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <Code className="w-4 h-4" />
            Utilities
          </h3>
          <div>
            <Label className="mb-2 block">Shared Utility Code (Optional)</Label>
            <Textarea
              value={formData.utility_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  utility_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[250px] leading-relaxed"
              style={{ fontSize: "16px" }}
              placeholder="Shared helper functions, parsers, constants available to all components..."
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              Export functions and constants here. They will be available in
              scope for inline, overlay, and header code.
            </p>
          </div>
        </div>

        {/* Config Section */}
        <div className="space-y-6 pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <Settings className="w-4 h-4" />
            Configuration
          </h3>

          {/* Basic settings */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="tool_name">Tool Name (identifier)</Label>
              <Input
                id="tool_name"
                value={formData.tool_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    tool_name: e.target.value,
                  }))
                }
                placeholder="e.g. web_search_v1"
                className="font-mono text-base"
                style={{ fontSize: "16px" }}
                disabled={!!toolName}
              />
            </div>
            <div>
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    display_name: e.target.value,
                  }))
                }
                placeholder="e.g. Web Search"
                className="text-base"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="results_label">Results Label</Label>
              <Input
                id="results_label"
                value={formData.results_label}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    results_label: e.target.value,
                  }))
                }
                placeholder="e.g. Search Results"
                className="text-base"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div>
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, version: e.target.value }))
                }
                placeholder="1.0.0"
                className="text-base"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="language">Language</Label>
            <Select
              value={formData.language}
              onValueChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  language: v as "tsx" | "jsx",
                }))
              }
            >
              <SelectTrigger
                id="language"
                className="text-base"
                style={{ fontSize: "16px" }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tsx">TSX (TypeScript)</SelectItem>
                <SelectItem value="jsx">JSX (JavaScript)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_active: checked }))
                }
              />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.keep_expanded_on_stream}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({
                    ...prev,
                    keep_expanded_on_stream: checked,
                  }))
                }
              />
              <Label>Keep expanded on stream</Label>
            </div>
          </div>

          {/* Allowed imports */}
          <div>
            <Label className="mb-2 block">Allowed Imports</Label>
            <div className="space-y-2">
              {availableImports.map((imp) => (
                <label
                  key={imp.path}
                  className="flex items-start gap-2 p-2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer text-xs"
                >
                  <Checkbox
                    checked={formData.allowed_imports.includes(imp.path)}
                    onCheckedChange={() => handleImportToggle(imp.path)}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <div className="font-mono text-slate-700 dark:text-slate-300">
                      {imp.path}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {imp.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Developer Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Any notes about this component..."
              rows={3}
              className="text-base"
              style={{ fontSize: "16px" }}
            />
          </div>
        </div>

        {/* Import rules info box */}
        <Card className="border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <p className="font-medium">Component Writing Rules:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-blue-700 dark:text-blue-300">
                  <li>
                    Write code as if it were a normal React file with imports
                    and <code>export default</code>
                  </li>
                  <li>
                    Props:{" "}
                    <code>
                      {
                        "{ entry, events, onOpenOverlay, toolGroupId, isPersisted }"
                      }
                    </code>
                  </li>
                  <li>
                    Only imports listed in the Allowed Imports config are
                    available
                  </li>
                  <li>
                    All Lucide icons are available by name (missing icons show a
                    placeholder)
                  </li>
                  <li>
                    Use <code>cn()</code> for conditional className merging
                  </li>
                  <li>
                    Do not use <code>import()</code> or <code>require()</code> —
                    only static import syntax
                  </li>
                  <li>
                    Utility code exports are automatically available in
                    inline/overlay scope
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        <div className="flex flex-col gap-3 pt-4 border-t border-border pb-safe">
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isSaving
              ? "Saving..."
              : existingComponent
                ? "Update Component"
                : "Create Component"}
          </Button>
        </div>
      </div>
    );
  }

  // Desktop: Use tabs
  return (
    <div className="space-y-6 p-1">
      {/* Status indicator */}
      {existingComponent && (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Editing existing component (v{existingComponent.version})</span>
        </div>
      )}

      {contractBanner}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="inline" className="text-xs">
            <FileCode className="w-3.5 h-3.5 mr-1" />
            Inline
          </TabsTrigger>
          <TabsTrigger value="overlay" className="text-xs">
            <Layers className="w-3.5 h-3.5 mr-1" />
            Overlay
          </TabsTrigger>
          <TabsTrigger value="extras" className="text-xs">
            <Paintbrush className="w-3.5 h-3.5 mr-1" />
            Header
          </TabsTrigger>
          <TabsTrigger value="utility" className="text-xs">
            <Code className="w-3.5 h-3.5 mr-1" />
            Utilities
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs">
            <Settings className="w-3.5 h-3.5 mr-1" />
            Config
          </TabsTrigger>
        </TabsList>

        {/* Inline Code Tab */}
        <TabsContent value="inline" className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Inline Component Code (Required)</Label>
              <Badge variant="outline" className="text-[10px]">
                TSX
              </Badge>
            </div>
            <Textarea
              value={formData.inline_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  inline_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[400px] leading-relaxed"
              placeholder="Write your inline component code here..."
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              The compact preview shown in the chat stream. Receives props:
              entry, events, onOpenOverlay, toolGroupId, isPersisted
            </p>
          </div>
        </TabsContent>

        {/* Overlay Code Tab */}
        <TabsContent value="overlay" className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Overlay Component Code (Optional)</Label>
              {!formData.overlay_code && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleUseTemplate("overlay_code")}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Use Template
                </Button>
              )}
            </div>
            <Textarea
              value={formData.overlay_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  overlay_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[400px] leading-relaxed"
              placeholder="Write overlay component code (shown in the full-screen modal)..."
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              Full detailed view shown in the modal. If not provided, the inline
              component is used.
            </p>
          </div>
        </TabsContent>

        {/* Header Functions Tab */}
        <TabsContent value="extras" className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Header Subtitle Function (Optional)</Label>
              {!formData.header_subtitle_code && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleUseTemplate("header_subtitle_code")}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Use Template
                </Button>
              )}
            </div>
            <Textarea
              value={formData.header_subtitle_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  header_subtitle_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[120px] leading-relaxed"
              placeholder="Function that receives entry and returns a subtitle string or null..."
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Header Extras Function (Optional)</Label>
              {!formData.header_extras_code && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleUseTemplate("header_extras_code")}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Use Template
                </Button>
              )}
            </div>
            <Textarea
              value={formData.header_extras_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  header_extras_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[150px] leading-relaxed"
              placeholder="Function that receives entry and returns a ReactNode for the header..."
            />
          </div>
        </TabsContent>

        {/* Utility Code Tab */}
        <TabsContent value="utility" className="space-y-4">
          <div>
            <Label className="mb-2 block">Shared Utility Code (Optional)</Label>
            <Textarea
              value={formData.utility_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  utility_code: e.target.value,
                }))
              }
              className="font-mono text-xs min-h-[300px] leading-relaxed"
              placeholder="Shared helper functions, parsers, constants available to all components..."
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              Export functions and constants here. They will be available in
              scope for inline, overlay, and header code.
            </p>
          </div>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="space-y-6">
          {/* Basic settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tool_name">Tool Name (identifier)</Label>
              <Input
                id="tool_name"
                value={formData.tool_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    tool_name: e.target.value,
                  }))
                }
                placeholder="e.g. web_search_v1"
                className="font-mono"
                disabled={!!toolName}
              />
            </div>
            <div>
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    display_name: e.target.value,
                  }))
                }
                placeholder="e.g. Web Search"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="results_label">Results Label</Label>
              <Input
                id="results_label"
                value={formData.results_label}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    results_label: e.target.value,
                  }))
                }
                placeholder="e.g. Search Results"
              />
            </div>
            <div>
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, version: e.target.value }))
                }
                placeholder="1.0.0"
              />
            </div>
            <div>
              <Label htmlFor="language">Language</Label>
              <Select
                value={formData.language}
                onValueChange={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    language: v as "tsx" | "jsx",
                  }))
                }
              >
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tsx">TSX (TypeScript)</SelectItem>
                  <SelectItem value="jsx">JSX (JavaScript)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_active: checked }))
                }
              />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.keep_expanded_on_stream}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({
                    ...prev,
                    keep_expanded_on_stream: checked,
                  }))
                }
              />
              <Label>Keep expanded on stream</Label>
            </div>
          </div>

          {/* Allowed imports */}
          <div>
            <Label className="mb-2 block">Allowed Imports</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {availableImports.map((imp) => (
                <label
                  key={imp.path}
                  className="flex items-start gap-2 p-2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer text-xs"
                >
                  <Checkbox
                    checked={formData.allowed_imports.includes(imp.path)}
                    onCheckedChange={() => handleImportToggle(imp.path)}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <div className="font-mono text-slate-700 dark:text-slate-300">
                      {imp.path}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {imp.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Developer Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Any notes about this component..."
              rows={3}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Save / Cancel */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {isSaving
            ? "Saving..."
            : existingComponent
              ? "Update Component"
              : "Create Component"}
        </Button>
      </div>

      {/* Import rules info box */}
      <Card className="border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <p className="font-medium">Component Writing Rules:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-blue-700 dark:text-blue-300">
                <li>
                  Write code as if it were a normal React file with imports and{" "}
                  <code>export default</code>
                </li>
                <li>
                  Props:{" "}
                  <code>
                    {
                      "{ entry, events, onOpenOverlay, toolGroupId, isPersisted }"
                    }
                  </code>
                </li>
                <li>
                  Only imports listed in the Allowed Imports config are
                  available
                </li>
                <li>
                  All Lucide icons are available by name (missing icons show a
                  placeholder)
                </li>
                <li>
                  Use <code>cn()</code> for conditional className merging
                </li>
                <li>
                  Do not use <code>import()</code> or <code>require()</code> —
                  only static import syntax
                </li>
                <li>
                  Utility code exports are automatically available in
                  inline/overlay scope
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
