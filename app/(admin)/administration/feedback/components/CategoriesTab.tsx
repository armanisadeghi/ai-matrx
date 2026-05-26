'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getAllFeedback } from '@/actions/feedback.actions';
import {
    FeedbackCategory,
    UserFeedback,
    FeedbackStatus,
    FeedbackType,
    CATEGORY_COLORS,
    ADMIN_STATUS_LABELS,
    FEEDBACK_STATUS_COLORS,
} from '@/types/feedback.types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    AlertCircle,
    Rainbow,
    Lightbulb,
    HelpCircle,
    Loader2,
    Plus,
    Pencil,
    Trash2,
    Tag,
    GripVertical,
    Check,
    X,
    ChevronDown,
    ChevronRight,
    LayoutGrid,
    Settings2,
    Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import FeedbackDetailDialog from './FeedbackDetailDialog';

const COLOR_OPTIONS = Object.keys(CATEGORY_COLORS) as (keyof typeof CATEGORY_COLORS)[];

function generateSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

interface EditingCategory {
    id: string | null;
    name: string;
    slug: string;
    description: string;
    color: string;
}

const EMPTY_EDIT: EditingCategory = { id: null, name: '', slug: '', description: '', color: 'gray' };

const feedbackTypeIcons: Record<FeedbackType, React.ReactNode> = {
    bug: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
    feature: <Rainbow className="w-3.5 h-3.5 text-purple-500" />,
    suggestion: <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />,
    other: <HelpCircle className="w-3.5 h-3.5 text-gray-500" />,
};

const STATUS_OPTIONS: { value: FeedbackStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'new', label: 'New' },
    { value: 'triaged', label: 'Triaged' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'awaiting_review', label: 'Ready for Testing' },
    { value: 'user_review', label: 'User Review' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
    { value: 'wont_fix', label: "Won't Fix" },
    { value: 'deferred', label: 'Deferred' },
];

const TYPE_OPTIONS: { value: FeedbackType | 'all'; label: string }[] = [
    { value: 'all', label: 'All Types' },
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
    { value: 'suggestion', label: 'Suggestion' },
    { value: 'other', label: 'Other' },
];

