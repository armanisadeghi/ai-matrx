"use client";
import React, { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save } from "lucide-react";

export interface TabDefinition {
    id: string;
    label: string;
    content: ReactNode;
    className?: string;
}

export interface SplitScreenOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    leftTabs: TabDefinition[];
    rightTabs: TabDefinition[];
    initialLeftTab?: string;
    initialRightTab?: string;
    onLeftTabChange?: (newTab: string) => void;
    onRightTabChange?: (newTab: string) => void;
    footerContent?: ReactNode;
    showSaveButton?: boolean;
    onSave?: () => void;
    saveButtonLabel?: string;
    saveButtonDisabled?: boolean;
    showCancelButton?: boolean;
    onCancel?: () => void;
    cancelButtonLabel?: string;
    additionalButtons?: ReactNode;
    width?: string;
    height?: string;
    leftPanelWidth?: string;
    rightPanelWidth?: string;
}

const SplitScreenOverlay: React.FC<SplitScreenOverlayProps> = ({
    isOpen,
    onClose,
    title,
    description,
    leftTabs,
    rightTabs,
    initialLeftTab,
    initialRightTab,
    onLeftTabChange,
    onRightTabChange,
    footerContent,
    showSaveButton = false,
    onSave,
    saveButtonLabel = "Save",
    saveButtonDisabled = false,
    showCancelButton = false,
    onCancel,
    cancelButtonLabel = "Cancel",
    additionalButtons,
    width = "90vw",
    height = "95dvh",
    leftPanelWidth = "50%",
    rightPanelWidth = "50%",
}) => {
    const [activeLeftTab, setActiveLeftTab] = React.useState<string>(
        initialLeftTab || (leftTabs.length > 0 ? leftTabs[0].id : "")
    );
    
    const [activeRightTab, setActiveRightTab] = React.useState<string>(
        initialRightTab || (rightTabs.length > 0 ? rightTabs[0].id : "")
    );

    const handleLeftTabChange = (newTab: string) => {
        setActiveLeftTab(newTab);
        if (onLeftTabChange) {
            onLeftTabChange(newTab);
        }
    };

    const handleRightTabChange = (newTab: string) => {
        setActiveRightTab(newTab);
        if (onRightTabChange) {
            onRightTabChange(newTab);
        }
    };

    const handleSave = () => {
        if (onSave) {
            onSave();
        }
    };

    const handleCancel = () => {
        if (onCancel) {
            onCancel();
        } else {
            onClose();
        }
    };

    const renderTabsList = (tabs: TabDefinition[], activeTab: string, onTabChange: (tab: string) => void) => (
        <TabsList className="rounded-3xl space-x-2">
            {tabs.map((tab, index) => {
                // Determine tab position styling
                let positionClass = "";
                if (tabs.length === 1) {
                    // If only one tab, it gets both rounded corners
                    positionClass = "rounded-l-3xl rounded-r-3xl";
                } else if (index === 0) {
                    // First tab always gets left rounded corners
                    positionClass = "rounded-l-3xl";
                } else if (index === tabs.length - 1) {
                    // Last tab always gets right rounded corners
                    positionClass = "rounded-r-3xl";
                }
                
                return (
                    <TabsTrigger
                        key={tab.id}
                        className={`${positionClass} px-4 py-2 border-border hover:bg-gray-100 dark:hover:bg-gray-600 active:bg-gray-200 dark:active:bg-gray-600 data-[state=active]:bg-gray-200 dark:data-[state=active]:bg-gray-700`}
                        value={tab.id}
                    >
                        {tab.label}
                    </TabsTrigger>
                );
            })}
        </TabsList>
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={`flex flex-col w-[${width}] max-w-[${width}] h-[${height}] max-h-[${height}] p-0 gap-0 border-3 border-solid border-slate-500 rounded-3xl`}>
                <DialogHeader className="flex flex-row justify-between items-center border-b px-4 py-2 flex-shrink-0">
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription className="sr-only">{description}</DialogDescription>}
                </DialogHeader>

                <div className="flex flex-row flex-grow overflow-hidden">
                    {/* Left Panel */}
                    <div className={`flex flex-col border-r border-border`} style={{ width: leftPanelWidth }}>
                        <div className="p-2 border-b border-border">
                            <Tabs value={activeLeftTab} onValueChange={handleLeftTabChange}>
                                {renderTabsList(leftTabs, activeLeftTab, handleLeftTabChange)}
                            </Tabs>
                        </div>
                        <Tabs value={activeLeftTab} className="flex-grow flex flex-col overflow-hidden">
                            {leftTabs.map((tab) => (
                                <TabsContent key={tab.id} value={tab.id} className="flex-grow mt-0 border-none overflow-auto outline-none ring-0">
                                    {tab.content}
                                </TabsContent>
                            ))}
                        </Tabs>
                    </div>

                    {/* Right Panel */}
                    <div className={`flex flex-col`} style={{ width: rightPanelWidth }}>
                        <div className="p-2 border-b border-border">
                            <Tabs value={activeRightTab} onValueChange={handleRightTabChange}>
                                {renderTabsList(rightTabs, activeRightTab, handleRightTabChange)}
                            </Tabs>
                        </div>
                        <Tabs value={activeRightTab} className="flex-grow flex flex-col overflow-hidden">
                            {rightTabs.map((tab) => (
                                <TabsContent key={tab.id} value={tab.id} className="flex-grow mt-0 border-none overflow-auto outline-none ring-0">
                                    {tab.content}
                                </TabsContent>
                            ))}
                        </Tabs>
                    </div>
                </div>

                {(showSaveButton || showCancelButton || additionalButtons || footerContent) && (
                    <DialogFooter className="border-t p-4 flex justify-end flex-shrink-0">
                        {additionalButtons}
                        {footerContent}
                        {showCancelButton && (
                            <Button variant="outline" onClick={handleCancel}>
                                {cancelButtonLabel}
                            </Button>
                        )}
                        {showSaveButton && (
                            <Button onClick={handleSave} disabled={saveButtonDisabled}>
                                <Save className="h-4 w-4 mr-2" />
                                {saveButtonLabel}
                            </Button>
                        )}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default SplitScreenOverlay; 