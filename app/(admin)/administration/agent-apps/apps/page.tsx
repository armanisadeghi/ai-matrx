"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowUpDown,
  Ban,
  CheckCircle,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  fetchAgentAppsAdmin,
  updateAgentAppAdmin,
  type AgentAppAdminView,
  type UpdateAgentAppAdminInput,
} from "@/lib/services/agent-apps-admin-service";

type SortField =
  | "name"
  | "status"
  | "category"
  | "executions"
  | "users"
  | "success_rate"
  | "cost"
  | "updated_at";
type SortDirection = "asc" | "desc";

interface ColumnFilters {
  name: string;
  slug: string;
  status: Set<string>;
  category: Set<string>;
  featured: "all" | "featured" | "not-featured";
  verified: "all" | "verified" | "not-verified";
  creator: string;
}

function getStatusBadge(status: string) {
  const map: Record<string, { cls: string; Icon: typeof Clock }> = {
    draft: { cls: "bg-muted text-foreground", Icon: Clock },
    published: {
      cls: "bg-success/15 text-success border-success/30",
      Icon: CheckCircle,
    },
    archived: {
      cls: "bg-muted text-muted-foreground border-border",
      Icon: Archive,
    },
    suspended: {
      cls: "bg-destructive/15 text-destructive border-destructive/30",
      Icon: Ban,
    },
  };
  const cfg = map[status] ?? map.draft;
  const Icon = cfg.Icon;
  return (
    <Badge variant="outline" className={`${cfg.cls} text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </Badge>
  );
}

export default function AgentAppsAdminListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [apps, setApps] = useState<AgentAppAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    name: "",
    slug: "",
    status: new Set<string>(),
    category: new Set<string>(),
    featured: "all",
    verified: "all",
    creator: "",
  });

  const uniqueValues = useMemo(() => {
    const statuses = new Set<string>();
    const categories = new Set<string>();
    apps.forEach((a) => {
      if (a.status) statuses.add(a.status);
      if (a.category) categories.add(a.category);
    });
    return {
      statuses: Array.from(statuses).sort(),
      categories: Array.from(categories).sort(),
    };
  }, [apps]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAgentAppsAdmin({ limit: 1000 });
      setApps(data);
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load agent apps",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAndSortedApps = useMemo(() => {
    let filtered = [...apps];

    if (columnFilters.name) {
      const q = columnFilters.name.toLowerCase();
      filtered = filtered.filter((a) => a.name?.toLowerCase().includes(q));
    }
    if (columnFilters.slug) {
      const q = columnFilters.slug.toLowerCase();
      filtered = filtered.filter((a) => a.slug?.toLowerCase().includes(q));
    }
    if (columnFilters.status.size > 0) {
      filtered = filtered.filter(
        (a) => a.status && columnFilters.status.has(a.status),
      );
    }
    if (columnFilters.category.size > 0) {
      filtered = filtered.filter(
        (a) => a.category && columnFilters.category.has(a.category),
      );
    }
    if (columnFilters.featured === "featured") {
      filtered = filtered.filter((a) => a.is_featured);
    } else if (columnFilters.featured === "not-featured") {
      filtered = filtered.filter((a) => !a.is_featured);
    }
    if (columnFilters.verified === "verified") {
      filtered = filtered.filter((a) => a.is_verified);
    } else if (columnFilters.verified === "not-verified") {
      filtered = filtered.filter((a) => !a.is_verified);
    }
    if (columnFilters.creator) {
      const q = columnFilters.creator.toLowerCase();
      filtered = filtered.filter((a) =>
        a.creator_email?.toLowerCase().includes(q),
      );
    }

    filtered.sort((a, b) => {
      let av: any, bv: any;
      switch (sortField) {
        case "name":
          av = a.name?.toLowerCase() || "";
          bv = b.name?.toLowerCase() || "";
          break;
        case "status":
          av = a.status || "";
          bv = b.status || "";
          break;
        case "category":
          av = a.category || "";
          bv = b.category || "";
          break;
        case "executions":
          av = a.total_executions || 0;
          bv = b.total_executions || 0;
          break;
        case "users":
          av = a.unique_users_count || 0;
          bv = b.unique_users_count || 0;
          break;
        case "success_rate":
          av = (a.success_rate || 0) * 100;
          bv = (b.success_rate || 0) * 100;
          break;
        case "cost":
          av = a.total_cost || 0;
          bv = b.total_cost || 0;
          break;
        case "updated_at":
          av = new Date(a.updated_at).getTime();
          bv = new Date(b.updated_at).getTime();
          break;
        default:
          return 0;
      }
      if (av < bv) return sortDirection === "asc" ? -1 : 1;
      if (av > bv) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [apps, columnFilters, sortField, sortDirection]);

  const stats = useMemo(() => {
    const published = apps.filter((a) => a.status === "published").length;
    const featured = apps.filter((a) => a.is_featured).length;
    const verified = apps.filter((a) => a.is_verified).length;
    return { total: apps.length, published, featured, verified };
  }, [apps]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const updateTextFilter = (
    field: "name" | "slug" | "creator",
    value: string,
  ) => setColumnFilters((p) => ({ ...p, [field]: value }));

  const toggleSetFilter = <T extends string>(
    field: "status" | "category",
    value: T,
  ) => {
    setColumnFilters((p) => {
      const next = new Set(p[field]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...p, [field]: next };
    });
  };

  const updateDropdownFilter = (
    field: "featured" | "verified",
    value: any,
  ) => setColumnFilters((p) => ({ ...p, [field]: value }));

  const clearAllFilters = () =>
    setColumnFilters({
      name: "",
      slug: "",
      status: new Set<string>(),
      category: new Set<string>(),
      featured: "all",
      verified: "all",
      creator: "",
    });

  const hasActiveFilters =
    columnFilters.name ||
    columnFilters.slug ||
    columnFilters.status.size > 0 ||
    columnFilters.category.size > 0 ||
    columnFilters.featured !== "all" ||
    columnFilters.verified !== "all" ||
    columnFilters.creator;

  const handleMutate = async (
    id: string,
    patch: Omit<UpdateAgentAppAdminInput, "id">,
    description: string,
  ) => {
    try {
      await updateAgentAppAdmin({ id, ...patch });
      await load();
      toast({
        title: "Updated",
        description,
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to update agent app",
        variant: "destructive",
      });
    }
  };

  const handleOpenEdit = (id: string) => {
    startTransition(() => {
      router.push(`/administration/agent-apps/edit/${id}`);
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ArrowUpDown className="h-3 w-3 inline ml-1" />
    ) : (
      <ArrowUpDown className="h-3 w-3 inline ml-1 rotate-180" />
    );
  };

  if (loading && apps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 p-4 border-b bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              Agent Apps Management
            </h2>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button
                  onClick={clearAllFilters}
                  variant="outline"
                  size="sm"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
              <Button onClick={() => void load()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-success">
                  {stats.published}
                </div>
                <div className="text-xs text-muted-foreground">Published</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-warning">
                  {stats.featured}
                </div>
                <div className="text-xs text-muted-foreground">Featured</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-primary">
                  {stats.verified}
                </div>
                <div className="text-xs text-muted-foreground">Verified</div>
              </CardContent>
            </Card>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="min-w-[200px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort("name")}
                    >
                      <span className="font-semibold">Name</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="name" />
                    </div>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.name}
                      onChange={(e) => updateTextFilter("name", e.target.value)}
                      className="h-7 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[150px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Slug</span>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.slug}
                      onChange={(e) => updateTextFilter("slug", e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[140px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span
                        className="font-semibold cursor-pointer hover:text-primary"
                        onClick={() => handleSort("status")}
                      >
                        Status
                      </span>
                      <ArrowUpDown
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => handleSort("status")}
                      />
                      <SortIcon field="status" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-full justify-between text-xs"
                        >
                          <span className="truncate">
                            {columnFilters.status.size > 0
                              ? `${columnFilters.status.size} selected`
                              : "All"}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {uniqueValues.statuses.map((s) => (
                          <DropdownMenuCheckboxItem
                            key={s}
                            checked={columnFilters.status.has(s)}
                            onCheckedChange={() => toggleSetFilter("status", s)}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {s}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead className="min-w-[130px]">
                  <div className="space-y-1">
                    <span
                      className="font-semibold cursor-pointer hover:text-primary"
                      onClick={() => handleSort("category")}
                    >
                      Category
                      <SortIcon field="category" />
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-full justify-between text-xs"
                        >
                          <span className="truncate">
                            {columnFilters.category.size > 0
                              ? `${columnFilters.category.size} selected`
                              : "All"}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuLabel>
                          Filter by Category
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {uniqueValues.categories.map((c) => (
                          <DropdownMenuCheckboxItem
                            key={c}
                            checked={columnFilters.category.has(c)}
                            onCheckedChange={() =>
                              toggleSetFilter("category", c)
                            }
                            onSelect={(e) => e.preventDefault()}
                          >
                            {c}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead className="min-w-[180px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Creator</span>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.creator}
                      onChange={(e) =>
                        updateTextFilter("creator", e.target.value)
                      }
                      className="h-7 text-xs"
                    />
                  </div>
                </TableHead>
                <TableHead className="min-w-[110px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Featured</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-full justify-between text-xs"
                        >
                          <span className="truncate">
                            {columnFilters.featured === "all"
                              ? "All"
                              : columnFilters.featured === "featured"
                                ? "Yes"
                                : "No"}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.featured === "all"}
                          onCheckedChange={() =>
                            updateDropdownFilter("featured", "all")
                          }
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.featured === "featured"}
                          onCheckedChange={() =>
                            updateDropdownFilter("featured", "featured")
                          }
                        >
                          Featured
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.featured === "not-featured"}
                          onCheckedChange={() =>
                            updateDropdownFilter("featured", "not-featured")
                          }
                        >
                          Not Featured
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead className="min-w-[110px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Verified</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-full justify-between text-xs"
                        >
                          <span className="truncate">
                            {columnFilters.verified === "all"
                              ? "All"
                              : columnFilters.verified === "verified"
                                ? "Yes"
                                : "No"}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.verified === "all"}
                          onCheckedChange={() =>
                            updateDropdownFilter("verified", "all")
                          }
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.verified === "verified"}
                          onCheckedChange={() =>
                            updateDropdownFilter("verified", "verified")
                          }
                        >
                          Verified
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.verified === "not-verified"}
                          onCheckedChange={() =>
                            updateDropdownFilter("verified", "not-verified")
                          }
                        >
                          Not Verified
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead className="min-w-[100px] text-right">
                  <span
                    className="font-semibold cursor-pointer hover:text-primary"
                    onClick={() => handleSort("executions")}
                  >
                    Runs
                    <SortIcon field="executions" />
                  </span>
                </TableHead>
                <TableHead className="min-w-[80px] text-right">
                  <span
                    className="font-semibold cursor-pointer hover:text-primary"
                    onClick={() => handleSort("users")}
                  >
                    Users
                    <SortIcon field="users" />
                  </span>
                </TableHead>
                <TableHead className="min-w-[100px] text-right">
                  <span
                    className="font-semibold cursor-pointer hover:text-primary"
                    onClick={() => handleSort("success_rate")}
                  >
                    Success
                    <SortIcon field="success_rate" />
                  </span>
                </TableHead>
                <TableHead className="min-w-[90px] text-right">
                  <span
                    className="font-semibold cursor-pointer hover:text-primary"
                    onClick={() => handleSort("cost")}
                  >
                    Cost
                    <SortIcon field="cost" />
                  </span>
                </TableHead>
                <TableHead className="text-right min-w-[120px] pr-4">
                  <span className="font-semibold">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedApps.map((app) => (
                <TableRow
                  key={app.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => handleOpenEdit(app.id)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{app.name}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={`/p/${app.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>View public app</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {app.slug}
                    </code>
                  </TableCell>
                  <TableCell>{getStatusBadge(app.status)}</TableCell>
                  <TableCell>
                    {app.category ? (
                      <Badge variant="outline" className="text-xs">
                        {app.category}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {app.creator_email ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={app.is_featured ? "default" : "outline"}
                      size="sm"
                      className="h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleMutate(
                          app.id,
                          { is_featured: !app.is_featured },
                          `${app.name} ${
                            !app.is_featured ? "featured" : "unfeatured"
                          }`,
                        );
                      }}
                    >
                      <Star
                        className={`w-3 h-3 mr-1 ${
                          app.is_featured ? "fill-current" : ""
                        }`}
                      />
                      {app.is_featured ? "Yes" : "No"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={app.is_verified ? "default" : "outline"}
                      size="sm"
                      className="h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleMutate(
                          app.id,
                          { is_verified: !app.is_verified },
                          `${app.name} ${
                            !app.is_verified ? "verified" : "unverified"
                          }`,
                        );
                      }}
                    >
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      {app.is_verified ? "Yes" : "No"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    {app.total_executions?.toLocaleString() || 0}
                  </TableCell>
                  <TableCell className="text-right">
                    {app.unique_users_count?.toLocaleString() || 0}
                  </TableCell>
                  <TableCell className="text-right">
                    {((app.success_rate || 0) * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-right">
                    ${app.total_cost?.toFixed(4) ?? "0.0000"}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => handleOpenEdit(app.id)}
                    >
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredAndSortedApps.length === 0 && !loading && (
            <div className="text-center py-12">
              <Ban className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No agent apps found</p>
            </div>
          )}

          {loading && filteredAndSortedApps.length > 0 && (
            <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              Refreshing…
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
