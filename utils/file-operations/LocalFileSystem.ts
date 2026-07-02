// utils/file-operations/LocalFileSystem.ts
'use client';

import { openDB, IDBPDatabase } from 'idb';

/** Bucket-structure entry shape stored under the METADATA store (`bucket:<name>`). */
interface BucketStructureEntry {
    id: string;
    bucketName: string;
    type: 'bucket';
    structure: {
        contents: Array<{ path: string; [key: string]: unknown }>;
        [key: string]: unknown;
    };
    lastUpdated: number;
}

interface LocalFile {
    id: string;           // bucketName:path
    bucketName: string;
    path: string;
    blob: Blob;
    metadata: Record<string, unknown>;
    version: number;      // For sync tracking
    lastModified: number;
    lastSynced: number;   // Last successful sync with cloud
    status: 'synced' | 'modified' | 'pending_upload' | 'conflict';
}

class LocalFileSystem {
    private static instance: LocalFileSystem;
    private db: IDBPDatabase | null = null;
    private readonly DB_NAME = 'FileSystem';
    private readonly STORES = {
        FILES: 'files',
        METADATA: 'metadata',
        SYNC_STATE: 'syncState'
    };

    private constructor() {}

    static getInstance(): LocalFileSystem {
        if (!LocalFileSystem.instance) {
            LocalFileSystem.instance = new LocalFileSystem();
        }
        return LocalFileSystem.instance;
    }

    isBrowser(): boolean {
        return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
    }

    private async initDB() {
        if (!this.isBrowser()) {
            console.warn('IndexedDB is not available in this environment');
            return null;
        }

        if (!this.db) {
            try {
                this.db = await openDB(this.DB_NAME, 1, {
                    upgrade(db) {
                        // Store for actual file data
                        if (!db.objectStoreNames.contains('files')) {
                            const fileStore = db.createObjectStore('files', { keyPath: 'id' });
                            fileStore.createIndex('bucketName', 'bucketName');
                            fileStore.createIndex('path', 'path');
                            fileStore.createIndex('status', 'status');
                            fileStore.createIndex('version', 'version');
                        }

                        // Store for bucket/folder structure
                        if (!db.objectStoreNames.contains('metadata')) {
                            const metaStore = db.createObjectStore('metadata', { keyPath: 'id' });
                            metaStore.createIndex('bucketName', 'bucketName');
                            metaStore.createIndex('type', 'type');
                        }

                        // Store for sync state
                        if (!db.objectStoreNames.contains('syncState')) {
                            const syncStore = db.createObjectStore('syncState', { keyPath: 'id' });
                            syncStore.createIndex('lastSync', 'lastSync');
                        }
                    },
                });
            } catch (error) {
                console.error('Failed to initialize IndexedDB:', error);
                return null;
            }
        }
        return this.db;
    }

    async getDbSafe(): Promise<IDBPDatabase | null> {
        if (!this.isBrowser()) return null;
        return await this.initDB();
    }

