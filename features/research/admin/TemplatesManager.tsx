"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Edit2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Loader2,
  FileText,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import type { Json } from "@/types/database.types";
import type { ResearchTemplate, AutonomyLevel } from "../types";
import type {
  PromptBuiltinRef,
  TemplateFormData,
  AgentConfigKey,
} from "./types";
import { AGENT_CONFIG_KEYS, AGENT_CONFIG_META } from "./types";
import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  fetchPromptBuiltins,
  resolveBuiltinNames,
} from "./service";

function jsonToStringArray(value: Json | null | undefined): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toAutonomyLevel(value: string): AutonomyLevel {
  if (value === "auto" || value === "semi" || value === "manual") return value;
  return "semi";
}

function agentConfigStringField(
  config: Json | null,
  key: string,
): string | undefined {
  if (config === null || typeof config !== "object" || Array.isArray(config))
    return undefined;
  const v = (config as Record<string, Json>)[key];
  return typeof v === "string" ? v : undefined;
}

function jsonToAgentConfigStrings(value: Json | null): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

const EMPTY_FORM: TemplateFormData = {
  name: "",
  description: "",
  keyword_templates: [],
  default_tags: [],
  agent_config: {},
  autonomy_level: "semi",
  metadata: {},
};

export function TemplatesManager() {
  const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
  const [builtins, setBuiltins] = useState<PromptBuiltinRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [builtinNames, setBuiltinNames] = useState<Record<string, string>>({});

  const [editingTemplate, setEditingTemplate] =
    useState<ResearchTemplate | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState<TemplateFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ResearchTemplate | null>(
    null,
  );

  const [keywordInput, setKeywordInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [templatesData, builtinsData] = await Promise.all([
        fetchTemplates(),
        fetchPromptBuiltins(),
      ]);
      setTemplates(templatesData);
      setBuiltins(builtinsData);

      const allAgentIds = templatesData
        .flatMap((t) => Object.values(t.agent_config ?? {}))
        .filter((v): v is string => typeof v === "string" && v.length > 0);
      const uniqueIds = [...new Set(allAgentIds)];
      if (uniqueIds.length > 0) {
        const names = await resolveBuiltinNames(uniqueIds);
        setBuiltinNames(names);
      }
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = searchQuery
    ? filterAndSortBySearch(templates, searchQuery, [
        { get: (t) => t.name, weight: "title" },
        { get: (t) => t.description, weight: "body" },
      ])
    : templates;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setKeywordInput("");
    setTagInput("");
    setIsCreateOpen(true);
  };

  const openEdit = (template: ResearchTemplate) => {
    const rawMeta = template.metadata;
    const metadataRecord =
      rawMeta !== null && typeof rawMeta === "object" && !Array.isArray(rawMeta)
        ? (rawMeta as Record<string, unknown>)
        : {};
    setFormData({
      name: template.name,
      description: template.description ?? "",
      keyword_templates: jsonToStringArray(template.keyword_templates),
      default_tags: jsonToStringArray(template.default_tags),
      agent_config: jsonToAgentConfigStrings(template.agent_config),
      autonomy_level: toAutonomyLevel(template.autonomy_level),
      metadata: metadataRecord,
    });
    setKeywordInput("");
    setTagInput("");
    setEditingTemplate(template);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, formData);
        toast({
          title: "Updated",
          description: `Template "${formData.name}" updated.`,
        });
        setEditingTemplate(null);
      } else {
        await createTemplate(formData);
        toast({
          title: "Created",
          description: `Template "${formData.name}" created.`,
        });
        setIsCreateOpen(false);
      }
      await loadData();
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate(deleteTarget.id);
      toast({
        title: "Deleted",
        description: `Template "${deleteTarget.name}" deleted.`,
      });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !formData.keyword_templates.includes(kw)) {
      setFormData((prev) => ({
        ...prev,
        keyword_templates: [...prev.keyword_templates, kw],
      }));
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    setFormData((prev) => ({
      ...prev,
      keyword_templates: prev.keyword_templates.filter((k) => k !== kw),
    }));
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.default_tags.includes(tag)) {
      setFormData((prev) => ({
        ...prev,
        default_tags: [...prev.default_tags, tag],
      }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      default_tags: prev.default_tags.filter((t) => t !== tag),
    }));
  };

  const setAgentConfig = (key: AgentConfigKey, value: string) => {
    setFormData((prev) => ({
      ...prev,
      agent_config: { ...prev.agent_config, [key]: value },
    }));
  };

  const getAgentWiringCount = (template: ResearchTemplate) => {
    const raw = template.agent_config;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return 0;
    const config = raw as Record<string, Json>;
    return AGENT_CONFIG_KEYS.filter((k) => {
      const v = config[k];
      return typeof v === "string" && v.length > 0;
    }).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <MatrxMiniLoader />
      </div>
    );
  }

  const formContent = (
    <div className="space-y-5 max-h-[70dvh] overflow-y-auto pr-1">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name *</label>
        <ProInput
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="e.g., Company Research"
          className="text-base"
          wrapperClassName="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <ProTextarea
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="What this template is for..."
          autoGrow
          minHeight={60}
          maxHeight={160}
          className="text-base"
          wrapperClassName="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Autonomy Level</label>
        <Select
          value={formData.autonomy_level}
          onValueChange={(v: AutonomyLevel) =>
            setFormData((prev) => ({ ...prev, autonomy_level: v }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automatic</SelectItem>
            <SelectItem value="semi">Semi-Auto</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Keyword Templates</label>
        <div className="flex gap-2">
          <ProInput
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="Add keyword..."
            className="text-base flex-1"
            wrapperClassName="flex-1"
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), addKeyword())
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addKeyword}
            disabled={!keywordInput.trim()}
          >
            Add
          </Button>
        </div>
        {formData.keyword_templates.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {formData.keyword_templates.map((kw) => (
              <Badge key={kw} variant="secondary" className="gap-1 pr-1">
                {kw}
                <button
                  onClick={() => removeKeyword(kw)}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Default Tags</label>
        <div className="flex gap-2">
          <ProInput
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag..."
            className="text-base flex-1"
            wrapperClassName="flex-1"
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), addTag())
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addTag}
            disabled={!tagInput.trim()}
          >
            Add
          </Button>
        </div>
        {formData.default_tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {formData.default_tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1 pr-1">
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium">Agent Configuration</label>
        <p className="text-xs text-muted-foreground">
          Select a prompt builtin for each agent role. Leave empty to use system
          defaults.
        </p>
        <div className="space-y-2">
          {AGENT_CONFIG_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-48 shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs font-medium cursor-help">
                        {AGENT_CONFIG_META[key].label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        {AGENT_CONFIG_META[key].description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {AGENT_CONFIG_META[key].usedBy}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={formData.agent_config[key] ?? ""}
                onValueChange={(v) =>
                  setAgentConfig(key, v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger className="flex-1 text-xs h-8">
                  <SelectValue placeholder="System default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">
                      System default
                    </span>
                  </SelectItem>
                  {builtins.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <div className="relative flex-1 max-w-sm">
          <ProInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="text-base h-9"
            wrapperClassName="w-full"
            startIcon={
              <Search className="h-4 w-4 text-muted-foreground pointer-events-none" />
            }
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={loadData}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New Template
        </Button>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Name</TableHead>
              <TableHead className="w-20">System</TableHead>
              <TableHead className="w-24">Autonomy</TableHead>
              <TableHead className="w-20 text-center">Keywords</TableHead>
              <TableHead className="w-24 text-center">Agent Wiring</TableHead>
              <TableHead className="w-40">ID</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground py-12"
                >
                  {searchQuery
                    ? "No templates match your search."
                    : "No templates yet. Create one to get started."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((template) => {
              const isExpanded = expandedIds.has(template.id);
              const wiringCount = getAgentWiringCount(template);
              const keywordList = jsonToStringArray(template.keyword_templates);
              const defaultTagList = jsonToStringArray(template.default_tags);
              return (
                <TableRow key={template.id} className="group">
                  <TableCell className="px-2">
                    <button
                      onClick={() => toggleExpand(template.id)}
                      className="p-1 hover:bg-muted rounded"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium text-sm">
                        {template.name}
                      </span>
                      {template.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {template.description}
                        </p>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-3 space-y-3 border-t border-border pt-3">
                        {keywordList.length > 0 && (
                          <div>
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                              Keywords
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {keywordList.map((kw) => (
                                <Badge
                                  key={kw}
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {kw}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {defaultTagList.length > 0 && (
                          <div>
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                              Default Tags
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {defaultTagList.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {template.agent_config != null && (
                          <div>
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                              Agent Wiring
                            </span>
                            <div className="grid grid-cols-1 gap-1 mt-1">
                              {AGENT_CONFIG_KEYS.map((key) => {
                                const val = agentConfigStringField(
                                  template.agent_config,
                                  key,
                                );
                                return (
                                  <div
                                    key={key}
                                    className="flex items-center gap-2 text-[11px]"
                                  >
                                    <div
                                      className={cn(
                                        "h-2 w-2 rounded-full shrink-0",
                                        val
                                          ? "bg-green-500"
                                          : "bg-zinc-300 dark:bg-zinc-600",
                                      )}
                                    />
                                    <span className="text-muted-foreground w-40 shrink-0">
                                      {AGENT_CONFIG_META[key].label}
                                    </span>
                                    <span
                                      className={cn(
                                        "truncate",
                                        val
                                          ? "text-foreground"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {val
                                        ? (builtinNames[val] ??
                                          val.slice(0, 8) + "...")
                                        : "System default"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {template.metadata != null &&
                          Object.keys(template.metadata).length > 0 && (
                            <div>
                              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                                Metadata
                              </span>
                              <pre className="text-[10px] bg-muted/50 rounded p-2 mt-1 overflow-x-auto">
                                {JSON.stringify(template.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={template.is_system ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {template.is_system ? "System" : "Custom"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {template.autonomy_level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm tabular-nums">
                      {keywordList.length}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={
                        wiringCount === AGENT_CONFIG_KEYS.length
                          ? "default"
                          : "secondary"
                      }
                      className={cn(
                        "text-[10px]",
                        wiringCount === AGENT_CONFIG_KEYS.length
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : wiringCount > 0
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "",
                      )}
                    >
                      {wiringCount}/{AGENT_CONFIG_KEYS.length}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <code className="text-[10px] text-muted-foreground">
                        {template.id.slice(0, 8)}...
                      </code>
                      <button
                        onClick={() => copyId(template.id)}
                        className="p-0.5 hover:bg-muted rounded"
                      >
                        {copiedId === template.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 rounded-full"
                        onClick={() => openEdit(template)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 rounded-full text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(template)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Configure a reusable research template with default keywords,
              tags, and agent wiring.
            </DialogDescription>
          </DialogHeader>
          {formContent}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Modify template configuration. Changes apply to new projects only.
            </DialogDescription>
          </DialogHeader>
          {formContent}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}
              &rdquo;? This cannot be undone. Existing projects using this
              template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
