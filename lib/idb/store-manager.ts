// lib/idb/store-manager.ts

import { openDB, IDBPDatabase } from 'idb';

export type AsyncResult<T> = Promise<{ data: T | null; error: Error | null }>;

export abstract class DBStoreManager<T> {
    // Subclasses override with their own concrete instance type (static
    // fields can't be generic over T, so this base slot is intentionally
    // untyped — see AudioStore for the pattern).
    protected static _instance: unknown;
    protected db: IDBPDatabase | null = null;
    protected dbName: string;
    protected version: number;

    protected constructor(dbName: string, version: number) {
        this.dbName = dbName;
        this.version = version;
    }

    protected abstract setupStores(db: IDBPDatabase): void;

    protected async initDB(): Promise<void> {
        if (this.db) return;

        try {
            this.db = await openDB(this.dbName, this.version, {
                upgrade: (db, oldVersion, newVersion) => {
                    this.setupStores(db);
                },
            });
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }

    // `add`/`get` carry their own generic (like `query` below) so a subclass
    // whose `T` covers one IDB object store (e.g. Recording) can still read/write
    // a different store's record shape (e.g. RecordingChunk) without a cast —
    // see AudioStore, which manages both `recordings` and `chunks` stores.
    protected async add<TRecord = T>(storeName: string, data: TRecord): AsyncResult<string> {
        try {
            if (!this.db) throw new Error('Database not initialized');
            const id = await this.db.add(storeName, data);
            return { data: id.toString(), error: null };
        } catch (error) {
            return { data: null, error: error as Error };
        }
    }

    protected async get<TRecord = T>(storeName: string, id: string): AsyncResult<TRecord> {
        try {
            if (!this.db) throw new Error('Database not initialized');
            const result = await this.db.get(storeName, id);
            return { data: result as TRecord, error: null };
        } catch (error) {
            return { data: null, error: error as Error };
        }
    }

    protected async getAll(storeName: string): AsyncResult<T[]> {
        try {
            if (!this.db) throw new Error('Database not initialized');
            const result = await this.db.getAll(storeName);
            return { data: result as T[], error: null };
        } catch (error) {
            return { data: null, error: error as Error };
        }
    }

    protected async update<T extends object>(storeName: string, id: number, data: Partial<T>): AsyncResult<boolean> {
        try {
            if (!this.db) throw new Error('Database not initialized');
            const existing = await this.db.get(storeName, id);
            if (!existing) throw new Error('Record not found');

            const updated = { ...existing, ...data };
            await this.db.put(storeName, updated);
            return { data: true, error: null };
        } catch (error) {
            return { data: null, error: error as Error };
        }
    }

    protected async delete(storeName: string, id: number): AsyncResult<boolean> {
        try {
            if (!this.db) throw new Error('Database not initialized');
            await this.db.delete(storeName, id);
            return { data: true, error: null };
        } catch (error) {
            return { data: null, error: error as Error };
        }
    }

    protected async query<T>(
        storeName: string,
        indexName: string,
        query: IDBValidKey | IDBKeyRange
    ): AsyncResult<T[]> {
        try {
            if (!this.db) throw new Error('Database not initialized');
            const result = await this.db.getAllFromIndex(storeName, indexName, query);
            return { data: result as T[], error: null };
        } catch (error) {
            return { data: null, error: error as Error };
        }
    }
}