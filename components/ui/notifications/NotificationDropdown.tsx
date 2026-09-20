'use client';

// components/ui/notifications/NotificationDropdown.tsx
//
// THE BELL. Until 2026-09-19 this component held
// `useState<Notification[]>([])` with no fetch anywhere in the repo, so it
// rendered "no notifications" over real unread rows — a screen that lies (the
// ten laws § 4). It now reads the `communication` doors through
// `features/notifications/`, and every state it can be in says which one it is:
//
//   loading  → skeleton rows, never an empty box
//   refused  → the door's OWN sentence and a retry, never a blank list
//   none     → "You're all caught up"
//   unknown  → the badge shows a mark, never a silent `0`
//
// Controls this bell cannot honour are GONE, not greyed: there is no door that
// deletes notifications (so no "Clear all") and no notification-settings route
// (so no settings link). A control returns when its door does.

import React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, Check, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@ai-matrx/design-system';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { BellTapButton, BellRingTapButton } from '@ai-matrx/tap-target/buttons';
import { useNotificationBell } from '@/features/notifications/useNotificationBell';
import { toDisplayNotification } from '@/features/notifications/display';
import NotificationItem from './NotificationItem';
import { cn } from '@/lib/utils';

interface NotificationDropdownProps {
    isMobile?: boolean;
}

/** Hoisted to module scope — an inner component type remounts its subtree every render. */
const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-8 px-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <Bell className="w-8 h-8 text-gray-400 dark:text-gray-500" />
        </div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            You&apos;re all caught up
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Nothing is waiting on you right now.
        </p>
    </div>
);

/** A shape the eye reads as "still loading", not as "nothing here". */
const LoadingState = () => (
    <div className="p-2 space-y-2" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading your notifications…</span>
        {[0, 1, 2].map((row) => (
            <div
                key={row}
                className="p-3 rounded-lg border border-border bg-gray-50 dark:bg-gray-900/40"
            >
                <div className="flex items-start gap-3">
                    <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse mt-0.5" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                        <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
                        <div className="h-2.5 w-20 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
                    </div>
                </div>
            </div>
        ))}
    </div>
);

/** A refusal prints the door's own words — never an empty list. */
const RefusalState = ({
    message,
    onRetry,
}: {
    message: string;
    onRetry: () => void;
}) => (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            Your notifications could not be shown
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{message}</p>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onRetry}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Try again
        </Button>
    </div>
);

export default function NotificationDropdown({ isMobile = false }: NotificationDropdownProps) {
    const router = useRouter();
    const {
        unreadCount,
        unreadError,
        notifications,
        listLoading,
        listError,
        isOpen,
        setOpen,
        markRead,
        markAllRead,
        writeError,
        refresh,
    } = useNotificationBell();

    const hasUnread = unreadCount !== null && unreadCount > 0;
    // The count is REFUSED — distinct from "not read yet", which wears no mark
    // at all because a first load in flight is not a failure.
    const countRefused = unreadError !== null;
    const TriggerIcon = hasUnread ? BellRingTapButton : BellTapButton;

    const openDeepLink = (link: string) => {
        if (link.startsWith('/')) {
            router.push(link);
            return;
        }
        window.open(link, '_blank', 'noopener,noreferrer');
    };

    const rows = notifications.map(toDisplayNotification);
    const showList = rows.length > 0;

    return (
        <Popover open={isOpen} onOpenChange={setOpen}>
            <div className="relative">
                <PopoverTrigger asChild>
                    <TriggerIcon ariaLabel="Notifications" />
                </PopoverTrigger>
                {hasUnread && (
                    <Badge
                        variant="destructive"
                        className="pointer-events-none absolute top-0.5 right-0.5 h-4 min-w-[16px] px-1 flex items-center justify-center text-[10px] font-medium bg-red-500 hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-600"
                    >
                        {unreadCount! > 99 ? '99+' : unreadCount}
                    </Badge>
                )}
                {countRefused && (
                    // Never a silent zero: an unreadable count wears a mark and
                    // explains itself when the bell is opened.
                    <span
                        aria-hidden="true"
                        title="Your unread count could not be read"
                        className="pointer-events-none absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400"
                    />
                )}
            </div>

            <PopoverContent
                className={cn(
                    'p-0 border-0 shadow-xl bg-textured',
                    isMobile ? 'w-screen max-w-sm' : 'w-96'
                )}
                align="end"
                sideOffset={8}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Notifications
                        </h3>
                        {hasUnread && (
                            <Badge variant="secondary" className="text-xs">
                                {unreadCount} new
                            </Badge>
                        )}
                    </div>

                    {hasUnread && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void markAllRead()}
                            className="h-7 px-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400"
                        >
                            <Check className="w-3 h-3 mr-1" />
                            Mark all read
                        </Button>
                    )}
                </div>

                {/* A count we could not read says so, in the door's own words. */}
                {countRefused && unreadError && (
                    <div className="px-4 py-2 text-xs text-amber-700 dark:text-amber-400 border-b border-border">
                        {unreadError}
                    </div>
                )}

                {/* Rows on screen from an earlier read, but this read refused:
                    say so rather than passing stale rows off as current. */}
                {listError && showList && (
                    <div className="px-4 py-2 text-xs text-amber-700 dark:text-amber-400 border-b border-border">
                        {listError} Showing what was last loaded.
                    </div>
                )}

                {/* A write that failed announces itself with what failed. */}
                {writeError && (
                    <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 border-b border-border">
                        {writeError}
                    </div>
                )}

                {/* Content */}
                <div className={cn(showList ? 'max-h-96' : 'h-auto')}>
                    {listError && !showList ? (
                        <RefusalState message={listError} onRetry={refresh} />
                    ) : listLoading && !showList ? (
                        <LoadingState />
                    ) : showList ? (
                        <ScrollArea className="max-h-96">
                            <div className="p-2 space-y-2">
                                {rows.map((row) => (
                                    <NotificationItem
                                        key={row.id}
                                        notification={row}
                                        onMarkAsRead={(id) => void markRead(id)}
                                        onNotificationClick={(notif) => {
                                            setOpen(false);
                                            if (notif.link) openDeepLink(notif.link);
                                        }}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    ) : (
                        <EmptyState />
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