export default function CategoriesTab() {
    const [categories, setCategories] = useState<FeedbackCategory[]>([]);
    const [allFeedback, setAllFeedback] = useState<UserFeedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<EditingCategory | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<FeedbackCategory | null>(null);
    const [activeView, setActiveView] = useState<'grouped' | 'manage'>('grouped');

    // Grouped view filters
    const [filterStatus, setFilterStatus] = useState<FeedbackStatus | 'all'>('all');
    const [filterType, setFilterType] = useState<FeedbackType | 'all'>('all');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    // Detail dialog
    const [selectedFeedback, setSelectedFeedback] = useState<UserFeedback | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [catRes, feedbackResult] = await Promise.all([
                fetch('/api/admin/feedback/categories').then(r => r.json()),
                getAllFeedback(),
            ]);
            const cats: FeedbackCategory[] = catRes.categories ?? [];
            setCategories(cats);
            // Auto-expand all categories on first load
            setExpandedCategories(new Set(cats.map((c: FeedbackCategory) => c.id).concat(['uncategorized'])));
            if (feedbackResult.success && feedbackResult.data) {
                setAllFeedback(feedbackResult.data);
            }
        } catch {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSave = async () => {
        if (!editing) return;
        if (!editing.name.trim()) {
            toast.error('Name is required');
            return;
        }
        setSaving(true);
        try {
            const isNew = editing.id === null;
            const url = isNew
                ? '/api/admin/feedback/categories'
                : `/api/admin/feedback/categories/${editing.id}`;
            const method = isNew ? 'POST' : 'PATCH';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editing.name.trim(),
                    slug: editing.slug || generateSlug(editing.name),
                    description: editing.description.trim() || null,
                    color: editing.color,
                    sort_order: isNew ? categories.length : undefined,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Save failed');
            }
            toast.success(isNew ? 'Category created' : 'Category updated');
            setEditing(null);
            await loadData();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            const res = await fetch(`/api/admin/feedback/categories/${deleteTarget.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Delete failed');
            }
            toast.success('Category deleted');
            setDeleteTarget(null);
            await loadData();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        }
    };

    const handleToggleActive = async (cat: FeedbackCategory) => {
        try {
            const res = await fetch(`/api/admin/feedback/categories/${cat.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !cat.is_active }),
            });
            if (!res.ok) throw new Error('Update failed');
            await loadData();
        } catch {
            toast.error('Failed to update category');
        }
    };

    const toggleCategory = (id: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Filter and group feedback
    const filteredFeedback = useMemo(() => {
        return allFeedback.filter(item => {
            if (filterStatus !== 'all' && item.status !== filterStatus) return false;
            if (filterType !== 'all' && item.feedback_type !== filterType) return false;
            return true;
        });
    }, [allFeedback, filterStatus, filterType]);

    const groupedFeedback = useMemo(() => {
        const groups: { category: FeedbackCategory | null; key: string; items: UserFeedback[] }[] = [];

        // Build a group for each active category
        for (const cat of categories) {
            const items = filteredFeedback.filter(f => f.category_id === cat.id);
            groups.push({ category: cat, key: cat.id, items });
        }

        // Uncategorized group
        const uncategorized = filteredFeedback.filter(f => !f.category_id);
        groups.push({ category: null, key: 'uncategorized', items: uncategorized });

        return groups;
    }, [categories, filteredFeedback]);

    if (loading) {
        return (
            <Card className="p-8 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading...</p>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'grouped' | 'manage')}>
                <div className="flex items-center justify-between gap-4">
                    <TabsList>
                        <TabsTrigger value="grouped" className="gap-1.5 text-xs">
                            <LayoutGrid className="w-3.5 h-3.5" />
                            By Category
                        </TabsTrigger>
                        <TabsTrigger value="manage" className="gap-1.5 text-xs">
                            <Settings2 className="w-3.5 h-3.5" />
                            Manage Categories
                        </TabsTrigger>
                    </TabsList>
                    {activeView === 'manage' && (
                        <Button
                            size="sm"
                            className="gap-2"
                            onClick={() => setEditing({ ...EMPTY_EDIT })}
                            disabled={editing !== null}
                        >
                            <Plus className="w-4 h-4" />
                            New Category
                        </Button>
                    )}
                </div>

                {/* ── Grouped View ─────────────────────────────────── */}
                <TabsContent value="grouped" className="mt-4 space-y-3">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-2 items-center">
                        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FeedbackStatus | 'all')}>
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterType} onValueChange={(v) => setFilterType(v as FeedbackType | 'all')}>
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TYPE_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {(filterStatus !== 'all' || filterType !== 'all') && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => { setFilterStatus('all'); setFilterType('all'); }}
                            >
                                Clear filters
                            </Button>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                            {filteredFeedback.length} item{filteredFeedback.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Category groups */}
                    <div className="space-y-2">
                        {groupedFeedback.map(({ category, key, items }) => {
                            const colors = category
                                ? (CATEGORY_COLORS[category.color as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.gray)
                                : CATEGORY_COLORS.gray;
                            const isExpanded = expandedCategories.has(key);
                            const totalForCat = allFeedback.filter(f =>
                                category ? f.category_id === category.id : !f.category_id
                            ).length;

                            return (
                                <Card key={key} className="overflow-hidden">
                                    {/* Category header row */}
                                    <button
                                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
                                        onClick={() => toggleCategory(key)}
                                    >
                                        {isExpanded
                                            ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                            : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                        }
                                        {category ? (
                                            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-semibold flex-shrink-0', colors.bg, colors.text, colors.border)}>
                                                <span className={cn('w-2 h-2 rounded-full border', colors.border)} style={{ background: 'currentColor', opacity: 0.7 }} />
                                                {category.name}
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-muted-foreground flex-shrink-0">Uncategorized</span>
                                        )}
                                        {category?.description && (
                                            <span className="text-xs text-muted-foreground truncate hidden sm:block">{category.description}</span>
                                        )}
                                        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                                            <span className={cn(
                                                'text-[10px] font-medium px-1.5 py-0.5 rounded',
                                                items.length > 0
                                                    ? cn(colors.bg, colors.text)
                                                    : 'bg-muted text-muted-foreground'
                                            )}>
                                                {items.length}
                                                {filterStatus !== 'all' || filterType !== 'all'
                                                    ? ` / ${totalForCat}`
                                                    : ''
                                                }
                                            </span>
                                        </span>
                                    </button>

                                    {/* Feedback items */}
                                    {isExpanded && (
                                        <div className="border-t">
                                            {items.length === 0 ? (
                                                <div className="px-4 py-3 text-xs text-muted-foreground italic">
                                                    {filterStatus !== 'all' || filterType !== 'all'
                                                        ? 'No items match the current filters'
                                                        : 'No items in this category'}
                                                </div>
                                            ) : (
                                                <div className="divide-y">
                                                    {items.map(item => {
                                                        const statusColors = FEEDBACK_STATUS_COLORS[item.status];
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left group"
                                                                onClick={() => { setSelectedFeedback(item); setDetailOpen(true); }}
                                                            >
                                                                <span className="flex-shrink-0 mt-0.5">
                                                                    {feedbackTypeIcons[item.feedback_type]}
                                                                </span>
                                                                <span className="flex-1 min-w-0">
                                                                    <span className="block text-sm line-clamp-1 group-hover:text-foreground">
                                                                        {item.description}
                                                                    </span>
                                                                    <span className="flex items-center gap-2 mt-0.5">
                                                                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', statusColors.bg, statusColors.text)}>
                                                                            {ADMIN_STATUS_LABELS[item.status]}
                                                                        </span>
                                                                        {item.work_priority !== null && (
                                                                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                                                <Hash className="w-2.5 h-2.5" />
                                                                                {item.work_priority}
                                                                            </span>
                                                                        )}
                                                                        <span className="text-[10px] text-muted-foreground">
                                                                            {item.username || 'Anonymous'}
                                                                        </span>
                                                                        <span className="text-[10px] text-muted-foreground font-mono truncate hidden sm:block">
                                                                            {item.route}
                                                                        </span>
                                                                    </span>
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </TabsContent>

                {/* ── Manage View ───────────────────────────────────── */}
                <TabsContent value="manage" className="mt-4 space-y-3">
                    {/* New Category Form */}
                    {editing?.id === null && (
                        <CategoryForm
                            editing={editing}
                            onChange={setEditing}
                            onSave={handleSave}
                            onCancel={() => setEditing(null)}
                            saving={saving}
                            isNew
                        />
                    )}

                    {categories.length === 0 && !editing ? (
                        <Card className="p-10 text-center">
                            <Tag className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No categories yet</p>
                            <p className="text-xs text-muted-foreground mt-1">Create a category to organize your feedback</p>
                        </Card>
                    ) : (
                        <div className="space-y-2">
                            {categories.map((cat) => {
                                const colors = CATEGORY_COLORS[cat.color as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.gray;
                                const isEditingThis = editing?.id === cat.id;
                                const itemCount = allFeedback.filter(f => f.category_id === cat.id).length;

                                if (isEditingThis) {
                                    return (
                                        <CategoryForm
                                            key={cat.id}
                                            editing={editing!}
                                            onChange={setEditing}
                                            onSave={handleSave}
                                            onCancel={() => setEditing(null)}
                                            saving={saving}
                                            isNew={false}
                                        />
                                    );
                                }

                                return (
                                    <Card key={cat.id} className={cn('p-3 flex items-center gap-3', !cat.is_active && 'opacity-50')}>
                                        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 cursor-grab" />
                                        <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-semibold flex-shrink-0', colors.bg, colors.text, colors.border)}>
                                            <span className={cn('w-2 h-2 rounded-full border flex-shrink-0', colors.border)} style={{ background: 'currentColor', opacity: 0.7 }} />
                                            {cat.name}
                                        </span>
                                        {cat.description && (
                                            <span className="text-xs text-muted-foreground flex-1 truncate">{cat.description}</span>
                                        )}
                                        {!cat.description && <div className="flex-1" />}
                                        <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">{cat.slug}</span>
                                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{itemCount}</span>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs text-muted-foreground"
                                                onClick={() => handleToggleActive(cat)}
                                            >
                                                {cat.is_active ? 'Active' : 'Inactive'}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => setEditing({
                                                    id: cat.id,
                                                    name: cat.name,
                                                    slug: cat.slug,
                                                    description: cat.description ?? '',
                                                    color: cat.color,
                                                })}
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={() => setDeleteTarget(cat)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete category?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete <strong>{deleteTarget?.name}</strong>. This cannot be undone.
                            If any feedback items are assigned to this category, the delete will be blocked — you must reassign them first.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {selectedFeedback && (
                <FeedbackDetailDialog
                    feedback={selectedFeedback}
                    open={detailOpen}
                    onOpenChange={setDetailOpen}
                    onUpdate={loadData}
                />
            )}
        </div>
    );
}

function CategoryForm({
    editing,
    onChange,
    onSave,
    onCancel,
    saving,
    isNew,
}: {
    editing: EditingCategory;
    onChange: (v: EditingCategory) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
    isNew: boolean;
}) {
    const colors = CATEGORY_COLORS[editing.color as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.gray;

    return (
        <Card className="p-4 border-2 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold">{isNew ? 'New Category' : 'Edit Category'}</span>
                {editing.name && (
                    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium', colors.bg, colors.text, colors.border)}>
                        {editing.name}
                    </span>
                )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium mb-1 block">Name *</label>
                    <Input
                        value={editing.name}
                        onChange={(e) => onChange({
                            ...editing,
                            name: e.target.value,
                            slug: editing.id === null ? generateSlug(e.target.value) : editing.slug,
                        })}
                        placeholder="e.g. Authentication"
                        className="h-8 text-sm"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium mb-1 block">Slug</label>
                    <Input
                        value={editing.slug}
                        onChange={(e) => onChange({ ...editing, slug: e.target.value })}
                        placeholder="auto-generated"
                        className="h-8 text-sm font-mono"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium mb-1 block">Color</label>
                    <Select value={editing.color} onValueChange={(v) => onChange({ ...editing, color: v })}>
                        <SelectTrigger className="h-8 text-sm">
                            <SelectValue>
                                <span className="flex items-center gap-1.5">
                                    <span className={cn('w-3 h-3 rounded-full flex-shrink-0 border', colors.bg, colors.border)} />
                                    <span className={cn('capitalize', colors.text)}>{editing.color}</span>
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {COLOR_OPTIONS.map((c) => {
                                const cls = CATEGORY_COLORS[c];
                                return (
                                    <SelectItem key={c} value={c}>
                                        <span className="flex items-center gap-1.5">
                                            <span className={cn('w-3 h-3 rounded-full flex-shrink-0 border', cls.bg, cls.border)} />
                                            <span className={cn('capitalize', cls.text)}>{c}</span>
                                        </span>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <label className="text-xs font-medium mb-1 block">Description</label>
                    <Textarea
                        value={editing.description}
                        onChange={(e) => onChange({ ...editing, description: e.target.value })}
                        placeholder="Optional description..."
                        className="min-h-[32px] h-8 text-sm resize-none"
                        rows={1}
                    />
                </div>
            </div>
            <div className="flex items-center gap-2 mt-3 justify-end">
                <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                </Button>
                <Button size="sm" onClick={onSave} disabled={saving || !editing.name.trim()}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                    {isNew ? 'Create' : 'Save'}
                </Button>
            </div>
        </Card>
    );
}
