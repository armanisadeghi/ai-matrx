import { IDBPDatabase } from 'idb';
import { DBStoreManager } from '../store-manager';
import {
    Recording,
    RecordingChunk,
    AsyncResult,
    STORES,
    RecordingStatus
} from '@/types/audioRecording.types';

class AudioStore extends DBStoreManager<Recording> {
    protected static override _instance: AudioStore;
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    private constructor() {
        super('voiceNotesDB', 2);
    }

    static getInstance(): AudioStore {
        if (!AudioStore._instance) {
            AudioStore._instance = new AudioStore();
        }
        return AudioStore._instance;
    }

    protected setupStores(db: IDBPDatabase): void {
        if (!db.objectStoreNames.contains(STORES.RECORDINGS)) {
            const recordingsStore = db.createObjectStore(STORES.RECORDINGS, {
                keyPath: 'id',
                autoIncrement: true
            });
            recordingsStore.createIndex('filename', 'filename', { unique: true });
            recordingsStore.createIndex('status', 'status');
            recordingsStore.createIndex('created_at', 'created_at');
        }

        if (!db.objectStoreNames.contains(STORES.CHUNKS)) {
            const chunksStore = db.createObjectStore(STORES.CHUNKS, {
                keyPath: 'id',
                autoIncrement: true
            });
            chunksStore.createIndex('recording_id', 'recording_id');
            chunksStore.createIndex('chunk_index', 'chunk_index');
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return;

        if (!this.initPromise) {
            this.initPromise = this.initDB().then(() => {
                this.initialized = true;
            });
        }

        await this.initPromise;
    }

    async createRecording(
        recording: Partial<Pick<Recording, 'filename' | 'title' | 'duration' | 'status' | 'size' | 'recording_quality'>>
    ): AsyncResult<string> {
        await this.ensureInitialized();

        const now = new Date();
        const newRecording: Omit<Recording, 'id'> = {
            filename: recording.filename || 'default_filename',
            title: recording.title || 'Untitled Recording',
            duration: recording.duration || 0,
            status: recording.status || 'recording',
            size: recording.size || 0,
            recording_quality: recording.recording_quality || {
                sampleRate: 44100,
                bitDepth: 16,
                channels: 2,
            },
            created_at: now,
            updated_at: now,
        };

        return this.add(STORES.RECORDINGS, newRecording);
    }

    async getRecording(id: number): AsyncResult<Recording> {
        await this.ensureInitialized();
        return this.get(STORES.RECORDINGS, id.toString());
    }

    async getAllRecordings(): AsyncResult<Recording[]> {
        await this.ensureInitialized();
        return this.getAll(STORES.RECORDINGS);
    }

    async updateRecording(id: number, changes: Partial<Recording>): AsyncResult<boolean> {
        await this.ensureInitialized();
        const now = new Date();
        return this.update(STORES.RECORDINGS, id, { ...changes, updated_at: now });
    }

    async deleteRecording(id: number): AsyncResult<boolean> {
        await this.ensureInitialized();
        const chunksResult = await this.getRecordingChunks(id);
        if (chunksResult.data) {
            for (const chunk of chunksResult.data) {
                if (chunk.id) {
                    const deleteResult = await this.delete(STORES.CHUNKS, chunk.id);
                    if (deleteResult.error) return deleteResult;
                }
            }
        }
        return this.delete(STORES.RECORDINGS, id);
    }

    async getRecordingsByStatus(status: RecordingStatus): AsyncResult<Recording[]> {
        await this.ensureInitialized();
        return this.query(STORES.RECORDINGS, 'status', status);
    }

    async saveChunk(chunk: Omit<RecordingChunk, 'id'>): AsyncResult<string> {
        await this.ensureInitialized();
        return this.add<Omit<RecordingChunk, 'id'>>(STORES.CHUNKS, chunk);
    }

    async getChunk(id: number): AsyncResult<RecordingChunk> {
        await this.ensureInitialized();
        return this.get<RecordingChunk>(STORES.CHUNKS, id.toString());
    }

    async getRecordingChunks(recordingId: number): AsyncResult<RecordingChunk[]> {
        await this.ensureInitialized();
        return this.query(STORES.CHUNKS, 'recording_id', recordingId);
    }

    async deleteChunk(id: number): AsyncResult<boolean> {
        await this.ensureInitialized();
        return this.delete(STORES.CHUNKS, id);
    }

    async getRecordingWithChunks(recordingId: number): AsyncResult<{
        recording: Recording;
        chunks: RecordingChunk[]
    }> {
        await this.ensureInitialized();

        const [recordingResult, chunksResult] = await Promise.all([
            this.getRecording(recordingId),
            this.getRecordingChunks(recordingId)
        ]);

        if (recordingResult.error) return { data: null, error: recordingResult.error };
        if (chunksResult.error) return { data: null, error: chunksResult.error };
        if (!recordingResult.data) return { data: null, error: new Error('Recording not found') };

        return {
            data: {
                recording: recordingResult.data,
                chunks: chunksResult.data ?? []
            },
            error: null
        };
    }

    async assembleRecordingBlob(recordingId: number): AsyncResult<Blob | null> {
        await this.ensureInitialized();

        const chunksResult = await this.getRecordingChunks(recordingId);
        if (chunksResult.error) return { data: null, error: chunksResult.error };
        if (!chunksResult.data?.length) return { data: null, error: null };

        try {
            const sortedChunks = [...chunksResult.data].sort((a, b) => a.chunk_index - b.chunk_index);
            const blobs = sortedChunks.map(chunk => chunk.blob);
            const assembledBlob = new Blob(blobs, { type: 'audio/wav' });
            return { data: assembledBlob, error: null };
        } catch (error) {
            return { data: null, error: error as Error };
        }
    }

    async updateRecordingStatus(
        id: number,
        status: RecordingStatus,
        additionalData?: Partial<Recording>
    ): AsyncResult<boolean> {
        await this.ensureInitialized();
        return this.updateRecording(id, { status, ...additionalData });
    }
}

export const audioStore = AudioStore.getInstance();