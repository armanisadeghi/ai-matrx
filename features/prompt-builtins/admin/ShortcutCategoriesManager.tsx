"use client";

import React, { useState, useMemo } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  X,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Edit2,
  Folder,
  FolderOpen,
  Loader2,
  Save,
} from "lucide-react";
import {
  ShortcutCategory,
  CreateShortcutCategoryInput,
  UpdateShortcutCategoryInput,
} from "../types/core";
import {
  fetchShortcutCategories,
  createShortcutCategory,
  updateShortcutCategory,
  deleteShortcutCategory,
} from "../services/admin-service";
import { PLACEMENT_TYPES, getPlacementTypeMeta } from "../constants";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { getUserFriendlyError } from "../utils/error-handler";
import { CategoryFormModal } from "../components/CategoryFormModal";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";

type SortField = "label" | "placement" | "parent" | "sort_order" | "status";
type SortDirection = "asc" | "desc";

interface ShortcutCategoriesManagerProps {
  className?: string;
}

export function ShortcutCategoriesManager({
  className,
}: ShortcutCategoriesManagerProps) {
  const [categories, setCategories] = useState<ShortcutCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [sortField, setSortField] = useState<SortField>("sort_order");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [placementFilter, setPlacementFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  // Modals
  const [editingCategory, setEditingCategory] =
    useState<ShortcutCategory | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  const { toast } = useToast();

  // Load categories
  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const categoriesData = await fetchShortcutCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error("Error loading categories:", error);
      toast({
        title: "Error",
        description: "Failed to load categories",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Helper to get category hierarchy label
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

  // Filter and sort categories, then group by placement type
  const categoriesByPlacement = useMemo(() => {
    let filtered = [...categories];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.label.toLowerCase().includes(query) ||
          c.description?.toLowerCase().includes(query) ||
          idMatchesQuery(c, query),
      );
    }

    // Placement filter
    if (placementFilter !== "all") {
      filtered = filtered.filter((c) => c.placement_type === placementFilter);
    }

    // Active filter
    if (activeFilter === "active") {
      filtered = filtered.filter((c) => c.is_active);
    } else if (activeFilter === "inactive") {
      filtered = filtered.filter((c) => !c.is_active);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case "label":
          aVal = a.label.toLowerCase();
          bVal = b.label.toLowerCase();
          break;
        case "placement":
          aVal = a.placement_type;
          bVal = b.placement_type;
          break;
        case "parent":
          aVal = a.parent_category_id || "";
          bVal = b.parent_category_id || "";
          break;
        case "sort_order":
          aVal = a.sort_order;
          bVal = b.sort_order;
          break;
        case "status":
          aVal = a.is_active ? 1 : 0;
          bVal = b.is_active ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    // Group by placement type
    const grouped = new Map<string, ShortcutCategory[]>();
    filtered.forEach((category) => {
      const placementType = category.placement_type;
      if (!grouped.has(placementType)) {
        grouped.set(placementType, []);
      }
      grouped.get(placementType)!.push(category);
    });

    // Sort placement types alphabetically
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [
    categories,
    searchQuery,
    placementFilter,
    activeFilter,
    sortField,
    sortDirection,
  ]);

  // Stats
  const stats = useMemo(() => {
    const total = categories.length;
    const active = categories.filter((c) => c.is_active).length;
    const byPlacement = Object.keys(PLACEMENT_TYPES).reduce(
      (acc, key) => {
        const placementType =
          PLACEMENT_TYPES[key as keyof typeof PLACEMENT_TYPES];
        acc[placementType] = categories.filter(
          (c) => c.placement_type === placementType,
        ).length;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { total, active, byPlacement };
  }, [categories]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleEdit = (category: ShortcutCategory) => {
    setEditingCategory(category);
    setIsFormModalOpen(true);
  };

  const handleCreate = () => {
    setEditingCategory(null);
    setIsFormModalOpen(true);
  };

  const handleFormSuccess = async () => {
    setIsFormModalOpen(false);
    setEditingCategory(null);
    await loadData();
  };

  const handleToggleActive = async (
    categoryId: string,
    currentState: boolean,
  ) => {
    try {
      await updateShortcutCategory({
        id: categoryId,
        is_active: !currentState,
      });

      toast({
        title: "Success",
        description: `Category ${!currentState ? "activated" : "deactivated"}`,
      });
      await loadData();
    } catch (error: any) {
      const errorMessage = getUserFriendlyError(error);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (categoryId: string, categoryLabel: string) => {
    if (!confirm(`Are you sure you want to delete "${categoryLabel}"?`)) return;

    try {
      await deleteShortcutCategory(categoryId);
      toast({ title: "Success", description: "Category deleted" });
      await loadData();
    } catch (error: any) {
      const errorMessage = getUserFriendlyError(error);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setPlacementFilter("all");
    setActiveFilter("all");
  };

  const hasActiveFilters =
    searchQuery || placementFilter !== "all" || activeFilter !== "all";

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-3 w-3 inline ml-1" />
    ) : (
      <ChevronDown className="h-3 w-3 inline ml-1" />
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
    <TooltipProvider>
      <div className={`flex flex-col h-full ${className}`}>
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Shortcut Categories</h2>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button onClick={clearFilters} variant="outline" size="sm">
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
              <Button onClick={() => loadData()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={handleCreate} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Category
              </Button>
            </div>
          </div>

          {/* Compact Stats */}
          <div className="grid grid-cols-5 gap-2">
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold text-blue-600">
                  {stats.active}
                </div>
                <div className="text-xs text-muted-foreground">Active</div>
              </CardContent>
            </Card>
            {Object.entries(stats.byPlacement)
              .slice(0, 3)
              .map(([type, count]) => (
                <Card key={type}>
                  <CardContent className="p-2">
                    <div className="text-xl font-bold">{count}</div>
                    <div className="text-xs text-muted-foreground">
                      {getPlacementTypeMeta(type).label}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>

          {/* Filters */}
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />

            <Select value={placementFilter} onValueChange={setPlacementFilter}>
              <SelectTrigger className="w-[180px]">
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

            <Select
              value={activeFilter}
              onValueChange={(v: any) => setActiveFilter(v)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Active</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {categoriesByPlacement.length === 0 ? (
              <div className="text-center py-12">
                <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                <p className="text-muted-foreground">No categories found</p>
                {hasActiveFilters && (
                  <Button
                    variant="link"
                    onClick={clearFilters}
                    className="mt-2"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                {categoriesByPlacement.map(
                  ([placementType, placementCategories]) => {
                    const placementMeta = getPlacementTypeMeta(placementType);

                    return (
                      <div key={placementType}>
                        {/* Placement Type Header */}
                        <div className="sticky top-0 z-20 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/50 border-b-2 border-blue-300 dark:border-blue-700 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-blue-500 dark:bg-blue-600 rounded-lg">
                                <FolderOpen className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                  {placementMeta.label}
                                </h3>
                                <p className="text-xs text-blue-700 dark:text-blue-300">
                                  {placementCategories.length}{" "}
                                  {placementCategories.length === 1
                                    ? "category"
                                    : "categories"}
                                </p>
                              </div>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {placementType}
                            </Badge>
                          </div>
                        </div>

                        {/* Categories Table */}
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow>
                              <TableHead
                                className="min-w-[200px]"
                                onClick={() => handleSort("label")}
                              >
                                <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                                  <span className="font-semibold">Label</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                  <SortIcon field="label" />
                                </div>
                              </TableHead>
                              <TableHead
                                className="min-w-[150px]"
                                onClick={() => handleSort("parent")}
                              >
                                <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                                  <span className="font-semibold">Parent</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                  <SortIcon field="parent" />
                                </div>
                              </TableHead>
                              <TableHead className="w-[100px]">Color</TableHead>
                              <TableHead
                                className="w-[100px]"
                                onClick={() => handleSort("sort_order")}
                              >
                                <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                                  <span className="font-semibold">Order</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                  <SortIcon field="sort_order" />
                                </div>
                              </TableHead>
                              <TableHead
                                className="w-[80px]"
                                onClick={() => handleSort("status")}
                              >
                                <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                                  <span className="font-semibold">Active</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                  <SortIcon field="status" />
                                </div>
                              </TableHead>
                              <TableHead className="text-right w-[120px]">
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {placementCategories.map((category) => {
                              const parent = category.parent_category_id
                                ? categories.find(
                                    (c) => c.id === category.parent_category_id,
                                  )
                                : null;

                              return (
                                <TableRow
                                  key={category.id}
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleEdit(category)}
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <DynamicIcon
                                        name={category.icon_name}
                                        color={category.color || "zinc"}
                                        size={4}
                                        fallbackIcon="SquareMenu"
                                        className="flex-shrink-0"
                                      />
                                      <div>
                                        <div className="font-medium">
                                          {category.label}
                                        </div>
                                        {category.description && (
                                          <div className="text-xs text-muted-foreground line-clamp-1">
                                            {category.description}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {parent ? (
                                      <div className="flex items-center gap-1.5">
                                        <DynamicIcon
                                          name={parent.icon_name}
                                          color={parent.color || "zinc"}
                                          size={4}
                                          fallbackIcon="SquareMenu"
                                          className="flex-shrink-0"
                                        />
                                        <span className="text-sm">
                                          {parent.label}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        Root
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="w-4 h-4 rounded border"
                                        style={{
                                          backgroundColor:
                                            category.color || "#666",
                                        }}
                                      />
                                      <span className="text-xs text-muted-foreground">
                                        {category.color}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm">
                                      {category.sort_order}
                                    </span>
                                  </TableCell>
                                  <TableCell
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Badge
                                      variant={
                                        category.is_active
                                          ? "default"
                                          : "secondary"
                                      }
                                    >
                                      {category.is_active ? "Yes" : "No"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell
                                    className="text-right"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex justify-end gap-1">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEdit(category)}
                                          >
                                            <Edit2 className="h-3 w-3" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Edit</TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              handleToggleActive(
                                                category.id,
                                                category.is_active,
                                              )
                                            }
                                          >
                                            {category.is_active ? (
                                              <EyeOff className="h-3 w-3" />
                                            ) : (
                                              <Eye className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {category.is_active
                                            ? "Deactivate"
                                            : "Activate"}
                                        </TooltipContent>
                                      </Tooltip>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              handleDelete(
                                                category.id,
                                                category.label,
                                              )
                                            }
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Delete</TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Unified Category Form Modal */}
        <CategoryFormModal
          isOpen={isFormModalOpen}
          onClose={() => {
            setIsFormModalOpen(false);
            setEditingCategory(null);
          }}
          allCategories={categories}
          editingCategory={editingCategory || undefined}
          onSuccess={handleFormSuccess}
        />
      </div>
    </TooltipProvider>
  );
}
