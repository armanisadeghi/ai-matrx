import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletRuntimeDataSourceConfig } from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  addToArrayField,
  setArrayField,
} from "@/lib/redux/stream-tasks/slices/socketTasksSlice";
import { createTask } from "@/lib/redux/stream-tasks/thunks/createTaskThunk";
import { submitTask } from "@/lib/redux/stream-tasks/thunks/submitTask";
import { useEffect, useState, useCallback, useRef } from "react";
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

interface UseAppletRecipeProps {
  appletId: string;
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

export function useAppletRecipe({
  appletId,
  enabled = true,
}: UseAppletRecipeProps) {
  const dispatch = useAppDispatch();
  const sourceConfig = useAppSelector((state) =>
    selectAppletRuntimeDataSourceConfig(state, appletId),
  );
  const [taskId, setTaskId] = useState<string | null>(null);
  const [neededBrokerIds, setNeededBrokerIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskData = undefined;
  const taskValidationState = EMPTY_VALIDATION_STATE;

  // Get the raw broker values from Redux state
  const rawBrokerValues = useAppSelector((state) =>
    brokerSelectors.selectMultipleValues(state, neededBrokerIds || []),
  );

  // Transform raw broker values into the structure expected by the task
  const brokerValues = Object.entries(rawBrokerValues || {}).reduce<
    Record<string, any>
  >((acc, [id, value]) => {
    acc[id] = value;
    return acc;
  }, {});

  // Create properly structured broker values for task submission
  const structuredBrokerValues = Object.entries(rawBrokerValues || {}).map(
    ([id, value]) => ({
      id,
      value: value ?? "",
      ready: true,
      name: sourceConfig?.config?.neededBrokers.find(
        (broker) => broker.id === id,
      )?.name,
    }),
  );

  // Extract validation state
  const isTaskValid = taskValidationState.isValid;
  const validationErrors = taskValidationState.validationErrors;

  // Calculate not-ready brokers
  const notReadyBrokers = (taskData?.broker_values || []).filter(
    (broker: BrokerValue) => !broker.ready,
  );

  // Initialize the task and brokers
  useEffect(() => {
    if (
      !enabled ||
      taskId ||
      !sourceConfig ||
      sourceConfig.sourceType !== "recipe" ||
      !sourceConfig.config
    ) {
      return;
    }

    setIsLoading(true);

    // Extract needed broker IDs from the config
    const configBrokerIds = sourceConfig.config.neededBrokers.map(
      (broker) => broker.id,
    );
    setNeededBrokerIds(configBrokerIds);

    // Create the task
    dispatch(
      createTask({
        service: "ai_chat_service",
        taskName: "run_recipe_to_chat",
        initialData: {
          chat_config: {
            recipe_id: sourceConfig.config.id,
            version: "latest", // Temporary fix for recipe version (There is a python bug that is converting it to a string)
            prepare_for_next_call: true,
            save_new_conversation: true,
            include_classified_output: true,
            tools_override: [],
            allow_default_values: false,
            allow_removal_of_unmatched: false,
          },
          broker_values: [], // Start with empty broker values
        },
      }),
    )
      .unwrap()
      .then((newTaskId) => {
        setTaskId(newTaskId);

        // Initialize brokers AFTER task is created
        configBrokerIds.forEach((brokerId) => {
          dispatch(
            addToArrayField({
              taskId: newTaskId,
              field: "broker_values",
              item: {
                id: brokerId,
                value: "",
                ready: true,
                name: sourceConfig.config?.neededBrokers.find(
                  (b) => b.id === brokerId,
                )?.name,
              },
            }),
          );
        });

        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Failed to create task:", error);
        setError("Failed to initialize the applet recipe.");
        setIsLoading(false);
      });
  }, [sourceConfig, taskId, dispatch, enabled]);

  // Handle submission with properly structured broker values
  const submitRecipe = useCallback(() => {
    if (!enabled || !taskId) return;

    setIsLoading(true);

    dispatch(
      setArrayField({
        taskId,
        field: "broker_values",
        items: structuredBrokerValues,
      }),
    );

    dispatch(submitTask({ taskId }))
      .unwrap()
      .then(() => {
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Failed to submit task:", error);
        setError("Failed to process the request.");
        setIsLoading(false);
      });
  }, [dispatch, taskId, structuredBrokerValues, enabled]);

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
