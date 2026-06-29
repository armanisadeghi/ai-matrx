'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import { captureReactRenderError } from '@/lib/diagnostics/captureReactError';

interface AgentAppErrorBoundaryProps {
    children: ReactNode;
    /** App name for display in error UI */
    appName?: string;
    /** Callback when error occurs */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface AgentAppErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    showDetails: boolean;
}

/**
 * Error Boundary specifically designed for user-generated prompt app components.
 * 
 * Catches runtime render errors from dynamically-loaded components and displays
 * a beautiful, user-friendly error screen instead of crashing the entire app.
 * 
 * This handles errors that the useMemo try/catch in renderers cannot catch:
 * - Runtime render errors (e.g., calling undefined as a component)
 * - State update errors in user-generated code
 * - Event handler errors that propagate to render
 */
export class AgentAppErrorBoundary extends Component<AgentAppErrorBoundaryProps, AgentAppErrorBoundaryState> {
    constructor(props: AgentAppErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            showDetails: false,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<AgentAppErrorBoundaryState> {
        return { hasError: true, error };
    }

    override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('[AgentApp ErrorBoundary] Component error:', error);
        console.error('[AgentApp ErrorBoundary] Component stack:', errorInfo.componentStack);
        captureReactRenderError(error, {
            boundary: 'AgentAppErrorBoundary',
            componentStack: errorInfo.componentStack ?? null,
            relation: this.props.appName,
        });
        this.setState({ errorInfo });
        this.props.onError?.(error, errorInfo);
    }

    handleRetry = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            showDetails: false,
        });
    };

    handleReload = (): void => {
        window.location.reload();
    };

    toggleDetails = (): void => {
        this.setState(prev => ({ showDetails: !prev.showDetails }));
    };

    /**
     * Parses the error to provide a user-friendly message
     */
    getUserFriendlyMessage(): { title: string; description: string } {
        const error = this.state.error;
        if (!error) {
            return {
                title: 'Something went wrong',
                description: 'An unexpected error occurred while running this app.',
            };
        }

        const message = error.message || '';

        // Missing icon / undefined component
        if (message.includes('is not a function') || message.includes('is not defined') || message.includes('Cannot read properties of undefined')) {
            return {
                title: 'Component rendering error',
                description: 'This app references a component or icon that could not be loaded. This is usually caused by a missing import in the app code.',
            };
        }

        // React-specific errors
        if (message.includes('Minified React error') || message.includes('Invalid hook call')) {
            return {
                title: 'React rendering error',
                description: 'The app component has a React-specific issue, such as an invalid hook call or incorrect component structure.',
            };
        }

        // Type errors
        if (error.name === 'TypeError') {
            return {
                title: 'Type error in app code',
                description: 'The app encountered a type mismatch. A value was used in an unexpected way.',
            };
        }

        // Generic
        return {
            title: 'App encountered an error',
            description: 'The app ran into an issue while rendering. You can try again or reload the page.',
        };
    }

    override render(): ReactNode {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { title, description } = this.getUserFriendlyMessage();
        const { error, showDetails } = this.state;
        const appName = this.props.appName;

        return (
            <div className="flex items-center justify-center min-h-[400px] p-6">
                <div className="w-full max-w-lg">
                    {/* Main error card */}
                    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                        {/* Header with icon */}
                        <div className="bg-destructive/5 border-b border-destructive/10 px-6 py-5">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-destructive" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-semibold text-foreground">
                                        {title}
                                    </h3>
                                    {appName && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {appName}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 space-y-4">
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {description}
                            </p>

                            {/* Action buttons */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={this.handleRetry}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Try Again
                                </button>
                                <button
                                    onClick={this.handleReload}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                                >
                                    Reload Page
                                </button>
                            </div>

                            {/* Technical details toggle */}
                            {error && (
                                <div className="pt-2 border-t border-border">
                                    <button
                                        onClick={this.toggleDetails}
                                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <Code2 className="w-3.5 h-3.5" />
                                        Technical Details
                                        {showDetails ? (
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                    </button>

                                    {showDetails && (
                                        <div className="mt-3 p-3 bg-muted/50 rounded-lg overflow-auto max-h-48">
                                            <p className="text-xs font-mono text-destructive break-all">
                                                {error.name}: {error.message}
                                            </p>
                                            {this.state.errorInfo?.componentStack && (
                                                <pre className="mt-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                                                    {this.state.errorInfo.componentStack.trim().split('\n').slice(0, 8).join('\n')}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
