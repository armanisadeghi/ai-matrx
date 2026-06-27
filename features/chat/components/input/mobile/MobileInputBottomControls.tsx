import React from "react";
import { Paperclip, Search, ArrowUp, Mic } from "lucide-react";
import { LuSearchCheck } from "react-icons/lu";
import ToggleButton from "@/components/matrx/toggles/ToggleButton";
import AIToolsSheet from "@/features/chat/components/input/AIToolsSheet";
import { FaMicrophoneLines } from "react-icons/fa6";
import { CgAttachment } from "react-icons/cg";
import { MatrxRecordId } from "@/types/records";
import ModelSelection from "@/features/chat/components/input/ModelSelection";
import MobileMenu from "./MatrxMobileMenu";
import BrokerSheet from "@/features/chat/components/input/BrokerSheet";
import useInputControls from "@/features/chat/hooks/useInputControls";
import { FileManagerReturn } from "@/hooks/ai/chat/useFileManagement";

interface InputBottomControlsProps {
    isDisabled: boolean;
    onSendMessage: () => void;
    onToggleTools?: () => void;
    fileManager: FileManagerReturn;
    onAddSpecialContent?: (content: string) => void;
}

const MobileInputBottomControls = (props: InputBottomControlsProps) => {
    // Use the same hook as the desktop version
    const {
        conversationId,
        settings,
        isToolsSheetOpen,
        isBrokerSheetOpen,
        hasUploadedFiles,
        modelId,
        models,
        updateSettings,
        handleToggleSearch,
        handleToggleTools,
        handleToggleBrokers,
        handleToggleMicrophone,
        handleModelSelect,
        handleTogglePlan,
        handleToggleResearch,
        handleToggleRecipes,
        setIsToolsSheetOpen,
        setIsBrokerSheetOpen
    } = useInputControls(props);


    return (
        <>
            <div className="absolute bottom-0 left-0 right-0 h-[50px] bg-muted z-5 rounded-b-2xl">
                {/* Left side controls - only show 3 most important controls */}
                <div className="absolute bottom-2 left-4 flex items-center space-x-2">
                    <ToggleButton
                        isEnabled={hasUploadedFiles}
                        isWaiting={props.fileManager.showFileUpload}
                        isLoading={props.fileManager.isUploading}
                        onClick={props.fileManager.toggleFileUpload}
                        disabled={props.isDisabled}
                        label=""
                        defaultIcon={<CgAttachment />}
                        enabledIcon={<Paperclip />}
                        tooltip="Upload Files"
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

                    {/* Mobile menu with expanded options */}
                    <MobileMenu
                        settings={settings}
                        updateSettings={updateSettings}
                        isDisabled={props.isDisabled}
                        handleToggleTools={handleToggleTools}
                        handleToggleBrokers={handleToggleBrokers}
                        handleTogglePlan={handleTogglePlan}
                        handleToggleResearch={handleToggleResearch}
                        handleToggleRecipes={handleToggleRecipes}
                        fileManager={props.fileManager}
                        conversationId={conversationId}
                    />
                </div>

                {/* Right side controls */}
                <div className="absolute bottom-2 right-4 flex items-center space-x-3">
                    <div className="flex items-center ml-1 relative">
                        <ModelSelection
                            models={models}
                            selectedModelKey={`id:${modelId}` as MatrxRecordId}
                            onModelSelect={handleModelSelect}
                            isMobile={true}
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
                    <ToggleButton
                        isEnabled={settings.audioEnabled}
                        onClick={handleToggleMicrophone}
                        disabled={props.isDisabled}
                        label=""
                        defaultIcon={<Mic />}
                        enabledIcon={<FaMicrophoneLines />}
                        tooltip="Listen for Speech Input"
                    />
                </div>
            </div>
            <AIToolsSheet isOpen={isToolsSheetOpen} onClose={() => setIsToolsSheetOpen(false)} isMobile={true} />
            <BrokerSheet isOpen={isBrokerSheetOpen} onClose={() => setIsBrokerSheetOpen(false)} />
        </>
    );
};

export default MobileInputBottomControls;