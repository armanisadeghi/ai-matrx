import { nanoid } from "nanoid";
import type { AppThunk } from "@/lib/redux/store";
import { componentDefinitionsSlice } from "../slices/componentDefinitionsSlice";
import { CustomAppletConfig } from "@/types/customAppTypes";
import { brokerActions } from "@/lib/redux/brokerSlice";
import { extractErrorMessage } from "@/utils/errors";

export interface LoadAppletResult {
  success: boolean;
  componentInstances?: { instanceId: string; brokerId: string }[];
  error?: string;
}

export const loadApplet =
  ({
    appId,
    applet,
    initialBrokerValues,
  }: {
    appId: string;
    applet: CustomAppletConfig;
    initialBrokerValues?: Record<string, unknown>;
  }): AppThunk<Promise<LoadAppletResult>> =>
  async (dispatch) => {
    try {
      dispatch(componentDefinitionsSlice.actions.setLoading(true));
      dispatch(brokerActions.setLoading(true));

      // 1. Add the applet to state
      const appletId = applet.id || nanoid();
      dispatch(
        componentDefinitionsSlice.actions.addApplet({
          appId,
          applet: { ...applet, id: appletId },
        }),
      );

      // 2. Add all containers
      const containers = applet.containers || [];
      containers.forEach((container) => {
        dispatch(
          componentDefinitionsSlice.actions.addContainer({ appId, container }),
        );
      });

      // 3. For each field, create a component instance and map to a broker
      const componentInstances: { instanceId: string; brokerId: string }[] = [];
      const neededBrokers: string[] = [];

      for (const container of containers) {
        for (const field of container.fields) {
          const instanceId = `${appId}_${field.id}_${nanoid()}`;
          const brokerId = `broker_${appId}_${field.id}_${nanoid()}`;

          // Create component instance
          dispatch(
            componentDefinitionsSlice.actions.createComponentInstance({
              appId,
              definitionId: field.id,
              instanceId,
              overrides: field,
            }),
          );

          // Map to broker
          dispatch(
            componentDefinitionsSlice.actions.mapComponentToBroker({
              appId,
              mapping: {
                componentId: field.id,
                instanceId,
                brokerId,
              },
            }),
          );

          componentInstances.push({ instanceId, brokerId });
          neededBrokers.push(brokerId);

          // Set initial value if provided (ignore defaultValue)
          // if (initialBrokerValues && initialBrokerValues[field.id] !== undefined) {
          //     dispatch(
          //         setAppropriateValueForComponent({ appId, brokerId, component: field, value: initialBrokerValues[field.id] })
          //     );
          // }
        }
      }

      // Add all brokers to neededBrokers
      // dispatch(brokerActions.addNeededBrokers({ appId, brokerIds: neededBrokers }));

      dispatch(componentDefinitionsSlice.actions.setLoading(false));
      dispatch(brokerActions.setLoading(false));

      return { success: true, componentInstances };
    } catch (error: unknown) {
      console.error("Error loading applet:", error);
      const message = extractErrorMessage(error);
      dispatch(componentDefinitionsSlice.actions.setError(message));
      dispatch(brokerActions.setError(message));
      dispatch(componentDefinitionsSlice.actions.setLoading(false));
      dispatch(brokerActions.setLoading(false));
      return { success: false, error: message };
    }
  };
