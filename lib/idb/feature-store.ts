// lib/idb/stores/feature-store.ts
import { IDBPDatabase } from "idb";
import { PublicStoreManager } from "./store-interface";

export abstract class FeatureStore<T> extends PublicStoreManager<T> {
    protected static override _instance: any;
    protected storeName: string;

    protected constructor(dbName: string, version: number, storeName: string) {
        super(dbName, version);
        this.storeName = storeName;
        this.initDB();
    }

    protected abstract override setupStores(db: IDBPDatabase): void;

    public getStoreName(): string {
        return this.storeName;
    }
}