    async storeFile(file: LocalFile): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        await db.put(this.STORES.FILES, file);
    }

    async getFile(bucketName: string, path: string): Promise<LocalFile | null> {
        const db = await this.getDbSafe();
        if (!db) return null;
        const id = `${bucketName}:${path}`;
        return await db.get(this.STORES.FILES, id);
    }

    async updateFileStatus(id: string, status: LocalFile['status']): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const file = await tx.store.get(id);
        if (file) {
            file.status = status;
            await tx.store.put(file);
        }
    }

    async updateBucketStructure(bucketName: string, structure: BucketStructureEntry['structure']): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        await db.put(this.STORES.METADATA, {
            id: `bucket:${bucketName}`,
            bucketName,
            type: 'bucket',
            structure,
            lastUpdated: Date.now()
        });
    }

    async getBucketStructure(bucketName: string): Promise<BucketStructureEntry | null> {
        if (!this.isBrowser()) return null;
        const db = await this.initDB();
        if (!db) return null;
        return await db.get(this.STORES.METADATA, `bucket:${bucketName}`);
    }

    async updateSyncState(bucketName: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        await db.put(this.STORES.SYNC_STATE, {
            id: bucketName,
            lastSync: Date.now()
        });
    }

    async getLastSyncTime(bucketName: string): Promise<number> {
        const db = await this.getDbSafe();
        if (!db) return 0;
        const state = await db.get(this.STORES.SYNC_STATE, bucketName);
        return state?.lastSync || 0;
    }

    async getPendingUploads(): Promise<LocalFile[]> {
        const db = await this.getDbSafe();
        if (!db) return [];
        const index = db.transaction(this.STORES.FILES).store.index('status');
        return await index.getAll('pending_upload');
    }

    async getModifiedFiles(): Promise<LocalFile[]> {
        const db = await this.getDbSafe();
        if (!db) return [];
        const index = db.transaction(this.STORES.FILES).store.index('status');
        return await index.getAll('modified');
    }

    async getConflicts(): Promise<LocalFile[]> {
        const db = await this.getDbSafe();
        if (!db) return [];
        const index = db.transaction(this.STORES.FILES).store.index('status');
        return await index.getAll('conflict');
    }

    async getAllBucketStructures(): Promise<BucketStructureEntry[]> {
        const db = await this.getDbSafe();
        if (!db) return [];
        const tx = db.transaction(this.STORES.METADATA, 'readonly');
        const index = tx.store.index('type');
        return await index.getAll('bucket');
    }

    async deleteFile(bucketName: string, path: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const id = `${bucketName}:${path}`;
        await db.delete(this.STORES.FILES, id);
    }

    async updateFilePath(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const oldId = `${bucketName}:${oldPath}`;
        const file = await tx.store.get(oldId);

        if (file) {
            await tx.store.delete(oldId);

            const newId = `${bucketName}:${newPath}`;
            file.id = newId;
            file.path = newPath;
            await tx.store.put(file);
        }
    }

    async deleteFolder(bucketName: string, folderPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const index = tx.store.index('path');

        const range = IDBKeyRange.bound(
            `${folderPath}/`,
            `${folderPath}/\uffff`
        );

        let cursor = await index.openCursor(range);

        while (cursor) {
            await cursor.delete();
            cursor = await cursor.continue();
        }
    }

    async updateFileMetadata(bucketName: string, path: string, metadata: Record<string, unknown>): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const id = `${bucketName}:${path}`;
        const file = await tx.store.get(id);

        if (file) {
            file.metadata = metadata;
            await tx.store.put(file);
        }
    }

    async getFilesByBucket(bucketName: string): Promise<LocalFile[]> {
        const db = await this.getDbSafe();
        if (!db) return [];
        const tx = db.transaction(this.STORES.FILES, 'readonly');
        const index = tx.store.index('bucketName');
        return await index.getAll(bucketName);
    }

    async fileExists(bucketName: string, path: string): Promise<boolean> {
        const db = await this.getDbSafe();
        if (!db) return false;
        const id = `${bucketName}:${path}`;
        const file = await db.get(this.STORES.FILES, id);
        return !!file;
    }

    async clearBucketStructure(bucketName: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const id = `bucket:${bucketName}`;
        await db.delete(this.STORES.METADATA, id);
    }

    async clearBucketFiles(bucketName: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const index = tx.store.index('bucketName');
        const range = IDBKeyRange.only(bucketName);

        let cursor = await index.openCursor(range);

        while (cursor) {
            await cursor.delete();
            cursor = await cursor.continue();
        }
    }

    async isStructureStale(bucketName: string, threshold: number = 900000): Promise<boolean> {
        const db = await this.getDbSafe();
        if (!db) return true;
        const structure = await db.get(this.STORES.METADATA, `bucket:${bucketName}`);
        if (!structure) return true;

        return Date.now() - structure.lastUpdated > threshold;
    }

    async getStructureLastUpdated(bucketName: string): Promise<number | null> {
        const db = await this.getDbSafe();
        if (!db) return null;
        const structure = await db.get(this.STORES.METADATA, `bucket:${bucketName}`);
        return structure?.lastUpdated || null;
    }

    async markFolderForRename(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const index = tx.store.index('path');
        const range = IDBKeyRange.bound(
            `${oldPath}/`,
            `${oldPath}/\uffff`
        );

        let cursor = await index.openCursor(range);
        while (cursor) {
            const file = cursor.value;
            file.status = 'pending_upload';
            file.metadata = {
                ...file.metadata,
                pendingFolderRename: { oldPath, newPath }
            };
            await cursor.update(file);
            cursor = await cursor.continue();
        }
    }

    async revertFolderRename(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const index = tx.store.index('path');
        const range = IDBKeyRange.bound(
            `${newPath}/`,
            `${newPath}/\uffff`
        );

        let cursor = await index.openCursor(range);
        while (cursor) {
            const file = cursor.value;
            const revertedPath = file.path.replace(newPath, oldPath);
            file.path = revertedPath;
            file.id = `${bucketName}:${revertedPath}`;
            file.status = 'synced';
            delete file.metadata.pendingFolderRename;
            await cursor.update(file);
            cursor = await cursor.continue();
        }
    }

    async getFolderContents(bucketName: string, folderPath: string): Promise<LocalFile[]> {
        const db = await this.getDbSafe();
        if (!db) return [];
        const tx = db.transaction(this.STORES.FILES, 'readonly');
        const index = tx.store.index('path');
        const range = IDBKeyRange.bound(
            folderPath ? `${folderPath}/` : '',
            folderPath ? `${folderPath}/\uffff` : '\uffff'
        );

        const contents: LocalFile[] = [];
        let cursor = await index.openCursor(range);

        while (cursor) {
            contents.push(cursor.value);
            cursor = await cursor.continue();
        }

        return contents;
    }

    async updateFolderStructure(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        const structure = await this.getBucketStructure(bucketName);
        if (structure) {
            structure.structure.contents = structure.structure.contents.map((item) => {
                if (item.path.startsWith(oldPath)) {
                    return {
                        ...item,
                        path: item.path.replace(oldPath, newPath)
                    };
                }
                return item;
            });
            await this.updateBucketStructure(bucketName, structure.structure);
        }
    }

    async updateFile(fileData: Partial<LocalFile> & { id: string }): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const existingFile = await tx.store.get(fileData.id);

        if (existingFile) {
            const updatedFile = {
                ...existingFile,
                ...fileData,
                lastModified: Date.now()
            };
            await tx.store.put(updatedFile);
        }
    }

    async moveFile(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const oldId = `${bucketName}:${oldPath}`;
        const file = await tx.store.get(oldId);

        if (file) {
            await tx.store.delete(oldId);

            const newFile = {
                ...file,
                id: `${bucketName}:${newPath}`,
                path: newPath,
                lastModified: Date.now(),
                status: 'synced'
            };
            await tx.store.put(newFile);
        }
    }

    async createFolder(bucketName: string, folderPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        await db.put(this.STORES.METADATA, {
            id: `folder:${bucketName}:${folderPath}`,
            bucketName,
            path: folderPath,
            type: 'folder',
            created: Date.now()
        });
    }

    async renameFile(
        bucketName: string,
        oldPath: string,
        newPath: string,
        fileData?: Partial<LocalFile>
    ): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.FILES, 'readwrite');
        const oldId = `${bucketName}:${oldPath}`;
        const file = await tx.store.get(oldId);

        if (file) {
            await tx.store.delete(oldId);

            const newFile = {
                ...file,
                ...fileData,
                id: `${bucketName}:${newPath}`,
                path: newPath,
                lastModified: Date.now()
            };
            await tx.store.put(newFile);
        }
    }

    async markFileForDeletion(bucketName: string, path: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const id = `${bucketName}:${path}`;
        const file = await db.get(this.STORES.FILES, id);
        if (file) {
            file.status = 'pending_upload';
            file.metadata = { ...file.metadata, pendingDeletion: true };
            await db.put(this.STORES.FILES, file);
        }
    }

    async revertDeletion(bucketName: string, path: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const id = `${bucketName}:${path}`;
        const file = await db.get(this.STORES.FILES, id);
        if (file) {
            file.status = 'synced';
            const metadata = { ...file.metadata };
            delete metadata.pendingDeletion;
            file.metadata = metadata;
            await db.put(this.STORES.FILES, file);
        }
    }

    async markFileForMove(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const id = `${bucketName}:${oldPath}`;
        const file = await db.get(this.STORES.FILES, id);
        if (file) {
            file.status = 'pending_upload';
            file.metadata = {
                ...file.metadata,
                pendingMove: { oldPath, newPath }
            };
            await db.put(this.STORES.FILES, file);
        }
    }

    async revertMove(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const newId = `${bucketName}:${newPath}`;
        const file = await db.get(this.STORES.FILES, newId);
        if (file) {
            // Delete the new path entry
            await db.delete(this.STORES.FILES, newId);

            // Restore the old path entry
            const oldFile = {
                ...file,
                id: `${bucketName}:${oldPath}`,
                path: oldPath,
                status: 'synced',
                metadata: {
                    ...file.metadata
                }
            };
            delete oldFile.metadata.pendingMove;
            await db.put(this.STORES.FILES, oldFile);
        }
    }

    async markFileForRename(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const id = `${bucketName}:${oldPath}`;
        const file = await db.get(this.STORES.FILES, id);
        if (file) {
            file.status = 'pending_upload';
            file.metadata = {
                ...file.metadata,
                pendingRename: { oldPath, newPath }
            };
            await db.put(this.STORES.FILES, file);
        }
    }

    async revertRename(bucketName: string, oldPath: string, newPath: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const newId = `${bucketName}:${newPath}`;
        const file = await db.get(this.STORES.FILES, newId);
        if (file) {
            // Delete the new path entry
            await db.delete(this.STORES.FILES, newId);

            // Restore the old path entry
            const oldFile = {
                ...file,
                id: `${bucketName}:${oldPath}`,
                path: oldPath,
                status: 'synced',
                metadata: {
                    ...file.metadata
                }
            };
            delete oldFile.metadata.pendingRename;
            await db.put(this.STORES.FILES, oldFile);
        }
    }

    async cachePublicUrl(bucketName: string, path: string, url: string): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        await db.put(this.STORES.METADATA, {
            id: `url:${bucketName}:${path}`,
            url,
            timestamp: Date.now()
        });
    }

    async getCachedPublicUrl(bucketName: string, path: string): Promise<string | null> {
        const db = await this.getDbSafe();
        if (!db) return null;
        const cached = await db.get(this.STORES.METADATA, `url:${bucketName}:${path}`);
        if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
            return cached.url;
        }
        return null;
    }

    async storeBuckets(buckets: Array<{ name: string; [key: string]: unknown }>): Promise<void> {
        const db = await this.getDbSafe();
        if (!db) return;
        const tx = db.transaction(this.STORES.METADATA, 'readwrite');
        await Promise.all(buckets.map(bucket =>
            tx.store.put({
                id: `bucket-info:${bucket.name}`,
                type: 'bucket-info',
                ...bucket,
                lastUpdated: Date.now()
            })
        ));
    }

    async getBuckets(): Promise<Array<{ id: string; name: string; type: 'bucket-info'; lastUpdated: number; [key: string]: unknown }>> {
        const db = await this.getDbSafe();
        if (!db) return [];
        const tx = db.transaction(this.STORES.METADATA, 'readonly');
        const index = tx.store.index('type');
        return await index.getAll('bucket-info');
    }

}

export default LocalFileSystem;