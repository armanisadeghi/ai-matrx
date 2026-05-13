'use client'

import Link from 'next/link';
import { TableIcon, Edit2, Trash2, Eye, MoreVertical, Loader2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ShareButton } from '@/features/sharing';

interface TableListItemProps {
  id: string;
  table_name: string;
  description?: string;
  row_count: number;
  field_count: number;
  updated_at: string;
  is_public: boolean;
  isOwned: boolean;
  onNavigate: (id: string, e?: React.MouseEvent) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  isNavigating?: boolean;
  isAnyNavigating?: boolean;
}

export function TableListItem({
  id,
  table_name,
  description,
  row_count,
  field_count,
  updated_at,
  is_public,
  isOwned,
  onNavigate,
  onEdit,
  onDelete,
  isNavigating,
  isAnyNavigating
}: TableListItemProps) {
  const isDisabled = isNavigating || isAnyNavigating;

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d');
    } catch {
      return '';
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (!isDisabled) {
      onNavigate(id, e);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit && isOwned) {
      onEdit(id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && isOwned) {
      onDelete(id);
    }
  };

  return (
    <Link
      href={`/data/${id}`}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 border rounded-lg transition-all relative",
        isOwned 
          ? "border-border bg-card hover:bg-accent/50 hover:border-primary/30" 
          : "border-purple-200 dark:border-purple-800 bg-card hover:bg-purple-50/50 dark:hover:bg-purple-900/20 border-l-4 border-l-purple-400 dark:border-l-purple-600",
        !isDisabled && "cursor-pointer hover:shadow-sm",
        isDisabled && "opacity-50 cursor-not-allowed"
      )}
      onClick={handleClick}
    >
      {/* Loading Overlay */}
      {isNavigating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        </div>
      )}

      {/* Icon */}
      <div className="flex-shrink-0">
        <div className={cn(
          "w-8 h-8 rounded-md flex items-center justify-center",
          isOwned ? "bg-blue-100 dark:bg-blue-900/30" : "bg-purple-100 dark:bg-purple-900/30"
        )}>
          <TableIcon className={cn(
            "w-4 h-4",
            isOwned ? "text-blue-600 dark:text-blue-400" : "text-purple-600 dark:text-purple-400"
          )} />
        </div>
      </div>

      {/* Name and metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground truncate">
            {table_name}
          </h4>
          {!isOwned && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex-shrink-0">
              Shared
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{row_count} rows</span>
          <span>•</span>
          <span>{field_count} fields</span>
          {updated_at && (
            <>
              <span>•</span>
              <span>{formatDate(updated_at)}</span>
            </>
          )}
        </div>
      </div>

      {/* Visibility badge */}
      <div className="flex-shrink-0 hidden sm:block">
        {is_public && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            Public
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {isOwned && (
          <ShareButton
            resourceType="udt_datasets"
            resourceId={id}
            resourceName={table_name}
            isOwner={true}
            variant="ghost"
            size="icon"
            showStatus={false}
          />
        )}
        {isOwned ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0"
                disabled={isDisabled}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={(e) => {
                if (e.metaKey || e.ctrlKey) { window.open(`/data/${id}`, '_blank'); return; }
                onNavigate(id);
              }} disabled={isDisabled}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEdit} disabled={isDisabled}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleDelete} 
                disabled={isDisabled}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0"
            disabled={isDisabled}
            title="View only"
          >
            <Eye className="h-4 w-4 text-purple-500" />
          </Button>
        )}
      </div>
    </Link>
  );
}
