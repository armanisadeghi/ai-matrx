'use client';

import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { captureReactRenderError } from '@/lib/diagnostics/captureReactError';

interface MessageErrorBoundaryProps {
    children: React.ReactNode;
    messageId?: string;
}

interface MessageErrorBoundaryState {
    hasError: boolean;
}

/**
 * Per-message error boundary.
 * Confines rendering errors to individual messages so the sidebar, header,
 * and all other messages remain usable when one message crashes.
 */
export class MessageErrorBoundary extends React.Component<MessageErrorBoundaryProps, MessageErrorBoundaryState> {
    constructor(props: MessageErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): MessageErrorBoundaryState {
        return { hasError: true };
    }

    override componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[MessageErrorBoundary] Render error in message', this.props.messageId, error, info);
        captureReactRenderError(error, {
            boundary: 'MessageErrorBoundary',
            componentStack: info.componentStack ?? null,
            relation: this.props.messageId,
        });
    }

    override render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        This message could not be displayed. The data may be in an unexpected format.
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}

export default MessageErrorBoundary;
