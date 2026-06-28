import React, { useState } from "react";
import { ChatMode } from "@/types/chat/chat.types";
import {
  MessageSquare,
  Image,
  Video,
  SquarePlay,
  Lightbulb,
  BarChart,
  Code,
} from "lucide-react";
import ToggleButton from "@/components/matrx/toggles/ToggleButton";
import { BsChatLeftText } from "react-icons/bs";
import { MdOutlineImage } from "react-icons/md";
import { TbTopologyComplex } from "react-icons/tb";
import { GiBrainstorm } from "react-icons/gi";
import { SiTidyverse } from "react-icons/si";
import { FaChartLine } from "react-icons/fa";
import { IoCodeWorkingSharp } from "react-icons/io5";
import HierarchicalToggleMenu from "@/components/matrx/toggles/HierarchicalToggleMenu";
import { programmingLibraries } from "./constants";
import useChatBasics from "@/features/chat/hooks/useChatBasics";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import RecipeSelectionButton from "./RecipeSelectionButton";

/** Legacy chat image mode — image-capable model id from the registry. */
const DEFAULT_IMAGE_MODEL_IDS = ["4de7f70f-c859-408d-9ef9-37466ad35a59"];

interface ActionButtonsProps {
  onModeSelect?: (mode: ChatMode) => void;
  className?: string;
  initialMode?: ChatMode;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  onModeSelect,
  className = "",
}) => {
  const dispatch = useAppDispatch();
  const { chatActions, chatSelectors, conversationKey } = useChatBasics();

  const currentMode = useAppSelector(chatSelectors.currentMode);
  const [selectedTechStack, setSelectedTechStack] = useState<string[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);

  const handleModeSelect = (mode: ChatMode) => {
    if (!conversationKey) return;
    dispatch(chatActions.updateMode({ value: mode }));
    console.log("HANDLE MODE SELECT mode", mode);

    if (mode !== "recipe") {
      setSelectedRecipeIds([]);
    }
    if (mode !== "code") {
      setSelectedTechStack([]);
    }

    if (onModeSelect) {
      onModeSelect(mode);
    }

    if (mode === "images") {
      const random_model =
        DEFAULT_IMAGE_MODEL_IDS[
          Math.floor(Math.random() * DEFAULT_IMAGE_MODEL_IDS.length)
        ];
      dispatch(chatActions.updateModel({ value: random_model }));
    }
  };

  const handleRecipeSelection = (selectedIds: string[]) => {
    setSelectedRecipeIds(selectedIds);

    if (selectedIds.length > 0) {
      handleModeSelect("recipe");
      dispatch(chatActions.updateSelectedRecipe({ recipeId: selectedIds[0] }));
    } else {
      handleModeSelect("general");
    }
  };

  const handleLibrarySelection = (selectedIds: string[]) => {
    setSelectedTechStack(selectedIds);
    handleModeSelect("code");
    dispatch(chatActions.updateTechStack({ libraries: selectedIds }));
  };

  const actionButtons = [
    {
      label: "Text",
      mode: "general" as const,
      defaultIcon: <MessageSquare />,
      enabledIcon: <BsChatLeftText />,
      tooltip: "General text chat",
    },
    {
      label: "Images",
      mode: "images" as const,
      defaultIcon: <MdOutlineImage />,
      enabledIcon: <Image />,
      tooltip: "Generate images",
    },
    {
      label: "Videos",
      mode: "video" as const,
      defaultIcon: <SquarePlay />,
      enabledIcon: <Video />,
      tooltip: "Generate video content",
    },
    {
      label: "Research",
      mode: "research" as const,
      defaultIcon: <TbTopologyComplex />,
      enabledIcon: <SiTidyverse />,
      tooltip: "Research information",
    },
    {
      label: "Brainstorm",
      mode: "brainstorm" as const,
      defaultIcon: <Lightbulb />,
      enabledIcon: <GiBrainstorm />,
      tooltip: "Generate ideas and brainstorm",
    },
    {
      label: "Data",
      mode: "analyze" as const,
      defaultIcon: <BarChart />,
      enabledIcon: <FaChartLine />,
      tooltip: "Analyze and visualize data",
    },
  ];

  return (
    <div className={`flex justify-center flex-wrap gap-1 ${className}`}>
      {actionButtons.map(
        ({ label, mode, defaultIcon, enabledIcon, tooltip }) => (
          <ToggleButton
            key={mode}
            isEnabled={currentMode === mode}
            onClick={() => handleModeSelect(mode)}
            label={label}
            defaultIcon={defaultIcon}
            enabledIcon={enabledIcon}
            tooltip={tooltip}
          />
        ),
      )}
      <RecipeSelectionButton
        selectedRecipeIds={selectedRecipeIds}
        onRecipeSelection={handleRecipeSelection}
        tooltip="Select a recipe to use"
        isEnabled={currentMode === "recipe"}
      />
      <HierarchicalToggleMenu
        label="Code"
        defaultIcon={<Code />}
        enabledIcon={<IoCodeWorkingSharp />}
        options={programmingLibraries}
        selectedIds={selectedTechStack}
        onSelectionChange={handleLibrarySelection}
        tooltip="Select libraries for code generation"
        direction="bottom"
        size="md"
        maxHeight="400px"
        minWidth="280px"
        enableSearch={true}
        selectionMode="multiple"
        collapsibleCategories={true}
        defaultExpandedCategories={true}
      />
    </div>
  );
};

export default ActionButtons;
