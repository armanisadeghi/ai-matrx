import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  fetchAppById,
  fetchAppBySlug,
  fetchTransformedAppAndApplets,
} from "../service/app-runtime-service";
import {
  setAppRuntimeConfig,
  setAppRuntimeLoading,
  resetAppRuntimeConfig,
} from "../slices/customAppRuntimeSlice";
import {
  setAppletRuntimeConfig,
  setAppletRuntimeLoading,
  resetAppletRuntimeConfig,
} from "../slices/customAppletRuntimeSlice";
import {
  validateAppWithApplets,
  ValidationOptions,
  ValidationResult,
} from "../validations/appRunnerValidations";
import { brokerActions, BrokerMapEntry } from "@/lib/redux/brokerSlice";
import { coreSelectors as brokerSelectors } from "@/lib/redux/brokerSlice/selectors/core";
import {
  CustomAppletConfig,
  CustomAppConfig,
  BrokerMapping,
} from "@/types/customAppTypes";
import type { RootState } from "@/lib/redux/store";

// Object to store validation results for retrieval later
const validationStore: Record<string, ValidationResult> = {};

/**
 * Runs validations asynchronously without blocking the main thread
 */
function runDeferredValidations(
  appConfig: any,
  applets: any[],
  options: ValidationOptions,
  storeKey: string,
): void {
  // Run as a fully isolated process that won't affect the main app
  try {
    console.debug("Scheduling deferred validations for:", storeKey);

    // Create a clone of the data to prevent any reference issues
    const clonedAppConfig = JSON.parse(JSON.stringify(appConfig));
    const clonedApplets = JSON.parse(JSON.stringify(applets));

    // Use a web worker or setTimeout to run in a separate context
    setTimeout(() => {
      try {
        console.debug("Running deferred validations for:", storeKey);
        const validationResult = validateAppWithApplets(
          clonedAppConfig,
          clonedApplets,
          options,
        );
        validationStore[storeKey] = validationResult;

        if (options.logResults && validationResult.issues.length > 0) {
          console.debug(
            "Validation complete:",
            validationResult.issues.length,
            "issues found",
          );
        }
      } catch (error) {
        // Completely isolate errors from the main thread
        console.debug("Background validation error (safely contained):", error);
      }
    }, 0);
  } catch (error) {
    // Safety catch to prevent any possible impact on the main application
    console.debug("Failed to schedule validation (safely ignored):", error);
  }
}

/**
 * Get validation results for a specific app
 */
export function getValidationResults(appId: string): ValidationResult | null {
  return validationStore[appId] || null;
}

/**
 * Thunk to fetch app data by ID and populate both the app and applet slices
 */
