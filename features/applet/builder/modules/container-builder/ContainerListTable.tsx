// File Location: @/features/applet/builder/modules/group-builder/ContainerListTable.tsx

"use client";
import React, { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  selectAllContainers,
  selectContainerLoading,
} from "@/lib/redux/app-builder/selectors/containerSelectors";
import {
  deleteContainerThunk,
  fetchContainersThunk,
} from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { Eye, Pencil, Box, Trash2, LayoutGrid, Check } from "lucide-react";
import { ContainerBuilder } from "@/lib/redux/app-builder/types";

import GenericDataTable, {
  type ColumnConfig,
  type ActionConfig,
  type CustomTableSettings,
} from "@/components/generic-table/GenericDataTable";
import { GenericTableHeader } from "@/components/generic-table/GenericTableHeader";
import { toast } from "@/components/ui/use-toast";

interface ContainerListTableProps {
  // Core functionality props
  onContainerView?: (id: string) => void;
  onContainerEdit?: (id: string) => void;
  onContainerDelete?: (id: string) => void;
  onContainerSelect?: (id: string) => void;
  onContainerCreate?: () => void;

  internalFetch?: boolean;

  // New customization props
  hiddenColumns?: string[];
  defaultPageSize?: number;
  customSettings?: CustomTableSettings;
  hideTableHeader?: boolean;
  hideActionsColumn?: boolean;
  hideStatusColumn?: boolean;
  hideIconColumn?: boolean;
  hideTableFooter?: boolean;

  // Visual customization props
  title?: string;
  entityName?: string;
  allowSelectAction?: boolean;
  showStripedRows?: boolean;
  headerClassName?: string;
  searchPlaceholder?: string;
  createButtonText?: string;
  selectLabel?: string;

  // Custom renderers
  renderCustomHeader?: React.ReactNode;
  customSelectActionRender?: (
    container: ContainerBuilder,
    onClick: (e: React.MouseEvent) => void,
  ) => React.ReactNode;
}

