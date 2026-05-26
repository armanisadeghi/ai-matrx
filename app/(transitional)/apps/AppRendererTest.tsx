"use client";

import { loadApp } from "@/lib/redux/app-runner/thunks/loadApp";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { useEffect, useState, useMemo } from "react";
import * as appletSelectors from "@/lib/redux/app-runner/selectors/appletRuntimeSelectors";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export default function AppRendererTest({ slug }: { slug: string }) {
  const dispatch = useAppDispatch();

  // Navigation state
  const [selectedSelector, setSelectedSelector] =
    useState<string>("selectAppConfigs");
  const [selectorOutput, setSelectorOutput] = useState<string>("");
  const [additionalId, setAdditionalId] = useState<string>("");

  // Permanent selection state
  const [selectedAppId, setSelectedAppId] = useState<string>(slug);
  const [selectedAppletId, setSelectedAppletId] = useState<string>("");
  const [selectedContainerId, setSelectedContainerId] = useState<string>("");
  const [selectedComponentId, setSelectedComponentId] = useState<string>("");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>("");

  // Call all selectors unconditionally at the top level
  // Base selectors
  const appConfigs = useAppSelector(appletSelectors.selectAppConfigs);
  const containers = useAppSelector(appletSelectors.selectContainers);
  const applets = useAppSelector(appletSelectors.selectApplets);
  const componentToBrokerMap = useAppSelector(
    appletSelectors.selectComponentToBrokerMap,
  );
  const neededBrokers = useAppSelector(appletSelectors.selectNeededBrokers);
  const componentInstances = useAppSelector(
    appletSelectors.selectComponentInstances,
  );
  const componentDefinitions = useAppSelector(
    appletSelectors.selectComponentDefinitions,
  );
  const brokerValues = useAppSelector(appletSelectors.selectBrokerValues);
  const brokerHistoryMap = useAppSelector(
    appletSelectors.selectBrokerHistoryMap,
  );
  const brokerDefinitions = useAppSelector(
    appletSelectors.selectBrokerDefinitions,
  );

  // App specific
  const appConfig = useAppSelector((state) =>
    appletSelectors.selectAppConfig(state, selectedAppId),
  );
  const appAppletList = useAppSelector((state) =>
    appletSelectors.selectAppAppletList(state, selectedAppId),
  );
  const allBrokerValues = useAppSelector(appletSelectors.selectAllBrokerValues);
  const missingNeededBrokers = useAppSelector((state) =>
    appletSelectors.selectMissingNeededBrokers(state, selectedAppId),
  );
  const allApplets = useAppSelector((state) =>
    appletSelectors.selectAllApplets(state, selectedAppId),
  );
  const allContainers = useAppSelector((state) =>
    appletSelectors.selectAllContainers(state, selectedAppId),
  );
  const allBrokerMappings = useAppSelector((state) =>
    appletSelectors.selectAllBrokerMappings(state, selectedAppId),
  );
  const allBrokerDefinitions = useAppSelector((state) =>
    appletSelectors.selectAllBrokerDefinitions(state, selectedAppId),
  );
  const brokerValueStatus = useAppSelector((state) =>
    appletSelectors.selectBrokerValueStatus(state, selectedAppId),
  );

  // Entity specific - always called, even if IDs are empty
  const componentDefinition = useAppSelector((state) =>
    selectedComponentId
      ? appletSelectors.selectComponentDefinition(
          state,
          selectedAppId,
          selectedComponentId,
        )
      : null,
  );
  const componentInstance = useAppSelector((state) =>
    selectedInstanceId
      ? appletSelectors.selectComponentInstance(
          state,
          selectedAppId,
          selectedInstanceId,
        )
      : null,
  );
  const container = useAppSelector((state) =>
    selectedContainerId
      ? appletSelectors.selectContainer(
          state,
          selectedAppId,
          selectedContainerId,
        )
      : null,
  );
  const applet = useAppSelector((state) =>
    selectedAppletId
      ? appletSelectors.selectApplet(state, selectedAppId, selectedAppletId)
      : null,
  );
  const brokerValue = useAppSelector((state) =>
    selectedBrokerId
      ? appletSelectors.selectBrokerValue(state, selectedBrokerId)
      : null,
  );
  const brokerHistory = useAppSelector((state) =>
    selectedBrokerId
      ? appletSelectors.selectBrokerHistory(state, selectedBrokerId)
      : null,
  );
  const brokerForComponentInstance = useAppSelector((state) =>
    selectedInstanceId
      ? appletSelectors.selectBrokerForComponentInstance(
          state,
          selectedAppId,
          selectedInstanceId,
        )
      : null,
  );
  const componentInstancesForContainer = useAppSelector((state) =>
    selectedContainerId
      ? appletSelectors.selectComponentInstancesForContainer(
          state,
          selectedAppId,
          selectedContainerId,
        )
      : null,
  );
  const brokerDefinition = useAppSelector((state) =>
    selectedBrokerId
      ? appletSelectors.selectBrokerDefinition(
          state,
          selectedAppId,
          selectedBrokerId,
        )
      : null,
  );

  // Derived data for navigation
  const currentAppConfig = useMemo(() => {
    return appConfigs[selectedAppId] || null;
  }, [appConfigs, selectedAppId]);

  const availableApplets = useMemo(() => {
    if (!currentAppConfig || !applets[selectedAppId]) return [];

    return currentAppConfig.appletList
      .map((appletRef) => {
        const appletData = applets[selectedAppId]?.[appletRef.appletId];
        return {
          id: appletRef.appletId,
          label: appletRef.label,
          data: appletData,
        };
      })
      .filter((a) => a.data);
  }, [currentAppConfig, applets, selectedAppId]);

  const availableContainers = useMemo(() => {
    if (!selectedAppletId || !applets[selectedAppId]?.[selectedAppletId])
      return [];

    const applet = applets[selectedAppId][selectedAppletId];
    return (applet.containers || []).map((container) => ({
      id: container.id,
      label: container.label,
      shortLabel: container.shortLabel,
      fields: container.fields || [],
    }));
  }, [applets, selectedAppId, selectedAppletId]);

  const availableComponents = useMemo(() => {
    if (!selectedContainerId || !availableContainers.length) return [];

    const container = availableContainers.find(
      (c) => c.id === selectedContainerId,
    );
    if (!container) return [];

    return container.fields.map((field) => ({
      id: field.id,
      label: field.label,
      component: field.component,
    }));
  }, [availableContainers, selectedContainerId]);

  const availableInstances = useMemo(() => {
    if (!componentToBrokerMap || !componentToBrokerMap[selectedAppId])
      return [];

    return ((componentToBrokerMap[selectedAppId] as any[]) || [])
      .filter((mapping) => {
        // If component is selected, filter by it; otherwise show all
        return (
          !selectedComponentId || mapping.componentId === selectedComponentId
        );
      })
      .map((mapping) => ({
        componentId: mapping.componentId,
        instanceId: mapping.instanceId,
        brokerId: mapping.brokerId,
      }));
  }, [componentToBrokerMap, selectedAppId, selectedComponentId]);

  // Auto-select the first item in each list when parent selection changes
  useEffect(() => {
    if (
      availableApplets.length &&
      !availableApplets.find((a) => a.id === selectedAppletId)
    ) {
      setSelectedAppletId(availableApplets[0].id);
    }
  }, [availableApplets, selectedAppletId]);

  useEffect(() => {
    if (
      availableContainers.length &&
      !availableContainers.find((c) => c.id === selectedContainerId)
    ) {
      setSelectedContainerId(availableContainers[0].id);
    }
  }, [availableContainers, selectedContainerId]);

  useEffect(() => {
    if (
      availableComponents.length &&
      !availableComponents.find((c) => c.id === selectedComponentId)
    ) {
      setSelectedComponentId(availableComponents[0].id);
    }
  }, [availableComponents, selectedComponentId]);

  useEffect(() => {
    if (availableInstances.length) {
      // Find an instance that matches our selected component
      const matchingInstance = availableInstances.find(
        (i) => i.componentId === selectedComponentId,
      );
      if (
        matchingInstance &&
        matchingInstance.instanceId !== selectedInstanceId
      ) {
        setSelectedInstanceId(matchingInstance.instanceId);
        setSelectedBrokerId(matchingInstance.brokerId);
      }
    }
  }, [availableInstances, selectedComponentId, selectedInstanceId]);

  // All available selectors - no hooks called here, just referencing results from above
  const selectors = {
    // Base selectors
    selectAppConfigs: appConfigs,
    selectComponentDefinitions: componentDefinitions,
    selectComponentInstances: componentInstances,
    selectContainers: containers,
    selectApplets: applets,
    selectComponentToBrokerMap: componentToBrokerMap,
    selectBrokerValues: brokerValues,
    selectBrokerHistoryMap: brokerHistoryMap,
    selectNeededBrokers: neededBrokers,
    selectBrokerDefinitions: brokerDefinitions,

    // Slug-specific selectors
    selectAppConfig: appConfig,
    selectAppAppletList: appAppletList,
    selectAllBrokerValues: allBrokerValues,
    selectMissingNeededBrokers: missingNeededBrokers,
    selectAllApplets: allApplets,
    selectAllContainers: allContainers,
    selectAllBrokerMappings: allBrokerMappings,
    selectAllBrokerDefinitions: allBrokerDefinitions,
    selectBrokerValueStatus: brokerValueStatus,

    // Specific entity selectors
    selectComponentDefinition: componentDefinition || "Select a Component ID",
    selectComponentInstance: componentInstance || "Select an Instance ID",
    selectContainer: container || "Select a Container ID",
    selectApplet: applet || "Select an Applet ID",
    selectBrokerValue: brokerValue || "Select a Broker ID",
    selectBrokerHistory: brokerHistory || "Select a Broker ID",
    selectBrokerForComponentInstance:
      brokerForComponentInstance || "Select an Instance ID",
    selectComponentInstancesForContainer:
      componentInstancesForContainer || "Select a Container ID",
    selectBrokerDefinition: brokerDefinition || "Select a Broker ID",
  };

  useEffect(() => {
    dispatch(loadApp({ slug: slug })).then((result) => {
      if (result.success) {
        console.log("App loaded:", result.appConfig);
        console.log("Applets loaded:", result.appletResults);
      } else {
        console.error("Failed to load app:", result.error);
      }
    });
  }, [dispatch, slug]);

  useEffect(() => {
    if (selectedSelector) {
      setSelectorOutput(JSON.stringify(selectors[selectedSelector], null, 2));
    }
  }, [selectedSelector, selectors]);

  // Format JSON for display
  const formatJson = (data) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return "Error formatting JSON";
    }
  };

  // Helper to truncate long IDs for display
  const truncateId = (id: string, length: number = 12) => {
    if (!id) return "";
    return id.length > length ? `${id.substring(0, length)}...` : id;
  };

  return (
    <div className="w-full p-8 mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">
        Testing UI for App:{" "}
        <span className="text-blue-600 dark:text-blue-400">{slug}</span>
      </h1>

      {/* Entity navigation panel */}
      <div className="bg-textured rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">
          Entity Navigation
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* App Selector */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border-border">
            <h3 className="font-medium mb-2 text-gray-700 dark:text-gray-300">
              Select App
            </h3>
            <RadioGroup
              value={selectedAppId}
              onValueChange={setSelectedAppId}
              className="space-y-2"
            >
              {Object.values(appConfigs).map((app) => (
                <div key={app.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={app.id} id={`app-${app.id}`} />
                  <Label
                    htmlFor={`app-${app.id}`}
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    {app.name} ({app.slug})
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Selected: {currentAppConfig?.name || selectedAppId}
            </div>
          </div>

          {/* Applet Selector */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border-border">
            <h3 className="font-medium mb-2 text-gray-700 dark:text-gray-300">
              Select Applet
            </h3>
            <div className="max-h-40 overflow-y-auto">
              <RadioGroup
                value={selectedAppletId}
                onValueChange={setSelectedAppletId}
                className="space-y-2"
              >
                {availableApplets.map((applet) => (
                  <div key={applet.id} className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={applet.id}
                      id={`applet-${applet.id}`}
                    />
                    <Label
                      htmlFor={`applet-${applet.id}`}
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      {applet.label || applet.data?.name}
                    </Label>
                  </div>
                ))}
                {availableApplets.length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No applets available
                  </div>
                )}
              </RadioGroup>
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Selected:{" "}
              {availableApplets.find((a) => a.id === selectedAppletId)?.label ||
                selectedAppletId}
            </div>
          </div>

          {/* Container Selector */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border-border">
            <h3 className="font-medium mb-2 text-gray-700 dark:text-gray-300">
              Select Container
            </h3>
            <div className="max-h-40 overflow-y-auto">
              <RadioGroup
                value={selectedContainerId}
                onValueChange={setSelectedContainerId}
                className="space-y-2"
              >
                {availableContainers.map((container) => (
                  <div
                    key={container.id}
                    className="flex items-center space-x-2"
                  >
                    <RadioGroupItem
                      value={container.id}
                      id={`container-${container.id}`}
                    />
                    <Label
                      htmlFor={`container-${container.id}`}
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      {container.label || container.shortLabel}
                    </Label>
                  </div>
                ))}
                {availableContainers.length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No containers available
                  </div>
                )}
              </RadioGroup>
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Selected:{" "}
              {availableContainers.find((c) => c.id === selectedContainerId)
                ?.label || selectedContainerId}
            </div>
          </div>

          {/* Component Selector */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border-border">
            <h3 className="font-medium mb-2 text-gray-700 dark:text-gray-300">
              Select Component
            </h3>
            <div className="max-h-40 overflow-y-auto">
              <RadioGroup
                value={selectedComponentId}
                onValueChange={setSelectedComponentId}
                className="space-y-2"
              >
                {availableComponents.map((component) => (
                  <div
                    key={component.id}
                    className="flex items-center space-x-2"
                  >
                    <RadioGroupItem
                      value={component.id}
                      id={`component-${component.id}`}
                    />
                    <Label
                      htmlFor={`component-${component.id}`}
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      {component.label} ({component.component})
                    </Label>
                  </div>
                ))}
                {availableComponents.length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No components available
                  </div>
                )}
              </RadioGroup>
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Selected:{" "}
              {availableComponents.find((c) => c.id === selectedComponentId)
                ?.label || selectedComponentId}
            </div>
          </div>

          {/* Instance Selector */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border-border">
            <h3 className="font-medium mb-2 text-gray-700 dark:text-gray-300">
              Select Instance
            </h3>
            <div className="max-h-40 overflow-y-auto">
              <RadioGroup
                value={selectedInstanceId}
                onValueChange={(value) => {
                  setSelectedInstanceId(value);
                  const instance = availableInstances.find(
                    (i) => i.instanceId === value,
                  );
                  if (instance) {
                    setSelectedBrokerId(instance.brokerId);
                  }
                }}
                className="space-y-2"
              >
                {availableInstances.map((instance) => (
                  <div
                    key={instance.instanceId}
                    className="flex items-center space-x-2"
                  >
                    <RadioGroupItem
                      value={instance.instanceId}
                      id={`instance-${instance.instanceId}`}
                    />
                    <Label
                      htmlFor={`instance-${instance.instanceId}`}
                      className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate cursor-pointer"
                    >
                      {truncateId(instance.instanceId, 24)}
                    </Label>
                  </div>
                ))}
                {availableInstances.length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No instances available
                  </div>
                )}
              </RadioGroup>
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Selected: {truncateId(selectedInstanceId, 15)}
            </div>
          </div>

          {/* Broker ID Display */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border-border">
            <h3 className="font-medium mb-2 text-gray-700 dark:text-gray-300">
              Associated Broker
            </h3>
            <div className="space-y-2">
              {selectedBrokerId ? (
                <div className="text-xs font-mono break-all text-gray-700 dark:text-gray-300">
                  {selectedBrokerId}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  No broker selected
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Broker values control data flow between components
            </div>
          </div>
        </div>

        {/* Selection Summary */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md border border-blue-200 dark:border-blue-800">
          <h3 className="font-medium mb-2 text-blue-700 dark:text-blue-300">
            Current Selection Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs font-mono">
            <div>
              <span className="text-gray-500 dark:text-gray-400">App ID:</span>{" "}
              {selectedAppId}
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Applet ID:
              </span>{" "}
              {selectedAppletId}
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Container ID:
              </span>{" "}
              {selectedContainerId}
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Component ID:
              </span>{" "}
              {selectedComponentId}
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Instance ID:
              </span>{" "}
              {selectedInstanceId}
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Broker ID:
              </span>{" "}
              {selectedBrokerId}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - Selector browser */}
        <div className="space-y-6">
          <div className="bg-textured rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">
              Selector Browser
            </h2>

            {/* Selector dropdown */}
            <div className="mb-4">
              <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
                Select Applet Selector:
              </label>
              <select
                value={selectedSelector}
                onChange={(e) => setSelectedSelector(e.target.value)}
                className="w-full p-3 border rounded-md bg-textured text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
              >
                {Object.keys(selectors).map((selector) => (
                  <option key={selector} value={selector}>
                    {selector}
                  </option>
                ))}
              </select>
            </div>

            {/* Output textarea */}
            <div>
              <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
                Selector Output:
              </label>
              <textarea
                value={selectorOutput}
                readOnly
                className="w-full h-[calc(100vh-750px)] p-3 font-mono text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700"
              />
            </div>
          </div>
        </div>

        {/* Right column - Key state panels */}
        <div className="space-y-6">
          <div className="bg-textured rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">
              Key State - Always Visible
            </h2>

            <div className="space-y-6">
              {/* appConfigs */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">
                  selectAppConfigs
                </h3>
                <textarea
                  value={formatJson(appConfigs)}
                  readOnly
                  className="w-full h-64 p-3 font-mono text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                />
              </div>

              {/* containers */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">
                  selectContainers
                </h3>
                <textarea
                  value={formatJson(containers)}
                  readOnly
                  className="w-full h-64 p-3 font-mono text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                />
              </div>

              {/* applets */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">
                  selectApplets
                </h3>
                <textarea
                  value={formatJson(applets)}
                  readOnly
                  className="w-full h-64 p-3 font-mono text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                />
              </div>

              {/* componentToBrokerMap */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">
                  selectComponentToBrokerMap
                </h3>
                <textarea
                  value={formatJson(componentToBrokerMap)}
                  readOnly
                  className="w-full h-64 p-3 font-mono text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                />
              </div>

              {/* neededBrokers */}
              <div>
                <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">
                  selectNeededBrokers
                </h3>
                <textarea
                  value={formatJson(neededBrokers)}
                  readOnly
                  className="w-full h-64 p-3 font-mono text-sm border rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 my-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
        <p className="text-yellow-800 dark:text-yellow-200">
          This testing UI allows you to explore app structure and data. Use the
          Entity Navigation panel to select specific app elements, then use the
          Selector Browser to view data for different selectors.
        </p>
      </div>
    </div>
  );
}
