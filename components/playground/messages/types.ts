import { MatrxRecordId } from "@/types/records";
import { MessageTemplateDataOptional } from "@/types/AutomationSchemaTypes";

export type ProcessedRecipeMessages = MessageTemplateDataOptional & {
    matrxRecordId: MatrxRecordId;
    order: number;
    recipeId?: string;
    parentMatrxId?: MatrxRecordId;
    joinPksValues?: Record<'id', string>;
    message_broker_inverse?: any[];
    recipe_message_inverse?: any[];    
};

const sampleData = {
    "id": "872a0b09-de75-4ff9-988d-8bf42f8b292f",
    "role": "assistant",
    "type": "text",
    "content": "test message",

    "createdAt": "2025-01-19T23:51:25.085139+00:00",
    "matrxRecordId": "id:872a0b09-de75-4ff9-988d-8bf42f8b292f",

    "order": 1,
    "recipeId": "5492b8ab-729b-466a-9584-60e9127acddd",
    "joinPksValues": {
        "id": "872a0b09-de75-4ff9-988d-8bf42f8b292f"
    },
    "parentMatrxId": "id:5492b8ab-729b-466a-9584-60e9127acddd",

    "message_broker_inverse": [],
    "recipe_message_inverse": [
        {
            "id": "872a0b09-de75-4ff9-988d-8bf42f8b292f",
            "order": 1,
            "recipe_id": "5492b8ab-729b-466a-9584-60e9127acddd",
            "message_id": "eb10c8d7-cce7-411b-95c4-79eef8d17063"
        }
    ],
}

