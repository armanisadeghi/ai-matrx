import { MatrxRecordId } from "@/types/records";
import {
    AiSettingsData,
    BrokerValueData,
    DataBrokerData,
    DataInputComponentData,
    DataInputComponentRecordWithKey,
    DataOutputComponentData,
    MessageBrokerData,
    MessageTemplateDataOptional,
    RecipeRecordWithKey,
} from "@/types/AutomationSchemaTypes";


export type CompiledRecipeEntry = {
    id: string;
    name: string;
    brokers: DataBrokerData[];
    messages: MessageTemplateDataOptional[];
    settings: AiSettingsData[];
    matrxRecordId: MatrxRecordId;
};

export type CompiledRecipeRecordWithKey = {
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


export type BrokerWithComponent = {
    brokerId: string;
    brokerRecordKey: MatrxRecordId;
    brokerName: string;
    componentRecordKey: MatrxRecordId;
    componentMetadata: DataInputComponentData;
    brokerDataType?: string;
    brokerDefaultValue?: string;
};

export type BrokerWithComponentsMap = Record<string, BrokerWithComponent>;
