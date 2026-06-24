"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/ButtonMine";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Search,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Edit2,
  Zap,
  Check,
  AlertTriangle,
  FileText,
} from "lucide-react";
import {
  ShortcutCategory,
  PromptBuiltin,
  PromptShortcut,
  CreateShortcutCategoryInput,
  UpdateShortcutCategoryInput,
  CreatePromptShortcutInput,
  UpdatePromptShortcutInput,
} from "../types/core";
import { ContentBlockDB } from "@/types/content-blocks-db";
import {
  fetchShortcutCategories,
  createShortcutCategory,
  updateShortcutCategory,
  deleteShortcutCategory,
  checkCategoryDependencies,
  fetchPromptShortcuts,
  createPromptShortcut,
  updatePromptShortcut,
  deletePromptShortcut,
  fetchPromptBuiltins,
  fetchShortcutsWithRelations,
  fetchCategoryItemsWithRelations,
  type CategoryItem,
} from "../services/admin-service";
import {
  PLACEMENT_TYPES,
  getPlacementTypeMeta,
  COMMON_SCOPE_CONFIGURATIONS,
} from "../constants";
import { RESULT_DISPLAY_META, type ResultDisplay } from "../types/execution-modes";
import { getUserFriendlyError } from "../utils/error-handler";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { SelectPromptForBuiltinModal } from "./SelectPromptForBuiltinModal";
import { PromptSettingsModal } from "@/features/prompts/components/PromptSettingsModal";
import { ShortcutEditModal } from "../components/ShortcutEditModal";
import { CategoryFormModal } from "../components/CategoryFormModal";
import { ContentBlockEditModal } from "../components/ContentBlockEditModal";
import { DuplicateShortcutModal } from "../components/DuplicateShortcutModal";
import {
  CategoryFormFields,
  CategoryFormData,
  formDataToUpdateInput,
  validateCategoryFormData,
} from "../components/CategoryFormFields";
import { useModels } from "@/features/ai-models/hooks/useModels";
import { matchesSearch as matchesSearchScoring } from "@/utils/search-scoring";

interface PromptBuiltinsManagerProps {
  className?: string;
}

type SelectedItem =
  | { type: "category"; data: ShortcutCategory }
  | {
      type: "shortcut";
      data: PromptShortcut & {
        category?: ShortcutCategory;
        builtin?: PromptBuiltin;
      };
    }
  | {
      type: "content_block";
      data: ContentBlockDB & { category?: ShortcutCategory };
    }
  | null;

