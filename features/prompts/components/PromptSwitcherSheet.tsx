"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Workflow, Loader2, LayoutGrid } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePromptsBasePath } from "../hooks/usePromptsBasePath";
import { useAgentCacheConsumer } from "@/features/agents/hooks/useAgentCacheConsumer";
import { filterAndSortBySearch } from "@/utils/search-scoring";

// ============================================================================
// TYPES
// ============================================================================

interface MinimalPrompt {
  id: string;
  name: string;
  description: string | null;
}

interface PromptSwitcherSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPromptId: string;
  mode: "edit" | "run";
}

// ============================================================================
// HOOK — fetch user prompts from Redux agent cache
// ============================================================================

function useUserPrompts(open: boolean) {
  const { owned, isLoading: loading } = useAgentCacheConsumer(
    "prompt-switcher",
    {
      ephemeral: true,
      mode: "slim",
    },
  );

  const prompts: MinimalPrompt[] = owned.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? null,
  }));

  return { prompts, loading, error: null };
}

// ============================================================================
// PROMPT LIST ITEM
// ============================================================================

function PromptItem({
  prompt,
  isCurrent,
  onSelect,
  compact,
}: {
  prompt: MinimalPrompt;
  isCurrent: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 text-left transition-colors rounded-xl ${
        compact ? "px-3 py-2.5" : "px-4 py-3.5"
      } ${
        isCurrent
          ? "bg-primary/10 dark:bg-primary/15 ring-1 ring-primary/20"
          : "hover:bg-accent/60 active:bg-accent"
      }`}
    >
      <div
        className={`flex-shrink-0 flex items-center justify-center rounded-lg bg-muted ${
          compact ? "w-8 h-8" : "w-10 h-10"
        }`}
      >
        <Workflow
          className={`text-muted-foreground ${compact ? "h-[16px] w-[16px]" : "h-[18px] w-[18px]"}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`font-medium text-foreground truncate ${compact ? "text-sm" : "text-[15px]"}`}
        >
          {prompt.name || "Untitled"}
        </div>
        {prompt.description && (
          <div
            className={`text-muted-foreground line-clamp-1 ${compact ? "text-xs mt-0.5" : "text-[13px] mt-0.5"}`}
          >
            {prompt.description}
          </div>
        )}
      </div>
      {isCurrent && (
        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary" />
      )}
    </button>
  );
}

// ============================================================================
// SHARED LIST CONTENT
// ============================================================================

function PromptListContent({
  prompts,
  loading,
  error,
  currentPromptId,
  searchQuery,
  onSelect,
  compact,
}: {
  prompts: MinimalPrompt[];
  loading: boolean;
  error: string | null;
  currentPromptId: string;
  searchQuery: string;
  onSelect: (prompt: MinimalPrompt) => void;
  compact?: boolean;
}) {
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return prompts;
    return filterAndSortBySearch(prompts, searchQuery, [
      { get: (p) => p.name, weight: "title" },
      { get: (p) => p.description, weight: "body" },
    ]);
  }, [prompts, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading prompts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        Could not load prompts
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {searchQuery ? "No prompts found" : "No prompts yet"}
      </div>
    );
  }

  return (
    <div className="px-2">
      {filtered.map((prompt) => (
        <PromptItem
          key={prompt.id}
          prompt={prompt}
          isCurrent={prompt.id === currentPromptId}
          onSelect={() => onSelect(prompt)}
          compact={compact}
        />
      ))}
    </div>
  );
}

// ============================================================================
// MOBILE BOTTOM SHEET
// ============================================================================

function MobilePromptSwitcher({
  open,
  onOpenChange,
  currentPromptId,
  mode,
}: PromptSwitcherSheetProps) {
  const router = useRouter();
  const basePath = usePromptsBasePath();
  const { prompts, loading, error } = useUserPrompts(open);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelect = (prompt: MinimalPrompt) => {
    onOpenChange(false);
    setSearchQuery("");
    setShowSearch(false);
    if (prompt.id !== currentPromptId) {
      router.push(`${basePath}/${mode}/${prompt.id}`);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setSearchQuery("");
      setShowSearch(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <DrawerTitle className="text-base font-semibold">
            Switch Prompt
          </DrawerTitle>
          <button
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery("");
            }}
            className="p-2 -mr-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            {showSearch ? (
              <X className="h-5 w-5" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </button>
        </div>

        {showSearch && (
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 border-0"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <PromptListContent
            prompts={prompts}
            loading={loading}
            error={error}
            currentPromptId={currentPromptId}
            searchQuery={searchQuery}
            onSelect={handleSelect}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ============================================================================
// DESKTOP DIALOG
// ============================================================================

function DesktopPromptSwitcher({
  open,
  onOpenChange,
  currentPromptId,
  mode,
}: PromptSwitcherSheetProps) {
  const router = useRouter();
  const basePath = usePromptsBasePath();
  const { prompts, loading, error } = useUserPrompts(open);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelect = (prompt: MinimalPrompt) => {
    onOpenChange(false);
    setSearchQuery("");
    if (prompt.id !== currentPromptId) {
      router.push(`${basePath}/${mode}/${prompt.id}`);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) setSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="p-4 pb-3 border-b border-border">
          <DialogTitle className="text-base font-semibold mb-3">
            Switch Prompt
          </DialogTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 border-0"
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[420px]">
          <PromptListContent
            prompts={prompts}
            loading={loading}
            error={error}
            currentPromptId={currentPromptId}
            searchQuery={searchQuery}
            onSelect={handleSelect}
            compact
          />
          <div className="h-2" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// UNIFIED SWITCHER — Drawer on mobile, Dialog on desktop
// ============================================================================

export function PromptSwitcherSheet(props: PromptSwitcherSheetProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <MobilePromptSwitcher {...props} />
  ) : (
    <DesktopPromptSwitcher {...props} />
  );
}

// ============================================================================
// TRIGGER BUTTON — drop-in icon button that opens the switcher
// ============================================================================

export function PromptSwitcherButton({
  promptId,
  mode,
}: {
  promptId: string;
  mode: "edit" | "run";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Switch prompt"
      >
        <Workflow className="w-4 h-4" />
      </Button>

      <PromptSwitcherSheet
        open={open}
        onOpenChange={setOpen}
        currentPromptId={promptId}
        mode={mode}
      />
    </>
  );
}
