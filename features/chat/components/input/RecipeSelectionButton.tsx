// features/chat/components/input/RecipeSelectionButton.tsx

import React, { useEffect, useMemo, useState } from "react";
import { LuWorkflow } from "react-icons/lu";
import { SiDassaultsystemes } from "react-icons/si";
import HierarchicalToggleMenu from "@/components/matrx/toggles/HierarchicalToggleMenu";
import { useFetchQuickRef } from "@/hooks/useFetchQuickRef";

interface RecipeSelectionButtonProps {
  selectedRecipeIds?: string[];
  onRecipeSelection?: (selectedIds: string[]) => void;
  tooltip?: string;
  isEnabled?: boolean;
}

const RecipeSelectionButton: React.FC<RecipeSelectionButtonProps> = ({
  selectedRecipeIds: externalSelectedRecipeIds,
  onRecipeSelection,
  tooltip = "Select a recipe to use",
  isEnabled = false,
}) => {
  // Internal state for when component is uncontrolled
  const [internalSelectedRecipeIds, setInternalSelectedRecipeIds] = useState<
    string[]
  >([]);

  // Determine if we're in controlled mode
  const isControlled = externalSelectedRecipeIds !== undefined;

  // Use either external or internal state based on whether we're controlled
  const selectedRecipeIds = isControlled
    ? externalSelectedRecipeIds
    : internalSelectedRecipeIds;

  const { quickReferenceKeyDisplayPairs: recipeItems } =
    useFetchQuickRef("recipe");

  const recipeOptions = useMemo(
    () =>
      recipeItems.map(({ recordKey, displayValue }) => ({
        id: recordKey,
        label: displayValue,
        icon: <LuWorkflow />,
      })),
    [recipeItems],
  );

  // Sync internal state with external state when in controlled mode
  useEffect(() => {
    if (isControlled) {
      setInternalSelectedRecipeIds(externalSelectedRecipeIds);
    }
  }, [isControlled, externalSelectedRecipeIds]);

  const handleRecipeSelection = (selectedIds: string[]) => {
    // Always update internal state
    if (!isControlled) {
      setInternalSelectedRecipeIds(selectedIds);
    }

    // Notify parent if callback is provided
    if (onRecipeSelection) {
      onRecipeSelection(selectedIds);
    }
  };

  return (
    <HierarchicalToggleMenu
      label="Recipe"
      defaultIcon={<LuWorkflow />}
      enabledIcon={<SiDassaultsystemes />}
      options={recipeOptions}
      selectedIds={selectedRecipeIds}
      onSelectionChange={handleRecipeSelection}
      tooltip={tooltip}
      direction="top"
      size="md"
      maxHeight="400px"
      minWidth="280px"
      enableSearch={true}
      selectionMode="single"
      collapsibleCategories={false}
      defaultExpandedCategories={false}
    />
  );
};

export default RecipeSelectionButton;
