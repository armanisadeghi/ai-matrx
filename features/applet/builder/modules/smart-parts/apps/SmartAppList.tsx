"use client";
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Search, Plus, Filter, Grid, List, ArrowUpDown, RefreshCw, Bug, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { fetchAppsThunk, deleteAppThunk } from "@/lib/redux/app-builder/thunks/appBuilderThunks";
import { selectAllApps, selectAppLoading, selectAppError, selectAppsByIds } from "@/lib/redux/app-builder/selectors/appSelectors";
import { IconPicker } from "@/components/ui/IconPicker";
import { InlineMediaRef } from "@/features/files";
import { COLOR_VARIANTS } from "@/features/applet/styles/StyledComponents";
import { CustomAppConfig } from "@/types/customAppTypes";
import { getAppColorClasses } from "@/features/applet/styles/styles";
import { matchesSearch } from "@/utils/search-scoring";

export type SmartAppListRefType = {
    refresh: () => Promise<void>;
};

/**
 * A modern, standalone AppList component that fetches and displays apps
 * @param {Object} props
 * @param {Function} props.onSelectApp - Callback when app is selected
 * @param {boolean} props.showCreateButton - Whether to show the create button
 * @param {Function} props.onCreateApp - Callback when create button is clicked
 * @param {boolean} props.showDelete - Whether to show delete buttons on apps
 * @param {string} props.className - Additional CSS classes
 * @param {string[]} props.appIds - Optional list of app IDs to fetch and display
 * @param {Function} props.onRefreshComplete - Optional callback when refresh completes
 * @param {Object} props.gridColumns - Optional configuration for grid columns
 * @param {number} props.gridColumns.sm - Columns for small screens (default: 1)
 * @param {number} props.gridColumns.md - Columns for medium screens (default: 2)
 * @param {number} props.gridColumns.lg - Columns for large screens (default: 3)
 * @param {number} props.gridColumns.xl - Columns for extra large screens (default: 4)
 */
const SmartAppList = forwardRef<
    SmartAppListRefType,
    {
        onSelectApp?: (app: CustomAppConfig) => void;
        onEditApp?: (app: CustomAppConfig) => void;
        showCreateButton?: boolean;
        onCreateApp?: () => void;
        showDelete?: boolean;
        className?: string;
        appIds?: string[];
        onRefreshComplete?: (apps: CustomAppConfig[]) => void;
        gridColumns?: {
            sm?: number;
            md?: number;
            lg?: number;
            xl?: number;
        };
    }
