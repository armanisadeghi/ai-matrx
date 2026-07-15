import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletRuntimeDataSourceConfig } from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import { useCallback, useState } from "react";
import { brokerSelectors } from "@/lib/redux/brokerSlice";

export interface NeededBroker {
  id: string;
  name: string;
  required: boolean;
  dataType: string;
  defaultValue: string;
}

interface RecipeSourceConfig {
  id: string;
  compiledId: string;
  version: number;
  neededBrokers: NeededBroker[];
}

interface AppletSourceConfig {
  sourceType?: "recipe" | "workflow" | "api" | "database" | "other" | string;
  config?: RecipeSourceConfig;
}

interface BrokerValue {
  id: string;
  value: string;
  ready: boolean;
  name?: string;
}

function isNeededBroker(value: unknown): value is NeededBroker {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "required" in value &&
    typeof value.required === "boolean" &&
    "dataType" in value &&
    typeof value.dataType === "string" &&
    "defaultValue" in value &&
    typeof value.defaultValue === "string"
  );
}

interface UseAppletRecipeProps {
  appletId: string | null;
  /**
   * When false, all execution side effects are short-circuited (no task is
   * created/submitted over the socket transport). Used while applet execution
   * is temporarily under construction after the prompts-system removal.
   * Defaults to true so the hook's normal behavior is restored simply by
   * passing `enabled` truthy (or omitting it). See AppletRunComponent.
   */
  enabled?: boolean;
}

const EMPTY_VALIDATION_STATE = {
  isValid: false,
  validationErrors: {} as Record<string, string>,
};

/**
 * Legacy socket-task recipe runner. Stream-tasks Redux was removed — execution
 * is stubbed until the agents execution path fully replaces it (see
 * useAppletRecipeFastAPI + AppletRunComponent).
 */
export function useAppletRecipe({
  appletId,
  enabled = true,
}: UseAppletRecipeProps) {
  const sourceConfig = useAppSelector((state) =>
    appletId ? selectAppletRuntimeDataSourceConfig(state, appletId) : undefined,
  );
  const [taskId] = useState<string | null>(null);
  const [neededBrokerIds] = useState<string[]>([]);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskData = undefined;
  const taskValidationState = EMPTY_VALIDATION_STATE;

  const rawBrokerValues = useAppSelector((state) =>
    brokerSelectors.selectMultipleValues(state, neededBrokerIds || []),
  );

  const brokerValues = Object.entries(rawBrokerValues || {}).reduce<
    Record<string, unknown>
  >((acc, [id, value]) => {
    acc[id] = value;
    return acc;
  }, {});

  const sourceNeededBrokers =
    sourceConfig?.config &&
    "neededBrokers" in sourceConfig.config &&
    Array.isArray(sourceConfig.config.neededBrokers)
      ? sourceConfig.config.neededBrokers.filter(isNeededBroker)
      : [];

  const structuredBrokerValues = Object.entries(rawBrokerValues || {}).map(
    ([id, value]) => ({
      id,
      value: value ?? "",
      ready: true,
      name: sourceNeededBrokers.find(
        (broker) => broker.id === id,
      )?.name,
    }),
  );

  const isTaskValid = taskValidationState.isValid;
  const validationErrors = taskValidationState.validationErrors;

  const notReadyBrokers: BrokerValue[] = [];

  const submitRecipe = useCallback(() => {
    if (!enabled) return;
    setError(
      "Applet recipe execution via socket tasks is unavailable (legacy stream-tasks removed).",
    );
  }, [enabled]);

  return {
    taskId,
    isLoading,
    error,
    isTaskValid,
    validationErrors,
    submitRecipe,
    notReadyBrokers,
    brokerValues,
  };
}

export default useAppletRecipe;
