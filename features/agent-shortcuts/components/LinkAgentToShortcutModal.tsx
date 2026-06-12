"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
  Plus,
  Search,
  Hammer,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAgentShortcuts } from "../hooks/useAgentShortcuts";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import { ScopeMappingEditor } from "./ScopeMappingEditor";
import { CategorySelect } from "./CategorySelect";
import type { AgentVariableDefinition } from "./ScopeMappingEditor";
import type { ScopeProps } from "../types";
import { parseShortcutContextsInput } from "../utils/enabled-contexts";

export interface LinkAgentToShortcutModalProps extends ScopeProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (shortcutId: string) => void;
  agent: {
    id: string;
    name: string;
    description?: string | null;
    variableDefinitions?: AgentVariableDefinition[];
    useLatest?: boolean;
    currentVersionId?: string | null;
  };
}

export function LinkAgentToShortcutModal({
  scope,
  scopeId,
  isOpen,
  onClose,
  onSuccess,
  agent,
}: LinkAgentToShortcutModalProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { shortcuts, categories, isLoading } = useAgentShortcuts({
    scope,
    scopeId,
    autoFetch: isOpen,
  });
  const crud = useAgentShortcutCrud({ scope, scopeId });

  const [activeTab, setActiveTab] = useState<"create" | "link">("create");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedShortcutId, setSelectedShortcutId] = useState<string | null>(
    null,
  );
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(true);
  const [useLatest, setUseLatest] = useState<boolean>(agent.useLatest ?? false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [label, setLabel] = useState<string>(agent.name);
  const [scopeMappings, setScopeMappings] = useState<Record<string, string>>(
    {},
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledFeaturesInput, setEnabledFeaturesInput] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab("create");
    setSearchQuery("");
    setSelectedShortcutId(null);
    setShowOnlyUnlinked(true);
    setUseLatest(agent.useLatest ?? false);
    setSelectedCategoryId(categories[0]?.id ?? "");
    setLabel(agent.name);
    setScopeMappings({});
    setEnabledFeaturesInput("");
    setError(null);
  }, [isOpen, agent, categories]);

  const filteredShortcuts = useMemo(() => {
    let out = showOnlyUnlinked
      ? shortcuts.filter((s) => !s.agentId)
      : shortcuts;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      out = out.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q) ||
          idMatchesQuery(s, q),
      );
    }
    return out;
  }, [shortcuts, showOnlyUnlinked, searchQuery]);

  const handleCreate = async () => {
    if (!label.trim()) {
      setError("Label is required");
      return;
    }
    if (!selectedCategoryId) {
      setError("Category is required");
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const newId = await crud.createShortcut({
        categoryId: selectedCategoryId,
        label,
        description: agent.description ?? null,
        iconName: "Hammer",
        keyboardShortcut: null,
        sortOrder: 0,
        agentId: agent.id,
        agentVersionId: useLatest ? null : (agent.currentVersionId ?? null),
        useLatest,
        resolvedId: useLatest ? agent.id : (agent.currentVersionId ?? null),
        isVersion: !useLatest && agent.currentVersionId != null,
        agentName: agent.name,
        variableDefinitions: [],
        contextSlots: [],
        surfaceName: null,
        valueMappings: null,
        enabledFeatures: parseShortcutContextsInput(enabledFeaturesInput),
        scopeMappings:
          Object.keys(scopeMappings).length > 0 ? scopeMappings : null,
        contextMappings: null,
        // AgentExecutionConfig defaults — keep in sync with DEFAULT_AGENT_EXECUTION_CONFIG
        displayMode: "modal-full",
        showVariablePanel: false,
        variablesPanelStyle: "inline",
        autoRun: true,
        allowChat: true,
        showDefinitionMessages: false,
        showDefinitionMessageContent: false,
        hideReasoning: false,
        hideToolResults: false,
        responseDensity: "comfortable",
        showPreExecutionGate: false,
        preExecutionMessage: null,
        bypassGateSeconds: 3,
        defaultUserInput: null,
        defaultVariables: null,
        contextOverrides: null,
        llmOverrides: null,
        jsonExtraction: null,
        isActive: true,
        userId: null,
        organizationId: null,
        projectId: null,
        taskId: null,
      });
      toast({
        title: "Linked",
        description: `Agent "${agent.name}" linked as new shortcut`,
      });
      onSuccess?.(newId);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create shortcut";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLinkExisting = async () => {
    if (!selectedShortcutId) {
      setError("Select a shortcut to link");
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      await crud.updateShortcut(selectedShortcutId, {
        agentId: agent.id,
        agentVersionId: useLatest ? null : (agent.currentVersionId ?? null),
        useLatest,
        scopeMappings:
          Object.keys(scopeMappings).length > 0 ? scopeMappings : null,
      });
      toast({
        title: "Linked",
        description: `Agent linked to existing shortcut`,
      });
      onSuccess?.(selectedShortcutId);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to link agent";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const body = (
    <div className="flex flex-col gap-4">
      <div className="p-3 rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 mb-1">
          <Hammer className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{agent.name}</span>
        </div>
        {agent.description && (
          <p className="text-xs text-muted-foreground">{agent.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-2 border border-border rounded-md bg-muted/30">
        <Label className="text-sm font-normal cursor-pointer">
          Always use latest agent version
        </Label>
        <Switch
          checked={useLatest}
          onCheckedChange={setUseLatest}
          disabled={isProcessing}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "create" | "link")}
      >
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="create">
            <Plus className="h-4 w-4 mr-2" />
            Create New
          </TabsTrigger>
          <TabsTrigger value="link">
            <Link2 className="h-4 w-4 mr-2" />
            Link Existing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-3 pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="link-label" className="text-sm">
              Label <span className="text-destructive">*</span>
            </Label>
            <Input
              id="link-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Shortcut label"
              className="h-9 text-[16px]"
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="link-category" className="text-sm">
              Category <span className="text-destructive">*</span>
            </Label>
            <CategorySelect
              id="link-category"
              categories={categories}
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
              placeholder="Select category..."
              className="h-9"
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="link-enabled-features" className="text-sm">
              Enabled features (optional)
            </Label>
            <Input
              id="link-enabled-features"
              value={enabledFeaturesInput}
              onChange={(e) => setEnabledFeaturesInput(e.target.value)}
              placeholder="e.g. code-editor, note-editor"
              className="h-9 text-[16px]"
              disabled={isProcessing}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Leave empty to show in every surface.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Scope Mappings</Label>
            <ScopeMappingEditor
              scopeMappings={scopeMappings}
              variableDefinitions={agent.variableDefinitions ?? []}
              onChange={(mappings) => setScopeMappings(mappings ?? {})}
              compact
            />
          </div>
        </TabsContent>

        <TabsContent value="link" className="space-y-3 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-[16px]"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {filteredShortcuts.length} shortcut
              {filteredShortcuts.length !== 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="unlinked-filter"
                className="text-xs font-normal cursor-pointer"
              >
                Unlinked only
              </Label>
              <Switch
                id="unlinked-filter"
                checked={showOnlyUnlinked}
                onCheckedChange={setShowOnlyUnlinked}
              />
            </div>
          </div>

          {filteredShortcuts.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {showOnlyUnlinked
                  ? "No unlinked shortcuts available"
                  : "No shortcuts match your search"}
              </AlertDescription>
            </Alert>
          ) : (
            <ScrollArea className="h-[260px]">
              <div className="space-y-2 pr-3">
                {filteredShortcuts.map((shortcut) => {
                  const isSelected = selectedShortcutId === shortcut.id;
                  const cat = categories.find(
                    (c) => c.id === shortcut.categoryId,
                  );
                  return (
                    <button
                      key={shortcut.id}
                      type="button"
                      onClick={() => setSelectedShortcutId(shortcut.id)}
                      className={`w-full text-left p-3 border rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-primary"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">
                            {shortcut.label}
                          </div>
                          {shortcut.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {shortcut.description}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {cat && (
                              <Badge variant="outline" className="text-xs">
                                {cat.label}
                              </Badge>
                            )}
                            {shortcut.agentId && (
                              <Badge variant="secondary" className="text-xs">
                                Already linked
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {selectedShortcutId && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-sm font-semibold">Scope Mappings</Label>
              <ScopeMappingEditor
                scopeMappings={scopeMappings}
                variableDefinitions={agent.variableDefinitions ?? []}
                onChange={(mappings) => setScopeMappings(mappings ?? {})}
                compact
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const footer = (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={onClose}
        disabled={isProcessing || isLoading}
      >
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={activeTab === "create" ? handleCreate : handleLinkExisting}
        disabled={
          isProcessing ||
          isLoading ||
          (activeTab === "create" && (!label.trim() || !selectedCategoryId)) ||
          (activeTab === "link" && !selectedShortcutId)
        }
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Processing...
          </>
        ) : activeTab === "create" ? (
          "Create & Link"
        ) : (
          "Link Shortcut"
        )}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[92dvh] pb-safe">
          <DrawerHeader>
            <DrawerTitle>Link Agent to Shortcut</DrawerTitle>
            <DrawerDescription>
              Wire &quot;{agent.name}&quot; into the UI
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-3 overflow-y-auto">{body}</div>
          <DrawerFooter className="flex-row gap-2 justify-end">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
          <DialogTitle>Link Agent to Shortcut</DialogTitle>
          <DialogDescription>
            Wire &quot;{agent.name}&quot; into the UI
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 pt-3 pb-3 overflow-y-auto flex-1">{body}</div>
        <DialogFooter className="px-4 py-3 border-t border-border">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
