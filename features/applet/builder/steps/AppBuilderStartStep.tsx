"use client";
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { SelectAppStep } from "@/features/applet/builder/modules/app-builder/SelectAppStep";
import { AppConfigStep } from "@/features/applet/builder/modules/app-builder/AppConfigStep";
import { v4 as uuidv4 } from "uuid";
import { useAppDispatch } from "@/lib/redux/hooks";
import { startNewApp } from "@/lib/redux/app-builder/slices/appBuilderSlice";
import { Plus, ListTodo, ChevronLeft, Layers, Boxes } from "lucide-react";
import SimpleTemplateDialog from "@/features/applet/builder/parts/SimpleTemplateDialog";
import ComplexTemplateDialog from "@/features/applet/builder/parts/ComplexTemplateDialog";
import { CardGrid } from "@/components/official/cards/CardGrid";

interface AppBuilderStartStepProps {
    onAppSelected: (id: string) => void;
    onAppSaved: (appId: string) => void;
    selectedAppId: string | null;
    onUpdateCompletion: (completion: { isComplete: boolean; canProceed: boolean; message?: string }) => void;
}

const AppBuilderStartStep: React.FC<AppBuilderStartStepProps> = ({ onAppSelected, onAppSaved, selectedAppId, onUpdateCompletion }) => {
    const dispatch = useAppDispatch();
    const [view, setView] = useState<"select" | "create" | "edit" | "choice">("choice");
    const [newAppId, setNewAppId] = useState<string | null>(null);
    const [isSimpleTemplateDialogOpen, setIsSimpleTemplateDialogOpen] = useState(false);
    const [isComplexTemplateDialogOpen, setIsComplexTemplateDialogOpen] = useState(false);

    const handleCreateNewApp = () => {
        const newAppId = uuidv4();
        dispatch(startNewApp({ id: newAppId }));
        setNewAppId(newAppId);
        setView("create");
        onUpdateCompletion({ isComplete: false, canProceed: true });
    };

    const handleAppSelected = (appId: string) => {
        onAppSelected(appId);
        setView("edit");
        onUpdateCompletion({ isComplete: true, canProceed: true });
    };

    const handleSelectExisting = () => {
        setView("select");
        onUpdateCompletion({ isComplete: false, canProceed: true });
    };

    const handleBackToChoice = () => {
        setView("choice");
        onUpdateCompletion({ isComplete: false, canProceed: false });
    };

    const handleOpenSimpleTemplateDialog = () => {
        setIsSimpleTemplateDialogOpen(true);
    };

    const handleOpenComplexTemplateDialog = () => {
        setIsComplexTemplateDialogOpen(true);
    };

    const handleAppCreated = (appId: string) => {
        setNewAppId(appId);
        onAppSaved(appId);
    };

    const cards = [
        {
            icon: <ListTodo className="h-12 w-12" />,
            title: "Start From Existing App",
            onClick: handleSelectExisting,
        },
        {
            icon: <Plus className="h-12 w-12" />,
            title: "Create New App",
            onClick: handleCreateNewApp,
        },
        {
            icon: <Layers className="h-12 w-12" />,
            title: "Start From Simple Template",
            description: "One Applet, One Container, One Field Only",
            onClick: handleOpenSimpleTemplateDialog,
        },
        {
            icon: <Boxes className="h-12 w-12" />,
            title: "Start From Complex Template",
            description: "Multiple Applets, Multiple Containers, Many Fields",
            onClick: handleOpenComplexTemplateDialog,
        },
    ];

    return (
        <Card className="w-full bg-textured border-none shadow-lg">
            {view === "choice" && (
                <div className="p-8 md:p-12">
                    <CardGrid
                        title="How would you like to start?"
                        cards={cards}
                        columns={2}
                        headerClassName="text-center pb-8"
                        className="bg-textured border-none shadow-none"
                    />
                </div>
            )}

            {view === "select" && (
                <div className="p-4">
                    <div
                        onClick={handleBackToChoice}
                        className="flex items-center mb-4 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer transition-colors w-fit"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Back to options</span>
                    </div>
                    <SelectAppStep
                        onAppSelected={handleAppSelected}
                        onCreateNewApp={handleCreateNewApp}
                        selectedAppId={selectedAppId}
                        onUpdateCompletion={onUpdateCompletion}
                    />
                </div>
            )}

            {view === "edit" && selectedAppId && (
                <div className="p-4">
                    <div
                        onClick={handleBackToChoice}
                        className="flex items-center mb-4 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer transition-colors w-fit"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Back to options</span>
                    </div>
                    <AppConfigStep appId={selectedAppId} onAppSaved={onAppSaved} onUpdateCompletion={onUpdateCompletion} />
                </div>
            )}

            {view === "create" && newAppId && (
                <div className="p-4">
                    <div
                        onClick={handleBackToChoice}
                        className="flex items-center mb-4 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer transition-colors w-fit"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Back to options</span>
                    </div>
                    <AppConfigStep appId={newAppId} onAppSaved={onAppSaved} onUpdateCompletion={onUpdateCompletion} />
                </div>
            )}

            <SimpleTemplateDialog
                isOpen={isSimpleTemplateDialogOpen}
                onClose={() => setIsSimpleTemplateDialogOpen(false)}
                onAppCreated={handleAppCreated}
            />

            <ComplexTemplateDialog
                isOpen={isComplexTemplateDialogOpen}
                onClose={() => setIsComplexTemplateDialogOpen(false)}
                onAppCreated={handleAppCreated}
            />
        </Card>
    );
};

export default AppBuilderStartStep;
