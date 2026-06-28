"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Play,
    Route,
    Copy,
    AppWindow,
    LayoutTemplate,
    Code2,
    MoreVertical,
    Loader2,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { usePromptRunner } from "@/features/prompts/hooks/usePromptRunner";
import { useUser } from "@/lib/hooks/useUser";
import { ConvertToBuiltinModal } from "@/features/prompts/components/layouts/ConvertToBuiltinModal";
import { UpdatePromptAppModal } from "@/features/prompt-apps/components/UpdatePromptAppModal";
import type { PromptMessage, PromptVariable } from "@/features/prompts/types/core";
import { usePromptsBasePath } from "../../hooks/usePromptsBasePath";

export interface PromptActionsMenuProps {
    /** Prompt ID - required */
    promptId: string;
    
    /** Prompt data for operations that need it (duplicate, create app) */
    promptData?: {
        name: string;
        messages?: PromptMessage[];
        variableDefaults?: PromptVariable[];
        settings?: Record<string, unknown>;
        description?: string;
        tools?: unknown;
    };
    
    /** Custom trigger element (defaults to MoreVertical icon button) */
    trigger?: React.ReactNode;
    
    /** Additional CSS classes for the trigger button */
    triggerClassName?: string;
    
    /** Align the dropdown menu */
    align?: "start" | "center" | "end";
    
    /** Side of the trigger to position the menu */
    side?: "top" | "right" | "bottom" | "left";
    
    /** Callback after successful duplicate */
    onDuplicateSuccess?: (newPromptId: string) => void;
    
    /** Callback after successful conversion to template */
    onConvertToTemplateSuccess?: () => void;
    
    /** Callback after successful conversion to builtin prompt */
    onConvertToBuiltinSuccess?: () => void;
}

/**
 * PromptActionsMenu - Reusable menu for prompt actions
 * 
 * Provides a dropdown menu with various prompt actions:
 * - Auto Run Modal
 * - Run Mode (navigate to run page)
 * - Duplicate
 * - Create App
 * - Convert to Template (Admin only)
 * - Convert to Builtin Prompt (Admin only)
 * 
 * @example
 * ```tsx
 * <PromptActionsMenu 
 *   promptId={prompt.id} 
 *   promptData={prompt}
 * />
 * ```
 */
