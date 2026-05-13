'use client';

import React, { useEffect, useState, useTransition, useCallback } from 'react';
import { getUserFeedback, confirmFeedbackResolution, updateUserOwnFeedback, getUserMessages, replyToUserReview } from '@/actions/feedback.actions';
import type { UserFeedback, FeedbackStatus, FeedbackUserMessage } from '@/types/feedback.types';
import {
    Bug, Lightbulb, MessageSquare, HelpCircle, ChevronDown, ChevronRight,
    CheckCircle2, Loader2, ImageIcon, Pencil, X, Save,
    Send, SearchCheck, ShieldCheck, Code, FlaskConical, CircleCheckBig,
    Ban, Clock, UserCheck, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { InlineMediaRef } from '@/features/files';

// ──────────────────────────────────────────────────
// Progress Stepper - User-facing stage definitions
// ──────────────────────────────────────────────────

interface StageDefinition {
    key: string;
    label: string;
    shortLabel: string;
    icon: LucideIcon;
}

const STAGES: StageDefinition[] = [
    { key: 'submitted',  label: 'Submitted',           shortLabel: 'Submitted',  icon: Send },
    { key: 'review',     label: 'Initial Review',      shortLabel: 'Review',     icon: SearchCheck },
    { key: 'approval',   label: 'Team Lead Approval',  shortLabel: 'Approval',   icon: ShieldCheck },
    { key: 'dev',        label: 'Senior Developer',    shortLabel: 'Developer',  icon: Code },
    { key: 'qa',         label: 'Quality Assurance',   shortLabel: 'QA',         icon: FlaskConical },
    { key: 'complete',   label: 'Complete',             shortLabel: 'Complete',   icon: CircleCheckBig },
];

/** Map internal status to the active stage index (0-based). Returns -1 for terminal/special states. */
function getActiveStageIndex(status: FeedbackStatus): number {
    switch (status) {
        case 'new':              return 0;
        case 'triaged':          return 2;
        case 'in_progress':      return 3;
        case 'awaiting_review':  return 4;
        case 'user_review':      return 4; // Same QA stage — waiting on user
        case 'resolved':         return 5;
        case 'closed':           return 6; // past last stage = all complete
        default:                 return -1;
    }
}

function isTerminalSpecialStatus(status: FeedbackStatus): boolean {
    return ['wont_fix', 'deferred', 'split'].includes(status);
}

const TERMINAL_STATUS_CONFIG: Record<string, { label: string; icon: LucideIcon; className: string }> = {
    wont_fix: { label: 'Declined', icon: Ban, className: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20' },
    deferred: { label: 'Scheduled for Later', icon: Clock, className: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' },
    split:    { label: 'Split into Sub-tasks', icon: Code, className: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20' },
};

/** Compact progress indicator for the collapsed row (mobile-friendly) */
function CompactProgressIndicator({ status }: { status: FeedbackStatus }) {
    if (isTerminalSpecialStatus(status)) {
        const config = TERMINAL_STATUS_CONFIG[status];
        if (!config) return null;
        const Icon = config.icon;
        return (
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', config.className)}>
                <Icon className="h-3 w-3" />
                {config.label}
            </span>
        );
    }

    const activeIndex = getActiveStageIndex(status);
    const totalStages = STAGES.length;
    const completedStages = Math.min(activeIndex, totalStages);
    const isAllComplete = activeIndex >= totalStages;
    const currentStage = isAllComplete ? STAGES[totalStages - 1] : STAGES[Math.max(0, Math.min(activeIndex, totalStages - 1))];

    return (
        <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
                {STAGES.map((_, i) => (
                    <div
                        key={i}
                        className={cn(
                            'h-1.5 w-3 rounded-full transition-colors',
                            i < completedStages
                                ? 'bg-primary'
                                : i === completedStages && !isAllComplete
                                ? 'bg-primary/50 animate-pulse'
                                : isAllComplete
                                ? 'bg-primary'
                                : 'bg-muted-foreground/20'
                        )}
                    />
                ))}
            </div>
            <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                {currentStage.shortLabel}
            </span>
        </div>
    );
}

/** Full progress stepper shown in the expanded detail view */
function FeedbackProgressStepper({ status }: { status: FeedbackStatus }) {
    if (isTerminalSpecialStatus(status)) {
        const config = TERMINAL_STATUS_CONFIG[status];
        if (!config) return null;
        const Icon = config.icon;
        return (
            <div className={cn('flex items-center gap-2 p-3 rounded-lg border', config.className)}>
                <Icon className="h-5 w-5 flex-shrink-0" />
                <div>
                    <p className="text-sm font-medium">{config.label}</p>
                    <p className="text-xs opacity-75">
                        {status === 'wont_fix' && 'Our team reviewed this and decided not to proceed at this time.'}
                        {status === 'deferred' && 'This has been added to our backlog and will be addressed in a future update.'}
                        {status === 'split' && 'This has been broken into smaller tasks to be handled individually.'}
                    </p>
                </div>
            </div>
        );
    }

    const activeIndex = getActiveStageIndex(status);
    const isAllComplete = activeIndex >= STAGES.length;

    return (
        <>
            {/* Desktop: Horizontal stepper */}
            <div className="hidden md:flex items-start gap-0 w-full">
                {STAGES.map((stage, i) => {
                    const Icon = stage.icon;
                    const isCompleted = i < activeIndex;
                    const isActive = i === activeIndex && !isAllComplete;
                    const isFuture = i > activeIndex && !isAllComplete;

                    return (
                        <div key={stage.key} className="flex-1 flex flex-col items-center relative">
                            {/* Connecting line */}
                            {i > 0 && (
                                <div
                                    className={cn(
                                        'absolute top-3.5 right-1/2 w-full h-0.5 -translate-y-1/2',
                                        isCompleted || isActive ? 'bg-primary' : 'bg-border'
                                    )}
                                    style={{ zIndex: 0 }}
                                />
                            )}

                            {/* Step circle */}
                            <div
                                className={cn(
                                    'relative z-10 flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all',
                                    isCompleted && 'bg-primary border-primary text-primary-foreground',
                                    isActive && 'bg-background border-primary text-primary ring-4 ring-primary/20',
                                    (isFuture || isAllComplete && i === STAGES.length - 1) && !isCompleted && !isActive && 'bg-muted border-border text-muted-foreground',
                                    isAllComplete && 'bg-primary border-primary text-primary-foreground',
                                )}
                            >
                                {isCompleted || isAllComplete ? (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                    <Icon className={cn('h-3.5 w-3.5', isActive && 'animate-pulse')} />
                                )}
                            </div>

                            {/* Label */}
                            <span
                                className={cn(
                                    'mt-1.5 text-[10px] font-medium text-center leading-tight px-0.5',
                                    isCompleted && 'text-primary',
                                    isActive && 'text-primary font-semibold',
                                    isFuture && 'text-muted-foreground',
                                    isAllComplete && 'text-primary',
                                )}
                            >
                                {stage.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Mobile: Vertical compact stepper */}
            <div className="md:hidden space-y-0">
                {STAGES.map((stage, i) => {
                    const Icon = stage.icon;
                    const isCompleted = i < activeIndex;
                    const isActive = i === activeIndex && !isAllComplete;
                    const isFuture = i > activeIndex && !isAllComplete;

                    return (
                        <div key={stage.key} className="flex items-center gap-2.5">
                            {/* Vertical line + dot */}
                            <div className="flex flex-col items-center w-5">
                                {i > 0 && (
                                    <div
                                        className={cn(
                                            'w-0.5 h-2',
                                            isCompleted || isActive ? 'bg-primary' : 'bg-border'
                                        )}
                                    />
                                )}
                                <div
                                    className={cn(
                                        'flex items-center justify-center w-5 h-5 rounded-full transition-all',
                                        isCompleted && 'bg-primary text-primary-foreground',
                                        isActive && 'bg-primary/15 text-primary ring-2 ring-primary/30',
                                        isFuture && 'bg-muted text-muted-foreground',
                                        isAllComplete && 'bg-primary text-primary-foreground',
                                    )}
                                >
                                    {isCompleted || isAllComplete ? (
                                        <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                        <Icon className={cn('h-3 w-3', isActive && 'animate-pulse')} />
                                    )}
                                </div>
                                {i < STAGES.length - 1 && (
                                    <div
                                        className={cn(
                                            'w-0.5 h-2',
                                            isCompleted && !isActive ? 'bg-primary' : 'bg-border'
                                        )}
                                    />
                                )}
                            </div>

                            {/* Label */}
                            <span
                                className={cn(
                                    'text-xs py-0.5',
                                    isCompleted && 'text-primary',
                                    isActive && 'text-primary font-semibold',
                                    isFuture && 'text-muted-foreground',
                                    isAllComplete && 'text-primary',
                                )}
                            >
                                {stage.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </>
    );
}

// ──────────────────────────────────────────────────
// Existing Components
// ──────────────────────────────────────────────────

function FeedbackTypeIcon({ type }: { type: string }) {
    switch (type) {
        case 'bug':
            return <Bug className="h-4 w-4 text-red-500" />;
        case 'feature':
            return <Lightbulb className="h-4 w-4 text-yellow-500" />;
        case 'suggestion':
            return <MessageSquare className="h-4 w-4 text-blue-500" />;
        default:
            return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
}

function FeedbackItem({ item, onUpdate }: { item: UserFeedback; onUpdate: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [confirmed, setConfirmed] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editDescription, setEditDescription] = useState(item.description);
    const [editType, setEditType] = useState(item.feedback_type);
    const [isSaving, setIsSaving] = useState(false);

    // User review messaging
    const [messages, setMessages] = useState<FeedbackUserMessage[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isSendingReply, setIsSendingReply] = useState(false);

    const isUserReview = item.status === 'user_review';

    const loadMessages = useCallback(async () => {
        setIsLoadingMessages(true);
        try {
            const result = await getUserMessages(item.id);
            if (result.success && result.data) {
                setMessages(result.data);
            }
        } catch {
            console.error('Error loading messages');
        } finally {
            setIsLoadingMessages(false);
        }
    }, [item.id]);

    // Auto-load messages when expanded and in user_review status (or has messages)
    useEffect(() => {
        if (expanded && (isUserReview || item.status === 'awaiting_review')) {
            loadMessages();
        }
    }, [expanded, isUserReview, item.status, loadMessages]);

    const handleSendReply = async () => {
        if (!replyText.trim()) return;
        setIsSendingReply(true);
        try {
            const result = await replyToUserReview(item.id, replyText.trim());
            if (result.success && result.data) {
                // Send email notification to admin
                try {
                    await fetch('/api/feedback/user-review-notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            feedback_id: item.id,
                            message_id: result.data.id,
                            message_content: replyText.trim(),
                            sender_type: 'user',
                            sender_name: item.username || 'User',
                        }),
                    });
                } catch {
                    // Email failure shouldn't block the reply
                }

                setReplyText('');
                toast.success('Response sent — the team has been notified');
                await loadMessages();
                onUpdate(); // Refresh parent to update status
            } else {
                toast.error(result.error || 'Failed to send reply');
            }
        } catch {
            toast.error('An error occurred');
        } finally {
            setIsSendingReply(false);
        }
    };

    const handleConfirm = () => {
        startTransition(async () => {
            const result = await confirmFeedbackResolution(item.id);
            if (result.success) {
                setConfirmed(true);
            }
        });
    };

    const handleStartEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditDescription(item.description);
        setEditType(item.feedback_type);
        setIsEditing(true);
        if (!expanded) setExpanded(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditDescription(item.description);
        setEditType(item.feedback_type);
    };

    const handleSaveEdit = async () => {
        if (!editDescription.trim()) {
            toast.error('Description cannot be empty');
            return;
        }

        setIsSaving(true);
        try {
            const updates: { description?: string; feedback_type?: 'bug' | 'feature' | 'suggestion' | 'other' } = {};
            if (editDescription !== item.description) updates.description = editDescription;
            if (editType !== item.feedback_type) updates.feedback_type = editType;

            if (Object.keys(updates).length === 0) {
                setIsEditing(false);
                return;
            }

            const result = await updateUserOwnFeedback(item.id, updates);
            if (result.success) {
                toast.success('Feedback updated');
                setIsEditing(false);
                onUpdate();
            } else {
                toast.error(result.error || 'Failed to update');
            }
        } catch {
            toast.error('An error occurred');
        } finally {
            setIsSaving(false);
        }
    };

    const canEdit = item.status === 'new';
    const canConfirm = item.status === 'resolved' && !confirmed;
    const formattedDate = new Date(item.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            {/* Summary Row */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(!expanded)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
            >
                {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}

                <FeedbackTypeIcon type={isEditing ? editType : item.feedback_type} />

                <span className="flex-1 truncate text-sm text-foreground">
                    {item.description.length > 80
                        ? item.description.slice(0, 80) + '...'
                        : item.description}
                </span>

                {canEdit && !isEditing && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={handleStartEdit}
                        title="Edit this submission"
                    >
                        <Pencil className="h-3 w-3" />
                    </Button>
                )}

                {isUserReview && !confirmed && (
                    <Badge className="bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-0 text-[10px] gap-1 animate-pulse">
                        <UserCheck className="w-3 h-3" />
                        Your Review
                    </Badge>
                )}
                <CompactProgressIndicator status={confirmed ? 'closed' : item.status} />

                <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:inline">
                    {formattedDate}
                </span>
            </div>

            {/* Expanded Detail */}
            {expanded && (
                <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/30">
                    {/* Progress Stepper */}
                    <FeedbackProgressStepper status={confirmed ? 'closed' : item.status} />

                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {isEditing ? (
                                <Select value={editType} onValueChange={(v) => setEditType(v as typeof editType)}>
                                    <SelectTrigger className="h-6 w-auto text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bug">Bug</SelectItem>
                                        <SelectItem value="feature">Feature</SelectItem>
                                        <SelectItem value="suggestion">Suggestion</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Badge variant="outline" className="text-xs capitalize">
                                    {item.feedback_type}
                                </Badge>
                            )}
                            <span className="sm:hidden">{formattedDate}</span>
                        </div>

                        {isEditing ? (
                            <div className="space-y-2">
                                <Textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    className="min-h-[100px] text-sm"
                                    placeholder="Describe the issue..."
                                />
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        onClick={handleSaveEdit}
                                        disabled={isSaving}
                                        className="gap-1.5"
                                    >
                                        {isSaving ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Save className="h-3.5 w-3.5" />
                                        )}
                                        Save
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={handleCancelEdit}
                                        disabled={isSaving}
                                        className="gap-1.5"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-foreground whitespace-pre-wrap">{item.description}</p>
                        )}
                    </div>

                    {/* Images */}
                    {item.image_urls && item.image_urls.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <ImageIcon className="h-3 w-3" />
                                Attached Screenshots ({item.image_urls.length})
                            </p>
                            <div className="flex gap-2 flex-wrap">
                                {item.image_urls.map((url, i) => (
                                    <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-20 h-20 rounded border border-border overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all"
                                    >
                                        <InlineMediaRef
                                            ref={url}
                                            size="fill"
                                            fit="cover"
                                            rounded="none"
                                            fallback={null}
                                            alt={`Screenshot ${i + 1}`}
                                        />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Resolution Notes (hide when user_review — shown in messages instead) */}
                    {item.resolution_notes && !isUserReview && (
                        <div className="bg-green-500/5 border border-green-500/20 rounded-md p-3">
                            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Resolution Notes</p>
                            <p className="text-sm text-foreground">{item.resolution_notes}</p>
                        </div>
                    )}

                    {/* User Review Messages */}
                    {(isUserReview || messages.length > 0) && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                                <p className="text-xs font-medium text-cyan-700 dark:text-cyan-400">
                                    {isUserReview ? 'The team needs your help verifying a fix' : 'Conversation with the team'}
                                </p>
                            </div>

                            {isLoadingMessages ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Loading messages...
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {messages.map((msg) => {
                                        const isAdmin = msg.sender_type === 'admin';
                                        return (
                                            <div
                                                key={msg.id}
                                                className={cn(
                                                    'rounded-lg p-3 text-sm',
                                                    isAdmin
                                                        ? 'bg-blue-500/5 border border-blue-500/20'
                                                        : 'bg-muted/50 border ml-4'
                                                )}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-medium">
                                                        {isAdmin ? 'AI Matrx Team' : (msg.sender_name || 'You')}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className="whitespace-pre-wrap text-foreground/90">{msg.content}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Reply input — only when in user_review status */}
                            {isUserReview && (
                                <div className="space-y-2 pt-2 border-t">
                                    <Textarea
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        placeholder="Type your response... Does the fix work? Any remaining issues?"
                                        className="min-h-[80px] text-sm"
                                    />
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-muted-foreground">
                                            The team will be notified when you respond
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={handleSendReply}
                                            disabled={!replyText.trim() || isSendingReply}
                                            className="gap-1.5"
                                        >
                                            {isSendingReply ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Send className="h-3.5 w-3.5" />
                                            )}
                                            Send Response
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Timestamps */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Submitted: {formattedDate}</span>
                        {item.resolved_at && (
                            <span>
                                Resolved:{' '}
                                {new Date(item.resolved_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                })}
                            </span>
                        )}
                        {item.user_confirmed_at && (
                            <span>
                                Confirmed:{' '}
                                {new Date(item.user_confirmed_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                })}
                            </span>
                        )}
                    </div>

                    {/* Confirm Button */}
                    {canConfirm && (
                        <div className="pt-1">
                            <Button
                                size="sm"
                                onClick={handleConfirm}
                                disabled={isPending}
                                className="gap-1.5"
                            >
                                {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                Confirm Fix Works
                            </Button>
                        </div>
                    )}

                    {confirmed && (
                        <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Thank you for confirming!
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default function UserFeedbackPage() {
    const [items, setItems] = useState<UserFeedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadItems = async () => {
        const result = await getUserFeedback();
        if (result.success && result.data) {
            setItems(result.data);
        } else {
            setError(result.error || 'Failed to load feedback');
        }
        setLoading(false);
    };

    useEffect(() => {
        loadItems();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center">
                <p className="text-destructive">{error}</p>
            </div>
        );
    }

    // Items needing user attention come first
    const userReviewItems = items.filter((i) => i.status === 'user_review');
    const otherActiveItems = items.filter((i) => !['closed', 'wont_fix', 'user_review'].includes(i.status));
    const activeItems = [...userReviewItems, ...otherActiveItems];
    const closedItems = items.filter((i) => ['closed', 'wont_fix'].includes(i.status));

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-foreground">My Feedback</h2>
                <p className="text-sm text-muted-foreground">
                    Track the status of your bug reports and feature requests.
                </p>
            </div>

            {items.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-lg">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No feedback submitted yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Use the feedback button in the bottom-right corner to report bugs or request features.
                    </p>
                </div>
            ) : (
                <>
                    {/* Active Items */}
                    {activeItems.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">
                                Active ({activeItems.length})
                            </h3>
                            <div className="space-y-2">
                                {activeItems.map((item) => (
                                    <FeedbackItem key={item.id} item={item} onUpdate={loadItems} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Closed Items */}
                    {closedItems.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">
                                Closed ({closedItems.length})
                            </h3>
                            <div className="space-y-2">
                                {closedItems.map((item) => (
                                    <FeedbackItem key={item.id} item={item} onUpdate={loadItems} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
