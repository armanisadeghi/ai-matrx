// utils/fileSystemTypes.ts
// Shared types for file system utilities that can be imported by both client and server

export type DirectoryType = 'public' | 'app' | 'custom';

export interface DirectoryOptions {
    type: DirectoryType;
    path: string[];
    environment?: 'development' | 'production' | 'auto';
}

export interface DirectoryEntry {
    path: string;
    name: string;
}

export interface FileOperationResult {
    success: boolean;
    filePath?: string;
    clickableLink?: string;
    error?: string;
}

export interface FileContentResult {
    content: unknown;
    type: string;
    viewerType: 'json' | 'text' | 'markdown' | 'image' | 'binary' | 'none';
    error?: string;
}
