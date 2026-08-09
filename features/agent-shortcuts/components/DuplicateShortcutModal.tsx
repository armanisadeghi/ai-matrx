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
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AlertCircle, ChevronRight, Copy, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  entityTokenForAgentScope,
  getPlacementTypeMeta,
  PLACEMENT_TYPES,
} from "../constants";
import type { PlacementType } from "../constants";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import type {
  AgentShortcut,
  AgentShortcutCategory,
  ScopeProps,
} from "../types";

export interface DuplicateShortcutModalProps extends ScopeProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newId: string) => void;
  shortcut: AgentShortcut;
  categories: AgentShortcutCategory[];
}

export function DuplicateShortcutModal({
  scope,
  scopeId,
  isOpen,
  onClose,
  onSuccess,
  shortcut,
  categories,
}: DuplicateShortcutModalProps) {
  const isMobile = useIsMobile();
  const crud = useAgentShortcutCrud({ scope, scopeId });
  const containerToken = entityTokenForAgentScope(scope);

  const sourceCategory = useMemo(
    () => categories.find((c) => c.id === shortcut.categoryId) ?? null,
    [categories, shortcut.categoryId],
  );

  const [selectedPlacement, setSelectedPlacement] = useState<string>(
    sourceCategory?.placementType ?? "",
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPlacement(sourceCategory?.placementType ?? "");
    setSelectedCategoryId("");
    setError(null);
    setIsProcessing(false);
  }, [isOpen, sourceCategory]);

  useEffect(() => {
    setSelectedCategoryId("");
  }, [selectedPlacement]);

  const categoriesForPlacement = useMemo(
    () =>
      selectedPlacement
        ? categories.filter((c) => c.placementType === selectedPlacement)
        : [],
    [categories, selectedPlacement],
  );

  const handleDuplicate = async () => {
    if (!selectedPlacement) {
      setError("Select a placement type first");
      return;
    }
    if (!selectedCategoryId) {
      setError("Select a category");
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const newId = await crud.duplicateShortcut(
        shortcut.id,
        selectedCategoryId,
      );
      onSuccess?.(newId);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to duplicate shortcut";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const body = (
    <div className="space-y-4">
      <div className="p-3 bg-muted rounded-md">
        <div className="text-sm font-medium mb-1">Duplicating from:</div>
        <div className="flex items-center gap-2 flex-wrap">
          {sourceCategory?.placementType && (
            <Badge variant="secondary" className="text-xs">
              {getPlacementTypeMeta(sourceCategory.placementType).label}
            </Badge>
          )}
          {sourceCategory && (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{sourceCategory.label}</span>
            </>
          )}
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          {/* THE DOOR LAW: the identity card names the shortcut being copied
              and had no way to open it, with shortcut.id right there. */}
          <EntityRef
            token="agent_shortcut"
            id={shortcut.id}
            name={shortcut.label}
            showIcon={false}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="duplicate-placement">
          Placement Type <span className="text-destructive">*</span>
        </Label>
        <Select value={selectedPlacement} onValueChange={setSelectedPlacement}>
          <SelectTrigger id="duplicate-placement">
            <SelectValue placeholder="Choose where to place the duplicate..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PLACEMENT_TYPES).map(([_key, value]) => {
              const meta = getPlacementTypeMeta(value);
              const count = categories.filter(
                (c) => c.placementType === value,
              ).length;
              return (
                <SelectItem key={value} value={value}>
                  <div className="flex items-center justify-between w-full gap-3">
                    <span>{meta.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {count}
                    </Badge>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="duplicate-category"
          className={!selectedPlacement ? "text-muted-foreground" : ""}
        >
          Category <span className="text-destructive">*</span>
          {!selectedPlacement && (
            <span className="text-xs ml-2">(select placement first)</span>
          )}
        </Label>
        <Select
          value={selectedCategoryId}
          onValueChange={setSelectedCategoryId}
          disabled={!selectedPlacement}
        >
          <SelectTrigger id="duplicate-category">
            <SelectValue
              placeholder={
                selectedPlacement
                  ? "Choose a category..."
                  : "Select placement type first"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {categoriesForPlacement.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedPlacement && categoriesForPlacement.length === 0 && (
          <p className="text-xs text-warning">
            No categories for placement &quot;
            {getPlacementTypeMeta(selectedPlacement as PlacementType).label}
            &quot;. Create one first.
          </p>
        )}
      </div>

      {selectedCategoryId && (
        <div className="p-3 rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-foreground">
            <span>
              The duplicate will copy label, description, agent reference, scope
              mappings, and all other settings. It will be created in the
              current scope ({scope}
              {scopeId && containerToken ? " · " : ""}
            </span>
            {/* Was a hand-truncated bare uuid — unopenable and uncopyable. The
                container this copy lands in is now reachable before the user
                commits to it. The token comes from `scope`, never a literal:
                `scopeId` is an org/project/task id, NOT a context.scopes row
                (see entityTokenForAgentScope). */}
            {scopeId && containerToken ? (
              <EntityRef
                token={containerToken}
                id={scopeId}
                name={null}
                showIcon={false}
              />
            ) : null}
            <span>).</span>
          </div>
        </div>
      )}

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
        disabled={isProcessing}
      >
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={handleDuplicate}
        disabled={isProcessing || !selectedPlacement || !selectedCategoryId}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Duplicating...
          </>
        ) : (
          <>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </>
        )}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[92dvh] pb-safe">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Duplicate Shortcut
            </DrawerTitle>
            <DrawerDescription>
              Create a copy of &quot;{shortcut.label}&quot; in a new category
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Duplicate Shortcut
          </DialogTitle>
          <DialogDescription>
            Create a copy of &quot;{shortcut.label}&quot; in a new category
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