>(
    (
        {
            onSelectApp,
            onEditApp,
            showCreateButton = true,
            onCreateApp,
            showDelete = false,
            className = "",
            appIds,
            onRefreshComplete,
            gridColumns = { sm: 1, md: 2, lg: 3, xl: 4 },
        },
        ref
    ) => {
        const { toast } = useToast();
        const dispatch = useAppDispatch();
        const store = useAppStore();

        // Local UI state
        const [searchTerm, setSearchTerm] = useState("");
        const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'list'
        const [sortBy, setSortBy] = useState("name-asc"); // 'name-asc', 'name-desc', 'date-asc', 'date-desc'
        const [isRefreshing, setIsRefreshing] = useState(false);

        // Redux state
        const allApps = useAppSelector(selectAllApps);
        const isLoading = useAppSelector(selectAppLoading);
        const error = useAppSelector(selectAppError);

        // Derived state
        const apps = appIds
            ? useAppSelector((state) => {
                  if (!appIds.length) {
                      return allApps;
                  }
                  const filteredApps = allApps.filter((app) => appIds.includes(app.id));
                  const selectorResult = selectAppsByIds(state, appIds);
                  return filteredApps.length ? filteredApps : allApps;
              })
            : allApps;

        // Apply filters and sorting to apps from Redux
        const filteredApps = React.useMemo(() => {
            if (!apps || apps.length === 0) {
                return [];
            }

            let result = [...apps];

            // Apply search filter
            if (searchTerm.trim()) {
                result = result.filter((app) =>
                    matchesSearch(app, searchTerm, [
                        { get: (a) => a.name, weight: "title" },
                        { get: (a) => a.slug, weight: "subtitle" },
                        { get: (a) => a.creator, weight: "subtitle" },
                        { get: (a) => a.description, weight: "body" },
                    ])
                );
            }

            // Apply sorting
            switch (sortBy) {
                case "name-asc":
                    result.sort((a, b) => a.name?.localeCompare(b.name));
                    break;
                case "name-desc":
                    result.sort((a, b) => b.name?.localeCompare(a.name));
                    break;
                case "date-asc":
                    // Sort by ID as a fallback since createdAt might not be available
                    result.sort((a, b) => a.id?.localeCompare(b.id || ""));
                    break;
                case "date-desc":
                    result.sort((a, b) => b.id?.localeCompare(a.id || ""));
                    break;
                default:
                    break;
            }

            return result;
        }, [apps, searchTerm, sortBy]);

        // Generate the grid columns CSS class based on the gridColumns prop
        const getGridColumnsClass = useCallback(() => {
            // Default values
            const columns = {
                sm: gridColumns?.sm || 1,
                md: gridColumns?.md || 2,
                lg: gridColumns?.lg || 3,
                xl: gridColumns?.xl || 3,
            };

            return `grid grid-cols-${columns.sm} md:grid-cols-${columns.md} lg:grid-cols-${columns.lg} xl:grid-cols-${columns.xl} gap-4`;
        }, [gridColumns]);

        // Initial data fetch
        useEffect(() => {
            // Only fetch if we have no apps or we're showing all apps (no specific IDs)
            if (allApps.length === 0 || !appIds) {
                dispatch(fetchAppsThunk());
            }
        }, [dispatch, allApps.length, appIds]);

        // Handle refresh - now using redux directly
        const refreshApps = useCallback(async () => {
            setIsRefreshing(true);
            try {
                // Dispatch the fetchAppsThunk to refresh all apps data
                await dispatch(fetchAppsThunk()).unwrap();

                // After redux state has updated, call the onRefreshComplete callback with the latest data
                // We'll need to wait for the next render cycle to get the updated state
                setTimeout(() => {
                    if (onRefreshComplete) {
                        // By this time, apps state should be updated from Redux
                        onRefreshComplete(apps);
                    }
                }, 0);
            } catch (error) {
                toast({
                    title: "Refresh Failed",
                    description: "Could not refresh app data",
                    variant: "destructive",
                });
            } finally {
                setIsRefreshing(false);
            }
        }, [dispatch, toast, onRefreshComplete, apps]);

        // Expose the refresh method via ref
        useImperativeHandle(
            ref,
            () => ({
                refresh: refreshApps,
            }),
            [refreshApps]
        );

        // Handle manual refresh button click
        const handleRefreshClick = () => {
            refreshApps();
            toast({
                title: "Refreshing",
                description: "Updating app list...",
            });
        };

        // Handle app deletion
        const handleDeleteApp = async (app: CustomAppConfig) => {
            try {
                await dispatch(deleteAppThunk(app.id)).unwrap();
                toast({
                    title: "App Deleted",
                    description: `"${app.name}" has been deleted successfully.`,
                });
            } catch (error) {
                console.error("Error deleting app:", error);
                toast({
                    title: "Delete Failed",
                    description: "Could not delete the app. Please try again.",
                    variant: "destructive",
                });
            }
        };

        // Handle search term changes
        const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
            setSearchTerm(e.target.value);
        };

        // Handle sort changes
        const handleSortChange = (value: string) => {
            setSortBy(value);
        };

        // Renders skeleton cards during loading state
        const renderSkeletons = () => {
            return Array(6)
                .fill(0)
                .map((_, index) => (
                    <Card key={`skeleton-${index}`} className="overflow-hidden border-border">
                        <div className="p-4">
                            <div className="flex items-center space-x-3">
                                <Skeleton className="h-10 w-10 rounded-md" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-4 w-24" />
                                </div>
                            </div>
                            <div className="mt-4 space-y-2">
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                        </div>
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-border">
                            <Skeleton className="h-8 w-full rounded-md" />
                        </div>
                    </Card>
                ));
        };

        // Show error state if Redux has an error
        if (error) {
            return (
                <div className="p-6 text-center">
                    <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-lg inline-block mb-4">
                        <RefreshCw className="h-6 w-6 text-red-500 dark:text-red-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Error Loading Apps</h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">{error}</p>
                    <Button className="mt-4 bg-red-500 hover:bg-red-600 text-white" onClick={handleRefreshClick}>
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
                            placeholder="Search apps..."
                            value={searchTerm}
                            onChange={handleSearch}
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                        {/* Debug button - only shown in development */}

                        <Button
                            className="bg-blue-500 hover:bg-blue-600 text-white"
                            size="sm"
                            onClick={handleRefreshClick}
                            disabled={isLoading || isRefreshing}
                        >
                            <RefreshCw className={`h-4 w-4 ${isLoading || isRefreshing ? "animate-spin" : ""}`} />
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="flex items-center gap-1">
                                    <ArrowUpDown className="h-4 w-4" />
                                    <span className="hidden sm:inline">Sort</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleSortChange("name-asc")}>Name (A-Z)</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSortChange("name-desc")}>Name (Z-A)</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSortChange("date-desc")}>Newest First</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSortChange("date-asc")}>Oldest First</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <div className="flex border-border rounded-md overflow-hidden">
                            <Button
                                variant={viewMode === "grid" ? "default" : "ghost"}
                                size="sm"
                                className={`rounded-none px-2 ${viewMode === "grid" ? "bg-blue-500 text-white" : "text-gray-500"}`}
                                onClick={() => setViewMode("grid")}
                            >
                                <Grid className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === "list" ? "default" : "ghost"}
                                size="sm"
                                className={`rounded-none px-2 ${viewMode === "list" ? "bg-blue-500 text-white" : "text-gray-500"}`}
                                onClick={() => setViewMode("list")}
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>

                        {showCreateButton && onCreateApp && (
                            <Button className="bg-blue-500 hover:bg-blue-600 text-white" size="sm" onClick={onCreateApp}>
                                <Plus className="h-4 w-4" /> New
                            </Button>
                        )}
                    </div>
                </div>

                {/* App cards */}
                <div className={viewMode === "grid" ? getGridColumnsClass() : "space-y-3"}>
                    {isLoading ? (
                        renderSkeletons()
                    ) : filteredApps.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-10 text-center">
                            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-full mb-4">
                                <Search className="h-6 w-6 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No apps found</h3>
                            <p className="text-gray-500 dark:text-gray-400 mt-1">
                                {searchTerm ? "Try a different search term" : "Create your first app to get started"}
                            </p>
                            {showCreateButton && onCreateApp && (
                                <Button className="bg-blue-500 hover:bg-blue-600 text-white mt-4" onClick={onCreateApp}>
                                    <Plus className="h-4 w-4 mr-2" /> Create New App
                                </Button>
                            )}
                        </div>
                    ) : (
                        <AnimatePresence mode="popLayout">
                            {filteredApps.map((app) => {
                                const colorClasses = getAppColorClasses(app, viewMode);

                                return (
                                    <motion.div
                                        key={app.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.2 }}
                                        layout
                                        className="h-full"
                                    >
                                        <Card
                                            className={`
                      border-border hover:shadow-md transition-shadow duration-200 h-full
                      ${viewMode === "list" ? "flex overflow-hidden" : "overflow-hidden"}
                      ${colorClasses.cardBg}
                    `}
                                        >
                                            {/* Banner image - only show in grid view */}
                                            {viewMode === "grid" && (
                                                <div className="h-32 w-full relative">
                                                    {(app.imageFileId || app.imageUrl) ? (
                                                        <>
                                                            <InlineMediaRef
                                                                ref={app.imageFileId ? { file_id: app.imageFileId } : app.imageUrl}
                                                                size="fill"
                                                                fit="cover"
                                                                rounded="none"
                                                                fallback={null}
                                                                alt={app.name}
                                                            />
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                        </>
                                                    ) : (
                                                        // Image placeholder with primaryColor background
                                                        <div
                                                            className={`w-full h-full flex items-center justify-center
                            ${
                                app.primaryColor
                                    ? `bg-${app.primaryColor}-300 dark:bg-${app.primaryColor}-800`
                                    : "bg-gray-200 dark:bg-gray-700"
                            }
                          `}
                                                        >
                                                            <IconPicker
                                                                selectedIcon={app.mainAppIcon}
                                                                onIconSelect={() => {}}
                                                                className="w-12 h-12 opacity-20"
                                                                defaultIcon={app.mainAppIcon}
                                                                accentColor={app.accentColor}
                                                                iconType="appIcon"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <CardContent
                                                className={`
                      ${viewMode === "list" ? "flex-1 p-4" : "p-4 pt-4"}
                      ${viewMode === "grid" ? "-mt-8 relative" : ""}
                    `}
                                            >
                                                <div
                                                    className={`
                        flex items-center gap-3
                        ${viewMode === "list" ? "mb-1" : "mb-3"}
                      `}
                                                >
                                                    <div
                                                        className={`
                          rounded-lg flex items-center justify-center
                          ${viewMode === "grid" ? `bg-textured shadow-lg p-2` : `bg-white/90 dark:bg-gray-800/90 p-2`}
                        `}
                                                    >
                                                        <IconPicker
                                                            selectedIcon={app.mainAppIcon}
                                                            onIconSelect={() => {}} // Read-only in this context
                                                            className={`${viewMode === "list" ? "w-5 h-5" : "w-6 h-6"}`}
                                                            defaultIcon={app.mainAppIcon}
                                                            primaryColor={app.primaryColor}
                                                            accentColor={app.accentColor}
                                                            iconType="appIcon"
                                                        />
                                                    </div>
                                                    <div>
                                                        <h3
                                                            className={`
                            font-medium truncate max-w-[200px]
                            ${colorClasses.titleClass}
                            ${viewMode === "list" ? "text-sm" : "text-base"}
                          `}
                                                        >
                                                            {app.name}
                                                        </h3>
                                                    </div>
                                                </div>

                                                {viewMode === "grid" && (
                                                    <div
                                                        className={`
                          h-14 overflow-hidden text-sm mb-3 line-clamp-2
                          ${colorClasses.descriptionClass}
                        `}
                                                    >
                                                        {app.description || "No description provided"}
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {app.layoutType && (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                                                        >
                                                            {app.layoutType}
                                                        </Badge>
                                                    )}
                                                    {app.accentColor && (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-xs bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800"
                                                        >
                                                            <span
                                                                className={`inline-block w-2 h-2 rounded-full mr-1 bg-${app.accentColor}-500`}
                                                            ></span>
                                                            {app.accentColor}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </CardContent>

                                            <CardFooter
                                                className={`border-t border-border p-3
                                                              ${colorClasses.cardFooterBg}
                                                              ${
                                                                  viewMode === "list"
                                                                      ? "w-24 border-l border-l-gray-200 dark:border-l-gray-700 flex items-center justify-center"
                                                                      : ""
                                                              }
                                                            `}
                                            >
                                                <div className={`flex w-full gap-2 ${viewMode === "list" ? "flex-col" : ""}`}>
                                                    {onSelectApp && (
                                                        <Button
                                                            className={`flex-1 ${COLOR_VARIANTS.buttonBg[app.accentColor || "blue"]}`}
                                                            size="sm"
                                                            onClick={() => onSelectApp(app)}
                                                        >
                                                            Select
                                                        </Button>
                                                    )}
                                                    {onEditApp && (
                                                        <Button
                                                            className={`flex-1 bg-transparent border border-current hover:bg-opacity-10 font-bold ${
                                                                COLOR_VARIANTS.text[app.accentColor || "blue"]
                                                            }`}
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => onEditApp(app)}
                                                        >
                                                            Edit
                                                        </Button>
                                                    )}
                                                    {showDelete && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button
                                                                    className="bg-red-500 hover:bg-red-600 text-white"
                                                                    size="sm"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Delete App</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        Are you sure you want to delete "{app.name}"? This action cannot be undone and will permanently remove the app and all its data.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        className="bg-red-600 hover:bg-red-700"
                                                                        onClick={() => handleDeleteApp(app)}
                                                                    >
                                                                        Delete
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </CardFooter>
                                        </Card>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    )}
                </div>

                {/* Status footer */}
                {!isLoading && filteredApps.length > 0 && (
                    <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 pt-2">
                        <span>
                            Showing {filteredApps.length} of {apps.length} apps
                            {searchTerm && ` for "${searchTerm}"`}
                        </span>
                    </div>
                )}
            </div>
        );
    }
);

// Add display name for debugging
SmartAppList.displayName = "SmartAppList";

export default SmartAppList;
