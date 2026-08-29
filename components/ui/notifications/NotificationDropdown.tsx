'use client';

import React, { useState } from 'react';
import { Bell, Check, Trash2, Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { BellTapButton, BellRingTapButton } from '@ai-matrx/tap-target/buttons';
import { Notification, NotificationDropdownProps } from '@/types/notification.types';
import NotificationItem from './NotificationItem';
import { cn } from '@/lib/utils';

interface NotificationDropdownComponentProps extends NotificationDropdownProps {
    isMobile?: boolean;
}

export default function NotificationDropdown({
    notifications = [],
    onMarkAsRead,
    onMarkAllAsRead,
    onClearAll,
    onNotificationClick,
    isMobile = false
}: NotificationDropdownComponentProps) {
    const [isOpen, setIsOpen] = useState(false);
    
    const unreadCount = notifications.filter(n => !n.isRead).length;
    const hasNotifications = notifications.length > 0;

    const handleMarkAllAsRead = () => {
        if (onMarkAllAsRead) {
            onMarkAllAsRead();
        }
    };

    const handleClearAll = () => {
        if (onClearAll) {
            onClearAll();
        }
    };

    const EmptyState = () => (
        <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                No new notifications
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                You're all caught up! Check back later for updates.
            </p>
        </div>
    );

    const TriggerIcon = unreadCount > 0 ? BellRingTapButton : BellTapButton;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <div className="relative">
                <PopoverTrigger asChild>
                    <TriggerIcon ariaLabel="Notifications" />
                </PopoverTrigger>
                {unreadCount > 0 && (
                    <Badge
                        variant="destructive"
                        className="pointer-events-none absolute top-0.5 right-0.5 h-4 min-w-[16px] px-1 flex items-center justify-center text-[10px] font-medium bg-red-500 hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-600"
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
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
                        {unreadCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                                {unreadCount} new
                            </Badge>
                        )}
                    </div>
                    
                    {hasNotifications && (
                        <div className="flex items-center gap-1">
                            {unreadCount > 0 && onMarkAllAsRead && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleMarkAllAsRead}
                                    className="h-7 px-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400"
                                >
                                    <Check className="w-3 h-3 mr-1" />
                                    Mark all read
                                </Button>
                            )}
                            
                            {onClearAll && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearAll}
                                    className="h-7 px-2 text-xs hover:bg-red-50 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className={cn(hasNotifications ? 'max-h-96' : 'h-auto')}>
                    {hasNotifications ? (
                        <ScrollArea className="max-h-96">
                            <div className="p-2 space-y-2">
                                {notifications.map((notification) => (
                                    <NotificationItem
                                        key={notification.id}
                                        notification={notification}
                                        onMarkAsRead={onMarkAsRead}
                                        onNotificationClick={(notif) => {
                                            setIsOpen(false);
                                            onNotificationClick?.(notif);
                                        }}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    ) : (
                        <EmptyState />
                    )}
                </div>

                {/* Footer */}
                {hasNotifications && (
                    <>
                        <Separator />
                        <div className="p-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-center text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                                onClick={() => setIsOpen(false)}
                            >
                                <Settings className="w-3 h-3 mr-2" />
                                Notification Settings
                            </Button>
                        </div>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
