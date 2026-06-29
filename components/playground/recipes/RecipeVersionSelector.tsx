"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RecipeVersionSelectorProps {
  recipeId: string;
  recipeName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Legacy recipe→prompt conversion UI — stubbed during agents migration. */
export function RecipeVersionSelector({
  recipeName,
  isOpen,
  onOpenChange,
}: RecipeVersionSelectorProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert recipe</DialogTitle>
          <DialogDescription>
            Version selection for <strong>{recipeName}</strong> is temporarily
            unavailable while recipes migrate to agents.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
