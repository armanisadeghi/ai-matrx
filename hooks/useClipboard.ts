import { useState, useCallback } from 'react';
import { extractErrorMessage } from '@/utils/errors';
import { useToast } from '@/components/ui/use-toast';

interface UseClipboardResult {
    copyText: (text: string, successMessage?: string) => Promise<void>;
    copyImage: (imageSrc: string, successMessage?: string) => Promise<void>;
    copyLink: (link: string, stripParams?: boolean, successMessage?: string) => Promise<void>;
    pasteText: () => Promise<string>;
    pasteImage: () => Promise<File | null>;
    lastCopied: string | null;
    error: Error | null;
}

export function useClipboard(): UseClipboardResult {
    const [lastCopied, setLastCopied] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const { toast } = useToast(); // Use the toast hook directly in the clipboard

    const handleSuccess = (type: string, successMessage: string | undefined) => {
        setLastCopied(type);
        setError(null);
        toast({
            title: successMessage || `${type.charAt(0).toUpperCase() + type.slice(1)} copied to clipboard!`,
        });
    };

    const handleError = (err: unknown, type: string) => {
        const message = `Failed to copy ${type}`;
        setError(err instanceof Error ? err : new Error(message));
        console.error(message, err);
        toast({
            title: message,
            variant: 'destructive',
        });
    };

    const copyText = useCallback(async (text: string, successMessage?: string) => {
        try {
            await navigator.clipboard.writeText(text);
            handleSuccess('text', successMessage);
        } catch (err) {
            handleError(err, 'text');
        }
    }, []);

    const copyImage = useCallback(async (imageSrc: string, successMessage?: string) => {
        try {
            const response = await fetch(imageSrc);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Failed to get canvas context');

            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = async () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);

                    canvas.toBlob(async (pngBlob) => {
                        if (pngBlob) {
                            const item = new ClipboardItem({ 'image/png': pngBlob });
                            try {
                                await navigator.clipboard.write([item]);
                                handleSuccess('image', successMessage);
                                resolve();
                            } catch (err) {
                                reject(err instanceof Error ? err : new Error('Failed to write image to clipboard'));
                            }
                        } else {
                            reject(new Error('Failed to convert image to PNG'));
                        }
                    }, 'image/png');
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = URL.createObjectURL(blob);
            });
        } catch (err) {
            handleError(err, 'image');
        }
    }, []);

    const copyLink = useCallback(async (link: string, stripParams: boolean = false, successMessage?: string) => {
        try {
            if (stripParams) {
                const url = new URL(link);
                link = `${url.origin}${url.pathname}`;
            }
            await navigator.clipboard.writeText(link);
            handleSuccess('link', successMessage);
        } catch (err) {
            handleError(err, 'link');
        }
    }, []);

    const pasteText = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            setError(null);
            return text;
        } catch (err) {
            setError(err instanceof Error ? err : new Error(extractErrorMessage(err)));
            console.error('Failed to paste text: ', err);
            return '';
        }
    }, []);

    const pasteImage = useCallback(async () => {
        try {
            // clipboard.read() is not available in Safari < 16.4
            if (!navigator.clipboard?.read) return null;
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    return new File([blob], 'pasted-image.png', { type: imageType });
                }
            }
            return null;
        } catch (err) {
            setError(err instanceof Error ? err : new Error(extractErrorMessage(err)));
            console.error('Failed to paste image: ', err);
            return null;
        }
    }, []);

    return { copyText, copyImage, copyLink, pasteText, pasteImage, lastCopied, error };
}
