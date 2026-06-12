"use client";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  Search,
  Plus,
  Filter,
  Grid,
  List,
  ArrowUpDown,
  RefreshCw,
  LayoutIcon,
  CopyIcon,
  FileEditIcon,
  Trash2Icon,
  AlignLeftIcon,
  BoxSelectIcon,
  CalendarIcon,
  CheckSquareIcon,
  ClipboardCheckIcon,
  ListIcon,
  TextIcon,
  TypeIcon,
  ImageIcon,
  ToggleLeftIcon,
  SlidersIcon,
  FileTextIcon,
  RadioIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { fetchFieldsThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import {
  selectAllFields,
  selectFieldLoading,
  selectFieldError,
  selectFieldsByIds,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { FieldDefinition } from "@/types/customAppTypes";
import { getFieldComponentStyle } from "@/features/applet/styles/styles";
import type { RootState } from "@/lib/redux/store";

// Define type for fieldIds
type FieldId = string;

// Define and export the ref type
export type SmartFieldsListRefType = {
  refresh: (specificFieldIds?: string[]) => Promise<FieldDefinition[]>;
};

// Add a field icon mapping function to determine which icon to show based on component type
const getFieldIcon = (componentType: string) => {
  switch (componentType?.toLowerCase()) {
    case "text":
      return <TextIcon className="h-full w-full" />;
    case "textarea":
      return <AlignLeftIcon className="h-full w-full" />;
    case "select":
      return <ListIcon className="h-full w-full" />;
    case "checkbox":
      return <CheckSquareIcon className="h-full w-full" />;
    case "radio":
      return <RadioIcon className="h-full w-full" />;
    case "date":
    case "datetime":
      return <CalendarIcon className="h-full w-full" />;
    case "toggle":
    case "switch":
      return <ToggleLeftIcon className="h-full w-full" />;
    case "slider":
      return <SlidersIcon className="h-full w-full" />;
    case "file":
    case "fileupload":
      return <FileTextIcon className="h-full w-full" />;
    case "image":
    case "imageupload":
      return <ImageIcon className="h-full w-full" />;
    case "multiselect":
      return <BoxSelectIcon className="h-full w-full" />;
    default:
      return <TypeIcon className="h-full w-full" />;
  }
};

/**
 * A modern, standalone SmartFieldsList component that fetches and displays field components
 * @param {Object} props
 * @param {Function} props.onSelectField - Callback when field is selected
 * @param {boolean} props.showCreateButton - Whether to show the create button
 * @param {Function} props.onCreateField - Callback when create button is clicked
 * @param {Function} props.onEditField - Callback when edit button is clicked
 * @param {Function} props.onDuplicateField - Callback when duplicate button is clicked
 * @param {Function} props.onDeleteField - Callback when delete button is clicked
 * @param {string} props.className - Additional CSS classes
 * @param {string[]} props.fieldIds - Optional list of field IDs to fetch and display
 * @param {Function} props.onRefreshComplete - Optional callback when refresh completes
 * @param {boolean} props.hideActions - Whether to hide action buttons
 * @param {boolean} props.selectable - Whether fields are selectable
 * @param {boolean} props.multiSelect - Whether multiple fields can be selected
 * @param {string[]} props.selectedFieldIds - IDs of selected fields
 * @param {Function} props.onSelectionChange - Callback when selection changes
 */
const SmartFieldsList = forwardRef<
  SmartFieldsListRefType,
  {
    onSelectField?: (field: FieldDefinition) => void;
    showCreateButton?: boolean;
    onCreateField?: () => void;
    onEditField?: (field: FieldDefinition) => void;
    onDuplicateField?: (field: FieldDefinition) => void;
    onDeleteField?: (field: FieldDefinition) => void;
    className?: string;
    fieldIds?: string[];
    onRefreshComplete?: (fields: FieldDefinition[]) => void;
    hideActions?: boolean;
    selectable?: boolean;
    multiSelect?: boolean;
    selectedFieldIds?: string[];
    onSelectionChange?: (fields: FieldDefinition[]) => void;
  }
>(
  (
    {
      onSelectField,
      showCreateButton = true,
      onCreateField,
      onEditField,
      onDuplicateField,
      onDeleteField,
      className = "",
      fieldIds,
      onRefreshComplete,
      hideActions = false,
      selectable = false,
      multiSelect = false,
      selectedFieldIds = [],
      onSelectionChange,
    },
    ref,
  ) => {
    const { toast } = useToast();
    const dispatch = useAppDispatch();
    const store = useAppStore();

    // Local UI state
    const [searchTerm, setSearchTerm] = useState("");
    const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'list'
    const [sortBy, setSortBy] = useState("label-asc"); // 'label-asc', 'label-desc', 'component-asc', 'component-desc'
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>(
      selectedFieldIds || [],
    );

    // Redux state
    const allFields = useAppSelector(selectAllFields);
    const isLoading = useAppSelector(selectFieldLoading);
    const error = useAppSelector(selectFieldError);

    // Derived state - create a memoized selector function
    const selectFields = React.useCallback(
      (state: RootState) => {
        if (fieldIds && fieldIds.length > 0) {
          return selectFieldsByIds(state, fieldIds);
        } else {
          return allFields;
        }
      },
      [fieldIds, allFields],
    );

    // Use the memoized selector
    const fields = useAppSelector(selectFields);

    // Apply filters and sorting to fields from Redux
    const filteredFields = React.useMemo(() => {
      let result = [...fields];

      // Apply search filter
      if (searchTerm.trim()) {
        const lowercaseTerm = searchTerm.toLowerCase();
        result = result.filter(
          (field) =>
            field.label?.toLowerCase().includes(lowercaseTerm) ||
            field.description?.toLowerCase().includes(lowercaseTerm) ||
            field.component?.toLowerCase().includes(lowercaseTerm) ||
            idMatchesQuery(field, lowercaseTerm),
        );
      }

      // Apply sorting
      switch (sortBy) {
        case "label-asc":
          result.sort((a, b) => a.label?.localeCompare(b.label));
          break;
        case "label-desc":
          result.sort((a, b) => b.label?.localeCompare(a.label));
          break;
        case "component-asc":
          result.sort((a, b) => a.component?.localeCompare(b.component));
          break;
        case "component-desc":
          result.sort((a, b) => b.component?.localeCompare(a.component));
          break;
        default:
          break;
      }

      return result;
    }, [fields, searchTerm, sortBy]);

    // Update local selection when prop changes
    useEffect(() => {
      if (selectedFieldIds && selectedFieldIds.length !== selectedIds.length) {
        setSelectedIds(selectedFieldIds);
      }
    }, [selectedFieldIds]);

    // Initial data fetch
    useEffect(() => {
      // Fetch fields regardless of whether we have them already, as we need to ensure the store is updated
      dispatch(fetchFieldsThunk());
    }, [dispatch]); // Don't include allFields.length or fieldIds in dependencies

    // Create a refresh function using useRef to always access the latest implementation
    const refreshRef = useRef<() => Promise<FieldDefinition[]>>(null!);

    // Expose the refresh method via ref
    useImperativeHandle(ref, () => {
      // Create the function once
      const refreshFn = async (specificFieldIds?: string[]) => {
        setIsRefreshing(true);
        try {
          // Use specificFieldIds if provided, otherwise use the component's fieldIds
          const fieldsToRefresh = specificFieldIds || fieldIds;
          await dispatch(fetchFieldsThunk()).unwrap();

          // Get the current state immediately after the fetch
          const currentState = store.getState();
          const currentAllFields = selectAllFields(currentState);
          const currentFields = fieldsToRefresh
            ? selectFieldsByIds(currentState, fieldsToRefresh)
            : currentAllFields;

          // Call the callback if provided
          if (onRefreshComplete) {
            onRefreshComplete(currentFields);
          }

          return currentFields;
        } catch (error) {
          toast({
            title: "Refresh Failed",
            description: "Could not refresh field data",
            variant: "destructive",
          });
          return [];
        } finally {
          setIsRefreshing(false);
        }
      };

      // Store the function in our ref for internal use
      refreshRef.current = refreshFn;

      // Return the interface
      return {
        refresh: refreshFn,
      };
    }, [dispatch, toast, fieldIds, store, onRefreshComplete, selectFields]);

    // Handle manual refresh button click
    const handleRefreshClick = () => {
      refreshRef.current();
      toast({
        title: "Refreshing",
        description: "Updating field list...",
      });
    };

    // Handle search term changes
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value);
    };

    // Handle sort changes
    const handleSortChange = (value: string) => {
      setSortBy(value);
    };

    // Handle field selection
    const handleFieldSelect = (field: FieldDefinition) => {
      if (selectable) {
        if (multiSelect) {
          // Toggle selection for multi-select
          let newSelection: string[];
          if (selectedIds.includes(field.id)) {
            newSelection = selectedIds.filter((id) => id !== field.id);
          } else {
            newSelection = [...selectedIds, field.id];
          }
          setSelectedIds(newSelection);

          if (onSelectionChange) {
            const selectedFields = fields.filter((f) =>
              newSelection.includes(f.id),
            );
            onSelectionChange(selectedFields);
          }
        } else {
          // Single select
          const newSelection = [field.id];
          setSelectedIds(newSelection);

          if (onSelectionChange) {
            const selectedFields = fields.filter((f) =>
              newSelection.includes(f.id),
            );
            onSelectionChange(selectedFields);
          }

          if (onSelectField) {
            onSelectField(field);
          }
        }
      } else if (onSelectField) {
        // If not selectable, just call onSelectField callback
        onSelectField(field);
      }
    };

    // Renders skeleton cards during loading state
    const renderSkeletons = () => {
      return Array(6)
        .fill(0)
        .map((_, index) => (
          <Card
            key={`skeleton-${index}`}
            className="overflow-hidden border-border"
          >
            <div className="p-4">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-8 w-28 rounded-md" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <div className="flex mt-4 space-x-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-border">
              <div className="flex justify-between">
                <Skeleton className="h-8 w-16 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            </div>
          </Card>
        ));
    };

    // Show error state if Redux has an error
    if (error) {
      return (
        <div className="p-6 text-center">
          <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-lg inline-block mb-4">
            <Trash2Icon className="h-6 w-6 text-red-500 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Error Loading Fields
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{error}</p>
          <Button
            className="mt-4 bg-red-500 hover:bg-red-600 text-white"
            onClick={handleRefreshClick}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Try Again
          </Button>
        </div>
      );
    }

    return (
      <div className={`space-y-6 ${className}`}>
        {/* Search and controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-64 md:w-72">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              className="pl-10 pr-4 py-2 border-gray-200 dark:border-gray-700 bg-textured"
              placeholder="Search fields..."
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
              onClick={handleRefreshClick}
              disabled={isLoading || isRefreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading || isRefreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="hidden sm:inline">Sort</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleSortChange("label-asc")}>
                  Name (A-Z)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSortChange("label-desc")}
                >
                  Name (Z-A)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleSortChange("component-asc")}
                >
                  Component Type (A-Z)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleSortChange("component-desc")}
                >
                  Component Type (Z-A)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex border-border rounded-md overflow-hidden">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                className={`rounded-none px-2 ${viewMode === "grid" ? "bg-indigo-500 text-white" : "text-gray-500"}`}
                onClick={() => setViewMode("grid")}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className={`rounded-none px-2 ${viewMode === "list" ? "bg-indigo-500 text-white" : "text-gray-500"}`}
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {showCreateButton && onCreateField && (
              <Button
                className="bg-indigo-500 hover:bg-indigo-600 text-white"
                size="sm"
                onClick={onCreateField}
              >
                <Plus className="h-4 w-4" /> New Field
              </Button>
            )}
          </div>
        </div>

        {/* Field cards */}
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-3"
          }
        >
          {isLoading ? (
            renderSkeletons()
          ) : filteredFields.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-10 text-center">
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-4">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                No fields found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {searchTerm
                  ? "Try a different search term"
                  : "Create your first field to get started"}
              </p>
              {showCreateButton && onCreateField && (
                <Button
                  className="bg-indigo-500 hover:bg-indigo-600 text-white mt-4"
                  onClick={onCreateField}
                >
                  <Plus className="h-4 w-4 mr-2" /> Create New Field
                </Button>
              )}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredFields.map((field) => {
                const componentStyle = getFieldComponentStyle(field.component);
                const isSelected = selectedIds.includes(field.id);

                return (
                  <motion.div
                    key={field.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    layout
                    className="h-full"
                  >
                    <Card
                      className={`
                                                        border hover:shadow-md transition-shadow duration-200 h-full
                                                        ${viewMode === "list" ? "flex overflow-hidden" : "overflow-hidden"}
                                                        ${
                                                          isSelected
                                                            ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900"
                                                            : "border-gray-200 dark:border-gray-700"
                                                        }
                                                        ${selectable ? "cursor-pointer" : ""}
                                                        `}
                      onClick={
                        selectable ? () => handleFieldSelect(field) : undefined
                      }
                    >
                      {viewMode === "grid" && (
                        <div
                          className={`h-28 w-full flex items-center justify-center ${componentStyle.iconBg}`}
                        >
                          <div
                            className={`h-12 w-12 ${componentStyle.iconColor}`}
                          >
                            {getFieldIcon(field.component || "")}
                          </div>
                        </div>
                      )}

                      <CardContent
                        className={`
                                                        ${viewMode === "list" ? "flex-1 p-4" : "p-4 pt-4"}
                                                        `}
                      >
                        <div className="flex justify-between items-center mb-2">
                          {viewMode === "list" && (
                            <div
                              className={`p-2 rounded-md mr-3 ${componentStyle.iconBg} ${componentStyle.iconColor}`}
                            >
                              {getFieldIcon(field.component || "")}
                            </div>
                          )}

                          <div className={viewMode === "list" ? "flex-1" : ""}>
                            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {field.label}
                            </h3>
                            {field.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                {field.description}
                              </p>
                            )}
                          </div>

                          <Badge
                            className={`ml-2 ${componentStyle.bg} ${componentStyle.text} ${componentStyle.border} capitalize text-xs whitespace-nowrap`}
                          >
                            {field.component}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {field.required && (
                            <Badge
                              variant="outline"
                              className="text-xs px-1.5 py-0 h-5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                            >
                              Required
                            </Badge>
                          )}
                          {field.includeOther && viewMode === "list" && (
                            <Badge
                              variant="outline"
                              className="text-xs px-1.5 py-0 h-5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                            >
                              Has "Other"
                            </Badge>
                          )}
                        </div>
                      </CardContent>

                      {!hideActions && (
                        <CardFooter
                          className={`
                                                            border-t border-border p-3
                                                            ${
                                                              viewMode ===
                                                              "list"
                                                                ? "w-auto border-l border-l-gray-200 dark:border-l-gray-700 flex items-center justify-center"
                                                                : ""
                                                            }
                                                        `}
                        >
                          <div className="flex flex-col w-full gap-2">
                            {onSelectField && (
                              <Button
                                className={`w-full ${componentStyle.bg} text-gray-800 dark:text-white hover:opacity-90`}
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectField(field);
                                }}
                              >
                                Select
                              </Button>
                            )}

                            {onEditField && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditField(field);
                                }}
                                className="w-full bg-transparent border border-current hover:bg-opacity-10 font-bold text-gray-700 dark:text-gray-300"
                              >
                                Edit
                              </Button>
                            )}

                            {onDuplicateField && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDuplicateField(field);
                                }}
                                className="w-full bg-transparent border border-current hover:bg-opacity-10 font-bold text-gray-500 dark:text-gray-400"
                              >
                                Duplicate
                              </Button>
                            )}

                            {onDeleteField && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteField(field);
                                }}
                                className="w-full bg-transparent border border-current hover:bg-opacity-10 font-bold text-red-600 dark:text-red-400"
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </CardFooter>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Status footer */}
        {!isLoading && filteredFields.length > 0 && (
          <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 pt-2">
            <span>
              Showing {filteredFields.length} of {fields.length} fields
              {searchTerm && ` for "${searchTerm}"`}
            </span>
            {selectable && <span>{selectedIds.length} selected</span>}
          </div>
        )}
      </div>
    );
  },
);

// Add display name for debugging
SmartFieldsList.displayName = "SmartFieldsList";

export default SmartFieldsList;
