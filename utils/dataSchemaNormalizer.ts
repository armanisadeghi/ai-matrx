type NormalizedFields<T> = Required<{
    [K in keyof T]: string | NonNullable<T[K]>;
}>;

const isNullLike = (value: unknown): boolean => {
    return value === null || value === undefined || value === '';
};

export function createNormalizer(fields: readonly string[]) {
    return (data: Record<string, unknown> | null | undefined) => {
        const normalized: Record<string, unknown> = {};

        fields.forEach(field => {
            normalized[field] = isNullLike(data?.[field]) ? 'default' : data?.[field];
        });

        return normalized;
    };
}

// Example usage for AI Settings:
const AI_SETTINGS_FIELDS = [
    'id',
    'aiEndpoint',
    'aiModel',
    'aiProvider',
    'maxTokens',
    'presetName',
    'temperature',
    'topP',
    'frequencyPenalty',
    'presencePenalty',
    'stream',
    'responseFormat',
    'size',
    'quality',
    'count',
    'audioVoice',
    'audioFormat',
    'modalities',
    'tools',
    'aiProviderReference',
    'aiEndpointReference',
    'aiModelReference',
    'aiAgentInverse'
] as const;

const normalizeAiSettings = createNormalizer(AI_SETTINGS_FIELDS);

// Example usage for any other type of data:
type UserProfile = {
    userId: string;
    name: string;
    email: string;
    preferences: Record<string, unknown>;
};

// Example: (NOT OUR REAL FIELDS)
const USER_PROFILE_FIELDS = [
    'userId',
    'name',
    'email',
    'preferences'
] as const;

const normalizeUserProfile = createNormalizer(USER_PROFILE_FIELDS);