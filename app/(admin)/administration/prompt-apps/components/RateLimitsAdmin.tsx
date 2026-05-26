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
  Shield,
  ShieldOff,
  ExternalLink,
  User,
  Globe,
  RefreshCw,
  Filter,
  X,
  ArrowUpDown,
  Ban,
} from 'lucide-react';
import MatrxMiniLoader from '@/components/loaders/MatrxMiniLoader';
import {
  fetchRateLimits,
  unblockRateLimit,
  PromptAppRateLimit,
} from '@/lib/services/prompt-apps-admin-service';

type SortField = 'app_name' | 'execution_count' | 'first_execution_at' | 'last_execution_at' | 'window_start_at';
type SortDirection = 'asc' | 'desc';

interface ColumnFilters {
  appName: string;
  identifier: string;
  identifierType: 'all' | 'user' | 'ip' | 'fingerprint';
  blocked: 'all' | 'blocked' | 'not-blocked';
}

export function RateLimitsAdmin() {
  const [rateLimits, setRateLimits] = useState<PromptAppRateLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('last_execution_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { toast } = useToast();

  // Column filters
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    appName: '',
    identifier: '',
    identifierType: 'all',
    blocked: 'blocked',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const blockedValue =
        columnFilters.blocked === 'all' ? undefined : columnFilters.blocked === 'blocked';
      const data = await fetchRateLimits({
        is_blocked: blockedValue,
        limit: 500,
      });
      setRateLimits(data);
    } catch (error) {
      console.error('Error loading rate limits:', error);
      toast({
        title: 'Error',
        description: 'Failed to load rate limits',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [columnFilters.blocked, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter and sort rate limits
  const filteredAndSortedRateLimits = useMemo(() => {
    let filtered = [...rateLimits];

    // App name filter
    if (columnFilters.appName) {
      const query = columnFilters.appName.toLowerCase();
      filtered = filtered.filter(
        (limit) =>
          limit.app_name?.toLowerCase().includes(query) || limit.app_slug?.toLowerCase().includes(query)
      );
    }

    // Identifier filter
    if (columnFilters.identifier) {
      const query = columnFilters.identifier.toLowerCase();
      filtered = filtered.filter(
        (limit) =>
          limit.user_id?.toLowerCase().includes(query) ||
          limit.ip_address?.toLowerCase().includes(query) ||
          limit.fingerprint?.toLowerCase().includes(query)
      );
    }

    // Identifier type filter
    if (columnFilters.identifierType !== 'all') {
      filtered = filtered.filter((limit) => {
        switch (columnFilters.identifierType) {
          case 'user':
            return !!limit.user_id;
          case 'ip':
            return !!limit.ip_address && !limit.user_id;
          case 'fingerprint':
            return !!limit.fingerprint && !limit.user_id && !limit.ip_address;
          default:
            return true;
        }
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'app_name':
          aVal = a.app_name?.toLowerCase() || '';
          bVal = b.app_name?.toLowerCase() || '';
          break;
        case 'execution_count':
          aVal = a.execution_count || 0;
          bVal = b.execution_count || 0;
          break;
        case 'first_execution_at':
          aVal = new Date(a.first_execution_at).getTime();
          bVal = new Date(b.first_execution_at).getTime();
          break;
        case 'last_execution_at':
          aVal = new Date(a.last_execution_at).getTime();
          bVal = new Date(b.last_execution_at).getTime();
          break;
        case 'window_start_at':
          aVal = new Date(a.window_start_at).getTime();
          bVal = new Date(b.window_start_at).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [rateLimits, columnFilters, sortField, sortDirection]);

  // Stats
  const stats = useMemo(() => {
    const blocked = rateLimits.filter((limit) => limit.is_blocked).length;
    const active = rateLimits.filter((limit) => !limit.is_blocked).length;
    const users = rateLimits.filter((limit) => limit.user_id).length;
    const ips = rateLimits.filter((limit) => limit.ip_address && !limit.user_id).length;

    return { total: rateLimits.length, blocked, active, users, ips };
  }, [rateLimits]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper functions for filter management
  const updateTextFilter = (field: 'appName' | 'identifier', value: string) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
  };

  const updateDropdownFilter = (field: 'identifierType' | 'blocked', value: any) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearAllFilters = () => {
    setColumnFilters({
      appName: '',
      identifier: '',
      identifierType: 'all',
      blocked: 'blocked',
    });
  };

  const hasActiveFilters =
    columnFilters.appName ||
    columnFilters.identifier ||
    columnFilters.identifierType !== 'all' ||
    columnFilters.blocked !== 'blocked';

  const handleUnblock = async (limit: PromptAppRateLimit) => {
    if (!confirm(`Unblock this ${limit.user_id ? 'user' : limit.ip_address ? 'IP' : 'fingerprint'}?`))
      return;

    try {
      await unblockRateLimit(limit.id);
      loadData();
      toast({
        title: 'Success',
        description: 'Rate limit unblocked successfully',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error unblocking rate limit:', error);
      toast({
        title: 'Error',
        description: 'Failed to unblock rate limit',
        variant: 'destructive',
      });
    }
  };

  const getIdentifierDisplay = (limit: PromptAppRateLimit) => {
    if (limit.user_id) {
      return (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-purple-600" />
          <span className="text-sm">{limit.user_id}</span>
          <Badge variant="outline" className="text-xs">
            User
          </Badge>
        </div>
      );
    } else if (limit.ip_address) {
      return (
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-600" />
          <span className="text-sm">{limit.ip_address}</span>
          <Badge variant="outline" className="text-xs">
            IP
          </Badge>
        </div>
      );
    } else if (limit.fingerprint) {
      return (
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-600" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-mono">{limit.fingerprint.substring(0, 12)}...</span>
            </TooltipTrigger>
            <TooltipContent>
              <code className="text-xs">{limit.fingerprint}</code>
            </TooltipContent>
          </Tooltip>
          <Badge variant="outline" className="text-xs">
            Fingerprint
          </Badge>
        </div>
      );
    }
    return <span className="text-sm text-muted-foreground">Unknown</span>;
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
              <h2 className="text-2xl pl-2 font-bold">Rate Limits Management</h2>
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
                <div className="text-xs text-muted-foreground">Total Limits</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-red-600">{stats.blocked}</div>
                <div className="text-xs text-muted-foreground">Blocked</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                <div className="text-xs text-muted-foreground">Active</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-purple-600">{stats.users}</div>
                <div className="text-xs text-muted-foreground">User Limits</div>
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
              {columnFilters.appName && <Badge variant="secondary">App: {columnFilters.appName}</Badge>}
              {columnFilters.identifier && (
                <Badge variant="secondary">Identifier: {columnFilters.identifier}</Badge>
              )}
              {columnFilters.identifierType !== 'all' && (
                <Badge variant="secondary">Type: {columnFilters.identifierType}</Badge>
              )}
              {columnFilters.blocked !== 'blocked' && (
                <Badge variant="secondary">Status: {columnFilters.blocked}</Badge>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 pr-4">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {/* Blocked Status Column */}
                <TableHead className="min-w-[100px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Status</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-full justify-between text-xs">
                          <span className="truncate">
                            {columnFilters.blocked === 'all'
                              ? 'All'
                              : columnFilters.blocked === 'blocked'
                              ? 'Blocked'
                              : 'Active'}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.blocked === 'all'}
                          onCheckedChange={() => updateDropdownFilter('blocked', 'all')}
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.blocked === 'blocked'}
                          onCheckedChange={() => updateDropdownFilter('blocked', 'blocked')}
                        >
                          Blocked Only
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.blocked === 'not-blocked'}
                          onCheckedChange={() => updateDropdownFilter('blocked', 'not-blocked')}
                        >
                          Active Only
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>

                {/* App Name Column - Text filter + Sort */}
                <TableHead className="min-w-[180px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('app_name')}
                    >
                      <span className="font-semibold">App</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="app_name" />
                    </div>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.appName}
                      onChange={(e) => updateTextFilter('appName', e.target.value)}
                      className="h-7 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </TableHead>

                {/* Identifier Column - Text filter */}
                <TableHead className="min-w-[280px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Identifier</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-5 px-2">
                            <Filter className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-40">
                          <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            checked={columnFilters.identifierType === 'all'}
                            onCheckedChange={() => updateDropdownFilter('identifierType', 'all')}
                          >
                            All Types
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={columnFilters.identifierType === 'user'}
                            onCheckedChange={() => updateDropdownFilter('identifierType', 'user')}
                          >
                            Users Only
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={columnFilters.identifierType === 'ip'}
                            onCheckedChange={() => updateDropdownFilter('identifierType', 'ip')}
                          >
                            IPs Only
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={columnFilters.identifierType === 'fingerprint'}
                            onCheckedChange={() => updateDropdownFilter('identifierType', 'fingerprint')}
                          >
                            Fingerprints Only
                          </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.identifier}
                      onChange={(e) => updateTextFilter('identifier', e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </TableHead>

                {/* Execution Count Column - Sort */}
                <TableHead className="min-w-[120px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('execution_count')}
                    >
                      <span className="font-semibold">Executions</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="execution_count" />
                    </div>
                    <div className="h-7" />
                  </div>
                </TableHead>

                {/* First Execution Column - Sort */}
                <TableHead className="min-w-[160px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('first_execution_at')}
                    >
                      <span className="font-semibold">First Execution</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="first_execution_at" />
                    </div>
                    <div className="h-7" />
                  </div>
                </TableHead>

                {/* Last Execution Column - Sort */}
                <TableHead className="min-w-[160px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('last_execution_at')}
                    >
                      <span className="font-semibold">Last Execution</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="last_execution_at" />
                    </div>
                    <div className="h-7" />
                  </div>
                </TableHead>

                {/* Actions Column */}
                <TableHead className="text-right min-w-[120px] pr-4">
                  <div className="space-y-1">
                    <span className="font-semibold">Actions</span>
                    <div className="h-7" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedRateLimits.map((limit) => (
                <TableRow key={limit.id}>
                  <TableCell>
                    {limit.is_blocked ? (
                      <Badge variant="destructive">
                        <ShieldOff className="w-3 h-3 mr-1" />
                        Blocked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <Shield className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{limit.app_name}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={`/p/${limit.app_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>View app</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>{getIdentifierDisplay(limit)}</TableCell>
                  <TableCell className="text-right">{limit.execution_count}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {new Date(limit.first_execution_at).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {new Date(limit.last_execution_at).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {limit.is_blocked ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => handleUnblock(limit)} className="h-7">
                            <Shield className="w-3 h-3 mr-1" />
                            Unblock
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {limit.blocked_until && (
                            <div>Until: {new Date(limit.blocked_until).toLocaleString()}</div>
                          )}
                          {limit.blocked_reason && <div>Reason: {limit.blocked_reason}</div>}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredAndSortedRateLimits.length === 0 && (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No rate limits found</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
