"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  Search,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Edit2,
  Settings,
  Check,
  Copy,
  Columns2,
  PanelLeft,
  Loader2,
  Waves,
  Cpu,
  RefreshCw,
} from "lucide-react";
import {
  ContentBlockDB,
  CategoryConfigDB,
  SubcategoryConfigDB,
  CreateContentBlockInput,
  UpdateContentBlockInput,
  CategoryWithSubcategories,
} from "@/types/content-blocks-db";
import { createClient } from "@/utils/supabase/client";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import MarkdownStream from "@/components/MarkdownStream";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import type {
  TypedStreamEvent,
  RenderBlockEvent,
} from "@/types/python-generated/stream-events";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";

interface ContentBlocksManagerProps {
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
      // Adjust on window resize
      window.addEventListener("resize", adjustHeight);
      return () => window.removeEventListener("resize", adjustHeight);
    }
  }, [adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e);
    // Small delay to ensure the value is updated before adjusting height
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

// Simplified category interface - all categories are equal, just organized hierarchically
interface Category {
  id: string;
  parent_category_id: string | null;
  label: string;
  icon_name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  children?: Category[];
}

export function ContentBlocksManager({ className }: ContentBlocksManagerProps) {
  // State
  const [contentBlocks, setContentBlocks] = useState<ContentBlockDB[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<ContentBlockDB>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [createFormData, setCreateFormData] = useState<
    Partial<CreateContentBlockInput>
  >({});
  // Collapsible state management
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  // Category management
  const [isCategoryManagementOpen, setIsCategoryManagementOpen] =
    useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryData, setNewCategoryData] = useState({
    label: "",
    icon_name: "Folder",
    color: "#3b82f6",
    parent_category_id: null as string | null,
  });
  // Quick create modals for "New..." option
  const [isQuickCreateCategoryOpen, setIsQuickCreateCategoryOpen] =
    useState(false);
  const [quickCreateContext, setQuickCreateContext] = useState<
    "edit" | "create"
  >("create");
  const [quickCategoryData, setQuickCategoryData] = useState({
    label: "",
    icon_name: "Folder",
    color: "#3b82f6",
    parent_category_id: null as string | null,
  });
  // Preview mode for Template Content
  const [previewMode, setPreviewMode] = useState<
    "editor" | "preview" | "json" | "stream"
  >("preview");

  // Block-processing API state
  const apiConfig = useApiTestConfig({ defaultServerType: "local" });
  const [processedEvents, setProcessedEvents] = useState<TypedStreamEvent[]>(
    [],
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [lastProcessedTemplate, setLastProcessedTemplate] =
    useState<string>("");
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
    async (mode: "json" | "stream", template: string) => {
      if (!template.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsProcessing(true);
      setProcessError(null);
      setProcessedEvents([]);
      setLastProcessedTemplate(template);
      rawApiDataRef.current = "";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiConfig.authToken)
        headers["Authorization"] = `Bearer ${apiConfig.authToken}`;
      const body = JSON.stringify({ content: template });

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

  // Re-run when switching to json/stream mode or when template changes while in those modes
  useEffect(() => {
    if (previewMode !== "json" && previewMode !== "stream") return;
    const template = editData.template || "";
    if (template === lastProcessedTemplate && processedEvents.length > 0)
      return;
    runBlockProcessing(previewMode, template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);
  // Delete confirmation dialog state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    type: "block" | "category" | null;
    item: any | null;
    hasChildren?: boolean;
    hasBlocks?: number;
  }>({
    isOpen: false,
    type: null,
    item: null,
  });

  // Toast notifications
  const { toast } = useToast();

  // Load data from Supabase
  const loadData = async () => {
    try {
      setLoading(true);
      const supabase = createClient();

      // Load all categories from platform.categories (dimension: shortcut)
      const { data: allCategoriesData, error: categoryError } = await supabase
        .schema("platform")
        .from("categories")
        .select(
          "id, label:name, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, parent_category_id:parent_id, placement_type",
        )
        .eq("dimension", "shortcut")
        .eq("placement_type", "content-block")
        .eq("metadata->>is_active", "true")
        .order("position");

      if (categoryError) throw categoryError;

      // Organize categories hierarchically
      const categoriesMap = new Map<string, Category>();
      const rootCategories: Category[] = [];

      // First pass: create all category objects
      allCategoriesData.forEach((cat) => {
        categoriesMap.set(cat.id, {
          id: cat.id,
          parent_category_id: cat.parent_category_id,
          label: cat.label,
          icon_name: cat.icon_name,
          color: cat.color,
          sort_order: cat.sort_order,
          is_active: cat.is_active,
          children: [],
        });
      });

      // Second pass: organize hierarchy
      categoriesMap.forEach((category) => {
        if (category.parent_category_id) {
          const parent = categoriesMap.get(category.parent_category_id);
          if (parent) {
            parent.children!.push(category);
          }
        } else {
          rootCategories.push(category);
        }
      });

      setCategories(rootCategories);

      // Load content blocks
      const { data: blockData, error: blockError } = await supabase
        .from("content_blocks")
        .select("*")
        .order("sort_order", { ascending: true });

      if (blockError) throw blockError;

      setContentBlocks(blockData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered and searched content blocks
  const categoryMatches = contentBlocks.filter(
    (block) =>
      selectedCategory === "all" || block.category_id === selectedCategory,
  );
  const filteredBlocks = searchTerm
    ? filterAndSortBySearch(categoryMatches, searchTerm, [
        { get: (b) => b.label, weight: "title" },
        { get: (b) => b.description, weight: "body" },
        { get: (b) => b.block_id, weight: "id" },
      ])
    : categoryMatches;

  // Initialize edit data when block is selected
  useEffect(() => {
    const selectedBlock = selectedBlockId
      ? contentBlocks.find((b) => b.id === selectedBlockId)
      : null;
    if (selectedBlock) {
      setEditData({
        id: selectedBlock.id,
        block_id: selectedBlock.block_id,
        label: selectedBlock.label,
        description: selectedBlock.description,
        icon_name: selectedBlock.icon_name,
        category_id: selectedBlock.category_id, // UUID FK to shortcut_categories
        template: selectedBlock.template,
        sort_order: selectedBlock.sort_order,
        is_active: selectedBlock.is_active,
      });
      setHasUnsavedChanges(false);
    }
  }, [selectedBlockId, contentBlocks]);

  const handleCreateNew = () => {
    setCreateFormData({
      block_id: "",
      label: "",
      description: "",
      icon_name: "FileText",
      category_id: categories.length > 0 ? categories[0].id : "", // Use first category UUID
      template: "",
      sort_order: 0,
      is_active: true,
    });
    setIsCreateDialogOpen(true);
  };

  const handleEditChange = (field: string, value: any) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedBlockId || !editData.id) return;

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("content_blocks")
        .update({
          label: editData.label,
          description: editData.description,
          icon_name: editData.icon_name,
          category_id: editData.category_id, // UUID FK to shortcut_categories
          template: editData.template,
          sort_order: editData.sort_order,
          is_active: editData.is_active,
        })
        .eq("id", editData.id);

      if (error) {
        console.error("Supabase error:", error);
        toast({
          title: "Error Saving Changes",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      toast({
        title: "Success",
        description: `Content block "${editData.label}" updated successfully.`,
        variant: "success",
      });

      setHasUnsavedChanges(false);
      loadData(); // Reload data
    } catch (error) {
      console.error("Error saving changes:", error);
    }
  };

  const handleCreateBlock = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase.from("content_blocks").insert([
        {
          block_id: createFormData.block_id,
          label: createFormData.label,
          description: createFormData.description,
          icon_name: createFormData.icon_name,
          category_id: createFormData.category_id, // UUID FK to shortcut_categories
          template: createFormData.template,
          sort_order: createFormData.sort_order || 0,
          is_active: createFormData.is_active !== false,
        },
      ]);

      if (error) {
        console.error("Supabase error:", error);
        toast({
          title: "Error Creating Block",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      toast({
        title: "Success",
        description: `Content block "${createFormData.label}" created successfully.`,
        variant: "success",
      });

      setIsCreateDialogOpen(false);
      loadData(); // Reload data
    } catch (error) {
      console.error("Error creating block:", error);
    }
  };

  const handleDiscardChanges = () => {
    const selectedBlock = selectedBlockId
      ? contentBlocks.find((b) => b.id === selectedBlockId)
      : null;
    if (selectedBlock) {
      setEditData({
        id: selectedBlock.id,
        block_id: selectedBlock.block_id,
        label: selectedBlock.label,
        description: selectedBlock.description,
        icon_name: selectedBlock.icon_name,
        category_id: selectedBlock.category_id, // UUID FK to shortcut_categories
        template: selectedBlock.template,
        sort_order: selectedBlock.sort_order,
        is_active: selectedBlock.is_active,
      });
      setHasUnsavedChanges(false);
    }
  };

  const handleDeleteBlock = async (block: ContentBlockDB) => {
    setDeleteConfirmation({
      isOpen: true,
      type: "block",
      item: block,
    });
  };

  const handleToggleActive = async (block: ContentBlockDB) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("content_blocks")
        .update({ is_active: !block.is_active })
        .eq("id", block.id);

      if (error) throw error;

      loadData(); // Reload data
    } catch (error) {
      console.error("Error toggling block status:", error);
    }
  };

  // Helper to find a category by ID (including children)
  const findCategoryById = (
    categoryId: string,
    categoriesList: Category[] = categories,
  ): Category | null => {
    for (const cat of categoriesList) {
      if (cat.id === categoryId) return cat;
      if (cat.children) {
        const found = findCategoryById(categoryId, cat.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper to get all categories as flat list
  const getAllCategoriesFlat = (
    categoriesList: Category[] = categories,
  ): Category[] => {
    const result: Category[] = [];
    categoriesList.forEach((cat) => {
      result.push(cat);
      if (cat.children) {
        result.push(...getAllCategoriesFlat(cat.children));
      }
    });
    return result;
  };

  // Collapsible helper function
  const toggleCategoryExpanded = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const isCategoryExpanded = (categoryId: string) =>
    expandedCategories.has(categoryId);

  // Unified category management handlers (works for both parent and child categories)
  const handleCreateCategory = async (
    label: string,
    iconName: string = "Folder",
    color: string = "#3b82f6",
    parentCategoryId: string | null = null,
  ) => {
    if (!label.trim()) return null;

    try {
      const supabase = createClient();

      // Calculate sort order within the parent context
      const allFlat = getAllCategoriesFlat();
      const siblings = allFlat.filter(
        (c) => c.parent_category_id === parentCategoryId,
      );
      const maxSortOrder = Math.max(
        0,
        ...siblings.map((c) => c.sort_order || 0),
      );

      // If creating a child category, inherit parent's color
      const finalColor = parentCategoryId
        ? findCategoryById(parentCategoryId)?.color || color
        : color;

      // Insert into platform.categories (dimension: shortcut)
      const { data, error } = await supabase
        .schema("platform")
        .from("categories")
        .insert([
          {
            dimension: "shortcut",
            placement_type: "content-block",
            parent_id: parentCategoryId,
            name: label,
            icon: iconName,
            color: finalColor,
            position: maxSortOrder + 1,
            metadata: { is_active: true, legacy_table: "shortcut_categories" },
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Supabase error details:", error);

        toast({
          title: "Error Creating Category",
          description: error.message,
          variant: "destructive",
        });

        throw error;
      }

      toast({
        title: "Success",
        description: `Category "${label}" created successfully.`,
        variant: "success",
      });

      await loadData();
      return data.id; // Return UUID
    } catch (error: any) {
      console.error("Error creating category - full error:", error);
      return null;
    }
  };

  const handleUpdateCategory = async (categoryId: string, updates: any) => {
    try {
      const supabase = createClient();
      // Remap old column names to platform.categories columns
      const remapped: Record<string, unknown> = {};
      const metaUpdates: Record<string, unknown> = {};
      if ("label" in updates) remapped.name = updates.label;
      if ("icon_name" in updates) remapped.icon = updates.icon_name;
      if ("sort_order" in updates) remapped.position = updates.sort_order;
      if ("parent_category_id" in updates)
        remapped.parent_id = updates.parent_category_id;
      if ("color" in updates) remapped.color = updates.color;
      if ("placement_type" in updates)
        remapped.placement_type = updates.placement_type;
      if ("is_active" in updates) metaUpdates.is_active = updates.is_active;
      if (Object.keys(metaUpdates).length > 0) {
        // Merge into metadata jsonb via jsonb_set equivalent: pass metadata patch
        remapped.metadata = metaUpdates;
      }
      const { error } = await supabase
        .schema("platform")
        .from("categories")
        .update(remapped)
        .eq("dimension", "shortcut")
        .eq("id", categoryId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Category updated successfully.",
        variant: "success",
      });

      loadData();
    } catch (error) {
      console.error("Error updating category:", error);
      toast({
        title: "Error",
        description: "Failed to update category.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const category = findCategoryById(categoryId);
    if (!category) return;

    // Check if category has children
    const hasChildren = category.children && category.children.length > 0;
    // Check if category has content blocks
    const blocksInCategory = contentBlocks.filter(
      (b) => b.category_id === categoryId,
    );

    setDeleteConfirmation({
      isOpen: true,
      type: "category",
      item: category,
      hasChildren,
      hasBlocks: blocksInCategory.length,
    });
  };

  const confirmDelete = async () => {
    const { type, item, hasChildren, hasBlocks } = deleteConfirmation;

    if (!item) return;

    try {
      const supabase = createClient();

      if (type === "block") {
        const { error } = await supabase
          .from("content_blocks")
          .delete()
          .eq("id", item.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Content block deleted successfully.",
        });

        if (selectedBlockId === item.id) {
          setSelectedBlockId(null);
        }
      } else if (type === "category") {
        if (hasChildren || (hasBlocks && hasBlocks > 0)) {
          // Deactivate instead of delete
          await handleUpdateCategory(item.id, { is_active: false });
        } else {
          const { error } = await supabase
            .schema("platform")
            .from("categories")
            .delete()
            .eq("dimension", "shortcut")
            .eq("id", item.id);

          if (error) throw error;

          toast({
            title: "Success",
            description: "Category deleted successfully.",
          });
        }
      }

      setDeleteConfirmation({ isOpen: false, type: null, item: null });
      await loadData();
    } catch (error) {
      console.error("Error deleting item:", error);
      toast({
        title: "Error",
        description: `Failed to delete ${type}.`,
        variant: "destructive",
      });
    }
  };

  // Note: Child categories are now created using handleCreateCategory with parentCategoryId parameter

  // Quick create handler
  const handleQuickCreateCategory = async () => {
    const categoryId = await handleCreateCategory(
      quickCategoryData.label,
      quickCategoryData.icon_name,
      quickCategoryData.color,
      quickCategoryData.parent_category_id,
    );

    if (categoryId) {
      // Set the newly created category in the form
      if (quickCreateContext === "create") {
        setCreateFormData({ ...createFormData, category_id: categoryId });
      } else {
        handleEditChange("category_id", categoryId);
      }

      // Reset and close
      setQuickCategoryData({
        label: "",
        icon_name: "Folder",
        color: "#3b82f6",
        parent_category_id: null,
      });
      setIsQuickCreateCategoryOpen(false);
    }
  };

  const selectedBlock = selectedBlockId
    ? contentBlocks.find((b) => b.id === selectedBlockId)
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
          <div className="flex gap-2 mb-3">
            <Button
              onClick={() => setIsCategoryManagementOpen(true)}
              size="sm"
              variant="outline"
            >
              <Settings className="w-4 h-4 mr-1" />
              Manage
            </Button>
            <Button onClick={handleCreateNew} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search blocks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <React.Fragment key={category.id}>
                  <SelectItem value={category.id}>{category.label}</SelectItem>
                  {category.children?.map((child) => (
                    <SelectItem
                      key={child.id}
                      value={child.id}
                      className="pl-6"
                    >
                      ↳ {child.label}
                    </SelectItem>
                  ))}
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sidebar Content */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {categories.map((category) => {
              // Recursive function to count blocks in a category tree
              const countBlocksInTree = (cat: Category): number => {
                const directBlocks = filteredBlocks.filter(
                  (b) => b.category_id === cat.id,
                ).length;
                const childBlocks =
                  cat.children?.reduce(
                    (sum, child) => sum + countBlocksInTree(child),
                    0,
                  ) || 0;
                return directBlocks + childBlocks;
              };

              // Recursive function to render a category and its children
              const renderCategory = (cat: Category, depth: number = 0) => {
                const categoryBlocks = filteredBlocks.filter(
                  (b) => b.category_id === cat.id,
                );
                const totalInTree = countBlocksInTree(cat);

                // Skip if no blocks in this category tree
                if (totalInTree === 0) return null;

                const isExpanded = isCategoryExpanded(cat.id);
                const hasChildren = cat.children && cat.children.length > 0;

                return (
                  <div key={cat.id}>
                    {/* Category Header - Collapsible */}
                    <div
                      className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md cursor-pointer transition-colors"
                      style={{ paddingLeft: `${depth * 12 + 8}px` }}
                      onClick={() => toggleCategoryExpanded(cat.id)}
                    >
                      {hasChildren || categoryBlocks.length > 0 ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 flex-shrink-0" />
                        )
                      ) : (
                        <div className="w-4 h-4 flex-shrink-0" />
                      )}
                      {depth === 0 ? (
                        <Folder className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <FolderOpen className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span className="truncate">{cat.label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                        ({totalInTree})
                      </span>
                    </div>

                    {/* Category Content - Show only if expanded */}
                    {isExpanded && (
                      <div>
                        {/* Child Categories first (recursive) */}
                        {cat.children?.map((childCat) =>
                          renderCategory(childCat, depth + 1),
                        )}

                        {/* Then blocks directly in this category */}
                        {categoryBlocks.map((block) => (
                          <div
                            key={block.id}
                            onClick={() => setSelectedBlockId(block.id)}
                            className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors
                                                            ${
                                                              selectedBlockId ===
                                                              block.id
                                                                ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100"
                                                                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                                            }`}
                            style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                          >
                            <FileText className="w-4 h-4 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {block.label}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {block.block_id}
                              </div>
                            </div>
                            {!block.is_active && (
                              <EyeOff className="w-3 h-3 text-gray-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              };

              return renderCategory(category, 0);
            })}
          </div>
        </ScrollArea>

        {/* Stats */}
        <div className="p-4 border-t border-border bg-gray-50 dark:bg-gray-800">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {filteredBlocks.length} blocks (
            {contentBlocks.filter((b) => b.is_active).length} active)
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedBlock ? (
          <>
            {/* Header with Save/Discard buttons */}
            <div className="px-6 py-2 border-b border-border bg-textured">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    Edit Content Block
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
                    onClick={() => handleToggleActive(selectedBlock)}
                  >
                    {selectedBlock.is_active ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    {selectedBlock.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteBlock(selectedBlock)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            {/* Inline Edit Form */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {/* Basic Information */}
                <Card>
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
                          placeholder="Display name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-block-id">Block ID</Label>
                        <Input
                          id="edit-block-id"
                          value={editData.block_id || ""}
                          onChange={(e) =>
                            handleEditChange("block_id", e.target.value)
                          }
                          placeholder="unique-block-id"
                          disabled
                          className="bg-gray-50 dark:bg-gray-800"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="edit-description">Description</Label>
                      <AutoResizeTextarea
                        id="edit-description"
                        value={editData.description || ""}
                        onChange={(e) =>
                          handleEditChange("description", e.target.value)
                        }
                        placeholder="Brief description of this block"
                        minHeight={40}
                        className="text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-category">Category</Label>
                        <Select
                          value={editData.category_id || ""}
                          onValueChange={(value) => {
                            if (value === "__new_cat__") {
                              setQuickCreateContext("edit");
                              setIsQuickCreateCategoryOpen(true);
                            } else {
                              handleEditChange("category_id", value);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => (
                              <React.Fragment key={category.id}>
                                <SelectItem value={category.id}>
                                  {category.label}
                                </SelectItem>
                                {category.children?.map((child) => (
                                  <SelectItem
                                    key={child.id}
                                    value={child.id}
                                    className="pl-6"
                                  >
                                    ↳ {child.label}
                                  </SelectItem>
                                ))}
                              </React.Fragment>
                            ))}
                            <SelectItem
                              value="__new_cat__"
                              className="text-blue-600 dark:text-blue-400 font-medium"
                            >
                              <Plus className="w-3 h-3 inline mr-1" />
                              New Category...
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="edit-sort-order">Sort Order</Label>
                        <Input
                          id="edit-sort-order"
                          type="number"
                          value={editData.sort_order || 0}
                          onChange={(e) =>
                            handleEditChange(
                              "sort_order",
                              parseInt(e.target.value) || 0,
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 pl-2">
                      <Checkbox
                        id="edit-is-active"
                        checked={editData.is_active !== false}
                        onCheckedChange={(checked) =>
                          handleEditChange("is_active", checked)
                        }
                      />
                      <Label htmlFor="edit-is-active">
                        Active (visible in context menus)
                      </Label>
                    </div>
                  </CardContent>
                </Card>

                {/* Template Content */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle>Template Content</CardTitle>
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
                          Editor
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
                          Preview
                        </Button>
                        <Button
                          variant={
                            previewMode === "json" ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setPreviewMode("json")}
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
                          onClick={() => setPreviewMode("stream")}
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
                                editData.template || "",
                              )
                            }
                            disabled={
                              isProcessing || !(editData.template || "").trim()
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
                    {/* Editor-only mode */}
                    {previewMode === "editor" && (
                      <AutoResizeTextarea
                        value={editData.template || ""}
                        onChange={(e) =>
                          handleEditChange("template", e.target.value)
                        }
                        placeholder="Enter the template content that will be inserted..."
                        className="font-mono text-sm"
                        minHeight={300}
                      />
                    )}

                    {/* Editor + client-side preview side by side */}
                    {previewMode === "preview" && (
                      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                        <div className="flex-1 min-w-0">
                          <AutoResizeTextarea
                            value={editData.template || ""}
                            onChange={(e) =>
                              handleEditChange("template", e.target.value)
                            }
                            placeholder="Enter the template content that will be inserted..."
                            className="font-mono text-sm h-full"
                            minHeight={300}
                          />
                        </div>
                        <div className="flex-1 min-w-0 min-h-[300px] border border-border rounded-lg px-3 py-1 bg-textured overflow-auto">
                          <div>
                            <MarkdownStream content={editData.template || ""} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* JSON / Stream processed render */}
                    {(previewMode === "json" || previewMode === "stream") && (
                      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                        {/* Left: template editor (read-only context while processing) */}
                        <div className="flex-1 min-w-0">
                          <AutoResizeTextarea
                            value={editData.template || ""}
                            onChange={(e) =>
                              handleEditChange("template", e.target.value)
                            }
                            placeholder="Enter the template content that will be inserted..."
                            className="font-mono text-sm h-full"
                            minHeight={300}
                          />
                        </div>

                        {/* Right: server-processed render */}
                        <div className="flex-1 min-w-0 min-h-[300px] border border-border rounded-lg bg-textured overflow-auto relative">
                          {/* Toolbar: strict mode + copy raw */}
                          <div className="sticky top-0 z-10 flex items-center justify-end gap-1 px-3 pt-2 pb-1">
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
                          <div className="px-4 pb-4">
                            {isProcessing && processedEvents.length === 0 && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {previewMode === "stream"
                                  ? "Streaming blocks..."
                                  : "Processing..."}
                              </div>
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
                                  No output yet — click{" "}
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
              <h3 className="text-lg font-medium mb-2">No Block Selected</h3>
              <p>
                Select a content block from the sidebar to view and edit its
                details.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Content Block</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-block-id">Block ID</Label>
                <Input
                  id="create-block-id"
                  value={createFormData.block_id || ""}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      block_id: e.target.value,
                    })
                  }
                  placeholder="unique-block-id"
                />
              </div>
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
                  placeholder="Display name"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="create-description">Description</Label>
              <AutoResizeTextarea
                id="create-description"
                value={createFormData.description || ""}
                onChange={(e) =>
                  setCreateFormData({
                    ...createFormData,
                    description: e.target.value,
                  })
                }
                placeholder="Brief description of this block"
                minHeight={40}
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="create-category">Category</Label>
                <Select
                  value={createFormData.category_id || ""}
                  onValueChange={(value) => {
                    if (value === "__new_cat__") {
                      setQuickCreateContext("create");
                      setIsQuickCreateCategoryOpen(true);
                    } else {
                      setCreateFormData({
                        ...createFormData,
                        category_id: value,
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <React.Fragment key={category.id}>
                        <SelectItem value={category.id}>
                          {category.label}
                        </SelectItem>
                        {category.children?.map((child) => (
                          <SelectItem
                            key={child.id}
                            value={child.id}
                            className="pl-6"
                          >
                            ↳ {child.label}
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    ))}
                    <SelectItem
                      value="__new_cat__"
                      className="text-blue-600 dark:text-blue-400 font-medium"
                    >
                      <Plus className="w-3 h-3 inline mr-1" />
                      New Category...
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="create-sort-order">Sort Order</Label>
                <Input
                  id="create-sort-order"
                  type="number"
                  value={createFormData.sort_order || 0}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      sort_order: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="create-template">Template</Label>
              <AutoResizeTextarea
                id="create-template"
                value={createFormData.template || ""}
                onChange={(e) =>
                  setCreateFormData({
                    ...createFormData,
                    template: e.target.value,
                  })
                }
                placeholder="Enter the template content that will be inserted..."
                className="font-mono"
                minHeight={200}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={createFormData.is_active !== false}
                  onCheckedChange={(checked) =>
                    setCreateFormData({
                      ...createFormData,
                      is_active: checked as boolean,
                    })
                  }
                />
                <Label className="text-sm">
                  Active (visible in context menus)
                </Label>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateBlock}>Create</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog
        open={isCategoryManagementOpen}
        onOpenChange={setIsCategoryManagementOpen}
      >
        <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
          </DialogHeader>

          <div
            className="flex-1 overflow-y-auto pr-4"
            style={{ maxHeight: "calc(90dvh - 180px)" }}
          >
            <div className="space-y-6 pb-6">
              {/* Create New Category */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Create New Category
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Category name (e.g., 'Structure')"
                        value={newCategoryLabel}
                        onChange={(e) => setNewCategoryLabel(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          newCategoryLabel.trim() &&
                          handleCreateCategory(
                            newCategoryLabel,
                            quickCategoryData.icon_name,
                            quickCategoryData.color,
                            null,
                          ).then(() => setNewCategoryLabel(""))
                        }
                        className="flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label
                          htmlFor="quick-category-icon"
                          className="text-xs"
                        >
                          Icon
                        </Label>
                        <IconInputWithValidation
                          id="quick-category-icon"
                          placeholder="e.g., Folder"
                          value={quickCategoryData.icon_name}
                          onChange={(value) =>
                            setQuickCategoryData({
                              ...quickCategoryData,
                              icon_name: value,
                            })
                          }
                          showLucideLink={false}
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Color</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={quickCategoryData.color}
                            onChange={(e) =>
                              setQuickCategoryData({
                                ...quickCategoryData,
                                color: e.target.value,
                              })
                            }
                            className="w-16 h-9"
                          />
                          <Input
                            type="text"
                            value={quickCategoryData.color}
                            onChange={(e) =>
                              setQuickCategoryData({
                                ...quickCategoryData,
                                color: e.target.value,
                              })
                            }
                            placeholder="#3b82f6"
                            className="flex-1"
                          />
                        </div>
                      </div>
                      <Button
                        onClick={() =>
                          handleCreateCategory(
                            newCategoryLabel,
                            quickCategoryData.icon_name,
                            quickCategoryData.color,
                            null,
                          ).then(() => setNewCategoryLabel(""))
                        }
                        disabled={!newCategoryLabel.trim()}
                        className="mt-5"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Create
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Existing Categories */}
              <div className="space-y-3">
                {categories.map((category) => (
                  <Card
                    key={category.id}
                    className={!category.is_active ? "opacity-60" : ""}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: category.color }}
                        >
                          <Folder className="w-5 h-5 text-white" />
                        </div>
                        {editingCategoryId === category.id ? (
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={category.label}
                                onChange={(e) => {
                                  const updatedCategories = categories.map(
                                    (c) =>
                                      c.id === category.id
                                        ? { ...c, label: e.target.value }
                                        : c,
                                  );
                                  setCategories(updatedCategories);
                                }}
                                placeholder="Label"
                                className="flex-1"
                              />
                              <IconInputWithValidation
                                value={category.icon_name}
                                onChange={(value) => {
                                  const updatedCategories = categories.map(
                                    (c) =>
                                      c.id === category.id
                                        ? { ...c, icon_name: value }
                                        : c,
                                  );
                                  setCategories(updatedCategories);
                                }}
                                placeholder="Icon"
                                className="w-32"
                                showLucideLink={false}
                              />
                              <Input
                                type="color"
                                value={category.color}
                                onChange={(e) => {
                                  const updatedCategories = categories.map(
                                    (c) =>
                                      c.id === category.id
                                        ? { ...c, color: e.target.value }
                                        : c,
                                  );
                                  setCategories(updatedCategories);
                                }}
                                className="w-16 h-9"
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  handleUpdateCategory(category.id, {
                                    label: category.label,
                                    icon_name: category.icon_name,
                                    color: category.color,
                                  });
                                  setEditingCategoryId(null);
                                }}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingCategoryId(null);
                                  loadData();
                                }}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {category.label}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                ID: {category.id} • Icon: {category.icon_name} •
                                Color: {category.color} • Sort:{" "}
                                {category.sort_order}
                              </div>
                            </div>
                            {!category.is_active && (
                              <Badge
                                variant="outline"
                                className="text-orange-600 border-orange-600"
                              >
                                Inactive
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingCategoryId(category.id)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteCategory(category.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Child Categories */}
                      <div className="space-y-2 ml-8">
                        {category.children && category.children.length > 0 && (
                          <>
                            {category.children.map((childCat) => (
                              <div
                                key={childCat.id}
                                className={`flex items-center gap-2 p-2 rounded-md border-border ${!childCat.is_active ? "opacity-60" : ""}`}
                              >
                                <FolderOpen className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                                {editingCategoryId === childCat.id ? (
                                  <div className="flex-1 flex items-center gap-2">
                                    <Input
                                      value={childCat.label}
                                      onChange={(e) => {
                                        const updatedCategories =
                                          categories.map((c) =>
                                            c.id === category.id
                                              ? {
                                                  ...c,
                                                  children:
                                                    c.children?.map((ch) =>
                                                      ch.id === childCat.id
                                                        ? {
                                                            ...ch,
                                                            label:
                                                              e.target.value,
                                                          }
                                                        : ch,
                                                    ) || [],
                                                }
                                              : c,
                                          );
                                        setCategories(updatedCategories);
                                      }}
                                      placeholder="Label"
                                      className="text-sm flex-1"
                                    />
                                    <IconInputWithValidation
                                      value={childCat.icon_name}
                                      onChange={(value) => {
                                        const updatedCategories =
                                          categories.map((c) =>
                                            c.id === category.id
                                              ? {
                                                  ...c,
                                                  children:
                                                    c.children?.map((ch) =>
                                                      ch.id === childCat.id
                                                        ? {
                                                            ...ch,
                                                            icon_name: value,
                                                          }
                                                        : ch,
                                                    ) || [],
                                                }
                                              : c,
                                          );
                                        setCategories(updatedCategories);
                                      }}
                                      placeholder="Icon"
                                      className="text-sm w-32"
                                      showLucideLink={false}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        handleUpdateCategory(childCat.id, {
                                          label: childCat.label,
                                          icon_name: childCat.icon_name,
                                        });
                                        setEditingCategoryId(null);
                                      }}
                                    >
                                      <Check className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingCategoryId(null);
                                        loadData();
                                      }}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex-1 text-sm">
                                      <span className="text-gray-900 dark:text-gray-100">
                                        {childCat.label}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                        (ID: {childCat.id} • Icon:{" "}
                                        {childCat.icon_name})
                                      </span>
                                    </div>
                                    {!childCat.is_active && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs text-orange-600 border-orange-600"
                                      >
                                        Inactive
                                      </Badge>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setEditingCategoryId(childCat.id)
                                      }
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        handleDeleteCategory(childCat.id)
                                      }
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            ))}
                          </>
                        )}

                        {/* Add Child Category */}
                        {newCategoryData.parent_category_id === category.id ? (
                          <div className="flex items-center gap-2 p-2">
                            <Input
                              placeholder="Child category name"
                              value={newCategoryData.label}
                              onChange={(e) =>
                                setNewCategoryData({
                                  ...newCategoryData,
                                  label: e.target.value,
                                })
                              }
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  newCategoryData.label.trim()
                                ) {
                                  handleCreateCategory(
                                    newCategoryData.label,
                                    "FolderOpen",
                                    newCategoryData.color || "#3b82f6",
                                    category.id,
                                  ).then(() => {
                                    setNewCategoryData({
                                      label: "",
                                      icon_name: "Folder",
                                      color: "#3b82f6",
                                      parent_category_id: null,
                                    });
                                  });
                                }
                              }}
                              className="text-sm"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() =>
                                handleCreateCategory(
                                  newCategoryData.label,
                                  "FolderOpen",
                                  newCategoryData.color || "#3b82f6",
                                  category.id,
                                ).then(() => {
                                  setNewCategoryData({
                                    label: "",
                                    icon_name: "Folder",
                                    color: "#3b82f6",
                                    parent_category_id: null,
                                  });
                                })
                              }
                              disabled={!newCategoryData.label.trim()}
                            >
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setNewCategoryData({
                                  label: "",
                                  icon_name: "Folder",
                                  color: "#3b82f6",
                                  parent_category_id: null,
                                })
                              }
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() =>
                              setNewCategoryData({
                                label: "",
                                icon_name: "Folder",
                                color: "#3b82f6",
                                parent_category_id: category.id,
                              })
                            }
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Child Category
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <Button onClick={() => setIsCategoryManagementOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Create Category Modal */}
      <Dialog
        open={isQuickCreateCategoryOpen}
        onOpenChange={setIsQuickCreateCategoryOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="quick-category-label">Category Name</Label>
              <Input
                id="quick-category-label"
                value={quickCategoryData.label}
                onChange={(e) =>
                  setQuickCategoryData({
                    ...quickCategoryData,
                    label: e.target.value,
                  })
                }
                placeholder="e.g., Structure"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && quickCategoryData.label.trim()) {
                    handleQuickCreateCategory();
                  }
                }}
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="quick-category-icon">Icon Name</Label>
              <Input
                id="quick-category-icon"
                value={quickCategoryData.icon_name}
                onChange={(e) =>
                  setQuickCategoryData({
                    ...quickCategoryData,
                    icon_name: e.target.value,
                  })
                }
                placeholder="e.g., Folder"
              />
            </div>

            <div>
              <Label htmlFor="quick-category-color">Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={quickCategoryData.color}
                  onChange={(e) =>
                    setQuickCategoryData({
                      ...quickCategoryData,
                      color: e.target.value,
                    })
                  }
                  className="w-16 h-9"
                />
                <Input
                  type="text"
                  value={quickCategoryData.color}
                  onChange={(e) =>
                    setQuickCategoryData({
                      ...quickCategoryData,
                      color: e.target.value,
                    })
                  }
                  placeholder="#3b82f6"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsQuickCreateCategoryOpen(false);
                  setQuickCategoryData({
                    label: "",
                    icon_name: "Folder",
                    color: "#3b82f6",
                    parent_category_id: null,
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleQuickCreateCategory}
                disabled={!quickCategoryData.label.trim()}
              >
                Create & Select
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmation.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmation({ isOpen: false, type: null, item: null });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirmation.type === "block"
                ? "Delete Content Block"
                : "Delete Category"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmation.type === "block" ? (
                <>
                  Are you sure you want to delete{" "}
                  <strong>"{deleteConfirmation.item?.label}"</strong>? This
                  action cannot be undone.
                </>
              ) : deleteConfirmation.hasChildren ||
                (deleteConfirmation.hasBlocks &&
                  deleteConfirmation.hasBlocks > 0) ? (
                <>
                  This category{" "}
                  <strong>"{deleteConfirmation.item?.label}"</strong> has{" "}
                  {deleteConfirmation.hasChildren &&
                    `${deleteConfirmation.item?.children?.length} child categories`}
                  {deleteConfirmation.hasChildren &&
                    deleteConfirmation.hasBlocks &&
                    deleteConfirmation.hasBlocks > 0 &&
                    " and "}
                  {deleteConfirmation.hasBlocks &&
                    deleteConfirmation.hasBlocks > 0 &&
                    `${deleteConfirmation.hasBlocks} content blocks`}
                  . It will be deactivated instead of deleted.
                </>
              ) : (
                <>
                  Are you sure you want to delete the category{" "}
                  <strong>"{deleteConfirmation.item?.label}"</strong>? This
                  action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteConfirmation.hasChildren ||
              (deleteConfirmation.hasBlocks && deleteConfirmation.hasBlocks > 0)
                ? "Deactivate"
                : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
