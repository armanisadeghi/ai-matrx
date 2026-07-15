"use client";

import React, { useState, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper } from "@/features/applet/builder/parts/Stepper";
import { StepperFooter } from "@/features/applet/builder/parts/StepperFooter";
import { AppletsConfigStep } from "@/features/applet/builder/steps/AppletsConfigStep";
import { GroupsConfigStep } from "@/features/applet/builder/steps/ContainerConfigStep";
import { FieldsBrokerConfigStep } from "@/features/applet/builder/steps/FieldsBrokerConfigStep";
import { PreviewConfig } from "@/features/applet/builder/previews/PreviewConfig";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectAppLoading, selectAppError, selectHasUnsavedAppChanges, selectAppSlug } from "@/lib/redux/app-builder/selectors/appSelectors";
import AppBuilderDebugOverlay from "@/components/admin/AppBuilderDebugOverlay";
import {
    selectAppletError,
    selectAppletLoading,
    selectAppletsByAppId,
    selectHasUnsavedAppletChanges,
} from "@/lib/redux/app-builder/selectors/appletSelectors";
import {
    selectContainerError,
    selectContainerLoading,
    selectHasUnsavedContainerChanges,
} from "@/lib/redux/app-builder/selectors/containerSelectors";
import { selectFieldError, selectFieldLoading, selectHasUnsavedFieldChanges } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { recompileAppletThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";
import SourceConfigStep from "@/features/applet/builder/steps/SourceConfigStep";
import AppBuilderStartStep from "@/features/applet/builder/steps/AppBuilderStartStep";
import { saveAppThunk } from "@/lib/redux/app-builder/thunks/appBuilderThunks";

interface StepCompletion {
    isComplete: boolean;
    canProceed: boolean;
    message?: string;
    footerButtons?: ReactNode;
}

export const ConfigBuilder = () => {
    const { toast } = useToast();
    const dispatch = useAppDispatch();
    const [activeStep, setActiveStep] = useState(0);
    const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

    const [stepCompletions, setStepCompletions] = useState<StepCompletion[]>([
        { isComplete: false, canProceed: false }, // App Start step (combined select & create)
        { isComplete: false, canProceed: true }, // Applets Config step
        { isComplete: false, canProceed: true }, // Source Config step
        { isComplete: false, canProceed: true }, // Groups Config step
        { isComplete: false, canProceed: true }, // Fields Config step
        { isComplete: true, canProceed: false }, // Preview step - no next step
    ]);

    const [nextAppRecompile, setNextAppRecompile] = useState(false);
    const [nextAppletRecompile, setNextAppletRecompile] = useState(false);
    const [nextContainerRecompile, setNextContainerRecompile] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [compilingErrors, setCompilingErrors] = useState<string[]>([]);

    const [actionFeedback, setActionFeedback] = useState<{
        message: string;
        type: "success" | "error" | "info" | "warning";
    } | null>(null);

    const allAppApplets = useAppSelector((state) =>
        selectedAppId ? selectAppletsByAppId(state, selectedAppId) : []
    );

    const isAppletLoading = useAppSelector(selectAppletLoading);
    const isAppLoading = useAppSelector(selectAppLoading);
    const isContainerLoading = useAppSelector(selectContainerLoading);
    const isFieldLoading = useAppSelector(selectFieldLoading);
    const isAppError = useAppSelector(selectAppError);
    const isAppletError = useAppSelector(selectAppletError);
    const isContainerError = useAppSelector(selectContainerError);
    const isFieldError = useAppSelector(selectFieldError);
    const appSlug = useAppSelector((state) =>
        selectedAppId ? selectAppSlug(state, selectedAppId) : null
    );

    const hasUnsavedAppChanges = useAppSelector(selectHasUnsavedAppChanges);
    const hasUnsavedAppletChanges = useAppSelector(selectHasUnsavedAppletChanges);
    const hasUnsavedContainerChanges = useAppSelector(selectHasUnsavedContainerChanges);
    const hasUnsavedFieldChanges = useAppSelector(selectHasUnsavedFieldChanges);

    const isLoading = isAppletLoading || isAppLoading || isContainerLoading || isFieldLoading || isCompiling;
    const isError = isAppletError || isAppError || isContainerError || isFieldError || compilingErrors.length > 0;
    const needsRecompile = nextAppRecompile || nextAppletRecompile || nextContainerRecompile;

    const hasUnsavedChanges = hasUnsavedAppChanges || hasUnsavedAppletChanges || hasUnsavedContainerChanges || hasUnsavedFieldChanges;

    const steps = [
        { id: "app-start", title: "Start App", description: "Create new or select existing" },
        { id: "applets-config", title: "Applets", description: "Create & Configure Applets" },
        { id: "source-config", title: "Intelligence", description: "Connect to Intelligence sources" },
        { id: "broker-config", title: "Field Mapping", description: "Map brokers to fields" },
        { id: "container-config", title: "Containers", description: "Put fields into containers" },
        { id: "preview", title: "Deploy", description: "Finalize & Launch your app" },
    ];

    const handleNext = async () => {
        if (activeStep === 0) {
            setActiveStep(1);
        } else if (!selectedAppId) {
            setActionFeedback({
                message: "Select an app before continuing",
                type: "error",
            });
        } else if (activeStep === 1) {
            dispatch(saveAppThunk(selectedAppId));
            setActiveStep(2);
        } else if (activeStep === 2) {
            setActiveStep(3);
        } else if (activeStep === 3) {
            setActiveStep(4);
            dispatch(saveAppThunk(selectedAppId));
        } else if (activeStep === 4) {
            await recompileAllApplets();
            dispatch(saveAppThunk(selectedAppId));
        } else if (activeStep < steps.length - 1) {
            dispatch(saveAppThunk(selectedAppId));
            setActiveStep(activeStep + 1);
        }
    };

    const recompileAllApplets = async () => {
        if (!selectedAppId || !allAppApplets.length) {
            setActionFeedback({
                message: "No applets found to compile",
                type: "error",
            });
            toast({
                title: "No applets found",
                description: "There are no applets to compile for this app.",
                variant: "destructive",
            });
            return;
        }

        try {
            setIsCompiling(true);
            setCompilingErrors([]);

            // Show toast to indicate compilation is starting
            toast({
                title: "Compiling Your App",
                description: "Please wait while we compile all applets...",
            });

            // Create array of promises for all recompile operations
            const recompilePromises = allAppApplets.map((applet) =>
                dispatch(recompileAppletThunk(applet.id))
                    .unwrap()
                    .catch((error) => {
                        // Track individual applet compilation errors
                        setCompilingErrors((prev) => [
                            ...prev,
                            `Failed to compile ${applet.name || applet.id}: ${error.message || "Unknown error"}`,
                        ]);
                        return null;
                    })
            );

            // Wait for all recompilations to complete
            const results = await Promise.all(recompilePromises);

            // Check if any compilation failed
            if (compilingErrors.length > 0) {
                setActionFeedback({
                    message: "Compilation failed. Check the errors above.",
                    type: "error",
                });
                toast({
                    title: "Compilation Failed",
                    description: `Failed to compile some applets. Please check the errors and try again.`,
                    variant: "destructive",
                });
                return;
            }

            toast({
                title: "Compilation Complete",
                description: "Your app is ready for preview!",
            });

            setActiveStep(activeStep + 1);
        } catch (error: any) {
            setActionFeedback({
                message: error.message || "Compilation failed unexpectedly",
                type: "error",
            });
            toast({
                title: "Compilation Failed",
                description: error.message || "An unexpected error occurred during compilation.",
                variant: "destructive",
            });
        } finally {
            setIsCompiling(false);
        }
    };

    const handleBack = () => {
        if (activeStep > 0) {
            setActiveStep(activeStep - 1);
        }
    };

    const handleAppSaved = (appId: string) => {
        setSelectedAppId(appId);
        setActiveStep(1);
    };

    const handleAppSelected = (appId: string) => {
        setSelectedAppId(appId);
        // setActiveStep(1);
    };

    // Reset to the app selection step
    const resetToSelectStep = () => {
        setActiveStep(0);
        toast({
            title: "Select Different App",
            description: "You can select a different app or create a new one.",
        });
    };

    // Method for steps to report their completion status
    const updateStepCompletion = (stepIndex: number, completion: Partial<StepCompletion>) => {
        // Use a function form to ensure we're working with the latest state
        // and to prevent unnecessary re-renders
        setStepCompletions((prev) => {
            // Check if the values are actually different before updating state
            const current = prev[stepIndex];
            const hasChanges =
                completion.isComplete !== current.isComplete ||
                completion.canProceed !== current.canProceed ||
                completion.message !== current.message;

            // Only update state if there are actual changes
            if (!hasChanges) return prev;

            const updated = [...prev];
            updated[stepIndex] = { ...updated[stepIndex], ...completion };
            return updated;
        });
    };

    // Error display component
    const renderCompilationErrors = () => {
        if (compilingErrors.length === 0) return null;

        return (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <h3 className="text-red-600 dark:text-red-400 font-medium mb-2">Compilation Errors:</h3>
                <ul className="list-disc pl-5 text-sm text-red-600 dark:text-red-400">
                    {compilingErrors.map((error, index) => (
                        <li key={index}>{error}</li>
                    ))}
                </ul>
            </div>
        );
    };

    // Handle app launch
    const handleLaunchApp = () => {
        if (!selectedAppId) {
            toast({
                title: "No App Selected",
                description: "Cannot launch an app that hasn't been selected.",
                variant: "destructive",
            });
            return;
        }

        setActionFeedback({
            message: "Launching your app...",
            type: "info",
        });

        // Here you'd normally redirect to the app or perform some launch action
        toast({
            title: "App Launch Initiated",
            description: "Your app is being launched in a new window.",
        });

        window.open(`/apps/custom/${appSlug}`);
    };

    return (
        <div className="w-full h-full px-4 bg-textured">
            <div className="w-full max-w-[1600px] mx-auto">
                <Card className="border-none bg-textured space-y-2">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold text-rose-500 pt-4">App Configuration Builder</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Stepper
                            steps={steps}
                            activeStep={activeStep}
                            showDescription={true}
                            onStepClick={(index) => {
                                // Only allow clicking on completed steps or the next step
                                if (index <= activeStep || index <= steps.findIndex((s) => s.id === "preview")) {
                                    setActiveStep(index);
                                }
                            }}
                        />

                        {actionFeedback && (
                            <div
                                className={`mt-4 p-3 rounded-md ${
                                    actionFeedback.type === "success"
                                        ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                                        : actionFeedback.type === "error"
                                        ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                                        : actionFeedback.type === "warning"
                                        ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                                        : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                                }`}
                            >
                                <p>{actionFeedback.message}</p>
                            </div>
                        )}

                        <div className="mt-8 relative">
                            {isLoading && (
                                <div className="absolute inset-0 bg-white/70 dark:bg-gray-900/70 flex flex-col items-center justify-center z-10">
                                    <LoadingSpinner size="lg" />
                                    <p className="mt-2 text-gray-600 dark:text-gray-300">
                                        {isCompiling ? "Compiling Your App..." : "Loading..."}
                                    </p>
                                </div>
                            )}

                            {renderCompilationErrors()}

                            {activeStep === 0 && (
                                <div className="w-full">
                                    <AppBuilderStartStep
                                        onAppSelected={handleAppSelected}
                                        onAppSaved={handleAppSaved}
                                        selectedAppId={selectedAppId}
                                        onUpdateCompletion={(completion) => updateStepCompletion(0, completion)}
                                    />
                                </div>
                            )}

                            {activeStep === 1 && selectedAppId && (
                                <div className="w-full rounded-3xl shadow-lg border border-rose-200 dark:border-rose-700">
                                    <AppletsConfigStep
                                        appId={selectedAppId}
                                        onUpdateCompletion={(completion) => updateStepCompletion(1, completion)}
                                    />
                                </div>
                            )}

                            {activeStep === 2 && selectedAppId && (
                                <div className="w-full rounded-3xl shadow-lg border border-rose-200 dark:border-rose-700">
                                    <SourceConfigStep
                                        appId={selectedAppId}
                                        onUpdateCompletion={(completion) => updateStepCompletion(2, completion)}
                                    />
                                </div>
                            )}
                            {activeStep === 3 && selectedAppId && (
                                <div className="w-full rounded-3xl shadow-lg border border-rose-200 dark:border-rose-700">
                                    <FieldsBrokerConfigStep
                                        appId={selectedAppId}
                                        onUpdateCompletion={(completion) => updateStepCompletion(3, completion)}
                                    />
                                </div>
                            )}

                            {activeStep === 4 && selectedAppId && (
                                <div className="w-full rounded-3xl shadow-lg border border-rose-200 dark:border-rose-700">
                                    <GroupsConfigStep
                                        appId={selectedAppId}
                                        onUpdateCompletion={(completion) => updateStepCompletion(4, completion)}
                                    />
                                </div>
                            )}

                            {/* PreviewConfig has been updated to use Redux directly and only needs an appId */}
                            {activeStep === 5 && selectedAppId && (
                                <div className="w-full rounded-3xl shadow-lg border border-rose-200 dark:border-rose-700">
                                    <PreviewConfig
                                        appId={selectedAppId}
                                        onUpdateCompletion={(completion) => updateStepCompletion(5, completion)}
                                    />
                                </div>
                            )}
                        </div>
                    </CardContent>
                    <StepperFooter
                        activeStep={activeStep}
                        totalSteps={steps.length}
                        currentStepCompletion={stepCompletions[activeStep]}
                        selectedAppId={selectedAppId}
                        isLoading={isLoading}
                        onNext={handleNext}
                        onBack={handleBack}
                        onReset={resetToSelectStep}
                        onLaunchApp={handleLaunchApp}
                        showLaunchButton={activeStep === steps.length - 1}
                        backButtonText="Back"
                        resetButtonText="Select Different App"
                        nextButtonText="Next"
                        finalStepButtonText="Finish"
                        secondToLastStepButtonText="Compile & Preview"
                        launchButtonText="Launch App"
                    />
                </Card>
            </div>
            <AppBuilderDebugOverlay position="middle-right" />
        </div>
    );
};

export default ConfigBuilder;
