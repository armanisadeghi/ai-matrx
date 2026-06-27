'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Layers,
  Tag,
  Clock,
  ArrowUpAZ,
  ArrowDownAZ,
  CalendarClock,
  Share2,
  X,
  Check,
} from 'lucide-react';
import type { Note } from '@/features/notes/types';

export interface NotesFilterState {
  folder: string;        // 'all' or folder name
  tags: string[];        // selected tag filters (AND logic)
  sortField: 'updated_at' | 'created_at' | 'label';
  sortOrder: 'asc' | 'desc';
  sharedOnly: boolean;
}

export const DEFAULT_FILTER_STATE: NotesFilterState = {
  folder: 'all',
  tags: [],
  sortField: 'updated_at',
  sortOrder: 'desc',
  sharedOnly: false,
};

interface NotesFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  filters: NotesFilterState;
  filteredCount: number;
  onApply: (filters: NotesFilterState) => void;
}

const SORT_OPTIONS: { field: NotesFilterState['sortField']; order: NotesFilterState['sortOrder']; label: string; icon: React.ReactNode }[] = [
  { field: 'updated_at', order: 'desc', label: 'Recently Edited', icon: <Clock size={14} /> },
  { field: 'created_at', order: 'desc', label: 'Newest First',    icon: <CalendarClock size={14} /> },
  { field: 'created_at', order: 'asc',  label: 'Oldest First',    icon: <CalendarClock size={14} /> },
  { field: 'label',      order: 'asc',  label: 'Title A→Z',       icon: <ArrowUpAZ size={14} /> },
  { field: 'label',      order: 'desc', label: 'Title Z→A',       icon: <ArrowDownAZ size={14} /> },
];

export default function NotesFilterSheet({
  isOpen,
  onClose,
  notes,
  filters,
  filteredCount,
  onApply,
}: NotesFilterSheetProps) {
  const [local, setLocal] = useState<NotesFilterState>(filters);

  // Sync incoming filters when sheet opens
  useEffect(() => {
    if (isOpen) setLocal(filters);
  }, [isOpen, filters]);

  // Derived folder list
  const folders = React.useMemo(() => {
    const s = new Set<string>();
    notes.forEach(n => s.add(n.folder_name || 'Draft'));
    return Array.from(s).sort();
  }, [notes]);

  // Derived tag list (all unique tags across notes)
  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    notes.forEach(n => n.tags?.forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [notes]);

  // Canonical sharing lives in the `permissions` table, not on the note row
  // (the legacy `shared_with` column has been dropped). The in-memory notes
  // list carries no permission data, so there is nothing to detect here yet —
  // keeps the "(sharing coming soon)" hint, matching prior behavior.
  const hasShared = false;

  const isDefaultState =
    local.folder === 'all' &&
    local.tags.length === 0 &&
    local.sortField === 'updated_at' &&
    local.sortOrder === 'desc' &&
    !local.sharedOnly;

  const toggleTag = (tag: string) => {
    setLocal(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const handleApply = () => {
    onApply(local);
    onClose();
  };

  const handleReset = () => {
    setLocal(DEFAULT_FILTER_STATE);
    onApply(DEFAULT_FILTER_STATE);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col max-h-[85dvh] rounded-t-2xl bg-background/95 backdrop-blur-xl border-t border-border/40 shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border/60" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1 flex-shrink-0">
          <span className="text-base font-semibold text-foreground">Filter &amp; Sort</span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">

          {/* ── SORT ── */}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Sort</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {SORT_OPTIONS.map(opt => {
              const active = local.sortField === opt.field && local.sortOrder === opt.order;
              return (
                <button
                  key={`${opt.field}-${opt.order}`}
                  onClick={() => setLocal(prev => ({ ...prev, sortField: opt.field, sortOrder: opt.order }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* ── FOLDERS ── */}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Folder</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {/* All chip */}
            <button
              onClick={() => setLocal(prev => ({ ...prev, folder: 'all' }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                local.folder === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Layers size={13} />
              All Notes
            </button>

            {folders.map(folder => {
              const active = local.folder === folder;
              return (
                <button
                  key={folder}
                  onClick={() => setLocal(prev => ({ ...prev, folder }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <FolderOpen size={13} />
                  {folder}
                </button>
              );
            })}
          </div>

          {/* ── TAGS ── */}
          {allTags.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Tags</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {allTags.map(tag => {
                  const active = local.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        active
                          ? 'bg-secondary text-secondary-foreground shadow-sm'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Tag size={12} />
                      {tag}
                      {active && <Check size={11} className="ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ── SHARING ── */}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Sharing</p>
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setLocal(prev => ({ ...prev, sharedOnly: !prev.sharedOnly }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                local.sharedOnly
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Share2 size={13} />
              Shared notes only
              {local.sharedOnly && <Check size={11} className="ml-0.5" />}
            </button>
            {!hasShared && (
              <span className="text-[10px] text-muted-foreground self-center pl-1">
                (sharing coming soon)
              </span>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 pt-3 pb-safe border-t border-border/30 flex items-center gap-3">
          {/* Live count */}
          <div className="flex-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredCount}</span> note{filteredCount !== 1 ? 's' : ''}
          </div>

          {!isDefaultState && (
            <button
              onClick={handleReset}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground bg-muted/60 hover:bg-muted transition-colors"
            >
              Reset
            </button>
          )}

          <button
            onClick={handleApply}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
