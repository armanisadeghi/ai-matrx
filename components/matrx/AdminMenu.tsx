'use client';

import React from 'react';
import { Shield, Server, ChevronDown, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import {
    clearServiceOverrides,
    selectActiveServer,
    selectActiveServerHealth,
    selectResolvedBaseUrl,
    switchServer,
    type ServerEnvironment,
} from '@/lib/redux/slices/apiConfigSlice';
import { BACKEND_URLS } from '@/lib/api/endpoints';
import { allowsLoopbackApiTargets } from '@/lib/api/service-routing';

type HealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy';

export function AdminMenu() {
    const dispatch = useAppDispatch();
    const activeServer = useAppSelector(selectActiveServer);
    const activeHealth = useAppSelector(selectActiveServerHealth);
    const resolvedUrl = useAppSelector(selectResolvedBaseUrl);

    if (!allowsLoopbackApiTargets()) return null;

    const isLocalhost = resolvedUrl?.includes('localhost') || resolvedUrl?.includes('127.0.0.1');
    const isChecking = activeHealth.status === 'checking';

    const handleServerChange = async (value: string) => {
        const env = (value === 'default' ? 'production' : value) as ServerEnvironment;

        dispatch(clearServiceOverrides());
        const result = await dispatch(switchServer({ env }));

        if (switchServer.fulfilled.match(result)) {
            const url = env === 'custom' ? resolvedUrl : BACKEND_URLS[env];
            if (activeHealth.status === 'unhealthy') {
                toast.error(`${env} unreachable`, {
                    description: url ? `Cannot connect to ${url}` : 'Server not configured',
                });
            } else {
                toast.success(`Switched to ${env}`, {
                    description: url ?? env,
                });
            }
        }
    };

    const currentValue = activeServer === 'production' ? 'default' : activeServer;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Open admin settings"
                    className={cn(
                        "h-11 w-11 gap-1 p-0 text-xs",
                        isLocalhost
                            ? "text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                >
                    <Shield className="h-3 w-3" />
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Admin Settings
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                    <Server className="h-3 w-3" />
                    Server Environment
                </DropdownMenuLabel>

                {isChecking ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running health check...
                    </div>
                ) : (
                    <DropdownMenuRadioGroup value={currentValue} onValueChange={handleServerChange}>
                        <DropdownMenuRadioItem value="default" className="text-xs">
                            <span className="flex items-center gap-2">
                                Production (default)
                                {currentValue === 'default' && <HealthIndicator status={activeHealth.status} />}
                            </span>
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="localhost" className="text-xs">
                            <span className="flex items-center gap-2">
                                localhost:8000
                                {currentValue === 'localhost' && <HealthIndicator status={activeHealth.status} />}
                            </span>
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function HealthIndicator({ status }: { status: HealthStatus }) {
    if (status === 'unknown') return null;
    if (status === 'healthy') return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    if (status === 'unhealthy') return <XCircle className="h-3 w-3 text-destructive" />;
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
}

export default AdminMenu;
