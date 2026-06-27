import { useEffect, useCallback } from "react";
import { EntityActions } from "@/lib/redux/entity/slice";
import { FetchMode } from "@/lib/redux/entity/actions";
import { EntitySelectors } from "@/lib/redux/entity/selectors";
import { QuickReferenceRecord } from "@/lib/redux/entity/types/stateTypes";
import { DataOutputComponentData } from "@/types/AutomationSchemaTypes";
import { MatrxRecordId } from "@/types/records";
import { useEntityWithFetch } from "@/lib/redux/entity/hooks/useAllData";


type UseDataOutputComponentWithFetchReturn = {
    dataOutputComponentSelectors: EntitySelectors<"dataOutputComponent">;
    dataOutputComponentActions: EntityActions<"dataOutputComponent">;
    dataOutputComponentRecords: Record<MatrxRecordId, DataOutputComponentData>;
    dataOutputComponentUnsavedRecords: Record<MatrxRecordId, Partial<DataOutputComponentData>>;
    dataOutputComponentSelectedRecordIds: MatrxRecordId[];
    dataOutputComponentIsLoading: boolean;
    dataOutputComponentIsError: boolean;
    dataOutputComponentQuickRefRecords: QuickReferenceRecord[];
    addDataOutputComponentMatrxId: (recordId: MatrxRecordId) => void;
    addDataOutputComponentMatrxIds: (recordIds: MatrxRecordId[]) => void;
    removeDataOutputComponentMatrxId: (recordId: MatrxRecordId) => void;
    removeDataOutputComponentMatrxIds: (recordIds: MatrxRecordId[]) => void;
    addDataOutputComponentPkValue: (pkValue: string) => void;
    addDataOutputComponentPkValues: (pkValues: Record<string, unknown>) => void;
    removeDataOutputComponentPkValue: (pkValue: string) => void;
    removeDataOutputComponentPkValues: (pkValues: Record<string, unknown>) => void;
    isDataOutputComponentMissingRecords: boolean;
    setDataOutputComponentShouldFetch: (shouldFetch: boolean) => void;
    setDataOutputComponentFetchMode: (fetchMode: FetchMode) => void;
    fetchDataOutputComponentQuickRefs: () => void;
    fetchDataOutputComponentOne: (recordId: MatrxRecordId) => void;
    fetchDataOutputComponentOneWithFkIfk: (recordId: MatrxRecordId) => void;
    fetchDataOutputComponentAll: () => void;
    fetchDataOutputComponentPaginated: (page: number, pageSize: number) => void;
};

export const useDataOutputComponentWithFetch = (): UseDataOutputComponentWithFetchReturn => {
    const {
        selectors: dataOutputComponentSelectors,
        actions: dataOutputComponentActions,
        allRecords: dataOutputComponentRecords,
        unsavedRecords: dataOutputComponentUnsavedRecords,
        selectedRecordIds: dataOutputComponentSelectedRecordIds,
        isLoading: dataOutputComponentIsLoading,
        isError: dataOutputComponentIsError,
        quickRefRecords: dataOutputComponentQuickRefRecords,
        addMatrxId: addDataOutputComponentMatrxId,
        addMatrxIds: addDataOutputComponentMatrxIds,
        removeMatrxId: removeDataOutputComponentMatrxId,
        removeMatrxIds: removeDataOutputComponentMatrxIds,
        addPkValue: addDataOutputComponentPkValue,
        addPkValues: addDataOutputComponentPkValues,
        removePkValue: removeDataOutputComponentPkValue,
        removePkValues: removeDataOutputComponentPkValues,
        isMissingRecords: isDataOutputComponentMissingRecords,
        setShouldFetch: setDataOutputComponentShouldFetch,
        setFetchMode: setDataOutputComponentFetchMode,
        fetchQuickRefs: fetchDataOutputComponentQuickRefs,
        fetchOne: fetchDataOutputComponentOne,
        fetchOneWithFkIfk: fetchDataOutputComponentOneWithFkIfk,
        fetchAll: fetchDataOutputComponentAll,
        fetchPaginated: fetchDataOutputComponentPaginated,

    } = useEntityWithFetch("dataOutputComponent");

    useEffect(() => {
        fetchDataOutputComponentAll();
    }, [fetchDataOutputComponentAll]);

    return {
        dataOutputComponentSelectors,
        dataOutputComponentActions,
        dataOutputComponentRecords,
        dataOutputComponentUnsavedRecords,
        dataOutputComponentSelectedRecordIds,
        dataOutputComponentIsLoading,
        dataOutputComponentIsError,
        dataOutputComponentQuickRefRecords,
        addDataOutputComponentMatrxId,
        addDataOutputComponentMatrxIds,
        removeDataOutputComponentMatrxId,
        removeDataOutputComponentMatrxIds,
        addDataOutputComponentPkValue,
        addDataOutputComponentPkValues,
        removeDataOutputComponentPkValue,
        removeDataOutputComponentPkValues,
        isDataOutputComponentMissingRecords,
        setDataOutputComponentShouldFetch,
        setDataOutputComponentFetchMode,
        fetchDataOutputComponentQuickRefs,
        fetchDataOutputComponentOne,
        fetchDataOutputComponentOneWithFkIfk,
        fetchDataOutputComponentAll,
        fetchDataOutputComponentPaginated,
    };
};
