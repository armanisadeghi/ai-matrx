// Canonical record-id alias, decoupled from the entity system.
export type MatrxRecordId = string;

/**
 * Minimal shape of a quick-reference record used outside the entity system.
 * The full version lives in lib/redux/entity/types/stateTypes — this copy
 * intentionally avoids importing AllEntityFieldKeys so non-entity consumers
 * (rich-text-editor, etc.) stay decoupled.
 */
export interface QuickReferenceRecord {
    recordKey: MatrxRecordId;
    primaryKeyValues: Record<string, unknown>;
    displayValue: string;
    metadata?: {
        lastModified?: string;
        createdBy?: string;
        status?: string;
    };
}
