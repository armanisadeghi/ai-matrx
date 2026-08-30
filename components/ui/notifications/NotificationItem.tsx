'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, AlertCircle, Info, AlertTriangle, ExternalLink } from 'lucide-react';
import { Notification } from '@/types/notification.types';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
    notification: Notification;
    onMarkAsRead?: (id: string) => void;
    onNotificationClick?: (notification: Notification) => void;
    className?: string;
}

const typeStyles = {
    success: {
        bg: 'bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/30',
        border: 'border-green-200 dark:border-green-900/50',
        icon: 'text-green-600 dark:text-green-400',
        title: 'text-green-900 dark:text-green-100',
        message: 'text-green-700 dark:text-green-300',
        defaultIcon: Check
    },
    error: {
        bg: 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30',
        border: 'border-red-200 dark:border-red-900/50',
        icon: 'text-red-600 dark:text-red-400',
        title: 'text-red-900 dark:text-red-100',
        message: 'text-red-700 dark:text-red-300',
        defaultIcon: AlertCircle
    },
    warning: {
        bg: 'bg-yellow-50 dark:bg-yellow-950/20 hover:bg-yellow-100 dark:hover:bg-yellow-950/30',
        border: 'border-yellow-200 dark:border-yellow-900/50',
        icon: 'text-yellow-600 dark:text-yellow-400',
        title: 'text-yellow-900 dark:text-yellow-100',
        message: 'text-yellow-700 dark:text-yellow-300',
        defaultIcon: AlertTriangle
    },
    info: {
        bg: 'bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30',
        border: 'border-blue-200 dark:border-blue-900/50',
        icon: 'text-blue-600 dark:text-blue-400',
        title: 'text-blue-900 dark:text-blue-100',
        message: 'text-blue-700 dark:text-blue-300',
        defaultIcon: Info
    }
};

export default function NotificationItem({ 
    notification, 
    onMarkAsRead, 
    onNotificationClick,
    className 
}: NotificationItemProps) {
    const styles = typeStyles[notification.type];
    const DefaultIcon = styles.defaultIcon;
    
    const timeAgo = formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true });
    
    const handleClick = () => {
        if (!notification.isRead && onMarkAsRead) {
            onMarkAsRead(notification.id);
        }
        if (onNotificationClick) {
            onNotificationClick(notification);
        }
    };

    return (
        <div 
            className={cn(
                'group relative p-3 rounded-lg border transition-all duration-200 cursor-pointer',
                styles.bg,
                styles.border,
                !notification.isRead && 'ring-1 ring-offset-1 ring-blue-500/20 dark:ring-blue-400/20',
                className
            )}
            onClick={handleClick}
        >
            {/* Unread indicator */}
            {!notification.isRead && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full" />
            )}
            
            <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn('flex-shrink-0 mt-0.5', styles.icon)}>
                    {notification.icon ? (
                        React.isValidElement(notification.icon) ? (
                            notification.icon
                        ) : (
                            <DefaultIcon className="w-4 h-4" />
                        )
                    ) : (
                        <DefaultIcon className="w-4 h-4" />
                    )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <h4 className={cn('font-medium text-sm leading-tight', styles.title)}>
                            {notification.title}
                        </h4>
                        {notification.link && (
                            <ExternalLink className="w-3 h-3 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        )}
                    </div>
                    
                    <p className={cn('text-xs mt-1 leading-relaxed', styles.message)}>
                        {notification.message}
                    </p>
                    
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {timeAgo}
                        </span>
                        
                        {!notification.isRead && onMarkAsRead && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onMarkAsRead(notification.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                            >
                                Mark as read
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