export default function ContainerListTable({
  // Core functionality props
  onContainerView,
  onContainerEdit,
  onContainerDelete,
  onContainerSelect,
  onContainerCreate,

  internalFetch = false,

  // New customization props
  hiddenColumns = [],
  defaultPageSize,
  customSettings,
  hideTableHeader = false,
  hideActionsColumn = false,
  hideStatusColumn = false,
  hideIconColumn = false,
  hideTableFooter = false,

  // Visual customization props
  title = "All Containers",
  entityName = "Container",
  allowSelectAction = true,
  showStripedRows = true,
  headerClassName,
  searchPlaceholder,
  createButtonText,
  selectLabel = "Select",

  // Custom renderers
  renderCustomHeader,
  customSelectActionRender,
}: ContainerListTableProps) {
  const dispatch = useAppDispatch();

  // Get containers from Redux
  const containers = useAppSelector(selectAllContainers);
  const isLoading = useAppSelector(selectContainerLoading);

  // Local state for search/filter
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredContainers, setFilteredContainers] = useState<
    ContainerBuilder[]
  >([]);

  // Sorting state
  type SortField = "label" | "shortLabel" | "description" | "fields";
  const [sortBy, setSortBy] = useState<SortField>("label");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(defaultPageSize || 10);
  const [paginatedContainers, setPaginatedContainers] = useState<
    ContainerBuilder[]
  >([]);

  const loadContainers = async () => {
    try {
      await dispatch(fetchContainersThunk()).unwrap();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load containers",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (internalFetch) {
      loadContainers();
    }
  }, [internalFetch]);

  // Apply search/filter and sorting whenever containers, search term, or sort params change
  useEffect(() => {
    let filtered = containers;

    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (container) =>
          container.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          container.description
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          container.shortLabel
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          idMatchesQuery(container, searchTerm),
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "label":
          comparison = (a.label || "").localeCompare(b.label || "");
          break;
        case "shortLabel":
          comparison = (a.shortLabel || "").localeCompare(b.shortLabel || "");
          break;
        case "description":
          comparison = (a.description || "").localeCompare(b.description || "");
          break;
        case "fields":
          comparison = a.fields.length - b.fields.length;
          break;
        default:
          comparison = (a.label || "").localeCompare(b.label || "");
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    setFilteredContainers(sorted);

    // Reset to first page when filters change
    setCurrentPage(1);
  }, [containers, searchTerm, sortBy, sortDirection]);

  // Apply pagination
  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginatedContainers(filteredContainers.slice(startIndex, endIndex));
  }, [filteredContainers, currentPage, itemsPerPage]);

  // Handle sort click
  const handleSortClick = (field: string) => {
    if (sortBy === (field as SortField)) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new field and default to ascending
      setSortBy(field as SortField);
      setSortDirection("asc");
    }
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Navigation handlers
  const handleViewContainer = (id: string) => {
    onContainerView?.(id);
    if (onContainerSelect) {
      onContainerSelect(id);
    }
  };

  const handleEditContainer = (id: string) => {
    onContainerEdit?.(id);
  };

  const handleCreateContainer = () => {
    if (onContainerCreate) {
      onContainerCreate();
    }
  };

  // Handle delete container
  const handleDeleteContainer = async (container: ContainerBuilder) => {
    try {
      if (onContainerDelete) {
        onContainerDelete(container.id);
      } else {
        await dispatch(deleteContainerThunk(container.id)).unwrap();
      }
    } catch (error) {
      console.error("Failed to delete container:", error);
    }
  };

  // Define columns
  const columns: ColumnConfig<ContainerBuilder>[] = [
    {
      key: "label",
      header: "Label",
      width: "w-[200px]",
      sortable: true,
      render: (container) => (
        <div className="flex items-center">
          {container.label ? (
            <span>{container.label}</span>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">
              Unnamed Container
            </span>
          )}
        </div>
      ),
    },
    {
      key: "shortLabel",
      header: "Short Label",
      width: "w-[200px]",
      sortable: true,
      render: (container) =>
        container.shortLabel ? (
          <span>{container.shortLabel}</span>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        ),
    },
    {
      key: "description",
      header: "Description",
      sortable: true,
      className: "hidden md:table-cell",
      render: (container) =>
        container.description ? (
          <span className="line-clamp-1 max-w-xs">{container.description}</span>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">
            No description
          </span>
        ),
    },
    {
      key: "fields",
      header: "Fields",
      width: "w-[100px]",
      className: "text-center",
      sortable: true,
      render: (container) => (
        <div className="flex justify-center">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            {container.fields.length}
          </span>
        </div>
      ),
    },
  ];

  // Define custom select action if provided
  const selectAction: ActionConfig<ContainerBuilder> = {
    icon: <Eye className="h-4 w-4" />,
    onClick: (container) => {
      handleViewContainer(container.id);
    },
    badgeStyle: !!onContainerSelect,
    badgeVariant: "outline",
    badgeClassName: "bg-blue-50 dark:bg-blue-900/20 border-blue-500",
    label: selectLabel,
    // Add custom render if provided
    ...(customSelectActionRender && {
      customRender: (container, onClick) =>
        customSelectActionRender(container, onClick),
    }),
  };

  // Define actions based on props
  const baseActions: ActionConfig<ContainerBuilder>[] = [
    // Only include select/view action if explicitly allowed or view handler exists
    ...(allowSelectAction || onContainerView ? [selectAction] : []),
    // Include edit action if handler exists
    ...(onContainerEdit
      ? [
          {
            icon: <Pencil className="h-4 w-4" />,
            onClick: (container) => {
              handleEditContainer(container.id);
            },
          },
        ]
      : []),
    // Include delete action if handler exists
    ...(onContainerDelete
      ? [
          {
            icon: <Trash2 className="h-4 w-4" />,
            onClick: (container) => {
              handleDeleteContainer(container);
            },
            className:
              "text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300",
            requiresConfirmation: true,
            confirmationProps: {
              getTitle: (container) =>
                `Delete Container: ${container.label || "Unnamed Container"}`,
              getDescription: (container) =>
                `This action cannot be undone. This will permanently delete "${container.label || "Unnamed Container"}" and remove it from any layouts that use it.`,
              confirmButtonText: "Delete Container",
            },
          },
        ]
      : []),
  ];

  // Merge custom settings
  const mergedCustomSettings: CustomTableSettings = {
    useZebraStripes: showStripedRows,
    ...customSettings,
  };

  return (
    <GenericDataTable
      items={containers}
      filteredItems={filteredContainers}
      paginatedItems={paginatedContainers}
      isLoading={isLoading}
      columns={columns}
      idField="id"
      iconField={
        !hideIconColumn
          ? {
              key: "id", // Not using an actual icon field, just using a fixed icon
              renderIcon: () => (
                <LayoutGrid className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              ),
            }
          : undefined
      }
      labelField="label"
      hiddenColumns={hiddenColumns}
      statusBadge={
        !hideStatusColumn
          ? {
              key: "status",
              isDirtyKey: "isDirty",
              isLocalKey: "isLocal",
              isPublicKey: "isPublic",
            }
          : undefined
      }
      emptyState={{
        icon: (
          <Box className="h-16 w-16 text-gray-400 dark:text-gray-500 mb-4" />
        ),
        title: `No ${entityName}s Found`,
        description: `You haven't created any ${entityName.toLowerCase()}s yet. ${entityName}s let you group related fields together for use in your apps.`,
        buttonText: `Create First ${entityName}`,
        onButtonClick: handleCreateContainer,
      }}
      title={title}
      headerActions={[
        renderCustomHeader || (
          <GenericTableHeader
            key="table-header"
            entityName={entityName}
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            onCreateItem={onContainerCreate ? handleCreateContainer : undefined}
            showCreateButton={!!onContainerCreate}
            searchPlaceholder={searchPlaceholder}
            createButtonText={createButtonText}
            headerClassName={headerClassName}
          />
        ),
      ]}
      onRowClick={(container) => handleViewContainer(container.id)}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSortChange={handleSortClick}
      actions={!hideActionsColumn ? baseActions : []}
      totalItems={filteredContainers.length}
      itemsPerPage={itemsPerPage}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      onItemsPerPageChange={setItemsPerPage}
      defaultPageSize={defaultPageSize}
      customSettings={mergedCustomSettings}
      hideTableHeader={hideTableHeader}
      hideActionsColumn={hideActionsColumn}
      hideStatusColumn={hideStatusColumn}
      hideIconColumn={hideIconColumn}
      hideTableFooter={hideTableFooter}
    />
  );
}
