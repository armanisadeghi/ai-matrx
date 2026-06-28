"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  FileText,
  Search,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Columns2,
  PanelLeft,
  Tag,
  Globe,
  Lock,
  Loader2,
  Waves,
  Cpu,
  RefreshCw,
  Check,
  Copy,
} from "lucide-react";
// TODO(prompts-deletion): PromptEditorContextMenu removed with features/prompts.
// Re-implement with features/context-menu-v3/EditableContextMenu or a new content-block picker.
import {
  ContentTemplateDB,
  CreateContentTemplateInput,
  UpdateContentTemplateInput,
  MessageRole,
} from "@/features/content-templates/types/content-templates-db";
import {
  fetchContentTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getAllTags,
  clearTemplateCache,
} from "@/features/content-templates/services/content-templates-service";
import MarkdownStream from "@/components/MarkdownStream";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { idMatchesQuery } from "@/utils/search-scoring";
import type {
  TypedStreamEvent,
  RenderBlockEvent,
} from "@/types/python-generated/stream-events";

interface ContentTemplateManagerProps {
  className?: string;
}

// Auto-resizing textarea component
const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    minHeight?: number;
  }
>(({ className, value, onChange, minHeight = 100, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useImperativeHandle(ref, () => textareaRef.current!);

  const adjustHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = Math.max(minHeight, scrollHeight) + "px";
    }
  }, [minHeight]);

  React.useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      adjustHeight();
      window.addEventListener("resize", adjustHeight);
      return () => window.removeEventListener("resize", adjustHeight);
    }
  }, [adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e);
    setTimeout(adjustHeight, 0);
  };

  return (
    <textarea
      ref={textareaRef}
      className={`flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden ${className}`}
      value={value}
      onChange={handleChange}
      style={{ minHeight: minHeight + "px" }}
      {...props}
    />
  );
});

AutoResizeTextarea.displayName = "AutoResizeTextarea";

const MESSAGE_ROLES: { value: MessageRole; label: string }[] = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
  { value: "tool", label: "Tool" },
];