export const fetchAppWithApplets = createAsyncThunk(
  "appRunner/fetchAppWithApplets",
  async (
    {
      idOrSlug,
      isSlug = true,
      defaultAppletId = null,
      validationOptions = { runValidations: false, logResults: false },
    }: {
      idOrSlug: string;
      isSlug?: boolean;
      defaultAppletId?: string | null;
      validationOptions?: ValidationOptions;
    },
    { dispatch, rejectWithValue, getState },
  ) => {
    const requestId = Math.random().toString(36).substring(2, 10);

    try {
      // Reset both slices and set loading state
      dispatch(resetAppRuntimeConfig());
      dispatch(resetAppletRuntimeConfig());
      dispatch(setAppRuntimeLoading());
      dispatch(setAppletRuntimeLoading());

      // Add timeout to prevent hanging forever on fetch
      const fetchWithTimeout = async (): Promise<{
        appConfig: CustomAppConfig;
        applets: CustomAppletConfig[];
      }> => {
        const FETCH_TIMEOUT = 15000; // 15 seconds

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Fetch timed out after ${FETCH_TIMEOUT}ms`));
          }, FETCH_TIMEOUT);
        });

        return Promise.race([
          fetchTransformedAppAndApplets(idOrSlug, isSlug),
          timeoutPromise,
        ]);
      };

      // Fetch app data with timeout
      const appData = await fetchWithTimeout();
      const { appConfig, applets } = appData;

      // Check if the app's userId matches the global user ID
      const state = getState() as RootState;
      const globalUserId = brokerSelectors.selectValue(state, "GLOBAL_USER_ID");

      // Set the APPLET_USER_IS_ADMIN broker value based on userId comparison
      if (appConfig.userId && globalUserId) {
        const isUserAdmin = appConfig.userId === globalUserId;
        dispatch(
          brokerActions.setValue({
            brokerId: "APPLET_USER_IS_ADMIN",
            value: isUserAdmin,
          }),
        );
      } else {
        // If either userId is missing, default to false
        dispatch(
          brokerActions.setValue({
            brokerId: "APPLET_USER_IS_ADMIN",
            value: false,
          }),
        );
      }

      const activeAppletId = determineActiveAppletId(
        appConfig,
        applets,
        defaultAppletId,
      );

      const brokerMappings = applets.reduce((acc, applet) => {
        // Check for brokerMap property
        if (
          applet.brokerMap &&
          Array.isArray(applet.brokerMap) &&
          applet.brokerMap.length > 0
        ) {
          applet.brokerMap.forEach((mapping: BrokerMapping) => {
            acc.push({
              brokerId: mapping.brokerId,
              mappedItemId: mapping.fieldId,
              source: "applet",
              sourceId: applet.id,
            });
          });
        }
        return acc;
      }, [] as BrokerMapEntry[]);

      dispatch(brokerActions.addOrUpdateRegisterEntries(brokerMappings));

      // console.warn("NOTICE: fetchAppWithApplets -> Conceptual broker mapping being set to the broker map concept slice");

      // Set app and applet configurations to make the app functional
      dispatch(setAppRuntimeConfig(appConfig));
      dispatch(
        setAppletRuntimeConfig({
          applets,
          activeAppletId,
        }),
      );

      // Run validations in the background *after* app is loaded
      // This is completely decoupled from the main application flow
      if (validationOptions.runValidations && appConfig.id) {
        const appId = appConfig.id;
        // Use setTimeout with a longer delay to ensure it runs well after the app is loaded
        setTimeout(() => {
          try {
            runDeferredValidations(
              appConfig,
              applets,
              validationOptions,
              appId,
            );
          } catch (error) {
            // Completely silence any validation errors to prevent affecting the main app
            console.debug(
              "[THUNK-DEBUG] Validation error (safely ignored):",
              error,
            );
          }
        }, 1000);
      }

      return {
        appConfig,
        applets,
        activeAppletId,
      };
    } catch (error: any) {
      console.error(
        `[THUNK-DEBUG ${requestId}] Error in fetchAppWithApplets thunk:`,
        error,
      );

      // Detailed error for debugging
      const errorDetails = {
        message: error.message || "Unknown error",
        code: error.code,
        status: error.status,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        requestId,
      };

      // Reset both slices on error
      dispatch(resetAppRuntimeConfig());
      dispatch(resetAppletRuntimeConfig());

      return rejectWithValue(errorDetails);
    }
  },
);

/**
 * Helper function to determine which applet should be active initially
 */
function determineActiveAppletId(
  appConfig: any,
  applets: any[],
  defaultAppletId: string | null,
): string | null {
  // If a specific applet ID was requested, use that if it exists
  if (
    defaultAppletId &&
    applets.some((applet) => applet.id === defaultAppletId)
  ) {
    return defaultAppletId;
  }

  // If there's an appletList in the appConfig, use the first one
  if (appConfig.appletList && appConfig.appletList.length > 0) {
    const firstAppletId = appConfig.appletList[0].appletId;
    if (applets.some((applet) => applet.id === firstAppletId)) {
      return firstAppletId;
    }
  }

  // Otherwise, use the first applet in the list if available
  return applets.length > 0 ? applets[0].id : null;
}
