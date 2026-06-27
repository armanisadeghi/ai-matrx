// InputBottomControls.tsx
import React, { useState } from "react";
import { Paperclip, Search, ArrowUp, Mic } from "lucide-react";
import { TbVariablePlus } from "react-icons/tb";
import { LiaLightbulbSolid } from "react-icons/lia";
import { HiOutlineLightBulb } from "react-icons/hi";
import { LuSearchCheck } from "react-icons/lu";
import { MatrxRecordId } from "@/types/records";
import ToggleButton from "@/components/matrx/toggles/ToggleButton";
import ModelSelection from "@/features/chat/components/input/ModelSelection";
import { FaMicrophoneLines } from "react-icons/fa6";
import { LuBrainCircuit } from "react-icons/lu";
import { LuBrain } from "react-icons/lu";
import { MdOutlineQuestionMark } from "react-icons/md";
import { BsPatchQuestion } from "react-icons/bs";
import { FileManagerReturn } from "@/hooks/ai/chat/useFileManagement";
import MobileInputBottomControls from "./mobile/MobileInputBottomControls";
import { useIsMobile } from "@/hooks/use-mobile";
import BrokerSheet from "./BrokerSheet";
import AIToolsSheet from "./AIToolsSheet";
import AudioPlanDialogButton from "@/features/chat/components/input/AudioPlanToggleButton";
import useInputControls from "@/features/chat/hooks/useInputControls";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Database } from "lucide-react";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import type { Resource } from "@/features/agents/resources/types";

interface InputBottomControlsProps {
  isDisabled: boolean;
  onSendMessage: () => void;
  onToggleTools?: () => void;
  fileManager: FileManagerReturn;
  onAddSpecialContent?: (content: string) => void;
  onResourceSelected?: (resource: Resource) => void;
}

const InputBottomControls: React.FC<InputBottomControlsProps> = (props) => {
  const isMobile = useIsMobile();
  const [isResourcePickerOpen, setIsResourcePickerOpen] = useState(false);

  // Use our custom hook for all the logic
  const {
    conversationId,
    settings,
    isToolsSheetOpen,
    isBrokerSheetOpen,
    hasUploadedFiles,
    modelId,
    models,
    handleToggleSearch,
    handleToggleTools,
    handleToggleBrokers,
    handleToggleThink,
    handleToggleAskQuestions,
    handleToggleMicrophone,
    handleModelSelect,
    handleTogglePlan,
    setIsToolsSheetOpen,
    setIsBrokerSheetOpen,
  } = useInputControls(props);

  const hasResources = hasUploadedFiles;

  // Conditionally render mobile or desktop version
  if (isMobile) {
    return <MobileInputBottomControls {...props} />;
  }

  // Desktop version
  return (
    <>
      <div className="absolute bottom-0 left-0 right-0 h-[50px] bg-muted z-5 rounded-b-2xl">
        {/* Left side controls */}
        <div className="absolute bottom-2 left-4 flex items-center space-x-2">
          {/* Resource picker — replaces bare attachment toggle */}
          <Popover
            open={isResourcePickerOpen}
            onOpenChange={setIsResourcePickerOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 transition-colors ${
                  hasResources || props.fileManager.showFileUpload
                    ? "text-primary"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                }`}
                disabled={props.isDisabled}
                title="Add resources"
              >
                <Database className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0 border-border"
              align="start"
              side="top"
              sideOffset={8}
            >
              <ResourcePickerMenu
                onResourceSelected={(resource: Resource) => {
                  props.onResourceSelected?.(resource);
                  setIsResourcePickerOpen(false);
                }}
                onClose={() => setIsResourcePickerOpen(false)}
              />
            </PopoverContent>
          </Popover>
          {/* Keep upload toggle so users can directly open the upload panel */}
          <ToggleButton
            isEnabled={hasUploadedFiles}
            isWaiting={props.fileManager.showFileUpload}
            isLoading={props.fileManager.isUploading}
            onClick={props.fileManager.toggleFileUpload}
            disabled={props.isDisabled}
            label=""
            defaultIcon={<Paperclip className="w-4 h-4" />}
            enabledIcon={<Paperclip className="w-4 h-4" />}
            tooltip="Upload Files"
          />
          <AudioPlanDialogButton
            isEnabled={settings.planEnabled}
            onClick={handleTogglePlan}
            disabled={props.isDisabled}
            fileManager={props.fileManager}
            conversationId={conversationId}
          />

          <ToggleButton
            isEnabled={settings.searchEnabled}
            onClick={handleToggleSearch}
            disabled={props.isDisabled}
            label=""
            defaultIcon={<Search />}
            enabledIcon={<LuSearchCheck />}
            tooltip="Allow Web Search"
          />
          <ToggleButton
            isEnabled={settings.thinkEnabled}
            onClick={handleToggleThink}
            disabled={props.isDisabled}
            label=""
            defaultIcon={<LuBrain />}
            enabledIcon={<LuBrainCircuit />}
            tooltip="Enable Thinking"
          />
          <ToggleButton
            isEnabled={settings.enableAskQuestions}
            onClick={handleToggleAskQuestions}
            disabled={props.isDisabled}
            label=""
            defaultIcon={<MdOutlineQuestionMark />}
            enabledIcon={<BsPatchQuestion />}
            tooltip="Ask me questions"
          />
          <ToggleButton
            isEnabled={settings.enableBrokers}
            isWaiting={isBrokerSheetOpen}
            onClick={handleToggleBrokers}
            disabled={props.isDisabled}
            label=""
            defaultIcon={<TbVariablePlus />}
            enabledIcon={<TbVariablePlus />}
            tooltip="Add Information Brokers"
          />
          <ToggleButton
            isEnabled={settings.toolsEnabled}
            isWaiting={isToolsSheetOpen}
            onClick={handleToggleTools}
            disabled={props.isDisabled}
            label="Tools"
            defaultIcon={<LiaLightbulbSolid />}
            enabledIcon={<HiOutlineLightBulb />}
            tooltip="Choose AI Tools"
          />
        </div>
        {/* Right side controls */}
        <div className="absolute bottom-2 right-4 flex items-center space-x-3">
          <ToggleButton
            isEnabled={settings.audioEnabled}
            onClick={handleToggleMicrophone}
            disabled={props.isDisabled}
            label=""
            defaultIcon={<Mic />}
            enabledIcon={<FaMicrophoneLines />}
            tooltip="Listen for Speech Input"
          />
          <div className="flex items-center ml-1 relative">
            <ModelSelection
              models={models}
              selectedModelKey={`id:${modelId}` as MatrxRecordId}
              onModelSelect={handleModelSelect}
            />
            <button
              className={`p-2 ml-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors ${
                props.isDisabled ? "opacity-50 cursor-not-allowed" : ""
              }`}
              onClick={props.onSendMessage}
              disabled={props.isDisabled}
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
      </div>
      <AIToolsSheet
        isOpen={isToolsSheetOpen}
        onClose={() => setIsToolsSheetOpen(false)}
      />
      <BrokerSheet
        isOpen={isBrokerSheetOpen}
        onClose={() => setIsBrokerSheetOpen(false)}
      />
    </>
  );
};

export default InputBottomControls;
