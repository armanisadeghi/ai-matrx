// @ts-nocheck

// lib/redux/entity/selectors.ts
"use client";

import { createSelector, Selector } from "@reduxjs/toolkit";
import {
  EntityKeys,
  EntityData,
  EntityAnyFieldKey,
  EntityDataWithKey,
  AllEntityFieldKeys,
  EntityFieldKeys,
} from "@/types/entityTypes";
import type { RootState } from "@/lib/redux/store";
import {
  EnhancedRecord,
  EntityOperationMode,
  EntityRecordMap,
  EntityState,
  EntityStateField,
  EntityStatus,
  FlexibleQueryOptions,
  MatrxRecordId,
  RuntimeFilter,
  RuntimeSort,
} from "@/lib/redux/entity/types/stateTypes";
import {
  createRecordKey,
  getRecordIdByRecord,
  parseRecordKey,
  parseRecordKeys,
} from "@/lib/redux/entity/utils/stateHelpUtils";
import EntityLogger from "@/lib/redux/entity/utils/entityLogger";
import { mapFieldDataToFormField } from "@/lib/redux/entity/utils/tempFormHelper";
import { uniqBy } from "lodash";
import { EntityStateType } from "@/types/AutomationSchemaTypes";
import debounce from "lodash/debounce";

interface SelectOption {
  value: string;
  label: string;
}

const EMPTY_SELECTED_RECORD_IDS: MatrxRecordId[] = [];
const EMPTY_RUNTIME_FILTERS: RuntimeFilter[] = [];
const DEFAULT_RUNTIME_SORT: RuntimeSort = {
  field: "matrxRecordId",
  direction: "asc",
};

interface FieldNameGroups<TEntity extends EntityKeys> {
  nativeFields: EntityAnyFieldKey<TEntity>[];
  relationshipFields: EntityAnyFieldKey<TEntity>[];
}

type EntityFieldFilter<TEntity extends EntityKeys> = {
  field: EntityFieldKeys<TEntity>;
  value: unknown;
};

const trace = "ENTITY SELECTORS";

/** Stable empty fallbacks for metric selectors (avoid new [] per recompute). */
const EMPTY_METRIC_SERIES: unknown[] = [];