export function PromptActionsMenu({
    promptId,
    promptData,
    trigger,
    triggerClassName = "",
    align = "end",
    side = "bottom",
    onDuplicateSuccess,
    onConvertToTemplateSuccess,
    onConvertToBuiltinSuccess,
}: PromptActionsMenuProps) {
    const router = useRouter();
    const { openPrompt } = usePromptRunner();
    const dispatch = useAppDispatch();
    const { isAdmin } = useUser();
    const basePath = usePromptsBasePath();
    
    const [isOpen, setIsOpen] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    
    // Modal states
    const [isConvertToBuiltinModalOpen, setIsConvertToBuiltinModalOpen] = useState(false);
    const [isCreateAppModalOpen, setIsCreateAppModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
    
    // Template conversion state
    const [templateConversionState, setTemplateConversionState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [templateError, setTemplateError] = useState<string>('');
    const [createdTemplateId, setCreatedTemplateId] = useState<string | null>(null);
    
    // Duplicate state
    const [duplicateState, setDuplicateState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [duplicateError, setDuplicateError] = useState<string>('');
    const [duplicatedPromptId, setDuplicatedPromptId] = useState<string | null>(null);
    
    // Open Run Modal - Opens the prompt runner modal
    const handleOpenRunModal = () => {
        setIsOpen(false);
        openPrompt({
            promptId,
            executionConfig: {
                auto_run: false,
                allow_chat: true,
                show_variables: true,
                apply_variables: false,
                track_in_runs: true,
                use_pre_execution_input: false,
            },
        });
    };
    
    // Go To Run Page - Navigate to dedicated run page (full-page runner)
    const handleGoToRunPage = () => {
        setIsOpen(false);
        router.push(`${basePath}/run/${promptId}`);
    };
    
    // Duplicate - Create a copy of the prompt with loading modal
    const handleDuplicate = async () => {
        if (!promptData) {
            toast.error("Cannot duplicate", {
                description: "Prompt data not available",
            });
            return;
        }
        
        setIsOpen(false);
        setIsDuplicateModalOpen(true);
        setDuplicateState('loading');
        setIsDuplicating(true);
        
        try {
            const copyName = `${promptData.name} (Copy)`;
            
            const result = await dispatch(createUserPrompt({
                name: copyName,
                description: promptData.description,
                messages: promptData.messages || [],
                variableDefaults: promptData.variableDefaults || [],
                settings: promptData.settings || {},
            })).unwrap();
            
            if (result?.id) {
                setDuplicatedPromptId(result.id);
                setDuplicateState('success');
            } else {
                throw new Error("Failed to create duplicate");
            }
        } catch (error) {
            console.error("Error duplicating prompt:", error);
            const msg = error instanceof Error
                ? error.message
                : (typeof error === 'object' && error !== null && 'message' in error)
                    ? String((error as { message: unknown }).message)
                    : JSON.stringify(error) || "Unknown error";
            setDuplicateError(msg);
            setDuplicateState('error');
        } finally {
            setIsDuplicating(false);
        }
    };
    
    // Create App - Open modal to check for existing apps first
    const handleCreateApp = () => {
        setIsOpen(false);
        setIsCreateAppModalOpen(true);
    };
    
    // Convert to Template (Admin only) - with loading modal
    const handleConvertToTemplate = async () => {
        setIsOpen(false);
        setIsTemplateModalOpen(true);
        setTemplateConversionState('loading');
        
        try {
            const response = await fetch(`/api/prompts/${promptId}/convert-to-template`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to convert to template");
            }
            
            const result = await response.json();
            setCreatedTemplateId(result.template?.id);
            setTemplateConversionState('success');
            
            if (onConvertToTemplateSuccess) {
                onConvertToTemplateSuccess();
            }
        } catch (error) {
            console.error("Error converting to template:", error);
            setTemplateError(error instanceof Error ? error.message : "Unknown error");
            setTemplateConversionState('error');
        }
    };
    
    // Convert to Builtin Prompt (Admin only) - Opens modal
    const handleConvertToBuiltin = () => {
        setIsOpen(false);
        setIsConvertToBuiltinModalOpen(true);
    };
    
    // Check if any async operations are in progress
    const isLoading = isDuplicating;
    
    // Default trigger if none provided
    const defaultTrigger = (
        <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 rounded-full hover:bg-accent ${triggerClassName}`}
            disabled={isLoading}
        >
            {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
                <MoreVertical className="h-3 w-3" />
            )}
        </Button>
    );
    
    return (
        <>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                {trigger || defaultTrigger}
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} side={side} className="w-56">
                {/* Run Actions */}
                <DropdownMenuItem onClick={handleOpenRunModal}>
                    <Play className="h-4 w-4 mr-2" />
                    Open Run Modal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleGoToRunPage}>
                    <Route className="h-4 w-4 mr-2" />
                    Go To Run Page
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                {/* Creation Actions */}
                <DropdownMenuItem onClick={handleDuplicate} disabled={!promptData || isDuplicating}>
                    {isDuplicating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Copy className="h-4 w-4 mr-2" />
                    )}
                    Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCreateApp}>
                    <AppWindow className="h-4 w-4 mr-2" />
                    Create App
                </DropdownMenuItem>
                
                {/* Admin Actions */}
                {isAdmin && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleConvertToTemplate}>
                            <LayoutTemplate className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
                            <span className="text-amber-600 dark:text-amber-400">
                                Convert to Template
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleConvertToBuiltin}>
                            <Code2 className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
                            <span className="text-amber-600 dark:text-amber-400">
                                Convert to Builtin
                            </span>
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Duplicate Modal */}
        <Dialog open={isDuplicateModalOpen} onOpenChange={setIsDuplicateModalOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Duplicating Prompt</DialogTitle>
                    <DialogDescription>
                        {duplicateState === 'loading' && 'Creating a copy of your prompt...'}
                        {duplicateState === 'success' && 'Prompt duplicated successfully!'}
                        {duplicateState === 'error' && 'Failed to duplicate prompt'}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    {duplicateState === 'loading' && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Please wait...</p>
                        </div>
                    )}
                    
                    {duplicateState === 'success' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                                <p className="text-sm font-medium">Copy created successfully!</p>
                            </div>
                            
                            <div className="flex gap-2">
                                <Button 
                                    onClick={() => {
                                        if (duplicatedPromptId) {
                                            if (onDuplicateSuccess) {
                                                onDuplicateSuccess(duplicatedPromptId);
                                            } else {
                                                router.push(`${basePath}/edit/${duplicatedPromptId}`);
                                            }
                                        }
                                        setIsDuplicateModalOpen(false);
                                    }}
                                    className="flex-1"
                                >
                                    Open Copy
                                </Button>
                                <Button 
                                    variant="outline"
                                    onClick={() => setIsDuplicateModalOpen(false)}
                                    className="flex-1"
                                >
                                    Stay Here
                                </Button>
                            </div>
                        </div>
                    )}
                    
                    {duplicateState === 'error' && (
                        <div className="space-y-4">
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{duplicateError}</AlertDescription>
                            </Alert>
                            
                            <Button 
                                variant="outline"
                                onClick={() => setIsDuplicateModalOpen(false)}
                                className="w-full"
                            >
                                Close
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
        
        {/* Template Conversion Modal */}
        <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Converting to Template</DialogTitle>
                    <DialogDescription>
                        {templateConversionState === 'loading' && 'Creating template from your prompt...'}
                        {templateConversionState === 'success' && 'Template created successfully!'}
                        {templateConversionState === 'error' && 'Failed to create template'}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    {templateConversionState === 'loading' && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Please wait...</p>
                        </div>
                    )}
                    
                    {templateConversionState === 'success' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                                <p className="text-sm font-medium">Template created successfully!</p>
                            </div>
                            
                            <div className="flex gap-2">
                                <Button 
                                    onClick={() => {
                                        if (createdTemplateId) {
                                            router.push(`${basePath}/templates/${createdTemplateId}`);
                                        } else {
                                            router.push(`${basePath}/templates`);
                                        }
                                        setIsTemplateModalOpen(false);
                                    }}
                                    className="flex-1"
                                >
                                    View Template
                                </Button>
                                <Button 
                                    variant="outline"
                                    onClick={() => setIsTemplateModalOpen(false)}
                                    className="flex-1"
                                >
                                    Stay Here
                                </Button>
                            </div>
                        </div>
                    )}
                    
                    {templateConversionState === 'error' && (
                        <div className="space-y-4">
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{templateError}</AlertDescription>
                            </Alert>
                            
                            <Button 
                                variant="outline"
                                onClick={() => setIsTemplateModalOpen(false)}
                                className="w-full"
                            >
                                Close
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
        
        {/* Convert to Builtin Modal */}
        {promptData && (
            <ConvertToBuiltinModal
                isOpen={isConvertToBuiltinModalOpen}
                onClose={() => setIsConvertToBuiltinModalOpen(false)}
                promptId={promptId}
                promptName={promptData.name}
                currentPromptData={promptData}
                onSuccess={() => {
                    if (onConvertToBuiltinSuccess) {
                        onConvertToBuiltinSuccess();
                    }
                    setIsConvertToBuiltinModalOpen(false);
                }}
            />
        )}

        {/* Create / Update App Modal */}
        <UpdatePromptAppModal
            isOpen={isCreateAppModalOpen}
            onClose={() => setIsCreateAppModalOpen(false)}
            promptId={promptId}
            promptName={promptData?.name || 'Untitled'}
            mode="from-prompt"
            onSuccess={() => setIsCreateAppModalOpen(false)}
            onCreateNew={() => router.push(`/prompt-apps/new?promptId=${promptId}`)}
        />
    </>
    );
}

