// features/transcripts/types.ts

export interface TranscriptSegment {
    id: string;
    timecode: string;
    seconds: number;
    text: string;
    speaker?: string;
}

export interface Transcript {
    id: string;
    user_id: string;
    title: string;
    description: string;
    segments: TranscriptSegment[];
    metadata: {
        duration?: number;
        wordCount?: number;
        segmentCount?: number;
        recordingDate?: string;
        speakers?: string[];
        [key: string]: any;
    };
    audio_file_path?: string | null; // cld_files UUID (universal file handler)
    video_file_path?: string | null; // cld_files UUID (universal file handler)
    source_type: 'audio' | 'video' | 'meeting' | 'interview' | 'other';
    tags: string[];
    folder_name: string;
    is_deleted: boolean;
    is_draft: boolean; // Draft status for recordings
    draft_saved_at?: string; // When draft was saved
    created_at: string;
    updated_at: string;
}

export interface CreateTranscriptInput {
    title?: string;
    description?: string;
    segments: TranscriptSegment[];
    metadata?: Transcript['metadata'];
    audio_file_path?: string | null;
    video_file_path?: string | null;
    source_type?: 'audio' | 'video' | 'meeting' | 'interview' | 'other';
    tags?: string[];
    folder_name?: string;
}

export interface UpdateTranscriptInput {
    title?: string;
    description?: string;
    segments?: TranscriptSegment[];
    metadata?: Transcript['metadata'];
    audio_file_path?: string | null;
    video_file_path?: string | null;
    source_type?: 'audio' | 'video' | 'meeting' | 'interview' | 'other';
    tags?: string[];
    folder_name?: string;
}

export interface TranscriptFilters {
    search?: string;
    tags?: string[];
    folder_name?: string;
    source_type?: string;
}

export type TranscriptSortField = 'title' | 'created_at' | 'updated_at';
export type TranscriptSortOrder = 'asc' | 'desc';

export interface TranscriptSortConfig {
    field: TranscriptSortField;
    order: TranscriptSortOrder;
}

export interface FolderGroup {
    folder_name: string;
    transcripts: Transcript[];
    count: number;
}