export function ContentTemplateManager({
  className,
}: ContentTemplateManagerProps) {
  // State
  const [templates, setTemplates] = useState<ContentTemplateDB[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<ContentTemplateDB>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [createFormData, setCreateFormData] = useState<
    Partial<CreateContentTemplateInput>
  >({});
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(
    new Set(["system", "user", "assistant"]),
  );
  const [previewMode, setPreviewMode] = useState<
    "editor" | "preview" | "json" | "stream"
  >("preview");

  // Block-processing API
  const apiConfig = useApiTestConfig({ defaultServerType: "local" });
  const [processedEvents, setProcessedEvents] = useState<TypedStreamEvent[]>(
    [],
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [rawCopied, setRawCopied] = useState(false);
  const [strictServerData, setStrictServerData] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rawApiDataRef = useRef<string>("");

  const copyRawApiData = useCallback(() => {
    if (!rawApiDataRef.current) return;
    navigator.clipboard.writeText(rawApiDataRef.current).catch(() => {});
    setRawCopied(true);
    setTimeout(() => setRawCopied(false), 1500);
  }, []);

  const runBlockProcessing = useCallback(
    async (mode: "json" | "stream", content: string) => {
      if (!content.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsProcessing(true);
      setProcessError(null);
      setProcessedEvents([]);
      rawApiDataRef.current = "";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiConfig.authToken)
        headers["Authorization"] = `Bearer ${apiConfig.authToken}`;
      const body = JSON.stringify({ content });

      try {
        if (mode === "json") {
          const res = await fetch(
            `${apiConfig.baseUrl}${ENDPOINTS.blockProcessing.process}`,
            {
              method: "POST",
              headers,
              body,
              signal: controller.signal,
            },
          );
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(
              (d as any)?.detail || (d as any)?.message || `HTTP ${res.status}`,
            );
          }
          const text = await res.text();
          rawApiDataRef.current = text;
          const data = JSON.parse(text) as {
            blocks: Record<string, unknown>[];
          };
          const synthetic: TypedStreamEvent[] = data.blocks.map(
            (block, i): RenderBlockEvent => ({
              event: "render_block",
              data: {
                blockId: (block.blockId ??
                  block.block_id ??
                  `block-${i}`) as string,
                blockIndex: (block.blockIndex ??
                  block.block_index ??
                  i) as number,
                type: block.type as string,
                status: "complete",
                content: (block.content ?? null) as string | null,
                data: (block.data ?? null) as Record<string, unknown> | null,
                metadata: (block.metadata ?? {}) as Record<string, unknown>,
              },
            }),
          );
          setProcessedEvents(synthetic);
        } else {
          const res = await fetch(
            `${apiConfig.baseUrl}${ENDPOINTS.blockProcessing.processStream}`,
            {
              method: "POST",
              headers,
              body,
              signal: controller.signal,
            },
          );
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(
              (d as any)?.detail || (d as any)?.message || `HTTP ${res.status}`,
            );
          }
          const { events } = parseNdjsonStream(res, controller.signal);
          const acc: TypedStreamEvent[] = [];
          const lines: string[] = [];
          for await (const ev of events) {
            acc.push(ev);
            lines.push(JSON.stringify(ev));
            rawApiDataRef.current = lines.join("\n");
            setProcessedEvents([...acc]);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setProcessError(err.message);
        }
      } finally {
        abortRef.current = null;
        setIsProcessing(false);
      }
    },
    [apiConfig.authToken, apiConfig.baseUrl],
  );

  // Tag management for forms
  const [editTagInput, setEditTagInput] = useState("");
  const [createTagInput, setCreateTagInput] = useState("");

  // Textarea refs for context menu
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const createTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  const { toast } = useToast();

  // Load data from Supabase
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [templatesData, tagsData] = await Promise.all([
        fetchContentTemplates(),
        getAllTags(),
      ]);
      setTemplates(templatesData);
      setAllTags(tagsData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered and searched templates
  const filteredTemplates = templates.filter((template) => {
    const matchesRole =
      selectedRole === "all" || template.role === selectedRole;
    const matchesSearch =
      searchTerm === "" ||
      template.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.tags?.some((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase()),
      ) ||
      idMatchesQuery(template, searchTerm);

    return matchesRole && matchesSearch;
  });

  // Group templates by role for sidebar
  const groupedTemplates = filteredTemplates.reduce(
    (acc, template) => {
      const roleKey = template.role || "none";
      if (!acc[roleKey]) {
        acc[roleKey] = [];
      }
      acc[roleKey].push(template);
      return acc;
    },
    {} as Record<string, ContentTemplateDB[]>,
  );

  // Initialize edit data when template is selected
  useEffect(() => {
    const selectedTemplate = selectedTemplateId
      ? templates.find((t) => t.id === selectedTemplateId)
      : null;
    if (selectedTemplate) {
      setEditData({
        id: selectedTemplate.id,
        label: selectedTemplate.label,
        content: selectedTemplate.content,
        role: selectedTemplate.role,
        metadata: selectedTemplate.metadata,
        is_public: selectedTemplate.is_public,
        tags: selectedTemplate.tags,
      });
      setHasUnsavedChanges(false);
    }
  }, [selectedTemplateId, templates]);

  const handleCreateNew = () => {
    setCreateFormData({
      label: "",
      content: "",
      role: "user",
      metadata: {},
      is_public: false,
      tags: [],
    });
    setIsCreateDialogOpen(true);
  };

  const handleEditChange = (field: string, value: any) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedTemplateId || !editData.id) return;

    try {
      await updateTemplate({
        id: editData.id,
        label: editData.label || "",
        content: editData.content || "",
        role: editData.role || "user",
        metadata: editData.metadata,
        is_public: editData.is_public,
        tags: editData.tags || [],
      });

      setHasUnsavedChanges(false);
      clearTemplateCache();
      loadData();

      toast({
        title: "Success",
        description: "Template updated successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error saving changes:", error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    }
  };

  const handleCreateTemplate = async () => {
    try {
      if (
        !createFormData.label ||
        !createFormData.content ||
        !createFormData.role
      ) {
        toast({
          title: "Validation Error",
          description: "Label, content, and role are required",
          variant: "destructive",
        });
        return;
      }

      await createTemplate(createFormData as CreateContentTemplateInput);

      setIsCreateDialogOpen(false);
      clearTemplateCache();
      loadData();

      toast({
        title: "Success",
        description: "Template created successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error creating template:", error);
      toast({
        title: "Error",
        description: "Failed to create template",
        variant: "destructive",
      });
    }
  };

  const handleDiscardChanges = () => {
    const selectedTemplate = selectedTemplateId
      ? templates.find((t) => t.id === selectedTemplateId)
      : null;
    if (selectedTemplate) {
      setEditData({
        id: selectedTemplate.id,
        label: selectedTemplate.label,
        content: selectedTemplate.content,
        role: selectedTemplate.role,
        metadata: selectedTemplate.metadata,
        is_public: selectedTemplate.is_public,
        tags: selectedTemplate.tags,
      });
      setHasUnsavedChanges(false);
    }
  };

  const handleDeleteTemplate = async (template: ContentTemplateDB) => {
    if (!confirm(`Are you sure you want to delete "${template.label}"?`))
      return;

    try {
      await deleteTemplate(template.id);

      if (selectedTemplateId === template.id) {
        setSelectedTemplateId(null);
      }

      clearTemplateCache();
      loadData();

      toast({
        title: "Success",
        description: "Template deleted successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting template:", error);
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const handleTogglePublic = async (template: ContentTemplateDB) => {
    try {
      await updateTemplate({
        id: template.id,
        is_public: !template.is_public,
      });

      clearTemplateCache();
      loadData();

      toast({
        title: "Success",
        description: `Template is now ${!template.is_public ? "public" : "private"}`,
        variant: "success",
      });
    } catch (error) {
      console.error("Error toggling public status:", error);
      toast({
        title: "Error",
        description: "Failed to update template",
        variant: "destructive",
      });
    }
  };

  const toggleRoleExpanded = (role: string) => {
    setExpandedRoles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(role)) {
        newSet.delete(role);
      } else {
        newSet.add(role);
      }
      return newSet;
    });
  };

  const isRoleExpanded = (role: string) => expandedRoles.has(role);

  const getRoleLabel = (role: string) => {
    return MESSAGE_ROLES.find((r) => r.value === role)?.label || role;
  };

  // Tag management
  const handleAddTagToEdit = () => {
    if (editTagInput.trim() && !editData.tags?.includes(editTagInput.trim())) {
      handleEditChange("tags", [...(editData.tags || []), editTagInput.trim()]);
      setEditTagInput("");
    }
  };

  const handleRemoveTagFromEdit = (tag: string) => {
    handleEditChange("tags", editData.tags?.filter((t) => t !== tag) || []);
  };

  const handleAddTagToCreate = () => {
    if (
      createTagInput.trim() &&
      !createFormData.tags?.includes(createTagInput.trim())
    ) {
      setCreateFormData({
        ...createFormData,
        tags: [...(createFormData.tags || []), createTagInput.trim()],
      });
      setCreateTagInput("");
    }
  };

  const handleRemoveTagFromCreate = (tag: string) => {
    setCreateFormData({
      ...createFormData,
      tags: createFormData.tags?.filter((t) => t !== tag) || [],
    });
  };

  const selectedTemplate = selectedTemplateId
    ? templates.find((t) => t.id === selectedTemplateId)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full bg-textured overflow-hidden ${className}`}
    >
      {/* Sidebar */}
      <div className="w-80 border-r border-border flex flex-col overflow-hidden">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Content Templates
            </h2>
            <Button onClick={handleCreateNew} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Role Filter */}
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {MESSAGE_ROLES.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sidebar Content */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {Object.entries(groupedTemplates).map(([role, roleTemplates]) => (
              <div key={role} className="mb-2">
                {/* Role Header - Collapsible */}
                <div
                  className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md cursor-pointer transition-colors"
                  onClick={() => toggleRoleExpanded(role)}
                >
                  {isRoleExpanded(role) ? (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                  )}
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{getRoleLabel(role)}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                    ({roleTemplates.length})
                  </span>
                </div>

                {/* Role Content - Show only if expanded */}
                {isRoleExpanded(role) && (
                  <div className="ml-4 mt-1">
                    {roleTemplates.map((template) => (
                      <div
                        key={template.id}
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors
                                                    ${
                                                      selectedTemplateId ===
                                                      template.id
                                                        ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100"
                                                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                                    }`}
                      >
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {template.label}
                          </div>
                          {template.tags && template.tags.length > 0 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {template.tags.slice(0, 2).join(", ")}
                            </div>
                          )}
                        </div>
                        {template.is_public ? (
                          <Globe className="w-3 h-3 text-green-500" />
                        ) : (
                          <Lock className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Stats */}
        <div className="p-4 border-t border-border bg-gray-50 dark:bg-gray-800">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {filteredTemplates.length} templates (
            {templates.filter((t) => t.is_public).length} public)
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTemplate ? (
          <>
            {/* Header with Save/Discard buttons */}
            <div className="p-4 border-b border-border bg-textured">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Edit Template
                  </h1>
                  {hasUnsavedChanges && (
                    <Badge
                      variant="outline"
                      className="text-orange-600 border-orange-600"
                    >
                      Unsaved Changes
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasUnsavedChanges && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDiscardChanges}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Discard
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSaveChanges}
                    disabled={!hasUnsavedChanges}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTogglePublic(selectedTemplate)}
                  >
                    {selectedTemplate.is_public ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    {selectedTemplate.is_public
                      ? "Make Private"
                      : "Make Public"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteTemplate(selectedTemplate)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            {/* Inline Edit Form */}
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-label">Label</Label>
                        <Input
                          id="edit-label"
                          value={editData.label || ""}
                          onChange={(e) =>
                            handleEditChange("label", e.target.value)
                          }
                          placeholder="Template name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-role">Message Role</Label>
                        <Select
                          value={editData.role || "user"}
                          onValueChange={(value) =>
                            handleEditChange("role", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {MESSAGE_ROLES.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="edit-is-public"
                        checked={editData.is_public !== false}
                        onCheckedChange={(checked) =>
                          handleEditChange("is_public", checked)
                        }
                      />
                      <Label htmlFor="edit-is-public">
                        Public (accessible by all users)
                      </Label>
                    </div>
                  </CardContent>
                </Card>

                {/* Tags */}
                <Card>
                  <CardHeader>
                    <CardTitle>Tags</CardTitle>
                    <CardDescription>
                      Organize templates with tags for easy filtering
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a tag..."
                        value={editTagInput}
                        onChange={(e) => setEditTagInput(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleAddTagToEdit()
                        }
                      />
                      <Button
                        onClick={handleAddTagToEdit}
                        disabled={!editTagInput.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editData.tags?.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                          <X
                            className="w-3 h-3 cursor-pointer hover:text-destructive"
                            onClick={() => handleRemoveTagFromEdit(tag)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Template Content */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle>Template Content</CardTitle>
                        <CardDescription>
                          The message content for this template
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                          variant={
                            previewMode === "editor" ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setPreviewMode("editor")}
                          className="flex items-center gap-1.5"
                        >
                          <PanelLeft className="w-4 h-4" />
                          Editor Only
                        </Button>
                        <Button
                          variant={
                            previewMode === "preview" ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setPreviewMode("preview")}
                          className="flex items-center gap-1.5"
                        >
                          <Columns2 className="w-4 h-4" />
                          Split View
                        </Button>
                        <Button
                          variant={
                            previewMode === "json" ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => {
                            setPreviewMode("json");
                            runBlockProcessing("json", editData.content || "");
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <Cpu className="w-4 h-4" />
                          JSON
                        </Button>
                        <Button
                          variant={
                            previewMode === "stream" ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => {
                            setPreviewMode("stream");
                            runBlockProcessing(
                              "stream",
                              editData.content || "",
                            );
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <Waves className="w-4 h-4" />
                          Stream
                        </Button>
                        {(previewMode === "json" ||
                          previewMode === "stream") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              runBlockProcessing(
                                previewMode,
                                editData.content || "",
                              )
                            }
                            disabled={
                              isProcessing || !(editData.content || "").trim()
                            }
                            title="Re-run"
                            className="px-2"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Editor-only */}
                    {previewMode === "editor" && (
                      <AutoResizeTextarea
                        ref={editTextareaRef}
                        value={editData.content || ""}
                        onChange={(e) =>
                          handleEditChange("content", e.target.value)
                        }
                        placeholder="Enter the template content..."
                        className="font-mono text-sm"
                        minHeight={300}
                      />
                    )}

                    {/* Editor + client-side preview */}
                    {previewMode === "preview" && (
                      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                        <div className="flex-1 min-w-0">
                          <AutoResizeTextarea
                            ref={editTextareaRef}
                            value={editData.content || ""}
                            onChange={(e) =>
                              handleEditChange("content", e.target.value)
                            }
                            placeholder="Enter the template content..."
                            className="font-mono text-sm h-full"
                            minHeight={300}
                          />
                        </div>
                        <div className="flex-1 min-w-0 min-h-[300px] border border-border rounded-lg p-4 bg-textured overflow-auto">
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 pb-2 border-b border-border">
                            PREVIEW
                          </div>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <MarkdownStream content={editData.content || ""} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Editor + server-processed render */}
                    {(previewMode === "json" || previewMode === "stream") && (
                      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                        <div className="flex-1 min-w-0">
                          <AutoResizeTextarea
                            ref={editTextareaRef}
                            value={editData.content || ""}
                            onChange={(e) =>
                              handleEditChange("content", e.target.value)
                            }
                            placeholder="Enter the template content..."
                            className="font-mono text-sm h-full"
                            minHeight={300}
                          />
                        </div>
                        <div className="flex-1 min-w-0 min-h-[300px] border border-border rounded-lg bg-textured overflow-auto relative">
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0 px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
                            <span>
                              {previewMode === "json"
                                ? "JSON PROCESSED"
                                : "STREAM PROCESSED"}
                            </span>
                            <div className="flex items-center gap-1">
                              {isProcessing && (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              )}
                              <Button
                                size="sm"
                                variant={
                                  strictServerData ? "destructive" : "ghost"
                                }
                                className="h-6 px-2 text-[10px] font-mono"
                                onClick={() => setStrictServerData((v) => !v)}
                                title={
                                  strictServerData
                                    ? "Strict mode ON — client fallback disabled"
                                    : "Strict mode OFF — click to enable"
                                }
                              >
                                {strictServerData ? "STRICT" : "strict"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                onClick={copyRawApiData}
                                disabled={
                                  !processedEvents.length && !processError
                                }
                                title="Copy raw API response"
                              >
                                {rawCopied ? (
                                  <Check className="w-3 h-3 mr-1 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3 mr-1" />
                                )}
                                {rawCopied ? "Copied!" : "Copy raw"}
                              </Button>
                            </div>
                          </div>
                          <div className="p-4">
                            {isProcessing && processedEvents.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">
                                {previewMode === "stream"
                                  ? "Streaming blocks..."
                                  : "Processing..."}
                              </p>
                            )}
                            {processError && (
                              <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                                {processError}
                              </div>
                            )}
                            {!isProcessing &&
                              !processError &&
                              processedEvents.length === 0 && (
                                <p className="text-xs text-muted-foreground italic">
                                  No output — click{" "}
                                  <RefreshCw className="w-3 h-3 inline" /> to
                                  process.
                                </p>
                              )}
                            {processedEvents.length > 0 && (
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <MarkdownStream
                                  content=""
                                  events={processedEvents}
                                  isStreamActive={
                                    isProcessing && previewMode === "stream"
                                  }
                                  strictServerData={strictServerData}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Template Selected</h3>
              <p>
                Select a template from the sidebar to view and edit its details.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-label">Label</Label>
                <Input
                  id="create-label"
                  value={createFormData.label || ""}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      label: e.target.value,
                    })
                  }
                  placeholder="Template name"
                />
              </div>
              <div>
                <Label htmlFor="create-role">Message Role</Label>
                <Select
                  value={createFormData.role || "user"}
                  onValueChange={(value) =>
                    setCreateFormData({
                      ...createFormData,
                      role: value as MessageRole,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESSAGE_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags for Create */}
            <div>
              <Label htmlFor="create-tags">Tags</Label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={createTagInput}
                    onChange={(e) => setCreateTagInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAddTagToCreate()
                    }
                  />
                  <Button
                    onClick={handleAddTagToCreate}
                    disabled={!createTagInput.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {createFormData.tags?.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                      <X
                        className="w-3 h-3 cursor-pointer hover:text-destructive"
                        onClick={() => handleRemoveTagFromCreate(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="create-content">Content</Label>
              <AutoResizeTextarea
                ref={createTextareaRef}
                id="create-content"
                value={createFormData.content || ""}
                onChange={(e) =>
                  setCreateFormData({
                    ...createFormData,
                    content: e.target.value,
                  })
                }
                placeholder="Enter the template content..."
                className="font-mono"
                minHeight={200}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={createFormData.is_public !== false}
                  onCheckedChange={(checked) =>
                    setCreateFormData({
                      ...createFormData,
                      is_public: checked as boolean,
                    })
                  }
                />
                <Label className="text-sm">
                  Public (accessible by all users)
                </Label>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateTemplate}>Create</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