export const createEntitySelectors = <TEntity extends EntityKeys>(
  entityKey: TEntity,
) => {
  if (!entityKey) return null;
  const entityLogger = EntityLogger.createLoggerWithDefaults(trace, entityKey);

  const selectEntity = (state: RootState): EntityStateType<TEntity> => {
    const entityState = state.entities?.[entityKey];
    if (!entityState) return {} as EntityStateType<TEntity>;
    return entityState as EntityStateType<TEntity>;
  };

  const selectAllRecords = createSelector(
    [selectEntity],
    (entity): EntityRecordMap<TEntity> =>
      entity?.records || ({} as EntityRecordMap<TEntity>),
  );

  const selectRecordsArray = createSelector(
    [selectAllRecords],
    (records): EntityDataWithKey<TEntity>[] => {
      if (!records) return [];

      return Object.entries(records).map(([recordId, record]) => ({
        ...record,
        matrxRecordId: recordId,
      }));
    },
  );

  const selectHasMinimumOneRecord = createSelector(
    [selectAllRecords],
    (records): boolean => Object.keys(records).length > 0,
  );

  const selectRecordsByFieldValue = createSelector(
    [
      selectRecordsArray,
      (_: RootState, field: EntityFieldKeys<TEntity>) => field,
      (_: RootState, _field: EntityFieldKeys<TEntity>, value: unknown) => value,
    ],
    (records, field, value): EntityDataWithKey<TEntity>[] => {
      if (!records || !field) return [];

      return records.filter((record) => record[field] === value);
    },
  );

  const selectRecordCountByFieldValue = createSelector(
    [selectRecordsByFieldValue],
    (filteredRecords) => filteredRecords.length,
  );

  const selectRecordKeysByFieldValue = createSelector(
    [selectRecordsByFieldValue],
    (records): MatrxRecordId[] => {
      if (!records) return [];

      return records.map((record) => record.matrxRecordId);
    },
  );

  const selectFirstRecordKeyByFieldValue = createSelector(
    [selectRecordKeysByFieldValue],
    (recordKeys): MatrxRecordId => {
      if (!recordKeys || recordKeys.length === 0) return "" as MatrxRecordId;

      return recordKeys[0];
    },
  );

  const selectRecordsByFieldValues = createSelector(
    [
      selectRecordsArray,
      (_: RootState, filters: EntityFieldFilter<TEntity>[]) => filters,
    ],
    (records, filters): EntityDataWithKey<TEntity>[] => {
      if (!records || !filters.length) return [];

      return records.filter((record) =>
        filters.every(({ field, value }) => record[field] === value),
      );
    },
  );

  // Then we can create a selector for the keys
  const selectRecordKeysByFieldValues = createSelector(
    [selectRecordsByFieldValues],
    (records): MatrxRecordId[] => {
      if (!records) return [];
      return records.map((record) => record.matrxRecordId);
    },
  );

  // And one for the first match
  const selectFirstRecordKeyByFieldValues = createSelector(
    [selectRecordKeysByFieldValues],
    (recordKeys): MatrxRecordId => {
      if (!recordKeys || recordKeys.length === 0) return "" as MatrxRecordId;
      return recordKeys[0];
    },
  );

  const selectEntityDisplayName = createSelector([selectEntity], (entity) => {
    return entity.entityMetadata.displayName;
  });

  const selectRecordByKey = createSelector(
    [selectAllRecords, (_: RootState, recordKey: MatrxRecordId) => recordKey],
    (records, recordKey) => {
      return records[recordKey] || null;
    },
  );

  const selectRecordsByKeys = createSelector(
    [
      selectAllRecords,
      (_: RootState, recordKeys: MatrxRecordId[]) => recordKeys,
    ],
    (records, recordKeys) => {
      if (!recordKeys?.length) return [];
      if (!records) return [];

      return recordKeys
        .filter((key): key is MatrxRecordId => key != null)
        .map((recordKey) => records[recordKey] || null)
        .filter(Boolean);
    },
  );

  const selectRecordsKeyPairs = createSelector(
    [selectEntity, (_: RootState, recordKeys: MatrxRecordId[]) => recordKeys],
    (entity, recordKeys) => {
      if (!recordKeys) return [];
      if (!entity?.records) return [];

      return recordKeys
        .filter((key): key is MatrxRecordId => key != null)
        .map((recordKey) => {
          const record = entity.records[recordKey];
          return record ? { key: recordKey, record } : null;
        })
        .filter(Boolean);
    },
  );

  const selectRecordWithKey = createSelector(
    [selectRecordByKey, (_: RootState, recordKey: MatrxRecordId) => recordKey],
    (record, recordKey): EntityDataWithKey<EntityKeys> | null => {
      if (!record) return null;

      return {
        ...record,
        matrxRecordId: recordKey,
      };
    },
  );

  const selectRecordsWithKeys = createSelector(
    [
      selectRecordsByKeys,
      (_: RootState, recordKeys: MatrxRecordId[]) => recordKeys,
    ],
    (records, recordKeys): EntityDataWithKey<EntityKeys>[] => {
      // Early return for empty or null recordKeys
      if (!recordKeys?.length) return [];
      if (!records) return [];

      return uniqBy(
        records.map((record, index) => ({
          ...record,
          matrxRecordId: recordKeys[index],
        })),
        "matrxRecordId",
      );
    },
  );

  const selectRecordWithKeyByPrimaryKey = createSelector(
    [
      selectEntity,
      (_: RootState, primaryKeyValues: Record<string, unknown>) =>
        primaryKeyValues,
    ],
    (entity, primaryKeyValues): EntityDataWithKey<EntityKeys> | null => {
      if (!primaryKeyValues) return null;
      if (!entity?.records || !entity.entityMetadata) return null;

      const recordKey = createRecordKey(
        entity.entityMetadata.primaryKeyMetadata,
        primaryKeyValues,
      );
      if (!recordKey) return null;

      const record = entity.records[recordKey];
      if (!record) return null;

      return {
        ...record,
        matrxRecordId: recordKey,
      };
    },
  );

  const selectRecordsWithKeysByPrimaryKeys = createSelector(
    [
      selectEntity,
      (_: RootState, primaryKeyValuesList: Record<string, unknown>[]) =>
        primaryKeyValuesList,
    ],
    (entity, primaryKeyValuesList): EntityDataWithKey<EntityKeys>[] => {
      if (!primaryKeyValuesList) return [];
      if (!entity?.records || !entity.entityMetadata) return [];

      return primaryKeyValuesList
        .map((primaryKeyValues) => {
          const recordKey = createRecordKey(
            entity.entityMetadata.primaryKeyMetadata,
            primaryKeyValues,
          );
          if (!recordKey) return null;

          const record = entity.records[recordKey];
          if (!record) return null;

          return {
            ...record,
            matrxRecordId: recordKey,
          };
        })
        .filter(Boolean);
    },
  );

  const selectRecordsWithKeysBySimpleIds = createSelector(
    [selectEntity, (_: RootState, simpleIds: unknown[]) => simpleIds],
    (entity, simpleIds): EntityDataWithKey<EntityKeys>[] => {
      if (!simpleIds) return [];
      if (!entity?.records || !entity.entityMetadata) return [];

      const fields = entity.entityMetadata.primaryKeyMetadata.fields;

      // Convert simple IDs to proper primary key format
      const primaryKeyValuesList = simpleIds.map((id) => {
        // Handle single field case (most common)
        if (fields.length === 1) {
          return { [fields[0]]: id };
        }

        // Handle multiple fields by matching values to fields in order
        return fields.reduce(
          (acc, field, index) => {
            if (Array.isArray(id) && id.length >= index) {
              acc[field] = id[index];
            }
            return acc;
          },
          {} as Record<string, unknown>,
        );
      });

      return primaryKeyValuesList
        .map((primaryKeyValues) => {
          const recordKey = createRecordKey(
            entity.entityMetadata.primaryKeyMetadata,
            primaryKeyValues,
          );
          if (!recordKey) return null;

          const record = entity.records[recordKey];
          if (!record) return null;

          return {
            ...record,
            matrxRecordId: recordKey,
          };
        })
        .filter(Boolean);
    },
  );

  const selectEffectiveRecordsByKeys = createSelector(
    [selectEntity, (_: RootState, recordKeys: MatrxRecordId[]) => recordKeys],
    (entity, recordKeys): EntityData<TEntity>[] => {
      if (!recordKeys) return [];
      if (!entity) return [];

      const validKeys = recordKeys.filter(
        (key): key is MatrxRecordId => key != null,
      );

      if (validKeys.length === 0) return [];

      return validKeys
        .map((recordKey) => {
          const unsavedRecord = entity.unsavedRecords?.[recordKey];
          if (unsavedRecord) return unsavedRecord;

          return (entity.records?.[recordKey] as EntityData<TEntity>) || null;
        })
        .filter((record): record is EntityData<TEntity> => record !== null);
    },
  );

  const selectFieldByKey = createSelector(
    [
      selectEntity,
      (_: RootState, recordKey: MatrxRecordId) => recordKey,
      (_: RootState, _recordKey: MatrxRecordId, field: string) => field,
    ],
    (entity, recordKey, field) => {
      const record = entity.records[recordKey];
      return record ? record[field] || null : null;
    },
  );
  const selectFieldValueByRecordKey = createSelector(
    [
      selectEntity,
      (_: RootState, recordKey: MatrxRecordId, field: string) => ({
        recordKey,
        field,
      }),
    ],
    (entity, { recordKey, field }) => {
      const record = entity.records[recordKey];
      return record ? record[field] || null : null;
    },
  );

  const selectRecordsForFetching = (matrxRecordIds: MatrxRecordId[]) =>
    createSelector([selectAllRecords], (existingRecords) => {
      const filteredRecordIds = matrxRecordIds.filter(
        (recordId) => !recordId.startsWith("new-record-"),
      );
      const existingRecordIds = filteredRecordIds.filter(
        (recordId) => !!existingRecords[recordId],
      );
      const recordIdsNotInState = filteredRecordIds.filter(
        (recordId) => !existingRecords[recordId],
      );
      const primaryKeysToFetch = parseRecordKeys(recordIdsNotInState);

      return {
        existingRecords: existingRecordIds,
        recordIdsNotInState: recordIdsNotInState,
        primaryKeysToFetch,
      };
    });

  const selectRecordByPrimaryKey = createSelector(
    [
      selectEntity,
      (_: RootState, primaryKeyValues: Record<string, MatrxRecordId>) =>
        primaryKeyValues,
    ],
    (entity, primaryKeyValues) => {
      const recordKey = createRecordKey(
        entity.entityMetadata.primaryKeyMetadata,
        primaryKeyValues,
      );
      return entity.records[recordKey];
    },
  );

  const selectRecordsByPrimaryKeys = createSelector(
    [
      selectEntity,
      (_: RootState, primaryKeyValuesList: Record<string, MatrxRecordId>[]) =>
        primaryKeyValuesList,
    ],
    (entity, primaryKeyValuesList) => {
      return primaryKeyValuesList
        .map((primaryKeyValues) => {
          const recordKey = createRecordKey(
            entity.entityMetadata.primaryKeyMetadata,
            primaryKeyValues,
          );
          return entity.records[recordKey];
        })
        .filter(Boolean); // Ensure stable reference
    },
  );

  const selectMatrxRecordIdByPrimaryKey = createSelector(
    [
      selectEntity,
      (_: RootState, primaryKeyValues: Record<string, MatrxRecordId>) =>
        primaryKeyValues,
    ],
    (entity, primaryKeyValues): MatrxRecordId => {
      return createRecordKey(
        entity.entityMetadata.primaryKeyMetadata,
        primaryKeyValues,
      );
    },
  );

  const selectMatrxRecordIdBySimpleKey = createSelector(
    [selectEntity, (_: RootState, id: MatrxRecordId) => id],
    (entity, id): MatrxRecordId => {
      // Return early if no id or if id is empty string
      if (!id) return "";

      return createRecordKey(entity.entityMetadata.primaryKeyMetadata, { id });
    },
  );

  const selectMatrxRecordIdsBySimpleKeys = createSelector(
    [selectEntity, (_: RootState, ids: MatrxRecordId[]) => ids],
    (entity, ids): MatrxRecordId[] => {
      // Filter out any falsy values before mapping
      return ids
        .filter(Boolean)
        .map((id) =>
          createRecordKey(entity.entityMetadata.primaryKeyMetadata, { id }),
        );
    },
  );

  const selectMatrxRecordIdFromValue = createSelector(
    [selectEntity, (_: RootState, value: any) => value],
    (entity, value): MatrxRecordId | null => {
      if (value === undefined || value === null) {
        return null;
      }
      const primaryKeyField =
        entity.entityMetadata.primaryKeyMetadata.fields[0];
      if (!primaryKeyField) {
        return null;
      }
      const record = { [primaryKeyField]: value };
      try {
        return createRecordKey(
          entity.entityMetadata.primaryKeyMetadata,
          record,
        );
      } catch (e) {
        return null;
      }
    },
  );

  const selectMatrxRecordIdByValues = createSelector(
    [selectEntity, (_: RootState, values: any[]) => values],
    (entity, values): MatrxRecordId => {
      const primaryKeyFields = Object.keys(
        entity.entityMetadata.primaryKeyMetadata,
      );
      if (values.length !== primaryKeyFields.length) {
        throw new Error(
          `Expected ${primaryKeyFields.length} values but received ${values.length}`,
        );
      }

      const primaryKeyValues = primaryKeyFields.reduce(
        (acc, field, index) => {
          acc[field] = values[index];
          return acc;
        },
        {} as Record<string, any>,
      );

      return createRecordKey(
        entity.entityMetadata.primaryKeyMetadata,
        primaryKeyValues,
      );
    },
  );

  const selectMatrxRecordIdByKeyValuePairs = createSelector(
    [
      selectEntity,
      (_: RootState, keyValuePairs: Array<[string, any]>) => keyValuePairs,
    ],
    (entity, keyValuePairs): MatrxRecordId => {
      const primaryKeyFields = Object.keys(
        entity.entityMetadata.primaryKeyMetadata,
      );
      const providedFields = keyValuePairs.map(([field]) => field);

      if (!primaryKeyFields.every((field) => providedFields.includes(field))) {
        throw new Error("Missing required primary key fields");
      }

      const primaryKeyValues = Object.fromEntries(keyValuePairs);
      return createRecordKey(
        entity.entityMetadata.primaryKeyMetadata,
        primaryKeyValues,
      );
    },
  );

  const selectMatrxRecordIdsByPrimaryKeys = createSelector(
    [
      selectEntity,
      (_: RootState, primaryKeyValuesList: Record<string, MatrxRecordId>[]) =>
        primaryKeyValuesList,
    ],
    (entity, primaryKeyValuesList) => {
      return primaryKeyValuesList.map((primaryKeyValues) =>
        createRecordKey(
          entity.entityMetadata.primaryKeyMetadata,
          primaryKeyValues,
        ),
      );
    },
  );

  // Quick Reference Selectors
  const selectQuickReference = createSelector(
    [selectEntity],
    (entity) => entity.quickReference.records,
  );

  const selectIsQuickReferenceFetchComplete = createSelector(
    [selectEntity],
    (entity) => entity.quickReference.fetchComplete,
  );

  const selectQuickReferenceState = createSelector(
    [selectEntity],
    (entity) => entity.quickReference,
  );

  const selectQuickReferenceByPrimaryKey = createSelector(
    [
      selectQuickReference,
      (_: RootState, primaryKeyValues: Record<string, MatrxRecordId>) =>
        primaryKeyValues,
    ],
    (records, primaryKeyValues) =>
      records.find((record) => {
        return Object.entries(primaryKeyValues).every(
          ([key, value]) => record.primaryKeyValues[key] === value,
        );
      }),
  );

  const selectQuickReferenceKeyDisplayPairs = createSelector(
    [selectQuickReference],
    (records) =>
      records.map((record) => ({
        recordKey: record.recordKey,
        displayValue: record.displayValue,
      })),
  );

  const selectQuickReferenceSelectOptions = createSelector(
    [selectQuickReference],
    (records): SelectOption[] =>
      records.map((record) => {
        const parsedKey = parseRecordKey(record.recordKey);
        const firstPrimaryKeyValue = Object.values(parsedKey)[0] as string;

        return {
          value: firstPrimaryKeyValue,
          label: record.displayValue,
        };
      }),
  );

  // Selection Selectors ==================================================

  const selectSelectionState = createSelector([selectEntity], (entity) => {
    return entity.selection;
  });

  const selectSelectedRecordIds = (state: RootState): MatrxRecordId[] => {
    return (
      state.entities?.[entityKey]?.selection?.selectedRecords ??
      EMPTY_SELECTED_RECORD_IDS
    );
  };

  const selectIsRecordSelected = createSelector(
    [
      selectSelectedRecordIds,
      (_: RootState, recordId: MatrxRecordId) => recordId,
    ],
    (selectedIds, recordId) => {
      return selectedIds.includes(recordId);
    },
  );

  const selectSelectedRecords = createSelector(
    [selectEntity, selectSelectedRecordIds],
    (entity, selectedIds) => {
      if (!selectedIds.length) return [];
      return selectedIds
        .map((recordKey) => entity.records[recordKey])
        .filter(Boolean);
    },
  );

  const selectSelectedRecordsWithKey = createSelector(
    [selectEntity, selectSelectedRecordIds],
    (entity, selectedIds) => {
      if (!selectedIds.length || !entity?.records) return {};

      return selectedIds.reduce(
        (acc, recordKey) => {
          const record = entity.records[recordKey];
          if (record) {
            acc[recordKey] = record;
          }
          return acc;
        },
        {} as Record<
          MatrxRecordId,
          NonNullable<(typeof entity.records)[keyof typeof entity.records]>
        >,
      );
    },
  );

  const selectActiveRecordId = createSelector(
    [selectSelectionState],
    (selection) => selection.activeRecord ?? null,
  );

  const selectSelectionMode = createSelector(
    [selectSelectionState],
    (selection) => selection.selectionMode,
  );

  const selectIsRecordActive = createSelector(
    [selectActiveRecordId, (_: RootState, recordId: MatrxRecordId) => recordId],
    (activeRecord, recordId) => activeRecord === recordId,
  );

  const selectSelectionSummary = createSelector(
    [selectSelectedRecords, selectActiveRecordId, selectSelectionMode],
    (selectedRecords, activeRecord, mode) => {
      const count = selectedRecords.length;
      return {
        count,
        hasSelection: count > 0,
        hasSingleSelection: count === 1,
        hasMultipleSelection: count > 1,
        activeRecord,
        mode,
      };
    },
  );

  const selectActiveRecord = createSelector(
    [selectEntity, selectActiveRecordId],
    (entity, activeRecordId) => {
      if (activeRecordId?.toString().startsWith("new-record-")) {
        return activeRecordId ? entity.unsavedRecords[activeRecordId] : null;
      }
      return activeRecordId ? entity.records[activeRecordId] : null;
    },
  );

  const selectActiveRecordWithId = createSelector(
    [selectEntity, selectActiveRecordId],
    (entity, activeRecordId) => {
      if (activeRecordId?.toString().startsWith("new-record-")) {
        return {
          matrxRecordId: activeRecordId,
          record: null,
        };
      }
      if (!activeRecordId || !entity.records[activeRecordId]) {
        return { matrxRecordId: null, record: null };
      }
      return {
        matrxRecordId: activeRecordId,
        record: entity.records[activeRecordId],
      };
    },
  );

  // === End Selection Selectors ==================================================

  const selectRecordIdByRecord = createSelector(
    [selectEntity, (_: RootState, record: EntityData<TEntity>) => record],
    (entityState, record) => getRecordIdByRecord(entityState, record),
  );

  const selectRecordIdsByRecords = createSelector(
    [selectEntity, (_: RootState, records: EntityData<TEntity>[]) => records],
    (entityState, records) =>
      records.map((record) => getRecordIdByRecord(entityState, record)),
  );

  // Pagination Selectors
  const selectPaginationInfo = createSelector(
    [selectEntity],
    (entity) => entity.pagination,
  );

  const selectCurrentPage = createSelector(
    [selectEntity, selectAllRecords],
    (entity, records) => {
      const { page, pageSize } = entity.pagination;
      const startIndex = (page - 1) * pageSize;
      return Object.values(records).slice(startIndex, startIndex + pageSize);
    },
  );

  const selectCurrentPageWithRecordId = createSelector(
    [selectEntity, selectAllRecords],
    (entity, records): EntityDataWithKey<TEntity>[] => {
      const { page, pageSize } = entity.pagination;
      const startIndex = (page - 1) * pageSize;

      return Object.entries(records)
        .slice(startIndex, startIndex + pageSize)
        .map(([recordKey, record]) => ({
          ...record,
          matrxRecordId: recordKey,
        }));
    },
  );

  // Filter Selectors
  const selectCurrentFilters = createSelector(
    [selectEntity],
    (entity) => entity.filters,
  );

  const selectFilteredRecords = createSelector(
    [selectAllRecords, selectCurrentFilters],
    (records, filters) => {
      let result = Object.values(records);

      // Apply filters
      if (filters.conditions.length > 0) {
        result = result.filter((record) =>
          filters.conditions.every((condition) => {
            const value = record[condition.field];
            switch (condition.operator) {
              case "eq":
                return value === condition.value;
              case "neq":
                return value !== condition.value;
              case "gt":
                return value > condition.value;
              case "gte":
                return value >= condition.value;
              case "lt":
                return value < condition.value;
              case "lte":
                return value <= condition.value;
              case "like":
                return String(value).includes(String(condition.value));
              case "ilike":
                return String(value)
                  .toLowerCase()
                  .includes(String(condition.value).toLowerCase());
              case "in":
                return (
                  Array.isArray(condition.value) &&
                  condition.value.includes(value)
                );
              case "between":
                return (
                  Array.isArray(condition.value) &&
                  value >= condition.value[0] &&
                  value <= condition.value[1]
                );
              case "is":
                return value === condition.value;
              default:
                return true;
            }
          }),
        );
      }

      // Apply sorting
      if (filters.sort.length > 0) {
        result = [...result].sort((a, b) => {
          for (const sort of filters.sort) {
            const aValue = a[sort.field];
            const bValue = b[sort.field];
            if (aValue !== bValue) {
              return sort.direction === "asc"
                ? aValue > bValue
                  ? 1
                  : -1
                : aValue < bValue
                  ? 1
                  : -1;
            }
          }
          return 0;
        });
      }

      return result;
    },
  );

  // State Selectors
  const selectLoadingState = createSelector(
    [selectEntity],
    (entity) => entity.loading,
  );

  const selectErrorState = createSelector(
    [selectLoadingState],
    (loading) => loading.error,
  );

  const selectIsStale = createSelector(
    [selectEntity],
    (entity) => entity.cache.stale,
  );

  const selectEntityFlags = createSelector(
    [selectEntity],
    (entity) => entity.flags,
  );

  const selectHasUnsavedChanges = createSelector(
    [selectEntity],
    (entity) => entity.flags.hasUnsavedChanges,
  );

  const selectOperationMode = createSelector(
    [selectEntity],
    (entity) => entity.flags.operationMode,
  );

  const selectIsValidated = createSelector(
    [selectEntity],
    (entity) => entity.flags.isValidated,
  );

  const selectFetchOneStatus = createSelector(
    [selectEntity],
    (entity) => entity.flags.operationFlags.FETCH_ONE_STATUS,
  );

  // Metadata Selectors
  const selectEntityMetadata = createSelector(
    [selectEntity],
    (entity) => entity.entityMetadata,
  );

  const selectPrimaryKeyMetadata = createSelector(
    [selectEntityMetadata],
    (metadata) => metadata.primaryKeyMetadata,
  );

  const selectPrimaryKeyFields = createSelector(
    [selectPrimaryKeyMetadata],
    (primaryKeyMetadata) => primaryKeyMetadata.fields,
  );

  const selectHistory = createSelector(
    [selectEntity],
    (entity) => entity.history,
  );

  const selectDisplayField = createSelector(
    [selectEntityMetadata],
    (metadata) => {
      const displayField = Object.values(metadata.entityFields).find(
        (f) => f.isDisplayField,
      )?.name;
      return displayField || metadata.primaryKeyMetadata.fields[0];
    },
  );

  const selectFieldInfo = createSelector(
    [selectEntityMetadata],
    (metadata): Record<string, EntityStateField> =>
      metadata?.entityFields || {},
  );

  const selectFieldNames = createSelector([selectFieldInfo], (fields) =>
    Object.keys(fields),
  );

  const selectFlexFormField = createSelector([selectFieldInfo], (fields) => {
    if (!fields || Object.keys(fields).length === 0) return [];

    return Object.values(fields).map((field) => ({
      ...field,
      label: field.displayName,
      type: mapFieldDataToFormField(field.dataType),
    }));
  });

  // For select components (value/label pairs)
  const selectFieldOptions = createSelector([selectFieldInfo], (fields) =>
    Object.values(fields).map((field) => ({
      value: field.name,
      label: field.displayName,
    })),
  );

  const selectDefaultValues = createSelector([selectFieldInfo], (fields) =>
    Object.entries(fields).reduce(
      (acc, [fieldName, field]) => ({
        ...acc,
        [fieldName]: field.defaultValue,
      }),
      {} as Record<string, any>,
    ),
  );

  interface FieldOptionWithDefault {
    value: string;
    label: string;
    defaultValue: any;
  }

  const selectFieldOptionsWithDefaults = createSelector(
    [selectFieldInfo],
    (fieldInfo): FieldOptionWithDefault[] =>
      Object.values(fieldInfo).map((field) => ({
        value: field.name,
        label: field.displayName,
        defaultValue: field.defaultValue,
      })),
  );

  const selectNativeFieldOptionsWithDefaultsNoPk = createSelector(
    [selectFieldInfo],
    (fieldInfo): FieldOptionWithDefault[] =>
      Object.values(fieldInfo)
        .filter((field) => field.isNative && !field.isPrimaryKey)
        .map((field) => ({
          value: field.name,
          label: field.displayName,
          defaultValue: field.defaultValue,
        })),
  );

  const selectNativeFieldOptionsWithDefaults = createSelector(
    [selectFieldInfo],
    (fieldInfo): FieldOptionWithDefault[] =>
      Object.values(fieldInfo)
        .filter((field) => field.isNative)
        .map((field) => ({
          value: field.name,
          label: field.displayName,
          defaultValue: field.defaultValue,
        })),
  );

  // Create separate selectors for expensive computations
  const selectRecordPair = createSelector(
    [
      selectEntity,
      (_: RootState, recordId: MatrxRecordId) => recordId,
      (state: RootState) => state,
    ],
    (entity, recordId, state) => {
      const originalRecord = entity.records[recordId] || null;
      const unsavedRecord = recordId
        ? selectUnsavedRecordById(state, recordId)
        : null;
      const isNewRecord = !originalRecord && !!unsavedRecord;
      return { originalRecord, unsavedRecord, isNewRecord };
    },
  );

  const selectChangedFieldsSet = createSelector(
    [selectRecordPair, selectFieldInfo],
    ({ originalRecord, unsavedRecord, isNewRecord }, fieldInfo) => {
      if (isNewRecord) {
        // If it's a new record, return all field names as a Set
        return new Set(Object.keys(fieldInfo));
      }

      // Otherwise, return a Set of field names where the original and unsaved values differ
      return new Set(
        Object.values(fieldInfo)
          .filter(
            (field: EntityStateField) =>
              originalRecord &&
              unsavedRecord &&
              originalRecord[field.name] !== unsavedRecord[field.name],
          )
          .map((field: EntityStateField) => field.name),
      );
    },
  );

  const selectChangedFieldData = createSelector(
    [selectRecordPair, selectChangedFieldsSet],
    ({ unsavedRecord, isNewRecord }, changedFields) => {
      if (!unsavedRecord) {
        return {};
      }

      if (isNewRecord) {
        return { ...unsavedRecord };
      }

      const changedData: Partial<typeof unsavedRecord> = {};
      for (const fieldName of changedFields) {
        if (typeof fieldName === "string" && fieldName in unsavedRecord) {
          changedData[fieldName as keyof typeof unsavedRecord] =
            unsavedRecord[fieldName as keyof typeof unsavedRecord];
        }
      }
      return changedData;
    },
  );

  const selectFieldComparisons = createSelector(
    [selectRecordPair, selectChangedFieldsSet, selectFieldInfo],
    (
      { originalRecord, unsavedRecord, isNewRecord },
      changedFields,
      fieldInfo,
    ) => {
      return Object.values(fieldInfo).map((field) => ({
        name: field.name,
        displayName: field.displayName,
        hasChanged: isNewRecord || changedFields.has(field.name),
        originalValue: originalRecord?.[field.name],
        newValue: unsavedRecord?.[field.name],
      }));
    },
  );

  // Main selector maintains same interface but uses optimized sub-selectors
  const selectChangeComparisonById = createSelector(
    [
      selectEntity,
      (_: RootState, recordId: MatrxRecordId) => recordId,
      selectFieldInfo,
      (state: RootState) => state,
    ],
    (entity, recordId, fieldInfo, state) => {
      const { originalRecord, unsavedRecord, isNewRecord } = selectRecordPair(
        state,
        recordId,
      );
      const changedFields = selectChangedFieldsSet(state, recordId);
      const fieldComparisons = selectFieldComparisons(state, recordId);
      const changedFieldData = selectChangedFieldData(state, recordId);

      return {
        entityName: entity.entityMetadata.entityName,
        matrxRecordId: recordId,
        originalRecord,
        unsavedRecord,
        fieldInfo: fieldComparisons,
        changedFields,
        changedFieldData,
        hasChanges: isNewRecord || changedFields.size > 0,
        isNewRecord,
        displayName:
          unsavedRecord?.[selectDisplayField(state)] ??
          originalRecord?.[selectDisplayField(state)],
      };
    },
  );

  const selectCreatePayload = createSelector(
    [
      (state: RootState, recordId: MatrxRecordId) =>
        selectChangeComparisonById(state, recordId),
      (_: RootState, recordId: MatrxRecordId) => recordId,
    ],
    (changeComparison, recordId) => {
      const { entityName, changedFieldData } = changeComparison;

      return {
        entityNameAnyFormat: entityName,
        entityName: entityName,
        tempRecordId: recordId,
        data: changedFieldData,
      } as FlexibleQueryOptions;
    },
  ); // const selectCreatePayload = createSelector(
  //     [selectEntity, (_: RootState, recordId: MatrxRecordId) => recordId, (state: RootState) => state],
  //     (entity, recordId, state) => {
  //         const changedFieldData = selectChangedFieldData(state, recordId);

  //         return {
  //             entityNameAnyFormat: entity.entityMetadata.entityName,
  //             matrxRecordId: recordId,
  //             entityName: entity.entityMetadata.entityName,
  //             tempRecordId: recordId,
  //             data: changedFieldData,
  //         } as FlexibleQueryOptions;
  //     }
  // );
  const selectChangeComparison = createSelector(
    [selectActiveRecordWithId, selectFieldInfo, (state) => state],
    (activeRecordData, fieldInfo, state) => {
      if (!activeRecordData.matrxRecordId) return null;
      return selectChangeComparisonById(state, activeRecordData.matrxRecordId);
    },
  );

  const selectActiveRecordCreatePayload = createSelector(
    [selectActiveRecordWithId, selectEntity, (state: RootState) => state],
    (activeRecordData, entity, state) => {
      if (!activeRecordData.matrxRecordId) return null;

      const changedFieldData = selectChangedFieldData(
        state,
        activeRecordData.matrxRecordId,
      );

      return {
        entityNameAnyFormat: entity.entityMetadata.entityName,
        entityName: entity.entityMetadata.entityName,
        tempRecordId: activeRecordData.matrxRecordId,
        data: changedFieldData,
        matrxRecordId: activeRecordData.matrxRecordId,
      } as FlexibleQueryOptions;
    },
  );

  const selectPendingOperations = createSelector(
    [selectEntity],
    (entity) => entity.pendingOperations,
  );

  const selectTableColumns = createSelector([selectFieldInfo], (fields) => {
    if (!fields || Object.keys(fields).length === 0) return [];

    return Object.values(fields).map((field) => ({
      ...field,
      key: field.name,
      title: field.displayName,
    }));
  });

  const selectRecordWithDisplay = createSelector(
    [
      selectEntity,
      (_: RootState, recordKey: string) => recordKey,
      selectFieldInfo,
    ],
    (entity, recordKey, fields) => {
      const record = entity.records[recordKey];
      if (!record) return null;

      return Object.values(fields).reduce(
        (acc, field) => {
          acc[field.name] = {
            value: record[field.name],
            displayValue: String(record[field.name]),
            fieldInfo: field,
          };
          return acc;
        },
        {} as Record<
          string,
          { value: any; displayValue: string; fieldInfo: EntityStateField }
        >,
      );
    },
  );

  const selectCombinedRecordsWithFieldInfo = createSelector(
    [selectSelectedRecordsWithKey, selectFieldInfo, selectDisplayField],
    (records, fieldInfo, displayField) => ({
      records,
      fieldInfo,
      displayField,
    }),
  );

  // Filtered and paginated data combined
  const selectCurrentPageFiltered = createSelector(
    [selectFilteredRecords, selectPaginationInfo],
    (filteredRecords, pagination) => {
      const { page, pageSize } = pagination;
      const startIndex = (page - 1) * pageSize;
      return filteredRecords.slice(startIndex, startIndex + pageSize);
    },
  );

  // Quick access to important metadata combinations
  const selectMetadataSummary = createSelector(
    [selectEntityMetadata],
    (metadata) => ({
      displayName: metadata.displayName,
      primaryKeys: metadata.primaryKeyMetadata.fields,
      displayField: metadata.displayFieldMetadata.fieldName,
      totalFields: Object.keys(metadata.entityFields).length,
      schemaType: metadata.schemaType,
    }),
  );

  // Cache and loading state combined
  const selectDataState = createSelector(
    [
      selectLoadingState,
      selectIsStale,
      selectHasUnsavedChanges,
      selectOperationMode,
    ],
    (loading, isStale, hasUnsavedChanges, operationMode) => ({
      isLoading: loading.loading || loading.externalLoading,
      internalLoading: loading.loading,
      externalLoading: loading.externalLoading,
      isError: !!loading.error,
      errorMessage: loading.error?.message,
      lastOperation: loading.lastOperation,
      isStale,
      hasUnsavedChanges,
      operationMode,
      needsAttention: isStale || hasUnsavedChanges || !!loading.error,
    }),
  );

  const selectIsInternalLoading = createSelector(
    [selectDataState],
    (dataState) => dataState.internalLoading,
  );
  const selectIsExternalLoading = createSelector(
    [selectDataState],
    (dataState) => dataState.externalLoading,
  );

  const selectIsLoading = createSelector(
    [selectDataState],
    (dataState) => dataState.isLoading,
  );

  const getStableLoading = (state: RootState, delay = 100): boolean => {
    let currentValue = selectIsLoading(state);
    let lastStableValue = currentValue;

    const debouncedUpdate = debounce((newValue: boolean) => {
      lastStableValue = newValue;
    }, delay);

    debouncedUpdate(currentValue);
    return lastStableValue;
  };

  // Pagination with additional computed properties
  const selectPaginationExtended = createSelector(
    [selectPaginationInfo, selectFilteredRecords],
    (pagination, filteredRecords) => ({
      ...pagination,
      totalFilteredRecords: filteredRecords.length,
      currentPageRecords:
        filteredRecords.length > 0
          ? Math.min(
              pagination.pageSize,
              filteredRecords.length -
                (pagination.page - 1) * pagination.pageSize,
            )
          : 0,
      isFirstPage: pagination.page === 1,
      isLastPage: pagination.page === pagination.totalPages,
      pageOptions: Array.from({ length: pagination.totalPages }, (_, i) => ({
        value: i + 1,
        label: `Page ${i + 1}`,
      })),
    }),
  );

  // History state with additional information
  const selectHistoryState = createSelector([selectHistory], (history) => ({
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    lastAction: history.past[history.past.length - 1],
    nextAction: history.future[history.future.length - 1],
    totalActions: history.past.length + history.future.length,
    lastSaved: history.lastSaved,
  }));

  const selectMetrics = createSelector(
    [selectEntity],
    (entity) => entity.metrics,
  );

  const selectOperationCounts = createSelector(
    [selectMetrics],
    (metrics) => metrics.operationCounts,
  );

  const selectPerformanceMetrics = createSelector(
    [selectMetrics],
    (metrics) => metrics.performanceMetrics,
  );

  const selectCacheStats = createSelector(
    [selectMetrics],
    (metrics) => metrics.cacheStats,
  );

  const selectErrorRates = createSelector(
    [selectMetrics],
    (metrics) => metrics.errorRates,
  );

  const selectMetricsLastUpdated = createSelector(
    [selectMetrics],
    (metrics) => metrics.lastUpdated,
  );

  const selectResponseTimeMetrics = createSelector(
    [selectPerformanceMetrics],
    (metrics) => metrics?.responseTimes ?? EMPTY_METRIC_SERIES,
  );

  const selectThroughputMetrics = createSelector(
    [selectPerformanceMetrics],
    (metrics) => metrics?.throughput ?? EMPTY_METRIC_SERIES,
  );

  // Cache-specific selectors
  const selectCacheHitRate = createSelector(
    [selectCacheStats],
    (stats) => stats.hitRate ?? EMPTY_METRIC_SERIES,
  );

  const selectCacheSize = createSelector(
    [selectCacheStats],
    (stats) => stats.size ?? EMPTY_METRIC_SERIES,
  );

  // Error-specific selectors
  const selectErrorTimeline = createSelector(
    [selectErrorRates],
    (rates) => rates.timeline,
  );

  const selectErrorDistribution = createSelector(
    [selectErrorRates],
    (rates) => rates.distribution,
  );

  const selectRecentErrors = createSelector(
    [selectErrorRates],
    (rates) => rates.recent,
  );

  const selectUnsavedRecords = createSelector(
    [selectEntity],
    (entity) => entity.unsavedRecords,
  );

  const selectUnsavedRecordById = createSelector(
    [selectUnsavedRecords, (_, recordId: MatrxRecordId) => recordId],
    (unsavedRecords, recordId) => unsavedRecords[recordId],
  );

  const selectAllEffectiveRecords = createSelector(
    [selectAllRecords, selectUnsavedRecords],
    (
      records,
      unsavedRecords,
    ): Record<string, EntityDataWithKey<EntityKeys>> => {
      const mergedRecords = {
        ...(records ?? {}),
        ...(unsavedRecords ?? {}),
      };

      return Object.fromEntries(
        Object.entries(mergedRecords).map(([recordKey, record]) => [
          recordKey,
          {
            ...record,
            matrxRecordId: recordKey,
          },
        ]),
      );
    },
  );

  const selectAllEffectiveRecordsArray = createSelector(
    [selectAllRecords, selectUnsavedRecords],
    (records, unsavedRecords): EntityDataWithKey<EntityKeys>[] => {
      const mergedRecords = {
        ...(records ?? {}),
        ...(unsavedRecords ?? {}),
      };

      return Object.entries(mergedRecords).map(([recordKey, record]) => ({
        ...record,
        matrxRecordId: recordKey,
      }));
    },
  );

  // Then this can be simplified to just convert the object to array
  const selectAllEffectiveRecordsWithKeys = createSelector(
    [selectAllEffectiveRecords],
    (effectiveRecords): EntityDataWithKey<EntityKeys>[] => {
      if (!effectiveRecords) {
        return [];
      }
      return Object.values(effectiveRecords);
    },
  );

  const selectEffectiveRecordsByMultipleFieldsValue = createSelector(
    [
      selectAllEffectiveRecords,
      (_: RootState, filters: EntityFieldFilter<TEntity>[]) => filters,
    ],
    (records, filters): EntityDataWithKey<EntityKeys>[] => {
      if (!records) return [];
      if (!filters.length) return [];

      const filteredRecords = Object.values(records).filter((record) =>
        filters.every(({ field, value }) => record[field] === value),
      );
      return filteredRecords;
    },
  );

  const selectEffectiveRecordsByFieldValues = createSelector(
    [
      selectAllEffectiveRecords, // First input: records from state
      (_: RootState, field: AllEntityFieldKeys) => field, // Second input: field
      (_: RootState, field: AllEntityFieldKeys, possibleValues: any[]) =>
        possibleValues, // Third input: possibleValues
    ],
    (records, field, possibleValues): EntityDataWithKey<EntityKeys>[] => {
      if (!records) return [];
      if (!possibleValues || possibleValues.length === 0) return [];

      const filteredRecords = Object.values(records).filter((record) =>
        possibleValues.includes(record[field]),
      );
      return filteredRecords;
    },
  );

  const selectEnhancedRecords = createSelector(
    [selectQuickReference, selectAllEffectiveRecordsWithKeys],
    (quickReferenceRecords, fullRecords): EnhancedRecord[] => {
      if (!quickReferenceRecords) {
        return [];
      }

      // Create a map of full records for quick lookup
      const fullRecordsMap = fullRecords.reduce(
        (acc, record) => {
          acc[record.matrxRecordId] = record;
          return acc;
        },
        {} as Record<string, EntityDataWithKey<EntityKeys>>,
      );

      // Map quick reference records to enhanced records
      return quickReferenceRecords.map((quickRef): EnhancedRecord => {
        const fullRecord = fullRecordsMap[quickRef.recordKey];

        return {
          recordKey: quickRef.recordKey,
          needsFetch: !fullRecord,
          data: fullRecord || undefined,
        };
      });
    },
  );

  const selectEnhancedRecordByKey = createSelector(
    [selectEnhancedRecords, (_, recordId: string) => recordId],
    (enhancedRecords, recordId): EnhancedRecord | null => {
      if (!enhancedRecords) return null;

      return (
        enhancedRecords.find((record) => record.recordKey === recordId) || null
      );
    },
  );

  const selectSelectedEnhancedRecords = createSelector(
    [selectEnhancedRecords, selectSelectedRecordIds],
    (enhancedRecords, selectedIds): EnhancedRecord[] => {
      if (!selectedIds?.length || !enhancedRecords?.length) return [];

      // Create a Set for O(1) lookup of selected IDs
      const selectedIdsSet = new Set(selectedIds);

      return enhancedRecords.filter((record) =>
        selectedIdsSet.has(record.recordKey),
      );
    },
  );

  const selectEffectiveRecordById = createSelector(
    [selectEntity, (_, recordId: MatrxRecordId) => recordId],
    (entity, recordId) => {
      return (
        entity.unsavedRecords?.[recordId] || entity.records?.[recordId] || null
      );
    },
  );

  const selectIsTemporaryRecordId = createSelector(
    [(_, recordId: MatrxRecordId) => recordId],
    (recordId) => recordId.startsWith("new-record-"),
  );

  const selectEffectiveRecordOrDefaults = createSelector(
    [
      selectEntity,
      selectDefaultValues,
      (_, recordId: MatrxRecordId) => recordId,
    ],
    (entity, defaultValues, recordId) => {
      const isTemporary = recordId?.startsWith("new-record-");
      const record =
        entity.unsavedRecords?.[recordId] || entity.records?.[recordId];

      if (!record) {
        return defaultValues;
      }

      if (isTemporary) {
        return {
          ...defaultValues,
          ...record,
        };
      }

      return record;
    },
  );

  const selectEffectiveFieldValue = createSelector(
    [
      (state: RootState, recordKey: MatrxRecordId, _fieldName: string) =>
        selectEffectiveRecordOrDefaults(state, recordKey),
      (_: RootState, _recordKey: MatrxRecordId, fieldName: string) => fieldName,
    ],
    (effectiveRecord, fieldName) => effectiveRecord[fieldName],
  );

  const selectFieldMetadata = createSelector(
    [selectFieldInfo, (_: RootState, fieldName: string) => fieldName],
    (fields, fieldName) => fields[fieldName] || null,
  );

  const selectRecord = createSelector(
    [selectAllRecords, (_: RootState, recordKey: MatrxRecordId) => recordKey],
    (records, recordKey) => records[recordKey],
  );

  const selectEntityFieldDetails = createSelector(
    [
      selectFieldMetadata,
      selectRecord,
      (_: RootState, recordKey: MatrxRecordId, fieldName: string) => ({
        recordKey,
        fieldName,
      }),
    ],
    (fieldMetadata, record, { fieldName }) => {
      if (!fieldMetadata) {
        return null;
      }

      return {
        ...fieldMetadata,
        valueFromDb: record ? record[fieldName] : undefined,
      };
    },
  );

  const selectFieldValue = createSelector(
    [
      (state: RootState, recordKey: MatrxRecordId, _fieldName: string) =>
        selectRecord(state, recordKey),
      (_: RootState, _recordKey: MatrxRecordId, fieldName: string) => fieldName,
    ],
    (record, fieldName) => (record ? record[fieldName] : undefined),
  );

  const selectFieldIdentifiers = createSelector([selectFieldInfo], (fields) =>
    Object.values(fields).map((field) => {
      console.log("field: ", field);
      console.log("uniqueFieldId: ", field.uniqueFieldId);
      const parts = field.uniqueFieldId.split(":");

      return {
        uniqueFieldId: field.uniqueFieldId,
        entityName: parts[1] || "",
        fieldName: parts[2] || "",
      };
    }),
  );

  const selectFieldIdentifiersByName = createSelector(
    [selectFieldIdentifiers, (_: RootState, fieldName: string) => fieldName],
    (identifiers, fieldName) =>
      identifiers.find((id) => id.fieldName === fieldName),
  );

  const selectEntityOperationMode = createSelector(
    [selectEntityFlags],
    (flags): EntityOperationMode => flags?.operationMode ?? "view",
  ) as Selector<RootState, EntityOperationMode>;

  const selectEntityStatus = createSelector(
    [selectLoadingState],
    (loadingState): EntityStatus => {
      if (!loadingState?.initialized) return "initialized";
      if (loadingState.error) return "error";
      if (loadingState.loading) return "loading";
      return "other";
    },
  );

  const selectFieldGroups = createSelector([selectFieldInfo], (fields) => ({
    nativeFields: Object.values(fields).filter((field) => field.isNative),
    relationshipFields: Object.values(fields).filter(
      (field) => !field.isNative,
    ),
  }));

  const selectNativeFields = createSelector(
    [selectFieldGroups],
    (groups) => groups.nativeFields,
  );

  const selectRelationshipFields = createSelector(
    [selectFieldGroups],
    (groups) => groups.relationshipFields,
  );

  const selectFieldNameGroups = createSelector(
    [selectFieldInfo],
    (fields): FieldNameGroups<TEntity> => {
      const nativeFields: EntityAnyFieldKey<TEntity>[] = [];
      const relationshipFields: EntityAnyFieldKey<TEntity>[] = [];

      Object.values(fields).forEach((field) => {
        if (field.isNative) {
          nativeFields.push(field.name as EntityAnyFieldKey<TEntity>);
        } else {
          relationshipFields.push(field.name as EntityAnyFieldKey<TEntity>);
        }
      });

      return {
        nativeFields,
        relationshipFields,
      };
    },
  );

  const selectFieldDisplayNames = createSelector(
    [selectFieldInfo],
    (fields) => {
      const displayNameMap = new Map<EntityAnyFieldKey<TEntity>, string>();

      Object.entries(fields).forEach(([fieldName, field]) => {
        displayNameMap.set(
          fieldName as EntityAnyFieldKey<TEntity>,
          field.displayName || fieldName,
        );
      });

      return displayNameMap;
    },
  );
  const selectNativeFieldNames = createSelector(
    [selectFieldNameGroups],
    (groups) => groups.nativeFields,
  );

  const selectRelationshipFieldNames = createSelector(
    [selectFieldNameGroups],
    (groups) => groups.relationshipFields,
  );

  const selectFieldNameGroupsWithHidden = createSelector(
    [
      selectFieldInfo,
      (_state, hiddenRelatedEntities: string[] = []) => hiddenRelatedEntities,
    ],
    (fields, hiddenRelatedEntities): FieldNameGroups<TEntity> => {
      if (!fields || typeof fields !== "object") {
        return { nativeFields: [], relationshipFields: [] };
      }

      const nativeFields: EntityAnyFieldKey<TEntity>[] = [];
      const relationshipFields: EntityAnyFieldKey<TEntity>[] = [];

      Object.entries(fields).forEach(([fieldName, field]) => {
        if (field.isNative) {
          nativeFields.push(fieldName as EntityAnyFieldKey<TEntity>);
        } else if (
          !hiddenRelatedEntities?.length ||
          !hiddenRelatedEntities.includes(field.entityName)
        ) {
          relationshipFields.push(fieldName as EntityAnyFieldKey<TEntity>);
        }
      });

      return {
        nativeFields,
        relationshipFields,
      };
    },
  );

  const selectNativeFieldNamesNoPk = createSelector(
    [selectNativeFieldNames, selectPrimaryKeyMetadata],
    (nativeFieldNames, primaryKeyMetadata) => {
      const primaryKeySet = new Set<AllEntityFieldKeys>(
        primaryKeyMetadata.fields,
      );
      return nativeFieldNames.filter(
        (fieldName) => !primaryKeySet.has(fieldName as AllEntityFieldKeys),
      );
    },
  );

  const selectForeignKeyFieldNames = createSelector(
    [selectFieldInfo],
    (fields) => {
      const foreignKeyFields: AllEntityFieldKeys[] = [];

      for (const field of Object.values(fields)) {
        if (field.foreignKeyReference !== null) {
          foreignKeyFields.push(field.name as AllEntityFieldKeys);
        }
      }

      return foreignKeyFields;
    },
  );

  const selectNonForeignKeyFieldNames = createSelector(
    [selectFieldInfo],
    (fields) => {
      const nonForeignKeyFields: AllEntityFieldKeys[] = [];

      for (const field of Object.values(fields)) {
        if (field.foreignKeyReference === null) {
          nonForeignKeyFields.push(field.name as AllEntityFieldKeys);
        }
      }

      return nonForeignKeyFields;
    },
  );

  const selectNonPkFkFieldNames = createSelector(
    [selectFieldInfo, selectPrimaryKeyMetadata],
    (fields, primaryKeyMetadata) => {
      const primaryKeySet = new Set<AllEntityFieldKeys>(
        primaryKeyMetadata.fields,
      );
      const filteredFields: AllEntityFieldKeys[] = [];

      for (const field of Object.values(fields)) {
        if (
          !primaryKeySet.has(field.name as AllEntityFieldKeys) &&
          field.foreignKeyReference === null
        ) {
          filteredFields.push(field.name as AllEntityFieldKeys);
        }
      }

      return filteredFields;
    },
  );

  const selectMatchDataToFields = (data: Record<string, any>) =>
    createSelector([selectFieldNames], (fieldNames) => {
      const matchingFields: Record<string, any> = {};

      for (const fieldName of fieldNames) {
        if (fieldName in data) {
          matchingFields[fieldName] = data[fieldName];
        }
      }

      return matchingFields;
    });

  const selectMatchDataToNativeFields = (data: Record<string, any>) =>
    createSelector([selectNativeFieldNames], (nativeFields) => {
      const matchingFields: Record<string, any> = {};

      for (const fieldName of nativeFields) {
        if (fieldName in data) {
          matchingFields[fieldName] = data[fieldName];
        }
      }

      return matchingFields;
    });

  const selectMatchListDataToFields = (records: Record<string, any>[]) =>
    createSelector([selectFieldNames], (fieldNames) => {
      const matchingRecords: Record<string, any>[] = [];

      for (const record of records) {
        const matchingFields: Record<string, any> = {};

        for (const fieldName of fieldNames) {
          if (fieldName in record) {
            matchingFields[fieldName] = record[fieldName];
          }
        }

        matchingRecords.push(matchingFields);
      }

      return matchingRecords;
    });

  const selectMatchListDataToNativeFields = (records: Record<string, any>[]) =>
    createSelector([selectNativeFieldNames], (nativeFieldNames) => {
      const matchingRecords: Record<string, any>[] = [];

      for (const record of records) {
        const matchingFields: Record<string, any> = {};

        for (const fieldName of nativeFieldNames) {
          if (fieldName in record) {
            matchingFields[fieldName] = record[fieldName];
          }
        }

        matchingRecords.push(matchingFields);
      }

      return matchingRecords;
    });

  const selectMatchDataToFieldsNoPk = (data: Record<string, any>) =>
    createSelector(
      [selectFieldNames, selectPrimaryKeyMetadata],
      (fieldNames, primaryKeyMetadata) => {
        const matchingFields: Record<string, any> = {};
        const primaryKeySet = new Set<AllEntityFieldKeys>(
          primaryKeyMetadata.fields,
        );

        for (const fieldName of fieldNames as AllEntityFieldKeys[]) {
          if (!primaryKeySet.has(fieldName) && fieldName in data) {
            matchingFields[fieldName] = data[fieldName];
          }
        }

        return matchingFields;
      },
    );

  const selectMatchDataToNativeFieldsNoPk = (data: Record<string, any>) =>
    createSelector(
      [selectNativeFieldNames, selectPrimaryKeyMetadata],
      (nativeFields, primaryKeyMetadata) => {
        const matchingFields: Record<string, any> = {};
        const primaryKeySet = new Set<AllEntityFieldKeys>(
          primaryKeyMetadata.fields,
        );

        for (const fieldName of nativeFields as AllEntityFieldKeys[]) {
          if (!primaryKeySet.has(fieldName) && fieldName in data) {
            matchingFields[fieldName] = data[fieldName];
          }
        }

        return matchingFields;
      },
    );

  const selectMatchListDataToFieldsNoPk = (records: Record<string, any>[]) =>
    createSelector(
      [selectFieldNames, selectPrimaryKeyMetadata],
      (fieldNames, primaryKeyMetadata) => {
        const matchingRecords: Record<string, any>[] = [];
        const primaryKeySet = new Set<AllEntityFieldKeys>(
          primaryKeyMetadata.fields,
        );

        for (const record of records) {
          const matchingFields: Record<string, any> = {};

          for (const fieldName of fieldNames as AllEntityFieldKeys[]) {
            if (!primaryKeySet.has(fieldName) && fieldName in record) {
              matchingFields[fieldName] = record[fieldName];
            }
          }

          matchingRecords.push(matchingFields);
        }

        return matchingRecords;
      },
    );

  const selectMatchListDataToNativeFieldsNoPk = (
    records: Record<string, any>[],
  ) =>
    createSelector(
      [selectNativeFieldNames, selectPrimaryKeyMetadata],
      (nativeFieldNames, primaryKeyMetadata) => {
        const matchingRecords: Record<string, any>[] = [];
        const primaryKeySet = new Set<AllEntityFieldKeys>(
          primaryKeyMetadata.fields,
        );

        for (const record of records) {
          const matchingFields: Record<string, any> = {};

          for (const fieldName of nativeFieldNames as AllEntityFieldKeys[]) {
            if (!primaryKeySet.has(fieldName) && fieldName in record) {
              matchingFields[fieldName] = record[fieldName];
            }
          }

          matchingRecords.push(matchingFields);
        }

        return matchingRecords;
      },
    );

  const selectMatchDataToNonPkFkFields = (data: Record<string, any>) =>
    createSelector([selectNonPkFkFieldNames], (nonPkFkFieldNames) => {
      const matchingFields: Record<string, any> = {};

      for (const fieldName of nonPkFkFieldNames) {
        if (fieldName in data) {
          matchingFields[fieldName] = data[fieldName];
        }
      }

      return matchingFields;
    });

  const selectMatchListDataToNonPkFkFields = (records: Record<string, any>[]) =>
    createSelector([selectNonPkFkFieldNames], (nonPkFkFieldNames) => {
      const matchingRecords: Record<string, any>[] = [];

      for (const record of records) {
        const matchingFields: Record<string, any> = {};

        for (const fieldName of nonPkFkFieldNames) {
          if (fieldName in record) {
            matchingFields[fieldName] = record[fieldName];
          }
        }

        matchingRecords.push(matchingFields);
      }

      return matchingRecords;
    });

  const selectRuntimeFilters = createSelector(
    [selectEntity],
    (entity): RuntimeFilter[] =>
      entity?.runtimeFilters ?? EMPTY_RUNTIME_FILTERS,
  );

  const selectRuntimeSort = createSelector(
    [selectEntity],
    (entity): RuntimeSort => entity?.runtimeSort ?? DEFAULT_RUNTIME_SORT,
  );

  // New selector for relation-filtered records
  const selectRelationFilteredRecords = createSelector(
    [selectRecordsArray, selectRuntimeFilters, selectRuntimeSort],
    (
      records: EntityDataWithKey<TEntity>[],
      runtimeFilters: RuntimeFilter[],
      runtimeSort: RuntimeSort,
    ) => {
      let result = [...records];

      for (const filter of runtimeFilters) {
        result = result.filter((item) =>
          filter.operator === "eq"
            ? item[filter.field as keyof EntityDataWithKey<TEntity>] ===
              filter.value
            : item[filter.field as keyof EntityDataWithKey<TEntity>] !==
              filter.value,
        );
      }

      // Apply runtime sort
      result.sort((a, b) => {
        const aValue = a[runtimeSort.field as keyof EntityDataWithKey<TEntity>];
        const bValue = b[runtimeSort.field as keyof EntityDataWithKey<TEntity>];
        return runtimeSort.direction === "asc"
          ? aValue > bValue
            ? 1
            : aValue < bValue
              ? -1
              : 0
          : bValue > aValue
            ? 1
            : bValue < aValue
              ? -1
              : 0;
      });

      return result;
    },
  );

  const selectSocketEventName = createSelector(
    [selectEntity],
    (entity): string | undefined => entity?.socketEventName,
  );
  const selectCustomData = createSelector(
    [selectEntity],
    (entity): Record<string, unknown> | undefined => entity?.customData,
  );

  return {
    selectEntity,
    selectAllRecords,
    selectHasMinimumOneRecord,
    selectRecordByPrimaryKey,
    selectRecordsByPrimaryKeys,
    selectQuickReference,
    selectQuickReferenceByPrimaryKey,
    selectQuickReferenceKeyDisplayPairs,
    selectQuickReferenceSelectOptions,
    selectPaginationInfo,
    selectCurrentPage,
    selectCurrentFilters,
    selectFilteredRecords,
    selectLoadingState,
    selectErrorState,
    selectIsStale,
    selectHasUnsavedChanges,
    selectEntityFlags,
    selectEntityMetadata,
    selectPrimaryKeyMetadata,
    selectDisplayField,
    selectHistory,
    selectFieldInfo,
    selectFieldOptions,
    selectTableColumns,
    selectCurrentPageFiltered,
    selectRecordWithDisplay,
    selectMetadataSummary,
    selectDataState,

    selectIsLoading,
    selectIsInternalLoading,
    selectIsExternalLoading,
    getStableLoading,

    selectPaginationExtended,
    selectHistoryState,
    // Newly added selectors
    selectMetrics,
    selectOperationCounts,
    selectPerformanceMetrics,
    selectCacheStats,
    selectErrorRates,
    selectMetricsLastUpdated,
    selectResponseTimeMetrics,
    selectThroughputMetrics,
    selectCacheHitRate,
    selectCacheSize,
    selectErrorTimeline,
    selectErrorDistribution,
    selectRecentErrors,

    // Selection Management
    selectSelectedRecordIds,
    selectSelectedRecords,
    selectActiveRecordId,
    selectSelectionMode,
    selectSelectionSummary,
    selectIsRecordSelected,
    selectIsRecordActive,

    // Convenience Additions
    selectEntityDisplayName,
    selectIsValidated,
    selectFetchOneStatus,
    selectRecordByKey,
    selectRecordsForFetching,
    selectActiveRecord,
    selectIsQuickReferenceFetchComplete,
    selectQuickReferenceState,

    selectRecordIdByRecord,
    selectRecordIdsByRecords,

    selectSelectedRecordsWithKey,
    selectCombinedRecordsWithFieldInfo,
    selectActiveRecordWithId,
    selectDefaultValues,
    selectFieldOptionsWithDefaults, // new
    selectNativeFieldOptionsWithDefaults, // new
    selectNativeFieldOptionsWithDefaultsNoPk,

    selectFlexFormField,

    selectMatrxRecordIdByPrimaryKey,
    selectMatrxRecordIdsByPrimaryKeys,

    selectMatrxRecordIdFromValue,
    selectMatrxRecordIdByValues,
    selectMatrxRecordIdByKeyValuePairs,

    selectFieldByKey,
    selectCurrentPageWithRecordId,

    selectOperationMode,
    selectUnsavedRecordById,
    selectEffectiveRecordById,
    selectIsTemporaryRecordId,

    selectChangeComparison,
    selectPendingOperations,
    selectEffectiveRecordOrDefaults,
    selectEffectiveFieldValue,

    selectFieldValueByRecordKey,

    selectFieldMetadata,
    selectRecord,
    selectEntityFieldDetails,

    selectFieldNames,

    selectFieldIdentifiers,
    selectFieldIdentifiersByName,
    selectEntityOperationMode,
    selectEntityStatus,

    selectFieldValue,

    selectFieldGroups,
    selectNativeFields,
    selectRelationshipFields,

    selectRecordPair,
    selectChangedFieldsSet,
    selectFieldComparisons,
    selectChangeComparisonById,
    selectCreatePayload,
    selectActiveRecordCreatePayload,

    // New name-only selectors
    selectFieldNameGroups,
    selectNativeFieldNames,
    selectRelationshipFieldNames,
    selectFieldDisplayNames,

    selectFieldNameGroupsWithHidden,

    selectRecordsByFieldValue,
    selectRecordCountByFieldValue, // new

    selectFirstRecordKeyByFieldValue,
    selectRecordKeysByFieldValue,
    selectRecordsArray,
    selectRecordsByFieldValues,
    selectRecordKeysByFieldValues,
    selectFirstRecordKeyByFieldValues,

    selectMatrxRecordIdsBySimpleKeys,
    selectMatrxRecordIdBySimpleKey,
    selectRecordsByKeys,

    selectAllEffectiveRecords,
    selectAllEffectiveRecordsArray,
    selectEffectiveRecordsByKeys,

    selectRecordsKeyPairs,

    selectRecordWithKey,
    selectRecordsWithKeys,
    selectRecordWithKeyByPrimaryKey,
    selectRecordsWithKeysByPrimaryKeys,
    selectRecordsWithKeysBySimpleIds,
    selectAllEffectiveRecordsWithKeys,
    selectEffectiveRecordsByMultipleFieldsValue,
    selectEffectiveRecordsByFieldValues,

    selectEnhancedRecords,
    selectEnhancedRecordByKey,
    selectSelectedEnhancedRecords,

    selectMatchDataToFields,
    selectMatchDataToNativeFields,
    selectMatchListDataToFields,
    selectMatchListDataToNativeFields,
    selectMatchDataToFieldsNoPk,
    selectMatchDataToNativeFieldsNoPk,
    selectMatchListDataToFieldsNoPk,
    selectMatchListDataToNativeFieldsNoPk,

    selectNativeFieldNamesNoPk,
    selectForeignKeyFieldNames,
    selectNonForeignKeyFieldNames,
    selectNonPkFkFieldNames,
    selectMatchDataToNonPkFkFields,
    selectMatchListDataToNonPkFkFields,

    selectRelationFilteredRecords,

    selectSocketEventName,
    selectCustomData,
    selectUnsavedRecords,
  };
};

export type EntitySelectors<TEntity extends EntityKeys> = ReturnType<
  typeof createEntitySelectors<TEntity>
>;

export const createMessageSelectors =
  createEntitySelectors<"message">("message");
export const createConversationSelectors =
  createEntitySelectors<"conversation">("conversation");
