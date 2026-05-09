'use client';

import { ReactNode } from 'react';
import { RotateCcw, Search, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { HierarchyFilterPill, type FilterOption } from './HierarchyFilterPill';
import type { UseHierarchyFilterReturn } from './types';

interface HierarchyFilterProps {
  filter: UseHierarchyFilterReturn;
  className?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onNewClick?: () => void;
  newLabel?: string;
  onNewOrg?: () => void;
  onNewProject?: () => void;
  trailing?: ReactNode;
}

export function HierarchyFilter({
  filter,
  className,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  onNewClick,
  newLabel = 'New',
  onNewOrg,
  onNewProject,
  trailing,
}: HierarchyFilterProps) {
  const {
    isLoading,
    selectedOrgId,
    selectedProjectId,
    filteredOrgs,
    filteredProjects,
    selectOrg,
    selectProject,
    resetAll,
  } = filter;

  const hasSelection = selectedOrgId || selectedProjectId;
  const showSearch = onSearchChange !== undefined;

  if (isLoading && !filter.data) {
    return (
      <div className={cn('flex items-center gap-1.5 p-1 rounded-full matrx-glass-thin-border', className)}>
        <Skeleton className="h-6 w-[100px] rounded-full" />
        <Skeleton className="h-6 w-[90px] rounded-full" />
        {showSearch && <Skeleton className="h-6 flex-1 min-w-[120px] rounded-full" />}
      </div>
    );
  }

  const orgOptions: FilterOption[] = filteredOrgs.map(org => ({
    id: org.id,
    label: org.name,
    sublabel: org.is_personal ? 'Personal' : undefined,
    count: org.project_count,
  }));

  const projectOptions: FilterOption[] = filteredProjects.map(project => ({
    id: project.id,
    label: project.name,
    sublabel: project.is_personal ? 'Personal' : undefined,
    count: project.topic_count,
  }));

  return (
    <div className={cn(
      'flex items-center gap-1.5 p-1 rounded-full matrx-glass-thin-border',
      className,
    )}>
      <HierarchyFilterPill
        label="Org"
        allLabel="All Orgs"
        options={orgOptions}
        selectedId={selectedOrgId}
        onSelect={selectOrg}
        onNew={onNewOrg}
        newLabel="New Organization"
        loading={isLoading}
      />

      <span className="text-muted-foreground/30 text-[10px] select-none">/</span>

      <HierarchyFilterPill
        label="Project"
        allLabel="All Projects"
        options={projectOptions}
        selectedId={selectedProjectId}
        onSelect={selectProject}
        onNew={onNewProject}
        newLabel="New Project"
        loading={isLoading}
      />

      {hasSelection && (
        <button
          onClick={resetAll}
          className="inline-flex items-center justify-center h-5 w-5 rounded-full matrx-glass-card text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Reset filters"
        >
          <RotateCcw className="h-2.5 w-2.5" />
        </button>
      )}

      {showSearch && (
        <>
          <div className="w-px h-4 bg-border/30 mx-0.5" />
          <div className="flex-1 flex items-center gap-1.5 min-w-0 h-6 px-2 rounded-full matrx-glass-card">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-muted-foreground"
              style={{ fontSize: '16px' }}
            />
            {searchValue && (
              <button
                onClick={() => onSearchChange?.('')}
                className="shrink-0 p-0.5 rounded-full hover:bg-muted/50 transition-colors"
              >
                <X className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </>
      )}

      {trailing}

      {onNewClick && (
        <button
          onClick={onNewClick}
          className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">{newLabel}</span>
        </button>
      )}
    </div>
  );
}
