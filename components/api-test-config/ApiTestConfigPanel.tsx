'use client';

import { Button } from '@/components/ui/button';
import { BasicInput } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Key, Check, X, Monitor, Globe, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import { clearStoredAdminToken } from '@/utils/api-test-auth';
import { toast } from "@/lib/toast";
import type { UseApiTestConfigReturn } from './useApiTestConfig';

interface ApiTestConfigPanelProps {
  config: UseApiTestConfigReturn;
  className?: string;
  showAuthToken?: boolean;
  authTokenLabel?: string;
  serverLabel?: string;
  compact?: boolean;
  /** Custom title rendered at the start of the config row */
  title?: React.ReactNode;
  /** Custom React nodes (e.g. buttons) rendered at the end of the config row */
  actions?: React.ReactNode;
}

/**
 * Reusable configuration panel for API test pages.
 *
 * This component is the SOLE authority for server selection UI. It reads
 * availability state from the hook and disables the localhost toggle when
 * the server is unreachable. Pages render this panel and consume the
 * resulting config — they never perform their own validation.
 */
export function ApiTestConfigPanel({
  config,
  className = '',
  showAuthToken = true,
  authTokenLabel = 'Auth Token:',
  serverLabel = 'Server:',
  compact = false,
  title,
  actions,
}: ApiTestConfigPanelProps) {
  const [isEditingToken, setIsEditingToken] = useState(!config.hasToken);
  const [tempToken, setTempToken] = useState(config.authToken);

  // Sync when config loads token from cookies (after mount, avoids hydration mismatch)
  useEffect(() => {
    if (config.hasToken) {
      setIsEditingToken(false);
      setTempToken(config.authToken);
    }
  }, [config.authToken, config.hasToken]);

  const handleSaveToken = () => {
    if (tempToken.trim()) {
      config.setAuthToken(tempToken.trim());
      setIsEditingToken(false);
      toast.success('Token saved', {
        description: 'Auth token stored in cookies for all API test pages',
      });
    }
  };

  const handleClearToken = () => {
    clearStoredAdminToken();
    config.setAuthToken('');
    setTempToken('');
    setIsEditingToken(true);
    toast.info('Token cleared', {
      description: 'Auth token removed from cookies',
    });
  };

  const handleCancelEdit = () => {
    setTempToken(config.authToken);
    setIsEditingToken(false);
  };

  const localhostDisabled = config.isCheckingLocalhost || (!config.isLocalhostAvailable && config.serverType !== 'local');

  const localhostTooltip = config.isCheckingLocalhost
    ? 'Checking localhost...'
    : config.isLocalhostAvailable
      ? 'Localhost'
      : 'Localhost unavailable';

  return (
    <TooltipProvider>
      <div className={className}>
        {/* Title + Server Selection & Auth Token + Actions - single row, minimal wrapping */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 border-b">
          {title && (
            <div className="flex items-center flex-shrink-0">
              {title}
            </div>
          )}
          {/* Server toggle */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <ToggleGroup
              type="single"
              value={config.serverType}
              onValueChange={(v) => v && config.setServerType(v as 'local' | 'production')}
              className="gap-0"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="local"
                    aria-label="Localhost"
                    disabled={localhostDisabled}
                    className="h-6 w-6 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground disabled:opacity-40"
                  >
                    {config.isCheckingLocalhost ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Monitor className="h-3 w-3" />
                    )}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{localhostTooltip}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="production"
                    aria-label="Production"
                    disabled={config.isCheckingLocalhost}
                    className="h-6 w-6 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <Globe className="h-3 w-3" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>Production</TooltipContent>
              </Tooltip>
            </ToggleGroup>
            {config.isCheckingLocalhost && (
              <span className="text-[10px] text-muted-foreground">Checking...</span>
            )}
          </div>

          {/* Auth Token - compact */}
          {showAuthToken && (
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-[420px]">
              {!isEditingToken && config.hasToken ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Key className={`h-3 w-3 flex-shrink-0 ${config.isSessionToken ? 'text-blue-500 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`} />
                    </TooltipTrigger>
                    <TooltipContent>
                      {config.isSessionToken ? 'Using session token (auto-loaded from your login)' : 'Token stored in cookies'}
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-[10px] text-muted-foreground truncate flex-1">
                    {config.isSessionToken ? 'session token' : 'cookie token'}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" onClick={() => { setTempToken(config.authToken); setIsEditingToken(true); }} className="h-6 w-6 p-0">
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Override with manual token</TooltipContent>
                  </Tooltip>
                  {!config.isSessionToken && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={handleClearToken} className="h-6 w-6 p-0 text-destructive hover:text-destructive">
                          <X className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Clear cookie token</TooltipContent>
                    </Tooltip>
                  )}
                </>
              ) : (
                <>
                  <BasicInput
                    type="text"
                    value={tempToken}
                    onChange={(e) => setTempToken(e.target.value)}
                    placeholder="Auth token"
                    className="h-6 text-xs flex-1 font-mono min-w-0"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveToken();
                      else if (e.key === 'Escape' && config.hasToken) handleCancelEdit();
                    }}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="default" onClick={handleSaveToken} disabled={!tempToken.trim()} className="h-6 w-6 p-0">
                        <Check className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save token</TooltipContent>
                  </Tooltip>
                  {config.hasToken && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-6 w-6 p-0">
                          <X className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Cancel</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
          )}

          {/* URL + actions */}
          {(!compact || actions) && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {!compact && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">
                      {config.baseUrl}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs break-all">{config.baseUrl}</TooltipContent>
                </Tooltip>
              )}
              {actions}
            </div>
          )}
        </div>

        {/* URL for compact mode */}
        {compact && (
          <div className="text-[10px] text-muted-foreground font-mono px-1 pt-0.5 truncate">
            {config.baseUrl}
          </div>
        )}
      
        {/* Warning if no token and not a session token */}
        {showAuthToken && !config.hasToken && !config.isSessionToken && !isEditingToken && (
          <div className="px-3 py-2 bg-warning/10 border-t border-warning/20">
            <p className="text-xs text-warning-foreground">
              <Key className="h-3 w-3 inline mr-1" />
              No auth token. Log in or paste a token above.
            </p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
