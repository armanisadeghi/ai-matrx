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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  ExternalLink,
  RefreshCw,
  Filter,
  X,
  ArrowUpDown,
  Eye,
} from 'lucide-react';
import MatrxMiniLoader from '@/components/loaders/MatrxMiniLoader';
import {
  fetchErrors,
  resolveError,
  unresolveError,
  PromptAppError,
} from '@/lib/services/prompt-apps-admin-service';

type SortField = 'error_type' | 'app_name' | 'created_at' | 'resolved';
type SortDirection = 'asc' | 'desc';

interface ColumnFilters {
  errorType: Set<string>;
  appName: string;
  errorMessage: string;
  resolved: 'all' | 'resolved' | 'unresolved';
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  missing_variable: 'Missing Variable',
  extra_variable: 'Extra Variable',
  invalid_variable_type: 'Invalid Variable Type',
  component_render_error: 'Component Render Error',
  api_error: 'API Error',
  rate_limit: 'Rate Limit',
  other: 'Other',
};

export function ErrorsAdmin() {
  const [errors, setErrors] = useState<PromptAppError[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedError, setSelectedError] = useState<PromptAppError | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const { toast } = useToast();

  // Column filters
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    errorType: new Set<string>(),
    appName: '',
    errorMessage: '',
    resolved: 'unresolved',
  });

  // Get unique values for dropdown filters
  const uniqueValues = useMemo(() => {
    const errorTypes = new Set<string>();

    errors.forEach((error) => {
      if (error.error_type) errorTypes.add(error.error_type);
    });

    return {
      errorTypes: Array.from(errorTypes).sort(),
    };
  }, [errors]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const resolvedValue =
        columnFilters.resolved === 'all' ? undefined : columnFilters.resolved === 'resolved';
      const data = await fetchErrors({
        resolved: resolvedValue,
        limit: 500,
      });
      setErrors(data);
    } catch (error) {
      console.error('Error loading errors:', error);
      toast({
        title: 'Error',
        description: 'Failed to load errors',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [columnFilters.resolved, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter and sort errors
  const filteredAndSortedErrors = useMemo(() => {
    let filtered = [...errors];

    // Error type filter
    if (columnFilters.errorType.size > 0) {
      filtered = filtered.filter((error) => error.error_type && columnFilters.errorType.has(error.error_type));
    }

    // App name filter
    if (columnFilters.appName) {
      const query = columnFilters.appName.toLowerCase();
      filtered = filtered.filter((error) => error.app_name?.toLowerCase().includes(query) || error.app_slug?.toLowerCase().includes(query));
    }

    // Error message filter
    if (columnFilters.errorMessage) {
      const query = columnFilters.errorMessage.toLowerCase();
      filtered = filtered.filter((error) => error.error_message?.toLowerCase().includes(query));
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'error_type':
          aVal = a.error_type || '';
          bVal = b.error_type || '';
          break;
        case 'app_name':
          aVal = a.app_name?.toLowerCase() || '';
          bVal = b.app_name?.toLowerCase() || '';
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'resolved':
          aVal = a.resolved ? 1 : 0;
          bVal = b.resolved ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [errors, columnFilters, sortField, sortDirection]);

  // Stats
  const stats = useMemo(() => {
    const resolved = errors.filter((error) => error.resolved).length;
    const unresolved = errors.filter((error) => !error.resolved).length;
    const critical = errors.filter((error) => ['component_render_error', 'api_error'].includes(error.error_type)).length;

    return { total: errors.length, resolved, unresolved, critical };
  }, [errors]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper functions for filter management
  const updateTextFilter = (field: 'appName' | 'errorMessage', value: string) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
  };

  const toggleSetFilter = <T extends string>(field: 'errorType', value: T) => {
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

  const updateDropdownFilter = (field: 'resolved', value: any) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearAllFilters = () => {
    setColumnFilters({
      errorType: new Set<string>(),
      appName: '',
      errorMessage: '',
      resolved: 'unresolved',
    });
  };

  const hasActiveFilters =
    columnFilters.errorType.size > 0 ||
    columnFilters.appName ||
    columnFilters.errorMessage ||
    columnFilters.resolved !== 'unresolved';

  const handleViewError = (error: PromptAppError) => {
    setSelectedError(error);
    setResolutionNotes(error.resolution_notes || '');
    setIsDetailDialogOpen(true);
  };

  const handleResolveError = async () => {
    if (!selectedError) return;

    try {
      await resolveError({
        id: selectedError.id,
        resolution_notes: resolutionNotes,
      });
      setIsDetailDialogOpen(false);
      loadData();
      toast({
        title: 'Success',
        description: 'Error marked as resolved',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error resolving error:', error);
      toast({
        title: 'Error',
        description: 'Failed to resolve error',
        variant: 'destructive',
      });
    }
  };

  const handleUnresolveError = async () => {
    if (!selectedError) return;

    try {
      await unresolveError(selectedError.id);
      setIsDetailDialogOpen(false);
      loadData();
      toast({
        title: 'Success',
        description: 'Error marked as unresolved',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error unresolving error:', error);
      toast({
        title: 'Error',
        description: 'Failed to unresolve error',
        variant: 'destructive',
      });
    }
  };

  const getErrorTypeBadge = (errorType: string) => {
    const variants: Record<string, any> = {
      missing_variable: 'destructive',
      extra_variable: 'outline',
      invalid_variable_type: 'destructive',
      component_render_error: 'destructive',
      api_error: 'destructive',
      rate_limit: 'secondary',
      other: 'outline',
    };
    return (
      <Badge variant={variants[errorType] || 'outline'} className="text-xs">
        {ERROR_TYPE_LABELS[errorType] || errorType}
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
              <h2 className="text-2xl pl-2 font-bold">Error Management</h2>
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
                <div className="text-xs text-muted-foreground">Total Errors</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-red-600">{stats.unresolved}</div>
                <div className="text-xs text-muted-foreground">Unresolved</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
                <div className="text-xs text-muted-foreground">Resolved</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-2xl font-bold text-orange-600">{stats.critical}</div>
                <div className="text-xs text-muted-foreground">Critical</div>
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
              {columnFilters.errorType.size > 0 && (
                <Badge variant="secondary">Error Type ({columnFilters.errorType.size})</Badge>
              )}
              {columnFilters.appName && <Badge variant="secondary">App: {columnFilters.appName}</Badge>}
              {columnFilters.errorMessage && <Badge variant="secondary">Message: {columnFilters.errorMessage}</Badge>}
              {columnFilters.resolved !== 'unresolved' && (
                <Badge variant="secondary">Status: {columnFilters.resolved}</Badge>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 pr-4">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {/* Resolved Status Column */}
                <TableHead className="min-w-[100px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('resolved')}
                    >
                      <span className="font-semibold">Status</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="resolved" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-full justify-between text-xs">
                          <span className="truncate">
                            {columnFilters.resolved === 'all'
                              ? 'All'
                              : columnFilters.resolved === 'resolved'
                              ? 'Resolved'
                              : 'Unresolved'}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.resolved === 'all'}
                          onCheckedChange={() => updateDropdownFilter('resolved', 'all')}
                        >
                          All
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.resolved === 'unresolved'}
                          onCheckedChange={() => updateDropdownFilter('resolved', 'unresolved')}
                        >
                          Unresolved Only
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                          checked={columnFilters.resolved === 'resolved'}
                          onCheckedChange={() => updateDropdownFilter('resolved', 'resolved')}
                        >
                          Resolved Only
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>

                {/* Error Type Column - Dropdown filter + Sort */}
                <TableHead className="min-w-[170px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span
                        className="font-semibold cursor-pointer hover:text-primary"
                        onClick={() => handleSort('error_type')}
                      >
                        Error Type
                      </span>
                      <ArrowUpDown className="h-3 w-3 cursor-pointer" onClick={() => handleSort('error_type')} />
                      <SortIcon field="error_type" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-full justify-between text-xs">
                          <span className="truncate">
                            {columnFilters.errorType.size > 0 ? `${columnFilters.errorType.size} selected` : 'All'}
                          </span>
                          <Filter className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel className="flex items-center justify-between">
                          <span>Filter by Type</span>
                          {columnFilters.errorType.size > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setColumnFilters((prev) => ({ ...prev, errorType: new Set() }))}
                              className="h-5 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
                            >
                              Clear
                            </Button>
                          )}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {uniqueValues.errorTypes.map((type) => (
                          <DropdownMenuCheckboxItem
                            key={type}
                            checked={columnFilters.errorType.has(type)}
                            onCheckedChange={() => toggleSetFilter('errorType', type)}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {ERROR_TYPE_LABELS[type] || type}
                          </DropdownMenuCheckboxItem>
                        ))}
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

                {/* Error Message Column - Text filter */}
                <TableHead className="min-w-[300px]">
                  <div className="space-y-1">
                    <span className="font-semibold">Error Message</span>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters.errorMessage}
                      onChange={(e) => updateTextFilter('errorMessage', e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </TableHead>

                {/* Created At Column - Sort */}
                <TableHead className="min-w-[160px]">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => handleSort('created_at')}
                    >
                      <span className="font-semibold">Created</span>
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="created_at" />
                    </div>
                    <div className="h-7" />
                  </div>
                </TableHead>

                {/* Actions Column */}
                <TableHead className="text-right min-w-[100px] pr-4">
                  <div className="space-y-1">
                    <span className="font-semibold">Actions</span>
                    <div className="h-7" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedErrors.map((error) => (
                <TableRow key={error.id} className="cursor-pointer" onClick={() => handleViewError(error)}>
                  <TableCell>
                    {error.resolved ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Resolved
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {error.resolved_at ? new Date(error.resolved_at).toLocaleString() : 'Resolved'}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Unresolved
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{getErrorTypeBadge(error.error_type)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{error.app_name}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={`/p/${error.app_slug}`}
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-sm truncate max-w-md">{error.error_message || 'No error message'}</p>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <p>{error.error_message || 'No error message'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{new Date(error.created_at).toLocaleString()}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewError(error);
                      }}
                      className="h-7"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredAndSortedErrors.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No errors found</p>
            </div>
          )}
        </ScrollArea>

        {/* Error Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedError?.resolved ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                Error Details
              </DialogTitle>
              <DialogDescription>
                View and manage error information
              </DialogDescription>
            </DialogHeader>

            {selectedError && (
              <div className="space-y-4">
                <div>
                  <Label>Error Type</Label>
                  <div className="mt-1">{getErrorTypeBadge(selectedError.error_type)}</div>
                </div>

                <div>
                  <Label>Message</Label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {selectedError.error_message || 'No error message'}
                  </p>
                </div>

                {selectedError.error_code && (
                  <div>
                    <Label>Error Code</Label>
                    <code className="block mt-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                      {selectedError.error_code}
                    </code>
                  </div>
                )}

                <div>
                  <Label>App</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm">{selectedError.app_name}</span>
                    <a
                      href={`/p/${selectedError.app_slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div>
                  <Label>Variables Sent</Label>
                  <pre className="mt-1 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
                    {JSON.stringify(selectedError.variables_sent, null, 2)}
                  </pre>
                </div>

                <div>
                  <Label>Expected Variables</Label>
                  <pre className="mt-1 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
                    {JSON.stringify(selectedError.expected_variables, null, 2)}
                  </pre>
                </div>

                {Object.keys(selectedError.error_details || {}).length > 0 && (
                  <div>
                    <Label>Error Details</Label>
                    <pre className="mt-1 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
                      {JSON.stringify(selectedError.error_details, null, 2)}
                    </pre>
                  </div>
                )}

                <div>
                  <Label>Created At</Label>
                  <p className="mt-1 text-sm">{new Date(selectedError.created_at).toLocaleString()}</p>
                </div>

                {selectedError.resolved && (
                  <>
                    <div>
                      <Label>Resolved At</Label>
                      <p className="mt-1 text-sm">
                        {selectedError.resolved_at ? new Date(selectedError.resolved_at).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                    {selectedError.resolution_notes && (
                      <div>
                        <Label>Resolution Notes</Label>
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {selectedError.resolution_notes}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {!selectedError.resolved && (
                  <div>
                    <Label htmlFor="resolution-notes">Resolution Notes</Label>
                    <Textarea
                      id="resolution-notes"
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Add notes about how this error was resolved..."
                      rows={4}
                      className="mt-1"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                    Close
                  </Button>
                  {selectedError.resolved ? (
                    <Button variant="outline" onClick={handleUnresolveError}>
                      <XCircle className="w-4 h-4 mr-1" />
                      Mark as Unresolved
                    </Button>
                  ) : (
                    <Button onClick={handleResolveError}>
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Mark as Resolved
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
