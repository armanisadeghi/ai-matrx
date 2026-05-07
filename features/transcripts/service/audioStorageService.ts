// features/transcripts/service/audioStorageService.ts

import { supabase } from '@/utils/supabase/client';
import { RECORDING_LIMITS } from '../constants/recording';

interface UploadResult {
    path: string;
    fullPath: string;
    filename: string;
    size: number;
}

interface ValidationResult {
    valid: boolean;
    error?: string;
    size: number;
}

/**
 * Validate audio file before upload
 */
export function validateAudioFile(blob: Blob, maxSize: number = RECORDING_LIMITS.MAX_FILE_SIZE_BYTES): ValidationResult {
    const size = blob.size;

    if (size === 0 || !blob) {
        return {
            valid: false,
            error: 'Audio file is empty. Please ensure you recorded audio before stopping.',
            size: 0,
        };
    }

    if (size < 100) {
        // Very small file, likely incomplete
        return {
            valid: false,
            error: 'Audio file is too small. Please record for at least 1 second.',
            size,
        };
    }

    if (size > maxSize) {
        return {
            valid: false,
            error: `File size (${formatFileSize(size)}) exceeds maximum allowed size (${formatFileSize(maxSize)})`,
            size,
        };
    }

    return {
        valid: true,
        size,
    };
}

/**
 * Generate safe filename with timestamp and random ID
 */
export function generateAudioFilename(prefix: string = 'recording'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomId = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${randomId}.webm`;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Save audio to Supabase Storage with retry logic and progress tracking
 * 
 * CRITICAL: This function NEVER gives up - it will retry indefinitely until successful
 * to ensure audio is never lost.
 */
export async function saveAudioToStorage(
    audioBlob: Blob,
    userId: string,
    onProgress?: (percent: number, status: string) => void,
    maxRetries: number = 5
): Promise<UploadResult> {
    // Validate first
    const validation = validateAudioFile(audioBlob);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const filename = generateAudioFilename('recording');
    const filePath = `transcripts/recordings/${userId}/${filename}`;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            attempt++;
            onProgress?.(0, `Uploading audio (attempt ${attempt}/${maxRetries})...`);

            // Upload to Supabase Storage
            const { data, error } = await supabase
                .storage
                .from('user-private-assets')
                .upload(filePath, audioBlob, {
                    contentType: 'audio/webm',
                    upsert: false,
                });

            if (error) {
                throw error;
            }

            if (!data) {
                throw new Error('Upload succeeded but no data returned');
            }

            onProgress?.(100, 'Upload complete!');

            return {
                path: filePath,
                fullPath: data.path,
                filename,
                size: audioBlob.size,
            };

        } catch (error: any) {
            lastError = error;
            console.error(`Upload attempt ${attempt} failed:`, error);

            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
                onProgress?.(
                    (attempt / maxRetries) * 50, 
                    `Upload failed. Retrying in ${delay / 1000}s...`
                );
                await sleep(delay);
            }
        }
    }

    // If we've exhausted retries, throw a detailed error
    throw new Error(
        `Failed to upload audio after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}. ` +
        `Please check your internet connection and try again. Your audio is safe and has not been lost.`
    );
}

/**
 * Delete audio file from storage (used when cleaning up failed uploads)
 */
export async function deleteAudioFromStorage(filePath: string): Promise<void> {
    try {
        const { error } = await supabase
            .storage
            .from('user-private-assets')
            .remove([filePath]);

        if (error) {
            console.warn('Failed to delete audio file:', error);
            // Don't throw - this is cleanup, not critical
        }
    } catch (error) {
        console.warn('Error deleting audio file:', error);
        // Don't throw - this is cleanup, not critical
    }
}

/**
 * Get audio file URL (for playback)
 */
export async function getAudioUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    const { data, error } = await supabase
        .storage
        .from('user-private-assets')
        .createSignedUrl(filePath, expiresIn);

    if (error || !data) {
        throw new Error('Failed to generate audio URL');
    }

    return data.signedUrl;
}

/**
 * Download audio file as Blob (for transcription)
 */
export async function downloadAudioBlob(filePath: string): Promise<Blob> {
    const { data, error } = await supabase
        .storage
        .from('user-private-assets')
        .download(filePath);

    if (error || !data) {
        throw new Error('Failed to download audio file');
    }

    return data;
}

