'use client';

import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CockpitControls } from '../types';
import { RefreshCw, Copy, Maximize2 } from 'lucide-react';

interface CompiledRecipeDisplayProps {
    cockpitControls: CockpitControls;
}

interface ActionButtonProps {
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, icon, label }) => (
    <Button
        variant='ghost'
        size='sm'
        className='h-6 w-6 p-0 text-muted-foreground hover:text-foreground'
        onClick={onClick}
        aria-label={label}
    >
        {icon}
    </Button>
);

export function CompiledRecipeDisplay({ cockpitControls }: CompiledRecipeDisplayProps) {
    const { recipeRecord, compiledData, recompileRecipe } = cockpitControls.aiCockpitHook;
    const [isFullScreen, setIsFullScreen] = useState(false);
    const compiledRecipe = compiledData?.recipe;

    useEffect(() => {
        recompileRecipe();
    }, []);

    const handleCompile = () => {
        recompileRecipe();
    };

    const handleCopy = async () => {
        if (compiledRecipe) {
            await navigator.clipboard.writeText(JSON.stringify(compiledRecipe, null, 2));
        }
    };

    const formattedContent = compiledRecipe ? JSON.stringify(compiledRecipe, null, 2) : 'Click compile to view recipe';

    return (
        <>
            <Card className='relative h-full bg-textured overflow-hidden'>
                <div className='absolute inset-0 flex flex-col'>
                    <div className='p-2 flex items-center justify-between'>
                        <div className='text-sm text-muted-foreground'>Compiled Recipe {recipeRecord?.name}</div>
                        <div className='flex gap-1'>
                            <ActionButton
                                onClick={handleCompile}
                                icon={<RefreshCw size={14} />}
                                label='Compile Recipe'
                            />
                            <ActionButton
                                onClick={handleCopy}
                                icon={<Copy size={14} />}
                                label='Copy to Clipboard'
                            />
                            <ActionButton
                                onClick={() => setIsFullScreen(true)}
                                icon={<Maximize2 size={14} />}
                                label='View Fullscreen'
                            />
                        </div>
                    </div>
                    <div className='flex-1 overflow-auto bg-textured'>
                        <pre className='p-4 text-sm whitespace-pre-wrap break-all'>{formattedContent}</pre>
                    </div>
                </div>
            </Card>

            <Dialog
                open={isFullScreen}
                onOpenChange={setIsFullScreen}
            >
                <DialogContent className='max-w-[90vw] max-h-[90dvh] flex flex-col'>
                    <div className='flex items-center gap-2 mb-4'>
                        <DialogTitle className='text-lg font-semibold'>Compiled Recipe View</DialogTitle>
                        <Button
                            variant='ghost'
                            size='sm'
                            className='h-8 w-8 p-0 text-muted-foreground hover:text-foreground'
                            onClick={handleCopy}
                            aria-label='Copy to Clipboard'
                        >
                            <Copy size={16} />
                        </Button>
                    </div>
                    <div className='flex-1 overflow-auto'>
                        <pre className='p-4 text-sm whitespace-pre-wrap break-all'>{formattedContent}</pre>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default CompiledRecipeDisplay;
