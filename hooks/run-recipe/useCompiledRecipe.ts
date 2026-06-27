"use client";

import { useMemo } from "react";
import { QuickReferenceRecord } from "@/lib/redux/entity/types/stateTypes";
import { MatrxRecordId } from "@/types/records";
import {
    AiSettingsData,
    BrokerValueData,
    DataInputComponentData,
    DataInputComponentRecordWithKey,
    DataOutputComponentData,
    MessageBrokerData,
    MessageTemplateDataOptional,
} from "@/types/AutomationSchemaTypes";
import { useGetorFetchRecords } from "@/app/entities/hooks/records/useGetOrFetch";
import { createEntitySelectors } from "@/lib/redux/entity/selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { useDebounce } from "@uidotdev/usehooks";

export type DataBrokerData = {
    id: string;
    name: string;
    dataType?: "str" | "bool" | "dict" | "float" | "int" | "list" | "url";
    outputComponent?: string;
    dataInputComponentReference?: DataInputComponentData[];
    defaultValue?: string;
    inputComponent?: string;
    color?:
        | "blue"
        | "amber"
        | "cyan"
        | "emerald"
        | "fuchsia"
        | "gray"
        | "green"
        | "indigo"
        | "lime"
        | "neutral"
        | "orange"
        | "pink"
        | "purple"
        | "red"
        | "rose"
        | "sky"
        | "slate"
        | "stone"
        | "teal"
        | "violet"
        | "yellow"
        | "zinc";
    dataOutputComponentReference?: DataOutputComponentData[];
    brokerValueInverse?: BrokerValueData[];
    messageBrokerInverse?: MessageBrokerData[];
};

type CompiledRecipeEntry = {
    id: string;
    name: string;
    brokers: DataBrokerData[];
    messages: MessageTemplateDataOptional[];
    settings: AiSettingsData[];
};

type CompiledRecipeRecordWithKey = {
    id: string;
    compiledRecipe: Record<string, unknown>;
    recipeId: string;
    createdAt: Date;
    userId: string;
    isPublic: boolean;
    version: number;
    updatedAt: Date;
    authenticatedRead: boolean;
    matrxRecordId: MatrxRecordId;
};

export function useCompiledRecipe({
    selectedRecipe,
    selectedVersion,
    compiledVersions,
}: {
    selectedRecipe: QuickReferenceRecord | undefined;
    selectedVersion: number;
    compiledVersions: CompiledRecipeRecordWithKey[];
}) {
    const activeCompiledRecipeRecord = useMemo(
        () => compiledVersions.find((record) => record.version === selectedVersion),
        [compiledVersions, selectedVersion]
    );

    const dataInputSelectors = useMemo(() => createEntitySelectors("dataInputComponent"), []);
    const recipeSelectors = useMemo(() => createEntitySelectors("recipe"), []);
    const compiledRecipeSelectors = useMemo(() => createEntitySelectors("compiledRecipe"), []);

    const dataInputComponentsLoading = useAppSelector(state => dataInputSelectors.selectIsLoading(state));
    const recipeLoading = useAppSelector(state => recipeSelectors.selectIsLoading(state));
    const compiledRecipeLoading = useAppSelector(state => compiledRecipeSelectors.selectIsLoading(state));

    const isReduxLoading = useDebounce(dataInputComponentsLoading || recipeLoading || compiledRecipeLoading, 400);

    const compiledRecipe = activeCompiledRecipeRecord?.compiledRecipe as CompiledRecipeEntry;

    const inputComponentIds = useMemo(
        () => compiledRecipe?.brokers?.map((broker) => `id:${broker.inputComponent}`) ?? [],
        [compiledRecipe?.brokers]
    );

    const inputComponentsArray = useGetorFetchRecords("dataInputComponent", inputComponentIds) as DataInputComponentRecordWithKey[];

    const inputComponents = useMemo(() => {
        const componentsMap: Record<string, DataInputComponentData> = {};
        inputComponentsArray.forEach((component) => {
            if (component?.id) {
                componentsMap[component.id] = component;
            }
        });
        return componentsMap;
    }, [inputComponentsArray]);

    const hasAllInputComponents = useMemo(() => {
        if (!compiledRecipe?.brokers || !inputComponents) return false;
        return compiledRecipe.brokers.every((broker) => broker.inputComponent && inputComponents[broker.inputComponent]?.component);
    }, [compiledRecipe?.brokers, inputComponents]);

    const isLoading = selectedRecipe && (!activeCompiledRecipeRecord || (inputComponentIds.length > 0 && !hasAllInputComponents) || isReduxLoading);

    const hasError = selectedRecipe && !isLoading && !activeCompiledRecipeRecord;

    return {
        compiledRecipe,
        inputComponents,
        isLoading,
        hasError,
    };
}

export type UseCompiledRecipeReturn = ReturnType<typeof useCompiledRecipe>;
