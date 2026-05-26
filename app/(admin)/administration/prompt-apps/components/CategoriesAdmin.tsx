"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Trash2,
  Save,
  X,
  Search,
  Tag,
  ArrowUp,
  ArrowDown,
  Hammer,
} from "lucide-react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  PromptAppCategory,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/lib/services/prompt-apps-admin-service";
import { renderIcon } from "@/components/official/icons/IconResolver";
import { matchesSearch as matchesSearchScoring } from "@/utils/search-scoring";

export function CategoriesAdmin() {
  const [categories, setCategories] = useState<PromptAppCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<PromptAppCategory>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [createFormData, setCreateFormData] = useState<
    Partial<CreateCategoryInput>
  >({});
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchCategories();
      setCategories(data || []);
    } catch (error: any) {
      console.error("Error loading categories:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to load categories",
        variant: "destructive",
      });
      // Set empty array so UI can render
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCategories = categories.filter((category) => {
    const matchesSearch =
      searchTerm === "" ||
      matchesSearchScoring(category, searchTerm, [
        { get: (c) => c.name, weight: "title" },
        { get: (c) => c.description, weight: "body" },
        { get: (c) => c.id, weight: "id" },
      ]);
    return matchesSearch;
  });

  useEffect(() => {
    const selectedCategory = selectedCategoryId
      ? categories.find((c) => c.id === selectedCategoryId)
      : null;
    if (selectedCategory) {
      setEditData({
        id: selectedCategory.id,
        name: selectedCategory.name,
        description: selectedCategory.description,
        icon: selectedCategory.icon,
        sort_order: selectedCategory.sort_order,
      });
      setHasUnsavedChanges(false);
    }
  }, [selectedCategoryId, categories]);

  const handleCreateNew = () => {
    setCreateFormData({
      id: "",
      name: "",
      description: "",
      icon: "",
      sort_order: categories.length,
    });
    setIsCreateDialogOpen(true);
  };

  const handleEditChange = (field: string, value: any) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedCategoryId || !editData.id) return;

    try {
      await updateCategory({
        id: editData.id,
        name: editData.name,
        description: editData.description,
        icon: editData.icon,
        sort_order: editData.sort_order,
      });

      setHasUnsavedChanges(false);
      loadData();

      toast({
        title: "Success",
        description: "Category updated successfully",
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

  const handleCreateCategory = async () => {
    try {
      if (!createFormData.id || !createFormData.name) {
        toast({
          title: "Validation Error",
          description: "ID and name are required",
          variant: "destructive",
        });
        return;
      }

      await createCategory(createFormData as CreateCategoryInput);
      setIsCreateDialogOpen(false);
      loadData();

      toast({
        title: "Success",
        description: "Category created successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error creating category:", error);
      toast({
        title: "Error",
        description: "Failed to create category",
        variant: "destructive",
      });
    }
  };

  const handleDiscardChanges = () => {
    const selectedCategory = selectedCategoryId
      ? categories.find((c) => c.id === selectedCategoryId)
      : null;
    if (selectedCategory) {
      setEditData({
        id: selectedCategory.id,
        name: selectedCategory.name,
        description: selectedCategory.description,
        icon: selectedCategory.icon,
        sort_order: selectedCategory.sort_order,
      });
      setHasUnsavedChanges(false);
    }
  };

  const handleDeleteCategory = async (category: PromptAppCategory) => {
    if (!confirm(`Are you sure you want to delete "${category.name}"?`)) return;

    try {
      await deleteCategory(category.id);

      if (selectedCategoryId === category.id) {
        setSelectedCategoryId(null);
      }

      loadData();

      toast({
        title: "Success",
        description: "Category deleted successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting category:", error);
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive",
      });
    }
  };

  const handleMoveCategoryUp = async (category: PromptAppCategory) => {
    if (category.sort_order <= 0) return;

    try {
      await updateCategory({
        id: category.id,
        sort_order: category.sort_order - 1,
      });
      loadData();
    } catch (error) {
      console.error("Error moving category:", error);
      toast({
        title: "Error",
        description: "Failed to reorder category",
        variant: "destructive",
      });
    }
  };

  const handleMoveCategoryDown = async (category: PromptAppCategory) => {
    try {
      await updateCategory({
        id: category.id,
        sort_order: category.sort_order + 1,
      });
      loadData();
    } catch (error) {
      console.error("Error moving category:", error);
      toast({
        title: "Error",
        description: "Failed to reorder category",
        variant: "destructive",
      });
    }
  };

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-textured overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Categories
            </h2>
            <Button onClick={handleCreateNew} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredCategories.map((category) => (
              <div
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors mb-1
                                    ${
                                      selectedCategoryId === category.id
                                        ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100"
                                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                                    }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {renderIcon(category.icon, { className: "w-4 h-4" }, "Tag")}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {category.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {category.id}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveCategoryUp(category);
                    }}
                    disabled={category.sort_order === 0}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveCategoryDown(category);
                    }}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border bg-gray-50 dark:bg-gray-800">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {filteredCategories.length} categories
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCategory ? (
          <>
            <div className="p-4 border-b border-border bg-textured">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Edit Category
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
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteCategory(selectedCategory)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Category Details</CardTitle>
                    <CardDescription>
                      Configure the category information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-id">ID</Label>
                        <Input
                          id="edit-id"
                          value={editData.id || ""}
                          disabled
                          className="bg-gray-100 dark:bg-gray-800"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Cannot be changed after creation
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="edit-name">Name</Label>
                        <Input
                          id="edit-name"
                          value={editData.name || ""}
                          onChange={(e) =>
                            handleEditChange("name", e.target.value)
                          }
                          placeholder="Category name"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="edit-description">Description</Label>
                      <Textarea
                        id="edit-description"
                        value={editData.description || ""}
                        onChange={(e) =>
                          handleEditChange("description", e.target.value)
                        }
                        placeholder="Category description"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-icon">Icon (Lucide React)</Label>
                        <div className="flex gap-2">
                          <div className="flex-shrink-0 w-10 h-10 border rounded-md flex items-center justify-center bg-gray-50 dark:bg-gray-800">
                            {renderIcon(
                              editData.icon,
                              { className: "w-5 h-5" },
                              "Tag",
                            )}
                          </div>
                          <Input
                            id="edit-icon"
                            value={editData.icon || ""}
                            onChange={(e) =>
                              handleEditChange("icon", e.target.value)
                            }
                            placeholder="e.g., Hammer"
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Use icon names from lucide-react (e.g., Hammer, Zap,
                          Star)
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="edit-sort">Sort Order</Label>
                        <Input
                          id="edit-sort"
                          type="number"
                          value={editData.sort_order ?? 0}
                          onChange={(e) =>
                            handleEditChange(
                              "sort_order",
                              parseInt(e.target.value) || 0,
                            )
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <Hammer className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Category Selected</h3>
              <p>
                Select a category from the sidebar to view and edit its details.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-id">ID</Label>
                <Input
                  id="create-id"
                  value={createFormData.id || ""}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, id: e.target.value })
                  }
                  placeholder="e.g., content-writing"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Lowercase, hyphenated (used in URLs)
                </p>
              </div>
              <div>
                <Label htmlFor="create-name">Name</Label>
                <Input
                  id="create-name"
                  value={createFormData.name || ""}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      name: e.target.value,
                    })
                  }
                  placeholder="Category name"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="create-description">Description</Label>
              <Textarea
                id="create-description"
                value={createFormData.description || ""}
                onChange={(e) =>
                  setCreateFormData({
                    ...createFormData,
                    description: e.target.value,
                  })
                }
                placeholder="Category description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-icon">Icon (Lucide React)</Label>
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-10 h-10 border rounded-md flex items-center justify-center bg-gray-50 dark:bg-gray-800">
                    {renderIcon(
                      createFormData.icon,
                      { className: "w-5 h-5" },
                      "Tag",
                    )}
                  </div>
                  <Input
                    id="create-icon"
                    value={createFormData.icon || ""}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        icon: e.target.value,
                      })
                    }
                    placeholder="e.g., Hammer"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="create-sort">Sort Order</Label>
                <Input
                  id="create-sort"
                  type="number"
                  value={createFormData.sort_order ?? categories.length}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      sort_order: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateCategory}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
