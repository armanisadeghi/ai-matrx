'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  Search,
  ExternalLink,
  Star,
  ShieldCheck,
  CheckCircle,
  Clock,
  Archive,
  Ban,
  RefreshCw,
  Filter,
  X,
  ArrowUpDown,
  Loader2,
} from 'lucide-react';
import MatrxMiniLoader from '@/components/loaders/MatrxMiniLoader';
import {
  fetchAppsAdmin,
  updateAppAdmin,
  PromptAppAdminView,
} from '@/lib/services/prompt-apps-admin-service';

type SortField = 'name' | 'status' | 'category' | 'executions' | 'users' | 'success_rate' | 'cost';
type SortDirection = 'asc' | 'desc';

interface ColumnFilters {
  name: string;
  slug: string;
  status: Set<string>;
  category: Set<string>;
  featured: 'all' | 'featured' | 'not-featured';
  verified: 'all' | 'verified' | 'not-verified';
  creator: string;
}

export function AppsAdmin() {
  const [apps, setApps] = useState<PromptAppAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { toast } = useToast();

  // Column filters
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    name: '',
    slug: '',
    status: new Set<string>(),
    category: new Set<string>(),
    featured: 'all',
    verified: 'all',
    creator: '',
  });

  // Get unique values for dropdown filters
  const uniqueValues = useMemo(() => {
    const statuses = new Set<string>();
    const categories = new Set<string>();

    apps.forEach((app) => {
      if (app.status) statuses.add(app.status);
      if (app.category) categories.add(app.category);
    });

    return {
      statuses: Array.from(statuses).sort(),
      categories: Array.from(categories).sort(),
    };
  }, [apps]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAppsAdmin();
      setApps(data);
    } catch (error) {
      console.error('Error loading apps:', error);
      toast({
        title: 'Error',
        description: 'Failed to load apps',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter and sort apps
  const filteredAndSortedApps = useMemo(() => {
    let filtered = [...apps];

    // Name filter
    if (columnFilters.name) {
      const query = columnFilters.name.toLowerCase();
      filtered = filtered.filter((app) => app.name?.toLowerCase().includes(query));
    }

    // Slug filter
    if (columnFilters.slug) {
      const query = columnFilters.slug.toLowerCase();
      filtered = filtered.filter((app) => app.slug?.toLowerCase().includes(query));
    }

    // Status filter
    if (columnFilters.status.size > 0) {
      filtered = filtered.filter((app) => app.status && columnFilters.status.has(app.status));
    }

    // Category filter
    if (columnFilters.category.size > 0) {
      filtered = filtered.filter((app) => app.category && columnFilters.category.has(app.category));
    }

    // Featured filter
    if (columnFilters.featured === 'featured') {
      filtered = filtered.filter((app) => app.is_featured);
    } else if (columnFilters.featured === 'not-featured') {
      filtered = filtered.filter((app) => !app.is_featured);
    }

    // Verified filter
    if (columnFilters.verified === 'verified') {
      filtered = filtered.filter((app) => app.is_verified);
    } else if (columnFilters.verified === 'not-verified') {
      filtered = filtered.filter((app) => !app.is_verified);
    }

    // Creator filter
    if (columnFilters.creator) {
      const query = columnFilters.creator.toLowerCase();
      filtered = filtered.filter((app) => app.creator_email?.toLowerCase().includes(query));
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'name':
          aVal = a.name?.toLowerCase() || '';
          bVal = b.name?.toLowerCase() || '';
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
          break;
        case 'category':
          aVal = a.category || '';
          bVal = b.category || '';
          break;
        case 'executions':
          aVal = a.total_executions || 0;
          bVal = b.total_executions || 0;
          break;
        case 'users':
          aVal = a.unique_users_count || 0;
          bVal = b.unique_users_count || 0;
          break;
        case 'success_rate':
          aVal = (a.success_rate || 0) * 100;
          bVal = (b.success_rate || 0) * 100;
          break;
        case 'cost':
          aVal = a.total_cost || 0;
          bVal = b.total_cost || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [apps, columnFilters, sortField, sortDirection]);

  // Stats
  const stats = useMemo(() => {
    const published = apps.filter((app) => app.status === 'published').length;
    const featured = apps.filter((app) => app.is_featured).length;
    const verified = apps.filter((app) => app.is_verified).length;

    return { total: apps.length, published, featured, verified };
  }, [apps]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper functions for filter management
  const updateTextFilter = (field: 'name' | 'slug' | 'creator', value: string) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
  };

  const toggleSetFilter = <T extends string>(field: 'status' | 'category', value: T) => {
    setColumnFilters((prev) => {
      const newSet = new Set(prev[field]);
      if (newSet.has(value)) {
        newSet.delete(value);
      } else {
        newSet.add(value);
      }
      return { ...prev, [field]: newSet };
    });
  };

  const updateDropdownFilter = (field: 'featured' | 'verified', value: any) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearAllFilters = () => {
    setColumnFilters({
      name: '',
      slug: '',
      status: new Set<string>(),
      category: new Set<string>(),
      featured: 'all',
      verified: 'all',
      creator: '',
    });
  };

  const hasActiveFilters =
    columnFilters.name ||
    columnFilters.slug ||
    columnFilters.status.size > 0 ||
    columnFilters.category.size > 0 ||
    columnFilters.featured !== 'all' ||
    columnFilters.verified !== 'all' ||
    columnFilters.creator;

  const handleToggleFeatured = async (app: PromptAppAdminView) => {
    try {
      await updateAppAdmin({
        id: app.id,
        is_featured: !app.is_featured,
      });
      loadData();
      toast({
        title: 'Success',
        description: `App ${!app.is_featured ? 'featured' : 'unfeatured'}`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Error updating app:', error);
      toast({
        title: 'Error',
        description: 'Failed to update app',
        variant: 'destructive',
      });
    }
  };

  const handleToggleVerified = async (app: PromptAppAdminView) => {
    try {
      await updateAppAdmin({
        id: app.id,
        is_verified: !app.is_verified,
      });
      loadData();
      toast({
        title: 'Success',
        description: `App ${!app.is_verified ? 'verified' : 'unverified'}`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Error updating app:', error);
      toast({
        title: 'Error',
        description: 'Failed to update app',
        variant: 'destructive',
      });
    }
  };

  const handleChangeStatus = async (app: PromptAppAdminView, newStatus: string) => {
    try {
      await updateAppAdmin({
        id: app.id,
        status: newStatus as any,
      });
      loadData();
      toast({
        title: 'Success',
        description: `App status changed to ${newStatus}`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Error updating app:', error);
      toast({
        title: 'Error',
        description: 'Failed to update app',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; class?: string }> = {
      draft: { variant: 'secondary', icon: Clock },
      published: { variant: 'default', icon: CheckCircle, class: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
      archived: { variant: 'outline', icon: Archive },
      suspended: { variant: 'destructive', icon: Ban },
    };
    const config = variants[status] || variants.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant as any} className={config.class}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUpDown className="h-3 w-3 inline ml-1" />
    ) : (
      <ArrowUpDown className="h-3 w-3 inline ml-1 rotate-180" />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl pl-2 font-bold">Apps Management</h2>
            </div>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button onClick={clearAllFilters} variant="outline" size="sm">
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
              <Button onClick={() => loadData()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Apps</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-green-600">{stats.published}</div>
                <div className="text-xs text-muted-foreground">Published</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-yellow-600">{stats.featured}</div>
                <div className="text-xs text-muted-foreground">Featured</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-blue-600">{stats.verified}</div>
                <div className="text-xs text-muted-foreground">Verified</div>
              </CardContent>
            </Card>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Active filters:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              {columnFilters.name && <Badge variant="secondary">Name: {columnFilters.name}</Badge>}
              {columnFilters.slug && <Badge variant="secondary">Slug: {columnFilters.slug}</Badge>}
              {columnFilters.status.size > 0 && (
                <Badge variant="secondary">Status ({columnFilters.status.size})</Badge>
              )}
              {columnFilters.category.size > 0 && (
                <Badge variant="secondary">Category ({columnFilters.category.size})</Badge>
              )}
              {columnFilters.featured !== 'all' && (
                <Badge variant="secondary">Featured: {columnFilters.featured}</Badge>
              )}
              {columnFilters.verified !== 'all' && (
                <Badge variant="secondary">Verified: {columnFilters.verified}</Badge>
              )}
              {columnFilters.creator && (
                <Badge variant="secondary">Creator: {columnFilters.creator}</Badge>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 pr-4">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {/* Name Column - Text filter + Sort */}
                <TableHead className="min-w-[200px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('name')}
                    >
                      <span className="font-semibold">Name</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="name" />
                    </div>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.name}
                      onChange={(e) => updateTextFilter('name', e.target.value)}
                      className="h-7 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </TableHead>

                {/* Slug Column - Text filter */}
                <TableHead className="min-w-[150px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Slug</span>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.slug}
                      onChange={(e) => updateTextFilter('slug', e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </TableHead>

                {/* Status Column - Dropdown filter + Sort */}
                <TableHead className="min-w-[140px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span
                        className="font-semibold cursor-pointer hover:text-primary"
                        onClick={() => handleSort('status')}
                      >
                        Status
                      </span>
                      <ArrowUpDown className="h-3 w-3 cursor-pointer" onClick={() => handleSort('status')} />
                      <SortIcon field="status" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-full justify-between text-xs">
                          <span className="truncate">
                            {columnFilters.status.size > 0 ? `${columnFilters.status.size} selected` : 'All'}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuLabel className="flex items-center justify-between">
                          <span>Filter by Status</span>
                          {columnFilters.status.size > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setColumnFilters((prev) => ({ ...prev, status: new Set() }))}
                              className="h-5 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
                            >
                              Clear
                            </Button>
                          )}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {uniqueValues.statuses.map((status) => (
                          <DropdownMenuCheckboxItem
                            key={status}
                            checked={columnFilters.status.has(status)}
                            onCheckedChange={() => toggleSetFilter('status', status)}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {status}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>

                {/* Category Column - Dropdown filter + Sort */}
                <TableHead className="min-w-[130px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span
                        className="font-semibold cursor-pointer hover:text-primary"
                        onClick={() => handleSort('category')}
                      >
                        Category
                      </span>
                      <ArrowUpDown className="h-3 w-3 cursor-pointer" onClick={() => handleSort('category')} />
                      <SortIcon field="category" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-full justify-between text-xs">
                          <span className="truncate">
                            {columnFilters.category.size > 0 ? `${columnFilters.category.size} selected` : 'All'}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuLabel className="flex items-center justify-between">
                          <span>Filter by Category</span>
                          {columnFilters.category.size > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setColumnFilters((prev) => ({ ...prev, category: new Set() }))}
                              className="h-5 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
                            >
                              Clear
                            </Button>
                          )}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {uniqueValues.categories.map((category) => (
                          <DropdownMenuCheckboxItem
                            key={category}
                            checked={columnFilters.category.has(category)}
                            onCheckedChange={() => toggleSetFilter('category', category)}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {category}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>

                {/* Creator Column - Text filter */}
                <TableHead className="min-w-[180px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Creator</span>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.creator}
                      onChange={(e) => updateTextFilter('creator', e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </TableHead>

                {/* Featured Column - Dropdown filter */}
                <TableHead className="min-w-[110px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Featured</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-full justify-between text-xs">
                          <span className="truncate">
                            {columnFilters.featured === 'all' ? 'All' : columnFilters.featured === 'featured' ? 'Yes' : 'No'}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuLabel>Filter by Featured</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.featured === 'all'}
                          onCheckedChange={() => updateDropdownFilter('featured', 'all')}
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.featured === 'featured'}
                          onCheckedChange={() => updateDropdownFilter('featured', 'featured')}
                        >
                          Featured Only
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.featured === 'not-featured'}
                          onCheckedChange={() => updateDropdownFilter('featured', 'not-featured')}
                        >
                          Not Featured
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>

                {/* Verified Column - Dropdown filter */}
                <TableHead className="min-w-[110px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Verified</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-full justify-between text-xs">
                          <span className="truncate">
                            {columnFilters.verified === 'all' ? 'All' : columnFilters.verified === 'verified' ? 'Yes' : 'No'}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuLabel>Filter by Verified</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.verified === 'all'}
                          onCheckedChange={() => updateDropdownFilter('verified', 'all')}
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.verified === 'verified'}
                          onCheckedChange={() => updateDropdownFilter('verified', 'verified')}
                        >
                          Verified Only
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.verified === 'not-verified'}
                          onCheckedChange={() => updateDropdownFilter('verified', 'not-verified')}
                        >
                          Not Verified
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>

                {/* Metrics Columns with Sort */}
                <TableHead className="min-w-[100px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('executions')}
                    >
                      <span className="font-semibold">Executions</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="executions" />
                    </div>
                    <div className="h-7" />
                  </div>
                </TableHead>

                <TableHead className="min-w-[80px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('users')}
                    >
                      <span className="font-semibold">Users</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="users" />
                    </div>
                    <div className="h-7" />
                  </div>
                </TableHead>

                <TableHead className="min-w-[110px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('success_rate')}
                    >
                      <span className="font-semibold">Success Rate</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="success_rate" />
                    </div>
                    <div className="h-7" />
                  </div>
                </TableHead>

                <TableHead className="min-w-[90px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('cost')}
                    >
                      <span className="font-semibold">Cost</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="cost" />
                    </div>
                    <div className="h-7" />
                  </div>
                </TableHead>

                {/* Actions Column */}
                <TableHead className="text-right min-w-[140px] pr-4">
                  <div className="space-y-1">
                    <span className="font-semibold">Actions</span>
                    <div className="h-7" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedApps.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{app.name}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={`/p/${app.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>View app</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{app.slug}</code>
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
                    <span className="text-sm text-muted-foreground">{app.creator_email}</span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={app.is_featured ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleToggleFeatured(app)}
                      className="h-7"
                    >
                      <Star className={`w-3 h-3 mr-1 ${app.is_featured ? 'fill-current' : ''}`} />
                      {app.is_featured ? 'Yes' : 'No'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={app.is_verified ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleToggleVerified(app)}
                      className="h-7"
                    >
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      {app.is_verified ? 'Yes' : 'No'}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">{app.total_executions?.toLocaleString() || 0}</TableCell>
                  <TableCell className="text-right">{app.unique_users_count?.toLocaleString() || 0}</TableCell>
                  <TableCell className="text-right">{((app.success_rate || 0) * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">${app.total_cost?.toFixed(4) || '0.0000'}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7">
                          Change Status
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuCheckboxItem
                          checked={app.status === 'draft'}
                          onCheckedChange={() => handleChangeStatus(app, 'draft')}
                        >
                          Draft
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={app.status === 'published'}
                          onCheckedChange={() => handleChangeStatus(app, 'published')}
                        >
                          Published
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={app.status === 'archived'}
                          onCheckedChange={() => handleChangeStatus(app, 'archived')}
                        >
                          Archived
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={app.status === 'suspended'}
                          onCheckedChange={() => handleChangeStatus(app, 'suspended')}
                        >
                          Suspended
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredAndSortedApps.length === 0 && (
            <div className="text-center py-12">
              <Ban className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No apps found</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
