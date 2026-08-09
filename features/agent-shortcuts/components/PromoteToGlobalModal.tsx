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
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
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
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  ChevronRight,
  Globe,
  Loader2,
  Shield,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { fetchCategoriesForScope } from "@/features/agents/redux/agent-shortcut-categories/thunks";
import { selectGlobalCategories } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { getPlacementTypeMeta, PLACEMENT_TYPES } from "../constants";
import type { PlacementType } from "../constants";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import type { AgentShortcut, AgentShortcutCategory } from "../types";

export interface PromoteToGlobalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newId: string) => void;
  shortcut: AgentShortcut;
  sourceCategory?: AgentShortcutCategory | null;
}

export function PromoteToGlobalModal({
  isOpen,
  onClose,
  onSuccess,
  shortcut,
  sourceCategory,
}: PromoteToGlobalModalProps) {
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const globalCategories = useAppSelector(selectGlobalCategories);

  const crud = useAgentShortcutCrud({ scope: "global" });

  const [selectedPlacement, setSelectedPlacement] = useState<string>(
    sourceCategory?.placementType ?? "",
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [labelOverride, setLabelOverride] = useState<string>(shortcut.label);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPlacement(sourceCategory?.placementType ?? "");
    setSelectedCategoryId("");
    setLabelOverride(shortcut.label);
    setError(null);
    setIsProcessing(false);

    setCategoriesLoading(true);
    dispatch(fetchCategoriesForScope({ scope: "global", scopeId: null }))
      .unwrap()
      .catch((e) => {
        const message =
          e instanceof Error ? e.message : "Failed to load global categories";
        setError(message);
      })
      .finally(() => setCategoriesLoading(false));
  }, [isOpen, shortcut.label, sourceCategory, dispatch]);

  useEffect(() => {
    setSelectedCategoryId("");
  }, [selectedPlacement]);

  const categoriesForPlacement = useMemo(
    () =>
      selectedPlacement
        ? globalCategories.filter((c) => c.placementType === selectedPlacement)
        : [],
    [globalCategories, selectedPlacement],
  );

  const handlePromote = async () => {
    if (!isAdmin) {
      setError("Only admins can promote shortcuts to global");
      return;
    }
    if (!selectedPlacement) {
      setError("Select a placement type first");
      return;
    }
    if (!selectedCategoryId) {
      setError("Select a global category");
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const newId = await crud.promoteShortcutToGlobal({
        shortcutId: shortcut.id,
        targetCategoryId: selectedCategoryId,
        label: labelOverride,
      });
      onSuccess?.(newId);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to promote shortcut to global";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const body = (
    <div className="space-y-4">
      {!isAdmin && (
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You must be a platform admin to promote a shortcut to the global
            system pool.
          </AlertDescription>
        </Alert>
      )}

      <div className="p-3 bg-muted rounded-md">
        <div className="text-sm font-medium mb-1">Promoting to global:</div>
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
          {/* THE DOOR LAW: the shortcut being promoted, openable. Sibling
              controls rather than a linked name — this modal carries a
              `labelOverride` the user may have edited, and a same-tab
              navigation would unmount the modal and discard it. */}
          <span className="truncate text-sm">{shortcut.label}</span>
          <EntityDoorControls
            token="agent_shortcut"
            id={shortcut.id}
            name={shortcut.label}
            alwaysShowActions
            className="shrink-0"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Creates a new system-owned copy. The original stays untouched.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="promote-label">Label</Label>
        <Input
          id="promote-label"
          value={labelOverride}
          onChange={(e) => setLabelOverride(e.target.value)}
          placeholder="Label for the global shortcut"
          disabled={!isAdmin || isProcessing}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="promote-placement">
          Placement Type <span className="text-destructive">*</span>
        </Label>
        <Select
          value={selectedPlacement}
          onValueChange={setSelectedPlacement}
          disabled={!isAdmin || isProcessing}
        >
          <SelectTrigger id="promote-placement">
            <SelectValue placeholder="Choose where the global copy belongs..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PLACEMENT_TYPES).map(([_key, value]) => {
              const meta = getPlacementTypeMeta(value);
              const count = globalCategories.filter(
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
          htmlFor="promote-category"
          className={!selectedPlacement ? "text-muted-foreground" : ""}
        >
          Global Category <span className="text-destructive">*</span>
          {!selectedPlacement && (
            <span className="text-xs ml-2">(select placement first)</span>
          )}
        </Label>
        <Select
          value={selectedCategoryId}
          onValueChange={setSelectedCategoryId}
          disabled={!isAdmin || !selectedPlacement || isProcessing}
        >
          <SelectTrigger id="promote-category">
            <SelectValue
              placeholder={
                categoriesLoading
                  ? "Loading global categories..."
                  : selectedPlacement
                    ? "Choose a global category..."
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
        {selectedPlacement &&
          !categoriesLoading &&
          categoriesForPlacement.length === 0 && (
            <p className="text-xs text-warning">
              No global categories for placement &quot;
              {getPlacementTypeMeta(selectedPlacement as PlacementType).label}
              &quot;. Create one in the global admin UI first.
            </p>
          )}
      </div>

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
        onClick={handlePromote}
        disabled={
          !isAdmin || isProcessing || !selectedPlacement || !selectedCategoryId
        }
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Promoting...
          </>
        ) : (
          <>
            <Globe className="h-4 w-4 mr-2" />
            Promote to Global
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
              <Globe className="h-5 w-5" />
              Promote to Global
            </DrawerTitle>
            <DrawerDescription>
              Create a system-owned copy of &quot;{shortcut.label}&quot; in a
              global category
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
            <Globe className="h-5 w-5" />
            Promote to Global
          </DialogTitle>
          <DialogDescription>
            Create a system-owned copy of &quot;{shortcut.label}&quot; in a
            global category
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
