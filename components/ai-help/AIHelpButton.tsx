// components/AIHelpButton.tsx
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {HelpCircle} from 'lucide-react';
import {useToast} from '@/components/ui/use-toast';
import {useContextCollection} from '@/hooks/useContextCollection';
import {AIHelpDialog} from './AIHelpDialog';

import {AIHelpResponse} from '@/types/audioHelp';
import { ImageQuality } from '@/types/screenshot';

interface AIHelpButtonProps {
    helpDocs?: Record<string, string>;
    className?: string;
    size?: 'default' | 'sm' | 'lg' | 'icon';
    variant?: 'default' | 'ghost' | 'outline';
    onHelpGenerated?: (response: AIHelpResponse) => void;
    suggestedActions?: {
        label: string;
        action: string;
    }[];
}
// https://claude.ai/chat/327028d1-1df2-4272-816d-83c3e06f72a2


export function AIHelpButton(
    {
        helpDocs = {},
        className = '',
        size = 'icon',
        variant = 'ghost',
        suggestedActions,
        onHelpGenerated
    }: AIHelpButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const {toast} = useToast();
    const {collectContext, isCollecting, lastContext} = useContextCollection(helpDocs);

    const handleOpen = async () => {
        setIsOpen(true);
        if (!lastContext) {
            try {
                await collectContext();
            } catch (err) {
                console.error('Failed to collect context:', err);
                toast({
                    title: "Error",
                    description: "Failed to collect page context",
                    variant: "destructive",
                });
            }
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: "Copied!",
            description: "Content copied to clipboard",
        });
    };

    const handleSaveImage = (quality: ImageQuality = 'full') => {
        if (lastContext?.screenshot) {
            // `ImageQuality` values don't map 1:1 onto `ScreenshotData` keys
            // ('full' -> 'fullSize'); index through this map instead of the
            // union directly, which would silently return `undefined` for 'full'.
            const imageData = quality === 'full'
                ? lastContext.screenshot.fullSize
                : lastContext.screenshot[quality];
            const link = document.createElement('a');
            link.href = imageData;
            link.download = `page-screenshot-${quality}-${new Date().toISOString()}.png`;
            link.click();
        }
    };

    const handleSaveContext = () => {
        if (lastContext) {
            const {screenshot, ...contextWithoutScreenshot} = lastContext;
            const blob = new Blob([JSON.stringify(contextWithoutScreenshot, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `page-context-${new Date().toISOString()}.json`;
            link.click();
            URL.revokeObjectURL(url);
        }
    };

    return (
        <>
            <Button
                variant={variant}
                size={size}
                className={className}
                onClick={handleOpen}
            >
                <HelpCircle className="h-4 w-4" />
            </Button>

            <AIHelpDialog
                isOpen={isOpen}
                onOpenChange={setIsOpen}
                isCollecting={isCollecting}
                lastContext={lastContext}
                onCopy={handleCopy}
                onSaveImage={handleSaveImage}
                onSaveContext={handleSaveContext}
                suggestedActions={suggestedActions}
                relevantElements={lastContext?.relevantElements?.map(el => el.selector) || []}
            />
        </>
    );
}

export default AIHelpButton;
