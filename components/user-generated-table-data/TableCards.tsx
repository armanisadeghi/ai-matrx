"use client";
import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase/client";
import {
  unwrapGetUserTables,
  unwrapUserTableMutation,
} from "@/utils/user-tables-rpc";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  TableIcon,
  Plus,
  Loader2,
  Trash2,
  Edit2,
  Calendar,
  Users,
  Eye,
  Search,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import CreateTableModal from "./CreateTableModal";
import EditTableModal from "./EditTableModal";
import { TableListItem } from "./TableListItem";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface UserTable {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
  updated_at: string;
  is_public: boolean;
  /** Canonical sharing reach. Legacy rows may predate it — see VisibilityBadge. */
  visibility?: string | null;
  organization_id?: string | null;
  user_id: string;
}

const LIST_ITEMS_PER_PAGE = 20;

// Hook to get the current grid column count based on viewport
function useGridColumns() {
  const [columns, setColumns] = useState(4); // Default to 4 for SSR

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1280) {
        setColumns(4); // xl
      } else if (width >= 1024) {
        setColumns(3); // lg
      } else if (width >= 768) {
        setColumns(2); // md
      } else {
        setColumns(1); // default
      }
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  return columns;
}

// Calculate card limit to fill complete rows (accounting for Create card)
function getCardsLimit(columns: number, hasCreateCard: boolean): number {
  // For owned tables: we show cards + 1 Create card, so we need (limit + 1) to be divisible by columns
  // For shared tables: no Create card, so limit should be divisible by columns
  if (hasCreateCard) {
    // Cards + 1 should fill complete rows
    // 4 cols: 7 cards + 1 = 8 (2 rows), or 11 + 1 = 12 (3 rows)
    // 3 cols: 5 cards + 1 = 6 (2 rows), or 8 + 1 = 9 (3 rows)
    // 2 cols: 5 cards + 1 = 6 (3 rows), or 7 + 1 = 8 (4 rows)
    // 1 col: any works
    const rowsToShow = 2;
    return columns * rowsToShow - 1;
  } else {
    // No create card, just fill 2 rows
    const rowsToShow = 2;
    return columns * rowsToShow;
  }
}

/**
 * What a table's sharing reach actually is, in the user's words.
 *
 * `visibility` is canonical; `is_public` is the legacy boolean kept only as a
 * fallback for a row written before the column existed. When neither is known
 * we SAY so rather than guessing "Private" — an unknown reach displayed as
 * private is exactly the lie this component was written to end.
 */
