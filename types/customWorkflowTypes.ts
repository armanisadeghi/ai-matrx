import { MatrxRecordId } from "@/types/records";

export type WorkflowData = {
    id: string;
    createdAt: Date;
    name?: string;
    userId?: string;
    description?: string;
    updatedAt?: Date;
    isPublic?: boolean;
    version?: number;
    authenticatedRead?: boolean;
    publicRead?: boolean;
    isDeleted?: boolean;
    isActive?: boolean;
    visualWorkflow?: Record<string, unknown>;
    backendWorkflow?: Record<string, unknown>;
};
export type WorkflowRecordWithKey = WorkflowData & {
    matrxRecordId: MatrxRecordId;
};

export type ArgOverride = {
    name: string;
    value?: any;
    default_value?: any;
    ready?: boolean;
    required?: boolean;
};

export type ArgMapping = {
    [key: string]: string;
};

export type OverrideData = {
    arg_overrides?: ArgOverride[];
    arg_mapping?: ArgMapping;
    return_broker_override?: string | string[];
};

export type WorkflowStep = {
    function_type: "registered_function" | "workflow_recipe_executor";
    function_id: string;

    step_name?: string;
    status?: string;
    execution_required?: boolean;

    override_data?: OverrideData;

    additional_dependencies?: string[];

    broker_relays?: {
        simple_relays?: SimpleRelay[];
        bidirectional_relays?: BidirectionalRelay[];
        relay_chains?: string[][];
    };
};

export type SimpleRelay = {
    source: string;
    targets: string[];
};

export type BidirectionalRelay = {
    broker_a: string;
    broker_b: string;
};

export type WorkflowRelays = {
    simple_relays?: SimpleRelay[];
    bidirectional_relays?: BidirectionalRelay[];
    relay_chains?: string[][];
};

export type UserInput = {
    broker_id: string;
    value: any;
};

export type BackendWorkflowData = {
    steps: WorkflowStep[];
    workflow_relays?: WorkflowRelays;
    user_inputs?: UserInput[];
};

export const FUNCTION_TYPES = {
    REGISTERED_FUNCTION: "registered_function" as const,
    WORKFLOW_RECIPE_EXECUTOR: "workflow_recipe_executor" as const,
} as const;

export const RECIPE_METHODS = {
    RECIPE_RUNNER: "recipe_runner" as const,
    EXTRACTOR: "extractor" as const,
    ITERATIVE_RECIPE_PREPARER: "iterative_recipe_preparer" as const,
    ITERATIVE_RECIPE_RUNNER: "iterative_recipe_runner" as const,
    RESULTS_PROCESSOR: "results_processor" as const,
} as const;

export const isFunctionStep = (step: WorkflowStep): boolean => {
    return step.function_type === FUNCTION_TYPES.REGISTERED_FUNCTION;
};

export const isRecipeStep = (step: WorkflowStep): boolean => {
    return step.function_type === FUNCTION_TYPES.WORKFLOW_RECIPE_EXECUTOR;
};

export const validateWorkflowStep = (step: WorkflowStep): boolean => {
    if (!step.function_id || !step.function_type) {
        return false;
    }

    if (step.function_type === FUNCTION_TYPES.REGISTERED_FUNCTION) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(step.function_id);
    }

    if (step.function_type === FUNCTION_TYPES.WORKFLOW_RECIPE_EXECUTOR) {
        const validMethods = Object.values(RECIPE_METHODS);
        return validMethods.includes(step.function_id as any);
    }

    return false;
};

export const createFunctionStep = (
    function_id: string,
    step_name?: string,
    override_data?: OverrideData,
    options?: {
        execution_required?: boolean;
        status?: string;
        additional_dependencies?: string[];
        broker_relays?: WorkflowStep["broker_relays"];
    }
): WorkflowStep => {
    return {
        function_type: FUNCTION_TYPES.REGISTERED_FUNCTION,
        function_id,
        step_name,
        override_data,
        ...options,
    };
};

export const createRecipeStep = (
    function_id: string,
    step_name?: string,
    override_data?: OverrideData,
    options?: {
        execution_required?: boolean;
        status?: string;
        additional_dependencies?: string[];
        broker_relays?: WorkflowStep["broker_relays"];
    }
): WorkflowStep => {
    return {
        function_type: FUNCTION_TYPES.WORKFLOW_RECIPE_EXECUTOR,
        function_id,
        step_name,
        override_data,
        ...options,
    };
};
