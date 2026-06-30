import { useCallback, useEffect, RefObject } from "react";

interface UseClipboardPasteProps {
    textareaRef: RefObject<HTMLTextAreaElement>;
    onPasteImage: (file: File) => Promise<void>;
    disabled?: boolean;
}

/**
 * Hook to handle clipboard paste events for images in a textarea
 */
export const useClipboardPaste = ({ textareaRef, onPasteImage, disabled = false }: UseClipboardPasteProps) => {
    const handlePaste = useCallback(
        async (event: ClipboardEvent) => {
            // Return early if the feature is disabled
            if (disabled) return;

            // Check if the clipboard has items
            if (!event.clipboardData || !event.clipboardData.items) return;

            const items = event.clipboardData.items;
            let imageFile: File | null = null;

            // Look for image items in the clipboard
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    // Prevent default to avoid pasting image as text
                    event.preventDefault();

                    // Get the blob from the clipboard
                    const blob = items[i].getAsFile();
                    if (!blob) continue;

                    // Create a proper filename with timestamp
                    const timestamp = new Date().getTime();
                    const filename = `pasted-image-${timestamp}.png`;

                    // Create a File object from the blob
                    imageFile = new File([blob], filename, { type: blob.type });
                    break;
                }
            }

            // Process the image file if found
            if (imageFile) {
                try {
                    await onPasteImage(imageFile);
                } catch (error) {
                    console.error("Error processing pasted image:", error);
                }
            }
        },
        [onPasteImage, disabled]
    );

    // Add and remove the paste event listener
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return undefined;

        textarea.addEventListener("paste", handlePaste);

        return () => {
            textarea.removeEventListener("paste", handlePaste);
        };
    }, [textareaRef, handlePaste]);

    return null; // This hook doesn't need to return anything
};
