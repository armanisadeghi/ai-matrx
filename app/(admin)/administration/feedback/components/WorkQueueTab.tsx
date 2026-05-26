'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getAgentWorkQueue, setAdminDecision } from '@/actions/feedback.actions';
import {
    UserFeedback,
    FeedbackCategory,
    FEEDBACK_STATUS_COLORS,
    ADMIN_STATUS_LABELS,
    CATEGORY_COLORS,
} from '@/types/feedback.types';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    AlertCircle,
    Rainbow,
    Lightbulb,
    HelpCircle,
    ArrowUp,
    ArrowDown,
    Loader2,
    Brain,
    RefreshCw,
    ListOrdered,
    FileCode,
    Eye,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import FeedbackDetailDialog from './FeedbackDetailDialog';

const feedbackTypeIcons: Record<string, React.ReactNode> = {
    bug: <AlertCircle className="w-4 h-4 text-red-500" />,
    feature: <Rainbow className="w-4 h-4 text-purple-500" />,
    suggestion: <Lightbulb className="w-4 h-4 text-yellow-500" />,
    other: <HelpCircle className="w-4 h-4 text-gray-500" />,
};

const complexityConfig: Record<string, { label: string; color: string }> = {
    simple: { label: 'Simple', color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
    moderate: { label: 'Moderate', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
    complex: { label: 'Complex', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
};

export default function WorkQueueTab() {
    const [items, setItems] = useState<UserFeedback[]>([]);
    const [categories, setCategories] = useState<FeedbackCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [reordering, setReordering] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<UserFeedback | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const loadQueue = useCallback(async () => {
        setLoading(true);
        try {
            const [queueResult] = await Promise.all([
                getAgentWorkQueue(),
                fetch('/api/admin/feedback/categories')
                    .then(r => r.json())
                    .then(d => setCategories(d.categories ?? []))
                    .catch(() => {}),
            ]);
            if (queueResult.success && queueResult.data) {
                setItems(queueResult.data);
            } else {
                toast.error(`Failed to load work queue: ${queueResult.error}`);
            }
        } catch (error) {
            console.error('Error loading work queue:', error);
            toast.error('Failed to load work queue');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    const handleMovePriority = async (itemId: string, direction: 'up' | 'down') => {
        setReordering(itemId);
        try {
            const currentIndex = items.findIndex(i => i.id === itemId);
            if (currentIndex < 0) return;

            const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (swapIndex < 0 || swapIndex >= items.length) return;

            const currentItem = items[currentIndex];
            const swapItem = items[swapIndex];

            // Swap priorities
            const currentPriority = currentItem.work_priority;
            const swapPriority = swapItem.work_priority;

            await Promise.all([
                setAdminDecision(currentItem.id, currentItem.admin_decision, currentItem.admin_direction || undefined, swapPriority || undefined),
                setAdminDecision(swapItem.id, swapItem.admin_decision, swapItem.admin_direction || undefined, currentPriority || undefined),
            ]);

            await loadQueue();
            toast.success('Priority updated');
        } catch (error) {
            console.error('Error reordering:', error);
            toast.error('Failed to reorder');
        } finally {
            setReordering(null);
        }
    };

    const handleViewDetails = (item: UserFeedback) => {
        setSelectedItem(item);
        setDetailOpen(true);
    };

    if (loading) {
        return (
            <Card className="p-8 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin mr-2 text-muted-foreground" />
                <span className="text-muted-foreground">Loading work queue...</span>
            </Card>
        );
    }

    return (
        <>
            <Card className="p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <ListOrdered className="w-5 h-5 text-muted-foreground" />
                        <span className="text-sm font-medium">
                            {items.length} item{items.length !== 1 ? 's' : ''} in queue
                        </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadQueue} className="gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refresh
                    </Button>
                </div>

                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <ListOrdered className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm font-medium">Work queue is empty</p>
                        <p className="text-xs mt-1">Approve feedback items to add them to the queue</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {items.map((item, index) => {
                            const complexity = complexityConfig[item.ai_complexity || ''];
                            const statusColors = FEEDBACK_STATUS_COLORS[item.status];

                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        'flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer',
                                        reordering === item.id && 'opacity-50'
                                    )}
                                    onClick={() => handleViewDetails(item)}
                                >
                                    {/* Priority Number */}
                                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleMovePriority(item.id, 'up');
                                            }}
                                            disabled={index === 0 || !!reordering}
                                        >
                                            <ArrowUp className="w-3 h-3" />
                                        </Button>
                                        <span className="text-lg font-bold text-muted-foreground w-8 text-center">
                                            {item.work_priority ?? index + 1}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleMovePriority(item.id, 'down');
                                            }}
                                            disabled={index === items.length - 1 || !!reordering}
                                        >
                                            <ArrowDown className="w-3 h-3" />
                                        </Button>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {feedbackTypeIcons[item.feedback_type]}
                                            <span className="text-sm font-medium truncate flex-1">
                                                {item.description.length > 100
                                                    ? item.description.substring(0, 100) + '...'
                                                    : item.description}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <Badge className={`${statusColors?.bg || ''} ${statusColors?.text || ''} border-0 text-[10px]`}>
                                                {ADMIN_STATUS_LABELS[item.status]}
                                            </Badge>
                                            {item.category_id && (() => {
                                                const cat = categories.find(c => c.id === item.category_id);
                                                if (!cat) return null;
                                                const colors = CATEGORY_COLORS[cat.color as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.gray;
                                                return (
                                                    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium', colors.bg, colors.text, colors.border)}>
                                                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 border', colors.border)} style={{ background: 'currentColor', opacity: 0.6 }} />
                                                        {cat.name}
                                                    </span>
                                                );
                                            })()}
                                            {complexity && (
                                                <Badge className={`${complexity.color} border-0 text-[10px]`}>
                                                    {complexity.label}
                                                </Badge>
                                            )}
                                            {item.ai_solution_proposal && (
                                                <Badge variant="outline" className="text-[10px] gap-1">
                                                    <Brain className="w-2.5 h-2.5" />
                                                    Triaged
                                                </Badge>
                                            )}
                                            {item.ai_estimated_files && item.ai_estimated_files.length > 0 && (
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <FileCode className="w-3 h-3" />
                                                    {item.ai_estimated_files.length} file{item.ai_estimated_files.length !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            <span className="text-muted-foreground ml-auto">
                                                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                        {item.admin_direction && (
                                            <div className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 border-l-2 border-primary/30">
                                                {item.admin_direction}
                                            </div>
                                        )}
                                    </div>

                                    {/* View Button */}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="flex-shrink-0 h-8 w-8 p-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewDetails(item);
                                        }}
                                    >
                                        <Eye className="w-4 h-4" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {selectedItem && (
                <FeedbackDetailDialog
                    feedback={selectedItem}
                    open={detailOpen}
                    onOpenChange={setDetailOpen}
                    onUpdate={loadQueue}
                />
            )}
        </>
    );
}
