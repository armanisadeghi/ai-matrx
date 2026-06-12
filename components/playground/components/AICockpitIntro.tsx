import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlusCircle, Book, Boxes, Atom, Zap } from 'lucide-react';
import { BackgroundBeamsWithCollision } from '@/components/ui/background-beams-with-collision';
import QuickRefSelect from '@/app/entities/quick-reference/QuickRefSelectFloatingLabel';
import QuickRefSearchableSelect from '@/app/entities/quick-reference/QuickRefSearchableSelect';
import { RecipeTemplatesGallery } from "../templates/RecipeTemplatesGallery";

const AICockpitIntro = ({ onNewRecipe }) => {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [isTemplatesDialogOpen, setIsTemplatesDialogOpen] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePosition({
                x: (e.clientX / window.innerWidth) * 2 - 1,
                y: (e.clientY / window.innerHeight) * 2 - 1,
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    const handleNewRecipe = () => {
        if (onNewRecipe && typeof onNewRecipe === 'function') {
            onNewRecipe();
        }
    };

    const handleSelectTemplate = (template) => {
        // Template will be loaded when new recipe is created
        localStorage.setItem('pendingRecipeTemplate', JSON.stringify(template));
        handleNewRecipe();
        setIsTemplatesDialogOpen(false);
    };

    return (
        <div className='flex-1 w-full relative overflow-hidden'>
            {/* Beams layer */}
            <BackgroundBeamsWithCollision className='absolute inset-0 !h-full'>
                {/* Content layer */}
                <div className='relative z-20 h-full w-full flex flex-col items-center justify-center p-8'>
                    {/* Logo and title */}
                    <div className='mb-12 text-center'>
                        <div className='flex items-center justify-center mb-4'>
                            <div className='relative'>
                                <Boxes className='h-16 w-16 text-blue-600 dark:text-blue-400' />
                                <Atom className='absolute -right-4 -top-4 h-6 w-6 text-amber-500 dark:text-amber-400 animate-pulse' />
                            </div>
                        </div>
                        <h1 className='text-4xl font-bold mb-2 text-slate-900 dark:text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.1)]'>AI Cockpit</h1>
                        <div className='relative mx-auto inline-block'>
                            <p className='text-lg bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600 dark:from-blue-400 dark:via-violet-400 dark:to-purple-400 font-medium'>
                                Create and manage your AI workflows
                            </p>
                        </div>
                    </div>

                    {/* Action cards */}
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full'>
                        {/* Start New Card */}
                        <Card
                            onClick={handleNewRecipe}
                            className='group relative overflow-hidden p-6 bg-white/80 dark:bg-slate-800/50 hover:bg-white/90 dark:hover:bg-slate-800/80 backdrop-blur-sm transition-all duration-300 cursor-pointer border-0 shadow-lg'
                        >
                            <div className='absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />
                            <div className='relative z-10'>
                                <div className='flex items-center justify-between mb-4'>
                                    <PlusCircle className='h-8 w-8 text-blue-600 dark:text-blue-400' />
                                    <div className='h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 absolute right-0 top-0 transform -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />
                                </div>
                                <h2 className='text-xl font-semibold mb-2 text-slate-900 dark:text-white'>Start New</h2>
                                <p className='text-slate-600 dark:text-slate-400'>
                                    Create a new AI workflow from scratch.
                                </p>
                            </div>
                        </Card>

                        {/* Recipe Templates Card */}
                        <Card
                            onClick={() => setIsTemplatesDialogOpen(true)}
                            className='group relative overflow-hidden p-6 bg-white/80 dark:bg-slate-800/50 hover:bg-white/90 dark:hover:bg-slate-800/80 backdrop-blur-sm transition-all duration-300 cursor-pointer border-0 shadow-lg'
                        >
                            <div className='absolute inset-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />
                            <div className='relative z-10'>
                                <div className='flex items-center justify-between mb-4'>
                                    <Zap className='h-8 w-8 text-amber-600 dark:text-amber-400' />
                                    <div className='h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 absolute right-0 top-0 transform -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />
                                </div>
                                <h2 className='text-xl font-semibold mb-2 text-slate-900 dark:text-white'>Recipe Templates</h2>
                                <p className='text-slate-600 dark:text-slate-400'>
                                    Start with pre-built workflow templates.
                                </p>
                            </div>
                        </Card>

                        {/* Use Saved Card */}
                        <Card
                            className='group relative overflow-hidden p-6 bg-white/80 dark:bg-slate-800/50 hover:bg-white/90 dark:hover:bg-slate-800/80 backdrop-blur-sm transition-all duration-300 cursor-pointer border-0 shadow-lg'
                        >
                            <div className='absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />
                            <div className='relative z-10'>
                                <div className='flex items-center justify-between mb-4'>
                                    <Book className='h-8 w-8 text-emerald-600 dark:text-emerald-400' />
                                    <div className='h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 absolute right-0 top-0 transform -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />
                                </div>
                                <h2 className='text-xl font-semibold mb-2 text-slate-900 dark:text-white'>Use Saved</h2>
                                <p className='text-slate-600 pb-2 dark:text-slate-400'>Access your previously created recipes.</p>
                                <QuickRefSearchableSelect
                                    entityKey='recipe'
                                    fetchMode='fkIfk'
                                />
                            </div>
                        </Card>
                    </div>

                    {/* Footer text */}
                    <div className='mt-12 text-center'>
                        <p className='text-sm bg-clip-text text-transparent bg-gradient-to-r from-slate-600 via-slate-500 to-slate-600 dark:from-slate-400 dark:via-slate-300 dark:to-slate-400 font-medium'>
                            AI Matrix — Where Workflows Meet Intelligence
                        </p>
                    </div>
                </div>
            </BackgroundBeamsWithCollision>

            {/* Recipe Templates Dialog */}
            <Dialog open={isTemplatesDialogOpen} onOpenChange={setIsTemplatesDialogOpen}>
                <DialogContent className='max-w-[95vw] max-h-[95dvh] p-0'>
                    <RecipeTemplatesGallery 
                        onSelectTemplate={handleSelectTemplate}
                        className='h-[90dvh]'
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AICockpitIntro;
