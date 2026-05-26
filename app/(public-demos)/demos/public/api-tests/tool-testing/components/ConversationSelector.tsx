'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { BasicInput } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2, Plus, ClipboardPaste, Check, AlertCircle, MessageSquare, Cookie } from 'lucide-react';
import { toast } from 'sonner';

interface ConversationSelectorProps {
  conversationId: string | null;
  isCreating: boolean;
  onCreateNew: () => Promise<void>;
  onSetExisting: (id: string | null) => void;
}

type Mode = 'create' | 'existing';

export function ConversationSelector({
  conversationId,
  isCreating,
  onCreateNew,
  onSetExisting,
}: ConversationSelectorProps) {
  const [mode, setMode] = useState<Mode>('create');
  const [inputValue, setInputValue] = useState('');
  const [mounted, setMounted] = useState(false);
  // Track whether the current conversationId was restored from a cookie on mount
  const [restoredFromCookie, setRestoredFromCookie] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (conversationId) {
      setRestoredFromCookie(true);
    }
    // Only run on mount to detect initial cookie-restored value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    try {
      await onCreateNew();
      setRestoredFromCookie(false);
      toast.success('Conversation created', {
        description: 'A real conversation entry has been created in the database.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create conversation';
      toast.error('Failed to create conversation', { description: msg });
    }
  };

  const handleApplyExisting = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmed)) {
      toast.error('Invalid conversation ID', { description: 'Must be a valid UUID.' });
      return;
    }
    onSetExisting(trimmed);
    setRestoredFromCookie(false);
    toast.success('Conversation ID set');
  };

  const handleClear = () => {
    onSetExisting(null);
    setInputValue('');
    setRestoredFromCookie(false);
  };

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {/* Label */}
      <Tooltip>
        <TooltipTrigger asChild>
          <MessageSquare className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        </TooltipTrigger>
        <TooltipContent className="text-xs">Conversation (required for tool execution)</TooltipContent>
      </Tooltip>

      {/* Mode toggle */}
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && setMode(v as Mode)}
        className="gap-0"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="create"
              aria-label="Create new conversation"
              className="h-6 w-6 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <Plus className="h-3 w-3" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Create new conversation</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="existing"
              aria-label="Use existing conversation"
              className="h-6 w-6 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <ClipboardPaste className="h-3 w-3" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Use existing conversation ID</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      {/* Mode content — use mounted to avoid SSR/client mismatch on cookie-restored state */}
      {mode === 'create' ? (
        mounted && conversationId ? (
          <div className="flex items-center gap-1">
            {restoredFromCookie ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Cookie className="h-3 w-3 text-muted-foreground flex-shrink-0 cursor-default" />
                </TooltipTrigger>
                <TooltipContent className="text-xs">Restored from last session</TooltipContent>
              </Tooltip>
            ) : (
              <Check className="h-3 w-3 text-success flex-shrink-0" />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px] cursor-default">
                  {conversationId}
                </span>
              </TooltipTrigger>
              <TooltipContent className="font-mono text-xs break-all max-w-xs">
                {conversationId}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClear}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                >
                  ×
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Clear conversation</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreate}
            disabled={isCreating}
            className="h-6 text-xs px-2 gap-1"
          >
            {isCreating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            {isCreating ? 'Creating...' : 'New'}
          </Button>
        )
      ) : (
        <div className="flex items-center gap-1">
          {conversationId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] px-1 h-5 font-mono gap-1 text-success border-success/40">
                  <Check className="h-2.5 w-2.5" />
                  set
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="font-mono text-xs break-all max-w-xs">
                {conversationId}
              </TooltipContent>
            </Tooltip>
          )}
          <BasicInput
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Paste conversation UUID"
            className="h-6 text-xs font-mono w-48"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyExisting();
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="default"
                onClick={handleApplyExisting}
                disabled={!inputValue.trim()}
                className="h-6 w-6 p-0"
              >
                <Check className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Apply</TooltipContent>
          </Tooltip>
          {conversationId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClear}
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                >
                  ×
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Clear</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Missing conversation warning */}
      {mounted && !conversationId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertCircle className="h-3 w-3 text-warning flex-shrink-0" />
          </TooltipTrigger>
          <TooltipContent className="text-xs max-w-[200px]">
            A conversation is required. Create a new one or paste an existing ID.
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