function VisibilityBadge({
  visibility,
  isPublic,
}: {
  visibility?: string | null;
  isPublic?: boolean;
}) {
  const resolved = visibility ?? (isPublic ? "public" : null);

  const spec: Record<string, { label: string; title: string; className: string }> = {
    personal: {
      label: "Only you",
      title: "Only you can open this table.",
      className: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
    },
    internal: {
      label: "Your organization",
      title: "Everyone in your organization can find and open this table.",
      className:
        "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    },
    link: {
      label: "Anyone with the link",
      title: "Anyone who has the link can open this table.",
      className:
        "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400",
    },
    public: {
      label: "Public",
      title: "Anyone on the internet can open this table.",
      className: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    },
  };

  const chosen = resolved ? spec[resolved] : undefined;
  if (!chosen) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        title="This table's sharing setting could not be read."
      >
        Sharing unknown
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${chosen.className}`}
      title={chosen.title}
    >
      {chosen.label}
    </span>
  );
}

export default function TableCards() {
  const [tables, setTables] = useState<UserTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<UserTable | null>(null);
  const [tableToEdit, setTableToEdit] = useState<UserTable | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const router = useRouter();

  // Get current grid columns and calculate card limits
  const gridColumns = useGridColumns();
  const ownedCardsLimit = getCardsLimit(gridColumns, true); // Has create card
  const sharedCardsLimit = getCardsLimit(gridColumns, false); // No create card

  // Navigation state
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination state
  const [ownedListPage, setOwnedListPage] = useState(1);
  const [sharedListPage, setSharedListPage] = useState(1);

  // Shared section collapse state
  const [isSharedSectionOpen, setIsSharedSectionOpen] = useState(true);

  useEffect(() => {
    fetchCurrentUser();
    fetchUserTables();
  }, []);

  // Reset pagination when search changes
  useEffect(() => {
    setOwnedListPage(1);
    setSharedListPage(1);
  }, [searchTerm]);

  // Fetch current user ID
  const fetchCurrentUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  // Check if user owns the table
  const isOwner = (table: UserTable) => {
    return currentUserId && table.user_id === currentUserId;
  };

  // Filter tables based on search
  const filteredTables = useMemo(() => {
    if (!searchTerm) return tables;
    return filterAndSortBySearch(tables, searchTerm, [
      { get: (t) => t.table_name, weight: "title" },
      { get: (t) => t.description, weight: "body" },
    ]);
  }, [tables, searchTerm]);

  // Separate tables into owned and shared
  const ownedTables = useMemo(
    () => filteredTables.filter((table) => isOwner(table)),
    [filteredTables, currentUserId],
  );
  const sharedTables = useMemo(
    () => filteredTables.filter((table) => !isOwner(table)),
    [filteredTables, currentUserId],
  );

  // Split owned tables into cards and list items
  const ownedCards = useMemo(
    () => ownedTables.slice(0, ownedCardsLimit),
    [ownedTables, ownedCardsLimit],
  );
  const allOwnedListItems = useMemo(
    () => ownedTables.slice(ownedCardsLimit),
    [ownedTables, ownedCardsLimit],
  );
  const ownedListItems = useMemo(
    () => allOwnedListItems.slice(0, ownedListPage * LIST_ITEMS_PER_PAGE),
    [allOwnedListItems, ownedListPage],
  );
  const hasMoreOwned = allOwnedListItems.length > ownedListItems.length;

  // Split shared tables into cards and list items
  const sharedCards = useMemo(
    () => sharedTables.slice(0, sharedCardsLimit),
    [sharedTables, sharedCardsLimit],
  );
  const allSharedListItems = useMemo(
    () => sharedTables.slice(sharedCardsLimit),
    [sharedTables, sharedCardsLimit],
  );
  const sharedListItems = useMemo(
    () => allSharedListItems.slice(0, sharedListPage * LIST_ITEMS_PER_PAGE),
    [allSharedListItems, sharedListPage],
  );
  const hasMoreShared = allSharedListItems.length > sharedListItems.length;

  // Fetch user tables
  const fetchUserTables = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_user_tables");

      if (error) throw error;
      setTables(unwrapGetUserTables(data ?? null) as UserTable[]);
    } catch (err) {
      console.error("Error fetching tables:", err);
      setError("Failed to load your tables");
    } finally {
      setLoading(false);
    }
  };

  // Delete a table
  const deleteTable = async () => {
    if (!tableToDelete) return;

    try {
      const { data, error } = await supabase.rpc("delete_user_table", {
        p_table_id: tableToDelete.id,
      });

      if (error) throw error;
      unwrapUserTableMutation(data ?? null);

      // Update local state after successful deletion
      setTables(tables.filter((table) => table.id !== tableToDelete.id));
      toast({
        title: "Table deleted",
        description: `"${tableToDelete.table_name}" has been deleted successfully`,
      });
    } catch (err) {
      console.error("Error deleting table:", err);
      toast({
        title: "Error",
        description: "Failed to delete the table. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTableToDelete(null);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch (err) {
      return "Unknown date";
    }
  };

  // Handle successful table creation
  const handleTableCreated = (tableId: string) => {
    fetchUserTables();
    router.push(`/data/${tableId}`);
  };

  // Open delete confirmation
  const confirmDelete = (table: UserTable, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setTableToDelete(table);
  };

  // Open edit modal
  const openEditModal = (table: UserTable, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setTableToEdit(table);
  };

  // Handle navigation with loading state
  const handleNavigate = (id: string, e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    if (navigatingId) return;
    setNavigatingId(id);
    startTransition(() => {
      router.push(`/data/${id}`);
    });
  };

  // Handle successful table update
  const handleTableUpdated = () => {
    fetchUserTables();
    toast({
      title: "Table updated",
      description: "The table has been updated successfully",
    });
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm("");
  };

  // Render a single table card
  const renderTableCard = (table: UserTable, owned: boolean) => {
    const isNavigating = navigatingId === table.id;
    const isDisabled = isNavigating || navigatingId !== null;

    return (
      <Link
        key={table.id}
        href={`/data/${table.id}`}
        className="group cursor-pointer"
        onClick={(e) => {
          if (!isDisabled) handleNavigate(table.id, e);
          else e.preventDefault();
        }}
        tabIndex={-1}
      >
        <Card
          className={cn(
            "h-[280px] bg-white dark:bg-gray-950 border-border transition-all flex flex-col relative",
            owned
              ? "hover:border-blue-300 dark:hover:border-blue-700"
              : "hover:border-purple-300 dark:hover:border-purple-700 border-l-4 border-l-purple-400 dark:border-l-purple-600",
            !isDisabled && "hover:shadow-md dark:hover:shadow-black/30",
            isDisabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {/* Loading Overlay */}
          {isNavigating && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center rounded-lg">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <span className="text-sm font-medium text-foreground">
                  Loading...
                </span>
              </div>
            </div>
          )}

          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <CardTitle
                  className={cn(
                    "text-lg truncate transition-colors",
                    owned
                      ? "text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                      : "text-gray-800 dark:text-gray-200 group-hover:text-purple-600 dark:group-hover:text-purple-400",
                  )}
                >
                  {table.table_name}
                </CardTitle>
                {!owned && (
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 whitespace-nowrap flex-shrink-0">
                    <Eye size={10} className="mr-1" />
                    Shared
                  </span>
                )}
              </div>
              <div
                className="flex items-center space-x-2 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {owned ? (
                  <>
                    <button
                      onClick={(e) => openEditModal(table, e)}
                      className="text-gray-400 hover:text-blue-500 dark:text-gray-600 dark:hover:text-blue-400"
                      title="Edit table"
                      disabled={isDisabled}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => confirmDelete(table, e)}
                      className="text-gray-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400"
                      title="Delete table"
                      disabled={isDisabled}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <Eye
                    size={16}
                    className="text-purple-400 dark:text-purple-500"
                  />
                )}
                <TableIcon
                  size={18}
                  className={cn(
                    owned
                      ? "text-gray-400 dark:text-gray-600 group-hover:text-blue-500 dark:group-hover:text-blue-500"
                      : "text-purple-400 dark:text-purple-500",
                  )}
                />
              </div>
            </div>

            <CardDescription className="text-gray-500 dark:text-gray-400 min-h-[2.5rem] mt-1 line-clamp-2">
              {table.description || (
                <span className="text-gray-400 dark:text-gray-600 italic">
                  No description
                </span>
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 py-2">
            <div className="bg-gray-50 dark:bg-gray-900 p-2.5 rounded-md text-sm mb-2">
              <div className="flex justify-between mb-1">
                <span className="text-gray-600 dark:text-gray-400">Rows:</span>
                <span className="font-medium text-gray-800 dark:text-gray-300">
                  {table.row_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Fields:
                </span>
                <span className="font-medium text-gray-800 dark:text-gray-300">
                  {table.field_count}
                </span>
              </div>
            </div>

            <div className="flex flex-col space-y-1.5">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-500">
                <Calendar size={12} className="mr-1" />
                <span>Updated: {formatDate(table.updated_at)}</span>
              </div>

              {/* THE BADGE MUST NOT LIE. This read the legacy `is_public`
                  boolean and called everything else "Private" — while every
                  dataset here is `internal`, i.e. visible to the whole
                  organization. Telling someone their data is more private than
                  it is, is the worst direction for this to be wrong in. */}
              <div className="flex items-center gap-2">
                <VisibilityBadge
                  visibility={table.visibility}
                  isPublic={table.is_public}
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-2">
            <Button
              className={cn(
                "w-full",
                owned
                  ? "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
                  : "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-700 dark:hover:bg-purple-800",
              )}
              disabled={isDisabled}
            >
              {owned ? "View Table" : "View (Read Only)"}
            </Button>
          </CardFooter>
        </Card>
      </Link>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Search skeleton */}
        <div className="h-10 w-full max-w-md bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card
              key={i}
              className="bg-white dark:bg-gray-950 border-border h-[280px] flex flex-col"
            >
              <CardHeader className="pb-2">
                <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-2"></div>
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="h-16 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-4"></div>
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
              </CardContent>
              <CardFooter className="mt-auto">
                <div className="h-9 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6 text-center text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <p className="font-medium">{error}</p>
        <p className="text-sm mt-1 text-red-400 dark:text-red-300">
          Please try again or contact support if the issue persists.
        </p>
        <Button
          onClick={fetchUserTables}
          variant="outline"
          className="mt-4 border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/30"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search tables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {searchTerm && (
          <span className="text-sm text-muted-foreground">
            {filteredTables.length} result
            {filteredTables.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* My Tables Section */}
      <div>
        {(ownedTables.length > 0 || !searchTerm) && (
          <div className="flex items-center gap-2 mb-4">
            <TableIcon size={18} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              My Tables
            </h2>
            <Badge
              variant="secondary"
              className="font-normal py-0.25 px-1.5 text-xs"
            >
              {ownedTables.length}
            </Badge>
          </div>
        )}

        {ownedTables.length === 0 && searchTerm ? (
          <div className="text-center py-8 text-muted-foreground">
            No tables match your search.
          </div>
        ) : (
          <>
            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {ownedCards.map((table) => renderTableCard(table, true))}

              {/* Create New Table Card - only show if not searching */}
              {!searchTerm && (
                <Card
                  className="h-[280px] bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 border border-dashed border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md dark:hover:shadow-black/30 transition-all cursor-pointer flex flex-col"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-gray-800 dark:text-gray-200">
                      Create New Table
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400 min-h-[2.5rem] mt-1">
                      Generate or import a new data table
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Plus
                        size={22}
                        className="text-blue-600 dark:text-blue-400"
                      />
                    </div>
                  </CardContent>

                  <CardFooter className="pt-2">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800">
                      Create Table
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </div>

            {/* List Items */}
            {ownedListItems.length > 0 && (
              <div className="mt-6 grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {ownedListItems.map((table) => (
                  <TableListItem
                    key={table.id}
                    {...table}
                    isOwned={true}
                    onNavigate={handleNavigate}
                    onEdit={(id) => {
                      const t = tables.find((t) => t.id === id);
                      if (t) openEditModal(t);
                    }}
                    onDelete={(id) => {
                      const t = tables.find((t) => t.id === id);
                      if (t) confirmDelete(t);
                    }}
                    isNavigating={navigatingId === table.id}
                    isAnyNavigating={navigatingId !== null}
                  />
                ))}
              </div>
            )}

            {/* Show More Button */}
            {hasMoreOwned && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setOwnedListPage((prev) => prev + 1)}
                  className="w-full md:w-auto"
                >
                  Show More ({allOwnedListItems.length - ownedListItems.length}{" "}
                  remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Shared With Me Section */}
      {(sharedTables.length > 0 ||
        (tables.some((t) => !isOwner(t)) && !searchTerm)) && (
        <Collapsible
          open={isSharedSectionOpen}
          onOpenChange={setIsSharedSectionOpen}
          className="mt-8"
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full group mb-4 hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-2">
              {isSharedSectionOpen ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              )}
              <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Shared With Me
              </h2>
              <Badge
                variant="secondary"
                className="font-normal py-0.25 px-1.5 text-xs"
              >
                {sharedTables.length}
              </Badge>
              <span className="text-xs text-muted-foreground ml-2">
                View only
              </span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {sharedTables.length === 0 && searchTerm ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg bg-muted/30">
                <p className="text-muted-foreground">
                  No shared tables match your search.
                </p>
              </div>
            ) : sharedTables.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg bg-muted/30">
                <p className="text-muted-foreground">
                  No tables have been shared with you yet.
                </p>
              </div>
            ) : (
              <>
                {/* Shared Cards Grid */}
                {sharedCards.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {sharedCards.map((table) => renderTableCard(table, false))}
                  </div>
                )}

                {/* Shared List Items */}
                {sharedListItems.length > 0 && (
                  <div className="mt-6 grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {sharedListItems.map((table) => (
                      <TableListItem
                        key={table.id}
                        {...table}
                        isOwned={false}
                        onNavigate={handleNavigate}
                        isNavigating={navigatingId === table.id}
                        isAnyNavigating={navigatingId !== null}
                      />
                    ))}
                  </div>
                )}

                {/* Show More Button */}
                {hasMoreShared && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => setSharedListPage((prev) => prev + 1)}
                      className="w-full md:w-auto"
                    >
                      Show More (
                      {allSharedListItems.length - sharedListItems.length}{" "}
                      remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Create Table Modal */}
      <CreateTableModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTableCreated}
      />

      {/* Edit Table Modal */}
      {tableToEdit && (
        <EditTableModal
          isOpen={tableToEdit !== null}
          onClose={() => setTableToEdit(null)}
          onSuccess={handleTableUpdated}
          tableId={tableToEdit.id}
          initialData={{
            table_name: tableToEdit.table_name,
            description: tableToEdit.description,
            is_public: tableToEdit.is_public,
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={tableToDelete !== null}
        onOpenChange={(open) => !open && setTableToDelete(null)}
      >
        <AlertDialogContent className="bg-white dark:bg-gray-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-100">
              Delete Table
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              Are you sure you want to delete{" "}
              <span className="font-medium text-gray-900 dark:text-gray-200">
                {tableToDelete?.table_name}
              </span>
              ? This action cannot be undone and will permanently delete all
              data in this table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteTable}
              className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800"
            >
              Delete Table
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