export function PromptBuiltinsManager({
  className,
}: PromptBuiltinsManagerProps) {
  const { models } = useModels();

  const [categories, setCategories] = useState<ShortcutCategory[]>([]);
  const [categoryItems, setCategoryItems] = useState<CategoryItem[]>([]);
  const [builtins, setBuiltins] = useState<PromptBuiltin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [selectedPlacement, setSelectedPlacement] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Edit data
  const [editCategoryData, setEditCategoryData] = useState<CategoryFormData>({
    label: "",
    placement_type: Object.values(PLACEMENT_TYPES)[0],
    parent_category_id: null,
    description: "",
    icon_name: "Folder",
    color: "#666666",
    sort_order: 999,
    is_active: true,
    metadata: {},
  });
  const [editShortcutData, setEditShortcutData] = useState<
    Partial<PromptShortcut>
  >({});

  // Tree expansion state
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  // View state
  const [viewMode, setViewMode] = useState<"tree" | "shortcuts">("tree");
  const [showInactive, setShowInactive] = useState(false);

  // Dialog state
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [isCreateShortcutOpen, setIsCreateShortcutOpen] = useState(false);
  const [createShortcutData, setCreateShortcutData] = useState<
    Partial<CreatePromptShortcutInput>
  >({});
  const [isSelectPromptModalOpen, setIsSelectPromptModalOpen] = useState(false);

  // Shortcut edit modal state
  const [isShortcutEditModalOpen, setIsShortcutEditModalOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<
    | (PromptShortcut & {
        category?: ShortcutCategory;
        builtin?: PromptBuiltin;
      })
    | null
  >(null);

  // Content block edit modal state
  const [isContentBlockEditModalOpen, setIsContentBlockEditModalOpen] =
    useState(false);
  const [editingContentBlock, setEditingContentBlock] = useState<
    (ContentBlockDB & { category?: ShortcutCategory }) | null
  >(null);

  // Duplicate shortcut modal state
  const [isDuplicateShortcutModalOpen, setIsDuplicateShortcutModalOpen] =
    useState(false);
  const [duplicatingShortcut, setDuplicatingShortcut] = useState<
    | (PromptShortcut & {
        category?: ShortcutCategory;
        builtin?: PromptBuiltin;
      })
    | null
  >(null);

  // Prompt settings modal state
  const [isPromptSettingsOpen, setIsPromptSettingsOpen] = useState(false);
  const [editingBuiltinId, setEditingBuiltinId] = useState<string | null>(null);
  const [availableTools, setAvailableTools] = useState<any[]>([]);

  // Confirmation dialog state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    type: "category" | "shortcut" | null;
    item: ShortcutCategory | PromptShortcut | null;
    dependencies?: {
      contentBlocks: number;
      promptShortcuts: number;
      childCategories: number;
    };
  }>({
    isOpen: false,
    type: null,
    item: null,
  });

  const { toast } = useToast();

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [categoriesData, categoryItemsData, builtinsData, toolsResponse] =
        await Promise.all([
          fetchShortcutCategories(),
          fetchCategoryItemsWithRelations(),
          fetchPromptBuiltins({ is_active: true }),
          fetch("/api/tools")
            .then((r) => r.json())
            .catch(() => ({ tools: [] })),
        ]);

      setCategories(categoriesData);
      setCategoryItems(categoryItemsData);
      setBuiltins(builtinsData);
      setAvailableTools(toolsResponse?.tools || []);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Initialize edit data when item is selected
  useEffect(() => {
    if (selectedItem?.type === "category") {
      const cat = selectedItem.data;
      setEditCategoryData({
        label: cat.label,
        placement_type: cat.placement_type,
        parent_category_id: cat.parent_category_id,
        description: cat.description || "",
        icon_name: cat.icon_name,
        color: cat.color,
        sort_order: cat.sort_order,
        is_active: cat.is_active,
        metadata: cat.metadata || {},
      });
      setHasUnsavedChanges(false);
    } else if (selectedItem?.type === "shortcut") {
      setEditShortcutData(selectedItem.data);
      setHasUnsavedChanges(false);
    }
  }, [selectedItem]);

  // Filter categories and shortcuts
  const filteredCategories = categories.filter((cat) => {
    const matchesPlacement =
      selectedPlacement === "all" || cat.placement_type === selectedPlacement;
    const matchesSearch =
      searchTerm === "" ||
      matchesSearchScoring(cat, searchTerm, [
        { get: (c) => c.label, weight: "title" },
      ]);
    const matchesActive = showInactive || cat.is_active;
    return matchesPlacement && matchesSearch && matchesActive;
  });

  // Build tree structure grouped by placement type
  const buildTree = () => {
    const categoryMap = new Map(
      filteredCategories.map((c) => [c.id, { ...c, children: [], items: [] }]),
    );

    // Add items (shortcuts and content blocks) to categories
    categoryItems.forEach((item) => {
      const category = categoryMap.get(item.category_id || "");
      const shouldShow = showInactive || item.is_active;
      if (category && shouldShow) {
        category.items.push(item);
      }
    });

    // Build category hierarchy (children under parents)
    const rootCategories: any[] = [];
    categoryMap.forEach((category) => {
      if (category.parent_category_id) {
        const parent = categoryMap.get(category.parent_category_id);
        if (parent) {
          parent.children.push(category);
        } else {
          rootCategories.push(category);
        }
      } else {
        rootCategories.push(category);
      }
    });

    // Group root categories by placement type
    const placementGroups = new Map<string, any[]>();
    rootCategories.forEach((category) => {
      const placementType = category.placement_type;
      if (!placementGroups.has(placementType)) {
        placementGroups.set(placementType, []);
      }
      placementGroups.get(placementType)!.push(category);
    });

    // Helper to count all categories recursively
    const countAllCategories = (categories: any[]): number => {
      return categories.reduce((total, cat) => {
        return (
          total + 1 + (cat.children ? countAllCategories(cat.children) : 0)
        );
      }, 0);
    };

    // Create placement type nodes
    const tree: any[] = [];
    Array.from(placementGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([placementType, categories]) => {
        const meta = getPlacementTypeMeta(placementType);
        const totalCount = countAllCategories(categories);
        tree.push({
          id: `placement-${placementType}`,
          label: meta.label,
          type: "placement",
          placement_type: placementType,
          children: categories,
          items: [],
          is_active: true,
          totalCount,
        });
      });

    // Sort items recursively
    const sortItems = (items: any[]) => {
      items.sort((a, b) => a.sort_order - b.sort_order);
      items.forEach((item) => {
        if (item.children) sortItems(item.children);
        if (item.items)
          item.items.sort((a: any, b: any) => a.sort_order - b.sort_order);
      });
    };

    // Sort categories within each placement group
    tree.forEach((placementNode) => {
      sortItems(placementNode.children);
    });

    return tree;
  };

  const tree = buildTree();

  // Helper to build category hierarchy label (e.g., "Parent > Child")
  const getCategoryHierarchyLabel = (category: ShortcutCategory): string => {
    if (!category.parent_category_id) {
      return category.label;
    }
    const parent = categories.find((c) => c.id === category.parent_category_id);
    if (!parent) {
      return category.label;
    }
    return `${getCategoryHierarchyLabel(parent)} > ${category.label}`;
  };

  // Tree expansion helpers
  const toggleCategory = (categoryId: string) => {
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

  const isExpanded = (categoryId: string) => expandedCategories.has(categoryId);

  const expandAll = () => {
    const allCategoryIds = new Set(categories.map((c) => c.id));
    // Also add placement type node IDs
    const placementIds = new Set(
      Array.from(new Set(categories.map((c) => c.placement_type))).map(
        (pt) => `placement-${pt}`,
      ),
    );
    setExpandedCategories(new Set([...allCategoryIds, ...placementIds]));
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  // CRUD handlers for categories
  const handleCategoryChange = (data: CategoryFormData) => {
    setEditCategoryData(data);
    setHasUnsavedChanges(true);
  };

  const handleSaveCategoryChanges = async () => {
    if (!selectedItem || selectedItem.type !== "category") return;

    // Validate
    const errors = validateCategoryFormData(editCategoryData);
    if (Object.keys(errors).length > 0) {
      toast({
        title: "Validation Error",
        description: Object.values(errors)[0],
        variant: "destructive",
      });
      return;
    }

    try {
      const updateInput = formDataToUpdateInput(
        selectedItem.data.id,
        editCategoryData,
      );
      await updateShortcutCategory(updateInput);

      toast({ title: "Success", description: "Category updated successfully" });
      setHasUnsavedChanges(false);

      // Reload data without showing full loading state
      const [categoriesData, categoryItemsData, builtinsData] =
        await Promise.all([
          fetchShortcutCategories(),
          fetchCategoryItemsWithRelations(),
          fetchPromptBuiltins({ is_active: true }),
        ]);

      setCategories(categoriesData);
      setCategoryItems(categoryItemsData);
      setBuiltins(builtinsData);
    } catch (error) {
      console.error("Error updating category:", error);
      toast({
        title: "Error",
        description: "Failed to update category",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCategory = async (category: ShortcutCategory) => {
    try {
      // Check dependencies before showing delete confirmation
      const { dependencies } = await checkCategoryDependencies(category.id);

      setDeleteConfirmation({
        isOpen: true,
        type: "category",
        item: category,
        dependencies,
      });
    } catch (error) {
      console.error("Error checking category dependencies:", error);
      toast({
        title: "Error",
        description: "Failed to check category dependencies",
        variant: "destructive",
      });
    }
  };

  const confirmDelete = async () => {
    const { type, item } = deleteConfirmation;

    if (!item) return;

    try {
      if (type === "category") {
        await deleteShortcutCategory(item.id);
        toast({
          title: "Success",
          description: "Category deleted successfully",
        });
      } else if (type === "shortcut") {
        await deletePromptShortcut(item.id);
        toast({
          title: "Success",
          description: "Shortcut deleted successfully",
        });
      }

      setSelectedItem(null);
      setDeleteConfirmation({ isOpen: false, type: null, item: null });
      await loadData();
    } catch (error) {
      console.error("Error deleting item:", error);

      // Show user-friendly error message from the service
      const errorMessage =
        error instanceof Error ? error.message : `Failed to delete ${type}`;

      toast({
        title: "Cannot Delete",
        description: errorMessage,
        variant: "destructive",
        duration: 8000, // Longer duration for complex error messages
      });

      // Close the confirmation dialog even on error
      setDeleteConfirmation({ isOpen: false, type: null, item: null });
    }
  };

  const handleCategorySuccess = async () => {
    setIsCreateCategoryOpen(false);
    await loadData();
  };

  // CRUD handlers for shortcuts
  const handleShortcutChange = (field: string, value: any) => {
    setEditShortcutData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSaveShortcutChanges = async () => {
    if (!editShortcutData.id) return;

    try {
      await updatePromptShortcut({
        id: editShortcutData.id,
        prompt_builtin_id: editShortcutData.prompt_builtin_id,
        category_id: editShortcutData.category_id,
        label: editShortcutData.label,
        description: editShortcutData.description,
        icon_name: editShortcutData.icon_name,
        keyboard_shortcut: editShortcutData.keyboard_shortcut,
        sort_order: editShortcutData.sort_order,
        scope_mappings: editShortcutData.scope_mappings,
        available_scopes: editShortcutData.available_scopes,
        // Execution Configuration
        result_display: editShortcutData.result_display,
        auto_run: editShortcutData.auto_run,
        allow_chat: editShortcutData.allow_chat,
        show_variables: editShortcutData.show_variables,
        apply_variables: editShortcutData.apply_variables,
        is_active: editShortcutData.is_active,
      });

      toast({ title: "Success", description: "Shortcut updated successfully" });
      setHasUnsavedChanges(false);

      // Reload data without showing full loading state
      const [categoriesData, categoryItemsData, builtinsData] =
        await Promise.all([
          fetchShortcutCategories(),
          fetchCategoryItemsWithRelations(),
          fetchPromptBuiltins({ is_active: true }),
        ]);

      setCategories(categoriesData);
      setCategoryItems(categoryItemsData);
      setBuiltins(builtinsData);
    } catch (error) {
      console.error("Error updating shortcut:", error);
      toast({
        title: "Error",
        description: "Failed to update shortcut",
        variant: "destructive",
      });
    }
  };

  const handleDeleteShortcut = async (shortcut: PromptShortcut) => {
    setDeleteConfirmation({
      isOpen: true,
      type: "shortcut",
      item: shortcut,
    });
  };

  const handleDiscardChanges = () => {
    if (selectedItem?.type === "category") {
      const cat = selectedItem.data;
      setEditCategoryData({
        label: cat.label,
        placement_type: cat.placement_type,
        parent_category_id: cat.parent_category_id,
        description: cat.description || "",
        icon_name: cat.icon_name,
        color: cat.color,
        sort_order: cat.sort_order,
        is_active: cat.is_active,
        metadata: cat.metadata || {},
      });
    } else if (selectedItem?.type === "shortcut") {
      setEditShortcutData(selectedItem.data);
    }
    setHasUnsavedChanges(false);
  };

  // Create handlers
  const handleCreateShortcut = async () => {
    if (!createShortcutData.category_id || !createShortcutData.label) {
      toast({
        title: "Error",
        description: "Category and label are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const newShortcut = await createPromptShortcut(
        createShortcutData as CreatePromptShortcutInput,
      );
      toast({ title: "Success", description: "Shortcut created successfully" });
      setIsCreateShortcutOpen(false);
      setCreateShortcutData({});

      // Reload data without showing full loading state
      const [categoriesData, categoryItemsData, builtinsData] =
        await Promise.all([
          fetchShortcutCategories(),
          fetchCategoryItemsWithRelations(),
          fetchPromptBuiltins({ is_active: true }),
        ]);

      setCategories(categoriesData);
      setCategoryItems(categoryItemsData);
      setBuiltins(builtinsData);

      // Find and select the newly created shortcut
      const createdShortcut = categoryItemsData.find(
        (item: any) =>
          item.item_type === "shortcut" && item.id === newShortcut.id,
      );
      if (createdShortcut && createdShortcut.item_type === "shortcut") {
        setSelectedItem({
          type: "shortcut",
          data: createdShortcut as PromptShortcut & {
            category?: ShortcutCategory;
            builtin?: PromptBuiltin;
          },
        });
        // Expand the category to show the new shortcut
        if (createdShortcut.category_id) {
          setExpandedCategories((prev) =>
            new Set(prev).add(createdShortcut.category_id),
          );
        }
      }
    } catch (error: any) {
      const errorMessage = getUserFriendlyError(error);
      toast({
        title: "Failed to Create Shortcut",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Prompt builtin handlers
  const handleOpenBuiltinEditor = (builtinId: string) => {
    setEditingBuiltinId(builtinId);
    setIsPromptSettingsOpen(true);
  };

  const handleUpdateBuiltin = async (
    id: string,
    data: {
      name: string;
      description?: string;
      variableDefaults: any[];
      messages?: any[];
      settings?: Record<string, any>;
      tags?: string[];
      category?: string;
      isFavorite?: boolean;
      isArchived?: boolean;
      modelId?: string;
      outputFormat?: string;
      outputSchema?: unknown;
    },
  ) => {
    try {
      const response = await fetch(`/api/admin/prompt-builtins/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          messages: data.messages,
          variable_defaults: data.variableDefaults,
          settings: data.settings,
          tags: data.tags,
          category: data.category,
          is_favorite: data.isFavorite,
          is_archived: data.isArchived,
          model_id: data.modelId,
          output_format: data.outputFormat,
          output_schema: data.outputSchema,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update builtin");
      }

      toast({
        title: "Success",
        description: "Prompt builtin updated successfully",
      });

      // Reload data without showing full loading state
      const [categoriesData, categoryItemsData, builtinsData] =
        await Promise.all([
          fetchShortcutCategories(),
          fetchCategoryItemsWithRelations(),
          fetchPromptBuiltins({ is_active: true }),
        ]);

      setCategories(categoriesData);
      setCategoryItems(categoryItemsData);
      setBuiltins(builtinsData);
    } catch (error: any) {
      const errorMessage = getUserFriendlyError(error);
      toast({
        title: "Failed to Update Builtin",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    }
  };

  // Render tree nodes recursively
  const renderTreeNode = (node: any, depth: number = 0): React.ReactNode => {
    const isPlacementNode = node.type === "placement";
    const isSelected =
      !isPlacementNode &&
      selectedItem?.type === "category" &&
      selectedItem.data.id === node.id;
    const expanded = isExpanded(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const hasItems = node.items && node.items.length > 0;
    const hasContent = hasChildren || hasItems;

    return (
      <div key={node.id}>
        {/* Category/Placement Row */}
        <div
          className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors
            ${isSelected ? "bg-blue-100 dark:bg-blue-900" : "hover:bg-gray-100 dark:hover:bg-gray-800"}
            ${isPlacementNode ? "font-semibold text-gray-700 dark:text-gray-300" : ""}`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => {
            if (hasContent) toggleCategory(node.id);
            if (!isPlacementNode) {
              setSelectedItem({ type: "category", data: node });
            }
          }}
        >
          {/* Always show chevron for consistency */}
          <div
            className={`flex items-center gap-1 ${!hasContent ? "opacity-30" : ""}`}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            {isPlacementNode ? (
              <>
                <Folder className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />
                <span className="text-xs truncate">{node.label}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {node.totalCount || 0}
                </Badge>
              </>
            ) : (
              <>
                <DynamicIcon
                  name={node.icon_name || "Folder"}
                  color={node.color || "zinc"}
                  size={3.5}
                  className="flex-shrink-0"
                />
                <span className="text-xs font-medium truncate">
                  {node.label}
                </span>
                {!node.is_active && (
                  <EyeOff className="w-3 h-3 text-gray-400" />
                )}
              </>
            )}
          </div>
        </div>

        {/* Children and Items */}
        {expanded && (
          <div>
            {/* Child Categories */}
            {node.children?.map((child: any) =>
              renderTreeNode(child, depth + 1),
            )}

            {/* Items (Shortcuts and Content Blocks) */}
            {node.items?.map((item: any) => {
              const isItemSelected =
                (item.item_type === "shortcut" &&
                  selectedItem?.type === "shortcut" &&
                  selectedItem.data.id === item.id) ||
                (item.item_type === "content_block" &&
                  selectedItem?.type === "content_block" &&
                  selectedItem.data.id === item.id);

              const isShortcut = item.item_type === "shortcut";
              const icon = isShortcut ? (
                <Zap className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              );

              return (
                <div
                  key={`${item.item_type}-${item.id}`}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors
                    ${isItemSelected ? "bg-blue-100 dark:bg-blue-900" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                  style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
                  onClick={() => {
                    if (isShortcut) {
                      setEditingShortcut(item);
                      setIsShortcutEditModalOpen(true);
                    } else {
                      setEditingContentBlock(item);
                      setIsContentBlockEditModalOpen(true);
                    }
                  }}
                >
                  {icon}
                  <span className="text-xs truncate">{item.label}</span>
                  {!item.is_active && (
                    <EyeOff className="w-3 h-3 text-gray-400" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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
            <div className="flex gap-2">
              <Button
                onClick={() => setIsCreateCategoryOpen(true)}
                size="sm"
                variant="outline"
              >
                <Folder className="w-4 h-4 mr-1" />
                Category
              </Button>
              <Button
                onClick={() => {
                  // Pre-select category if one is currently selected
                  if (selectedItem?.type === "category") {
                    setCreateShortcutData({
                      category_id: selectedItem.data.id,
                    });
                  } else {
                    setCreateShortcutData({});
                  }
                  setIsCreateShortcutOpen(true);
                }}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Shortcut
              </Button>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant={viewMode === "tree" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("tree")}
              className="flex-1"
            >
              <Folder className="w-4 h-4 mr-1" />
              Tree
            </Button>
            <Button
              variant={viewMode === "shortcuts" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("shortcuts")}
              className="flex-1"
            >
              <Zap className="w-4 h-4 mr-1" />
              Items
            </Button>
          </div>

          {viewMode === "tree" && (
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={expandAll}
                className="flex-1 text-xs"
              >
                Expand All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={collapseAll}
                className="flex-1 text-xs"
              >
                Collapse All
              </Button>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Placement Filter */}
          <Select
            value={selectedPlacement}
            onValueChange={setSelectedPlacement}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Placements</SelectItem>
              {Object.entries(PLACEMENT_TYPES).map(([key, value]) => (
                <SelectItem key={value} value={value}>
                  {getPlacementTypeMeta(value).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Show Inactive Toggle */}
          <label className="flex items-center space-x-2 cursor-pointer mt-1 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <Checkbox
              checked={showInactive}
              onCheckedChange={(checked) => setShowInactive(!!checked)}
            />
            <span className="text-sm">Show inactive items</span>
          </label>
        </div>

        {/* Tree/Shortcuts View */}
        <ScrollArea className="flex-1">
          <div className="px-1 py-1">
            {viewMode === "tree" ? (
              tree.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <Folder className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No categories found</p>
                </div>
              ) : (
                tree.map((node) => renderTreeNode(node))
              )
            ) : // Items-only view (shortcuts + content blocks)
            categoryItems.filter((item) => {
                const category = categories.find(
                  (c) => c.id === item.category_id,
                );
                const matchesPlacement =
                  selectedPlacement === "all" ||
                  category?.placement_type === selectedPlacement;
                const matchesSearch =
                  searchTerm === "" ||
                  matchesSearchScoring(item, searchTerm, [
                    { get: (i) => i.label, weight: "title" },
                  ]);
                const matchesActive = showInactive || item.is_active;
                return matchesPlacement && matchesSearch && matchesActive;
              }).length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No items found</p>
              </div>
            ) : (
              categoryItems
                .filter((item) => {
                  const category = categories.find(
                    (c) => c.id === item.category_id,
                  );
                  const matchesPlacement =
                    selectedPlacement === "all" ||
                    category?.placement_type === selectedPlacement;
                  const matchesSearch =
                    searchTerm === "" ||
                    matchesSearchScoring(item, searchTerm, [
                      { get: (i) => i.label, weight: "title" },
                    ]);
                  const matchesActive = showInactive || item.is_active;
                  return matchesPlacement && matchesSearch && matchesActive;
                })
                .sort((a, b) => {
                  // Sort by category label then by sort_order
                  const catA = categories.find((c) => c.id === a.category_id);
                  const catB = categories.find((c) => c.id === b.category_id);
                  const catCompare = (catA?.label || "").localeCompare(
                    catB?.label || "",
                  );
                  if (catCompare !== 0) return catCompare;
                  return a.sort_order - b.sort_order;
                })
                .map((item) => {
                  const isItemSelected =
                    (item.item_type === "shortcut" &&
                      selectedItem?.type === "shortcut" &&
                      selectedItem.data.id === item.id) ||
                    (item.item_type === "content_block" &&
                      selectedItem?.type === "content_block" &&
                      selectedItem.data.id === item.id);
                  const category = categories.find(
                    (c) => c.id === item.category_id,
                  );
                  const isShortcut = item.item_type === "shortcut";

                  return (
                    <div
                      key={`${item.item_type}-${item.id}`}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors mb-0.5
                          ${isItemSelected ? "bg-blue-100 dark:bg-blue-900" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                      onClick={() => {
                        if (isShortcut) {
                          setEditingShortcut(item);
                          setIsShortcutEditModalOpen(true);
                        } else {
                          setEditingContentBlock(item);
                          setIsContentBlockEditModalOpen(true);
                        }
                      }}
                    >
                      {isShortcut ? (
                        <Zap className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {item.label}
                        </div>
                        {category && (
                          <div className="text-[10px] text-gray-500 truncate">
                            {category.label}
                          </div>
                        )}
                      </div>
                      {!item.is_active && (
                        <EyeOff className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </ScrollArea>

        {/* Stats */}
        <div className="p-4 border-t border-border bg-gray-50 dark:bg-gray-800">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {categories.length} categories •{" "}
            {categoryItems.filter((i) => i.item_type === "shortcut").length}{" "}
            shortcuts •{" "}
            {
              categoryItems.filter((i) => i.item_type === "content_block")
                .length
            }{" "}
            content blocks
          </div>
        </div>
      </div>

      {/* Main Content Area - Will continue in next message */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedItem ? (
          <>
            {/* Header */}
            <div className="px-6 py-2 border-b border-border bg-textured">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-lg font-bold">
                    {selectedItem.type === "category"
                      ? "Edit Category"
                      : "Edit Shortcut"}
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
                    onClick={
                      selectedItem.type === "category"
                        ? handleSaveCategoryChanges
                        : handleSaveShortcutChanges
                    }
                    disabled={!hasUnsavedChanges}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (selectedItem.type === "category") {
                        handleDeleteCategory(selectedItem.data);
                      } else if (selectedItem.type === "shortcut") {
                        handleDeleteShortcut(selectedItem.data);
                      }
                      // Note: content blocks are handled via their own modal
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {selectedItem.type === "category" ? (
                  /* Category Edit Form */
                  <Card>
                    <CardHeader>
                      <CardTitle>Category Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CategoryFormFields
                        initialData={selectedItem.data}
                        allCategories={categories}
                        formData={editCategoryData}
                        onChange={handleCategoryChange}
                        disabled={false}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  /* Shortcut Edit Form */
                  <>
                    {/* Basic Information */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Basic Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Label</Label>
                            <Input
                              value={editShortcutData.label || ""}
                              onChange={(e) =>
                                handleShortcutChange("label", e.target.value)
                              }
                              placeholder="Shortcut name"
                            />
                          </div>
                          <div>
                            <Label>Keyboard Shortcut</Label>
                            <Input
                              value={editShortcutData.keyboard_shortcut || ""}
                              onChange={(e) =>
                                handleShortcutChange(
                                  "keyboard_shortcut",
                                  e.target.value,
                                )
                              }
                              placeholder="Ctrl+Shift+K"
                            />
                          </div>
                        </div>

                        <div>
                          <Label>Description</Label>
                          <Textarea
                            value={editShortcutData.description || ""}
                            onChange={(e) =>
                              handleShortcutChange(
                                "description",
                                e.target.value,
                              )
                            }
                            placeholder="Optional description"
                            rows={3}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor="shortcut-icon-input">
                              Icon Name
                            </Label>
                            <IconInputWithValidation
                              id="shortcut-icon-input"
                              value={editShortcutData.icon_name || ""}
                              onChange={(value) =>
                                handleShortcutChange("icon_name", value)
                              }
                              placeholder="e.g., Zap"
                            />
                          </div>
                          <div>
                            <Label>Category</Label>
                            <Select
                              value={editShortcutData.category_id}
                              onValueChange={(value) =>
                                handleShortcutChange("category_id", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    {getCategoryHierarchyLabel(cat)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Sort Order</Label>
                            <Input
                              type="number"
                              value={editShortcutData.sort_order || 0}
                              onChange={(e) =>
                                handleShortcutChange(
                                  "sort_order",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                            />
                          </div>
                        </div>

                        <label className="flex items-center space-x-2 cursor-pointer">
                          <Checkbox
                            checked={editShortcutData.is_active}
                            onCheckedChange={(checked) =>
                              handleShortcutChange("is_active", checked)
                            }
                          />
                          <span className="text-sm">
                            Active (visible in menus)
                          </span>
                        </label>
                      </CardContent>
                    </Card>

                    {/* Execution Configuration */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          Execution Configuration
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2.5">
                        {/* Result Display */}
                        <div className="flex items-center gap-3">
                          <Label className="text-xs flex-shrink-0 w-28">
                            Display
                          </Label>
                          <Select
                            value={
                              editShortcutData.result_display || "modal-full"
                            }
                            onValueChange={(value: ResultDisplay) =>
                              handleShortcutChange("result_display", value)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                              {Object.entries(RESULT_DISPLAY_META).map(
                                ([key, meta]) => (
                                  <SelectItem
                                    key={key}
                                    value={key}
                                    className="text-xs py-1"
                                  >
                                    {meta.label}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Divider */}
                        <div className="pt-1 border-t border-border" />

                        {/* Boolean switches in compact grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {/* Auto Run */}
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Auto run</Label>
                            <Switch
                              checked={editShortcutData.auto_run ?? true}
                              onCheckedChange={(checked) =>
                                handleShortcutChange("auto_run", checked)
                              }
                            />
                          </div>

                          {/* Allow Chat */}
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Allow chat</Label>
                            <Switch
                              checked={editShortcutData.allow_chat ?? true}
                              onCheckedChange={(checked) =>
                                handleShortcutChange("allow_chat", checked)
                              }
                            />
                          </div>

                          {/* Show Variables */}
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Show variables</Label>
                            <Switch
                              checked={editShortcutData.show_variables ?? false}
                              onCheckedChange={(checked) =>
                                handleShortcutChange("show_variables", checked)
                              }
                            />
                          </div>

                          {/* Apply Variables */}
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Apply variables</Label>
                            <Switch
                              checked={editShortcutData.apply_variables ?? true}
                              onCheckedChange={(checked) =>
                                handleShortcutChange("apply_variables", checked)
                              }
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Available Scope Keys - Primary Section */}
                    <Card className="border-blue-200 dark:border-blue-800">
                      <CardHeader>
                        <CardTitle>Scopes</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pl-4">
                        <div className="space-y-3">
                          <div className="flex flex-col gap-2">
                            {["selection", "content", "context"].map(
                              (scope) => (
                                <label
                                  key={scope}
                                  className="flex items-center space-x-2 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={(
                                      editShortcutData.available_scopes || []
                                    ).includes(scope)}
                                    onCheckedChange={(checked) => {
                                      const currentScopes =
                                        editShortcutData.available_scopes || [];
                                      const newScopes = checked
                                        ? [...currentScopes, scope]
                                        : currentScopes.filter(
                                            (s) => s !== scope,
                                          );
                                      handleShortcutChange(
                                        "available_scopes",
                                        newScopes,
                                      );
                                    }}
                                  />
                                  <span className="font-normal capitalize text-sm">
                                    {scope}
                                  </span>
                                </label>
                              ),
                            )}
                          </div>
                        </div>

                        <div>
                          <Label className="text-sm font-semibold">
                            Custom Scope Keys (comma-separated)
                          </Label>
                          <Input
                            value={(editShortcutData.available_scopes || [])
                              .filter(
                                (s) =>
                                  !["selection", "content", "context"].includes(
                                    s,
                                  ),
                              )
                              .join(", ")}
                            onChange={(e) => {
                              const customScopes = e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean);
                              const commonScopes = (
                                editShortcutData.available_scopes || []
                              ).filter((s) =>
                                ["selection", "content", "context"].includes(s),
                              );
                              handleShortcutChange("available_scopes", [
                                ...commonScopes,
                                ...customScopes,
                              ]);
                            }}
                            placeholder="custom_key1, custom_key2"
                          />
                        </div>

                        {editShortcutData.available_scopes &&
                          editShortcutData.available_scopes.length > 0 && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                              <p className="text-sm font-medium mb-2">
                                Current Scopes:
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {editShortcutData.available_scopes.map(
                                  (scope) => (
                                    <Badge key={scope} variant="outline">
                                      {scope}
                                    </Badge>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </CardContent>
                    </Card>

                    {/* Prompt Builtin & Scope Mappings - Independent Bottom Section */}
                    <div className="grid grid-cols-2 gap-6">
                      {/* Prompt Builtin Selection/Creation */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Prompt Builtin</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Select
                              value={
                                editShortcutData.prompt_builtin_id || "none"
                              }
                              onValueChange={(value) =>
                                handleShortcutChange(
                                  "prompt_builtin_id",
                                  value === "none" ? null : value,
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="No prompt connected" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="text-gray-500">
                                    No prompt connected
                                  </span>
                                </SelectItem>
                                {builtins.map((builtin) => (
                                  <SelectItem
                                    key={builtin.id}
                                    value={builtin.id}
                                  >
                                    {builtin.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {editShortcutData.prompt_builtin_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() =>
                                  handleOpenBuiltinEditor(
                                    editShortcutData.prompt_builtin_id!,
                                  )
                                }
                              >
                                <Edit2 className="w-4 h-4 mr-2" />
                                View/Edit Builtin
                              </Button>
                            )}
                          </div>

                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setIsSelectPromptModalOpen(true)}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Builtin Prompt
                          </Button>

                          {!editShortcutData.prompt_builtin_id && (
                            <p className="text-xs text-orange-600 dark:text-orange-400">
                              ℹ️ Shortcut won't be functional until a prompt is
                              connected
                            </p>
                          )}

                          {/* Show prompt variables if builtin selected */}
                          {editShortcutData.prompt_builtin_id &&
                            (() => {
                              const selectedBuiltin = builtins.find(
                                (b) =>
                                  b.id === editShortcutData.prompt_builtin_id,
                              );
                              if (selectedBuiltin) {
                                const hasVariables =
                                  selectedBuiltin.variableDefaults &&
                                  selectedBuiltin.variableDefaults.length > 0;

                                if (hasVariables) {
                                  return (
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                                        Variables in "{selectedBuiltin.name}":
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {selectedBuiltin.variableDefaults.map(
                                          (v: any) => (
                                            <Badge
                                              key={v.name}
                                              variant="secondary"
                                              className="text-xs"
                                            >
                                              {v.name}
                                            </Badge>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-md border border-orange-200 dark:border-orange-800">
                                      <p className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-1">
                                        ⚠️ No Variables Defined
                                      </p>
                                      <p className="text-xs text-orange-700 dark:text-orange-300">
                                        This prompt has no variables. You may
                                        want to add variables or scope mappings
                                        may not be needed.
                                      </p>
                                    </div>
                                  );
                                }
                              }
                              return null;
                            })()}
                        </CardContent>
                      </Card>

                      {/* Scope Mappings */}
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle>Scope Mappings</CardTitle>
                              <CardDescription>
                                Map scope keys to prompt variables
                              </CardDescription>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const input = document.createElement("input");
                                input.type = "file";
                                input.accept = ".json";
                                input.onchange = (e: any) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      try {
                                        const json = JSON.parse(
                                          event.target?.result as string,
                                        );
                                        handleShortcutChange(
                                          "scope_mappings",
                                          json,
                                        );
                                        toast({
                                          title: "Success",
                                          description:
                                            "Scope mappings imported",
                                        });
                                      } catch (err) {
                                        toast({
                                          title: "Error",
                                          description: "Invalid JSON file",
                                          variant: "destructive",
                                        });
                                      }
                                    };
                                    reader.readAsText(file);
                                  }
                                };
                                input.click();
                              }}
                            >
                              Upload JSON
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {(editShortcutData.available_scopes || []).map(
                            (scopeKey) => {
                              const selectedBuiltin = builtins.find(
                                (b) =>
                                  b.id === editShortcutData.prompt_builtin_id,
                              );
                              const availableVariables =
                                selectedBuiltin?.variableDefaults?.map(
                                  (v: any) => v.name,
                                ) || [];
                              const currentValue =
                                (editShortcutData.scope_mappings as any)?.[
                                  scopeKey
                                ] || "";

                              return (
                                <div
                                  key={scopeKey}
                                  className="flex items-center gap-2"
                                >
                                  <Label className="w-32 text-sm font-medium">
                                    {scopeKey}
                                  </Label>
                                  <span className="text-gray-500">→</span>
                                  <Select
                                    value={currentValue || "_none_"}
                                    onValueChange={(value) => {
                                      if (value === "_none_") {
                                        // Clear the mapping
                                        const newMappings = {
                                          ...(editShortcutData.scope_mappings ||
                                            {}),
                                          [scopeKey]: "",
                                        };
                                        handleShortcutChange(
                                          "scope_mappings",
                                          newMappings,
                                        );
                                      } else {
                                        const newMappings = {
                                          ...(editShortcutData.scope_mappings ||
                                            {}),
                                          [scopeKey]: value,
                                        };
                                        handleShortcutChange(
                                          "scope_mappings",
                                          newMappings,
                                        );
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-48">
                                      <SelectValue placeholder="Select variable" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableVariables.length > 0 ? (
                                        <>
                                          {availableVariables.map(
                                            (varName: string) => (
                                              <SelectItem
                                                key={varName}
                                                value={varName}
                                              >
                                                {varName}
                                              </SelectItem>
                                            ),
                                          )}
                                          <SelectItem
                                            value="_none_"
                                            className="text-gray-500"
                                          >
                                            Custom
                                          </SelectItem>
                                        </>
                                      ) : (
                                        <SelectItem value="_none_">
                                          No variables
                                        </SelectItem>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    value={currentValue}
                                    onChange={(e) => {
                                      const newMappings = {
                                        ...(editShortcutData.scope_mappings ||
                                          {}),
                                        [scopeKey]: e.target.value,
                                      };
                                      handleShortcutChange(
                                        "scope_mappings",
                                        newMappings,
                                      );
                                    }}
                                    placeholder="or type custom"
                                    className="flex-1"
                                  />
                                </div>
                              );
                            },
                          )}

                          {(!editShortcutData.available_scopes ||
                            editShortcutData.available_scopes.length === 0) && (
                            <p className="text-sm text-gray-500 text-center py-4">
                              Add available scope keys above first
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Item Selected</h3>
              <p>Select a category or shortcut from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Category Dialog */}
      <CategoryFormModal
        isOpen={isCreateCategoryOpen}
        onClose={() => setIsCreateCategoryOpen(false)}
        allCategories={categories}
        onSuccess={handleCategorySuccess}
      />

      {/* Select/Generate Prompt for Builtin Modal */}
      {isSelectPromptModalOpen && selectedItem?.type === "shortcut" && (
        <SelectPromptForBuiltinModal
          isOpen={isSelectPromptModalOpen}
          onClose={() => setIsSelectPromptModalOpen(false)}
          shortcutId={selectedItem.data.id}
          shortcutData={{
            label: selectedItem.data.label || "",
            available_scopes: selectedItem.data.available_scopes || [],
          }}
          onSuccess={async (builtinId) => {
            // Update the shortcut with the new builtin
            handleShortcutChange("prompt_builtin_id", builtinId);
            // Reload data to get the latest builtins without showing full loading state
            const builtinsData = await fetchPromptBuiltins({ is_active: true });
            setBuiltins(builtinsData);
            setIsSelectPromptModalOpen(false);
          }}
        />
      )}

      {/* Prompt Settings Modal for Editing Builtin */}
      {isPromptSettingsOpen &&
        editingBuiltinId &&
        (() => {
          const builtin = builtins.find((b) => b.id === editingBuiltinId);
          if (!builtin) return null;

          return (
            <PromptSettingsModal
              isOpen={isPromptSettingsOpen}
              onClose={() => {
                setIsPromptSettingsOpen(false);
                setEditingBuiltinId(null);
              }}
              promptId={builtin.id}
              promptName={builtin.name}
              promptDescription={builtin.description || ""}
              variableDefaults={builtin.variableDefaults || []}
              messages={builtin.messages || []}
              settings={builtin.settings || {}}
              models={models}
              availableTools={availableTools}
              tags={builtin.tags ?? undefined}
              category={builtin.category ?? undefined}
              isFavorite={builtin.is_favorite}
              isArchived={builtin.is_archived}
              modelId={builtin.model_id ?? undefined}
              outputFormat={builtin.output_format ?? undefined}
              outputSchema={builtin.output_schema ?? undefined}
              onUpdate={handleUpdateBuiltin}
              onLocalStateUpdate={() => {
                // No-op for builtins — state is managed by the admin manager
              }}
            />
          );
        })()}

      {/* Create Shortcut Dialog */}
      <Dialog
        open={isCreateShortcutOpen}
        onOpenChange={setIsCreateShortcutOpen}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Shortcut</DialogTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
              Create a shortcut "wishlist" item. You can connect it to a prompt
              later.
            </CardDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Label *</Label>
                <Input
                  value={createShortcutData.label || ""}
                  onChange={(e) =>
                    setCreateShortcutData({
                      ...createShortcutData,
                      label: e.target.value,
                    })
                  }
                  placeholder="Shortcut name"
                />
              </div>
              <div>
                <Label>Category *</Label>
                <Select
                  value={createShortcutData.category_id}
                  onValueChange={(value) =>
                    setCreateShortcutData({
                      ...createShortcutData,
                      category_id: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {getCategoryHierarchyLabel(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={createShortcutData.description || ""}
                onChange={(e) =>
                  setCreateShortcutData({
                    ...createShortcutData,
                    description: e.target.value,
                  })
                }
                placeholder="What should this shortcut do?"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Keyboard Shortcut</Label>
                <div className="flex gap-2">
                  <Select
                    value="custom"
                    onValueChange={(prefix) => {
                      if (prefix !== "custom") {
                        const current =
                          createShortcutData.keyboard_shortcut || "";
                        // Extract the last key if it exists
                        const lastKey = current.split("+").pop() || "";
                        setCreateShortcutData({
                          ...createShortcutData,
                          keyboard_shortcut: `${prefix}${lastKey}`,
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Prefix" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="Ctrl+">Ctrl+</SelectItem>
                      <SelectItem value="Ctrl+Shift+">Ctrl+Shift+</SelectItem>
                      <SelectItem value="Ctrl+Alt+">Ctrl+Alt+</SelectItem>
                      <SelectItem value="Alt+">Alt+</SelectItem>
                      <SelectItem value="Alt+Shift+">Alt+Shift+</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    value={createShortcutData.keyboard_shortcut || ""}
                    onChange={(e) =>
                      setCreateShortcutData({
                        ...createShortcutData,
                        keyboard_shortcut: e.target.value,
                      })
                    }
                    placeholder="K (optional)"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Use prefix dropdown or type full shortcut
                </p>
              </div>
              <div>
                <Label htmlFor="create-shortcut-icon">Icon Name</Label>
                <IconInputWithValidation
                  id="create-shortcut-icon"
                  value={createShortcutData.icon_name || ""}
                  onChange={(value) =>
                    setCreateShortcutData({
                      ...createShortcutData,
                      icon_name: value,
                    })
                  }
                  placeholder="e.g., Zap (optional)"
                />
              </div>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                💡 <strong>Note:</strong> After creating this shortcut, you can
                edit it to configure scope mappings and connect it to a prompt.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateShortcutOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateShortcut}>Create Shortcut</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shortcut Edit Modal */}
      <ShortcutEditModal
        isOpen={isShortcutEditModalOpen}
        onClose={() => {
          setIsShortcutEditModalOpen(false);
          setEditingShortcut(null);
        }}
        onSuccess={() => {
          setIsShortcutEditModalOpen(false);
          setEditingShortcut(null);
          loadData();
        }}
        shortcut={editingShortcut}
        categories={categories}
        builtins={builtins}
        mode="standalone"
        models={models}
        availableTools={availableTools}
      />

      {/* Content Block Edit Modal */}
      <ContentBlockEditModal
        isOpen={isContentBlockEditModalOpen}
        onClose={() => {
          setIsContentBlockEditModalOpen(false);
          setEditingContentBlock(null);
        }}
        onSuccess={() => {
          setIsContentBlockEditModalOpen(false);
          setEditingContentBlock(null);
          loadData();
        }}
        contentBlock={editingContentBlock}
        categories={categories}
      />

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
            <AlertDialogTitle className="flex items-center gap-2">
              {(() => {
                const deps = deleteConfirmation.dependencies;
                const hasDeps =
                  deps &&
                  (deps.contentBlocks > 0 ||
                    deps.promptShortcuts > 0 ||
                    deps.childCategories > 0);

                return (
                  <>
                    {hasDeps && (
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    )}
                    {deleteConfirmation.type === "category"
                      ? "Delete Category"
                      : "Delete Shortcut"}
                  </>
                );
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {deleteConfirmation.type === "category" &&
                deleteConfirmation.dependencies ? (
                  <>
                    {(() => {
                      const {
                        contentBlocks,
                        promptShortcuts,
                        childCategories,
                      } = deleteConfirmation.dependencies;
                      const hasAnyDeps =
                        contentBlocks > 0 ||
                        promptShortcuts > 0 ||
                        childCategories > 0;

                      if (hasAnyDeps) {
                        return (
                          <>
                            <p>
                              <strong>
                                Cannot delete category "
                                {
                                  (deleteConfirmation.item as ShortcutCategory)
                                    ?.label
                                }
                                "
                              </strong>
                            </p>
                            <p>This category is currently being used by:</p>
                            <ul className="list-disc list-inside space-y-1 pl-2">
                              {contentBlocks > 0 && (
                                <li>
                                  <strong>{contentBlocks}</strong> content block
                                  {contentBlocks !== 1 ? "s" : ""}
                                </li>
                              )}
                              {promptShortcuts > 0 && (
                                <li>
                                  <strong>{promptShortcuts}</strong> prompt
                                  shortcut{promptShortcuts !== 1 ? "s" : ""}
                                </li>
                              )}
                              {childCategories > 0 && (
                                <li>
                                  <strong>{childCategories}</strong> child
                                  categor{childCategories !== 1 ? "ies" : "y"}
                                </li>
                              )}
                            </ul>
                            <p className="text-sm">
                              Please reassign or remove these items before
                              deleting this category.
                            </p>
                          </>
                        );
                      } else {
                        return (
                          <p>
                            Are you sure you want to delete the category{" "}
                            <strong>
                              "
                              {
                                (deleteConfirmation.item as ShortcutCategory)
                                  ?.label
                              }
                              "
                            </strong>
                            ? This action cannot be undone.
                          </p>
                        );
                      }
                    })()}
                  </>
                ) : deleteConfirmation.type === "shortcut" ? (
                  <p>
                    Are you sure you want to delete the shortcut{" "}
                    <strong>
                      "{(deleteConfirmation.item as PromptShortcut)?.label}"
                    </strong>
                    ? This action cannot be undone.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {(() => {
              const deps = deleteConfirmation.dependencies;
              const hasDeps =
                deps &&
                (deps.contentBlocks > 0 ||
                  deps.promptShortcuts > 0 ||
                  deps.childCategories > 0);

              // Only show delete button if no dependencies exist
              if (!hasDeps || deleteConfirmation.type !== "category") {
                return (
                  <AlertDialogAction
                    onClick={confirmDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                );
              }
              return null;
            })()}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Shortcut Modal */}
      {duplicatingShortcut && (
        <DuplicateShortcutModal
          isOpen={isDuplicateShortcutModalOpen}
          onClose={() => {
            setIsDuplicateShortcutModalOpen(false);
            setDuplicatingShortcut(null);
          }}
          onSuccess={async () => {
            setIsDuplicateShortcutModalOpen(false);
            setDuplicatingShortcut(null);
            await loadData();
          }}
          shortcut={duplicatingShortcut}
          categories={categories}
        />
      )}
    </div>
  );
}
