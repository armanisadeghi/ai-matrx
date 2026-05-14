'use client';

/**
 * ImageCropModal
 *
 * Shared dialog/drawer wrapper around ImageCropUploader.
 * Use this whenever you need the pick → crop → upload flow inside a modal
 * (profile photo, org logo, agent avatar, etc.).
 *
 * - Desktop: Dialog (max-w-lg, 512px)
 * - Mobile:  Drawer (bottom sheet)
 *
 * The modal auto-closes after onComplete fires (upload done or Remove clicked).
 */

import React from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { ImageCropUploader } from '@/components/official/ImageCropUploader';
import type { ImageUploaderResult } from '@/components/official/ImageAssetUploader';
import type { AssetPreset, Visibility } from '@/features/files';
import { useMediaQuery } from '@/hooks/use-media-query';

export interface ImageCropModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called with the upload result, or null when the user removes the image. Auto-closes modal after firing. */
    onComplete: (result: ImageUploaderResult | null) => void;
    currentUrl?: string | null;
    preset?: AssetPreset;
    folder?: string;
    visibility?: Visibility;
    /** Dialog / drawer title. */
    title?: string;
    /** Label shown above the picker ("New photo", "New logo", etc.). */
    label?: string;
    defaultAspect?: number;
    /** Shape of the current-image thumbnail — circle for avatars, square for logos. */
    currentImageShape?: 'circle' | 'square';
    /** Alt text for the current image thumbnail. */
    currentImageAlt?: string;
}

interface InnerContentProps {
    currentUrl: string | null;
    preset: AssetPreset;
    folder?: string;
    visibility: Visibility;
    label: string;
    defaultAspect?: number;
    currentImageShape: 'circle' | 'square';
    currentImageAlt: string;
    onDone: (result: ImageUploaderResult | null) => void;
}

function ModalContent({
    currentUrl,
    preset,
    folder,
    visibility,
    label,
    defaultAspect,
    currentImageShape,
    currentImageAlt,
    onDone,
}: InnerContentProps) {
    return (
        <div className="flex flex-col gap-4">
            {currentUrl && (
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div
                            className={cn(
                                'relative h-12 w-12 overflow-hidden ring-2 ring-border shrink-0 bg-muted',
                                currentImageShape === 'circle' ? 'rounded-full' : 'rounded-lg',
                            )}
                        >
                            <Image
                                src={currentUrl}
                                alt={currentImageAlt}
                                fill
                                className="object-cover"
                                sizes="48px"
                            />
                        </div>
                        <div>
                            <p className="text-sm font-medium">Current {label.toLowerCase()}</p>
                            <p className="text-xs text-muted-foreground">
                                Pick or drop a new one below to replace it
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onDone(null)}
                        className="text-xs text-destructive hover:text-destructive/80 shrink-0"
                    >
                        Remove
                    </button>
                </div>
            )}

            <ImageCropUploader
                preset={preset}
                currentUrl={null}
                label={currentUrl ? `New ${label.toLowerCase()}` : label}
                defaultAspect={defaultAspect}
                visibility={visibility}
                folder={folder}
                onComplete={onDone}
                onError={(msg) => toast.error(msg)}
            />
        </div>
    );
}

export function ImageCropModal({
    open,
    onOpenChange,
    onComplete,
    currentUrl,
    preset = 'avatar',
    folder,
    visibility = 'public',
    title = 'Update Image',
    label = 'Image',
    defaultAspect,
    currentImageShape = 'square',
    currentImageAlt = 'Current image',
}: ImageCropModalProps) {
    const isMobile = !useMediaQuery('(min-width: 768px)');

    const handleDone = (result: ImageUploaderResult | null) => {
        onComplete(result);
        onOpenChange(false);
    };

    const content = (
        <ModalContent
            currentUrl={currentUrl ?? null}
            preset={preset}
            folder={folder}
            visibility={visibility}
            label={label}
            defaultAspect={defaultAspect}
            currentImageShape={currentImageShape}
            currentImageAlt={currentImageAlt}
            onDone={handleDone}
        />
    );

    if (isMobile) {
        return (
            <Drawer open={open} onOpenChange={onOpenChange}>
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle>{title}</DrawerTitle>
                    </DrawerHeader>
                    <div className="px-4 pb-8">{content}</div>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                {content}
            </DialogContent>
        </Dialog>
    );
}

export default ImageCropModal;
