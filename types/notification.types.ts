export interface Notification {
    id: string;
    title: string;
    message: string;
    link?: string;
    icon?: React.ReactNode;
    timestamp: string;
    type: "success" | "error" | "warning" | "info";
    isRead?: boolean;
}

// `NotificationDropdownProps` is gone: the bell reads its own data through
// `features/notifications/` and is no longer fed an array by the shell.
