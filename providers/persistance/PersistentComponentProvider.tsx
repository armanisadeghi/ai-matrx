"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";

// Type definitions
type ComponentId = string;
type ComponentRegistry = Record<
  ComponentId,
  {
    Component: React.ComponentType<any>;
    props: any;
    isVisible: boolean;
  }
>;

// Context to manage persistent components
interface PersistentComponentContextType {
  registerComponent: <T>(
    id: ComponentId,
    Component: React.ComponentType<T>,
    props: T,
  ) => void;
  updateComponentProps: <T>(id: ComponentId, props: Partial<T>) => void;
  setComponentVisibility: (id: ComponentId, isVisible: boolean) => void;
}

const PersistentComponentContext =
  createContext<PersistentComponentContextType>({
    registerComponent: () => {},
    updateComponentProps: () => {},
    setComponentVisibility: () => {},
  });

// Removal Candidate - No references
/**
 * Provider component that maintains persistent component instances
 */
export const PersistentComponentProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [components, setComponents] = useState<ComponentRegistry>({});
  const componentsRef = useRef<ComponentRegistry>({});
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Batch updates to prevent excessive re-renders
  const batchUpdates = useCallback(() => {
    setComponents({ ...componentsRef.current });
    updateTimeoutRef.current = null;
  }, []);

  // Schedule a batched update
  const scheduleUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(batchUpdates, 30);
  }, [batchUpdates]);

  // Register a component
  const registerComponent = useCallback(
    <T,>(id: ComponentId, Component: React.ComponentType<T>, props: T) => {
      componentsRef.current[id] = {
        Component,
        props,
        isVisible: false,
      };
      scheduleUpdate();
      console.log(`Registered component: ${id}`);
    },
    [scheduleUpdate],
  );

  // Update component props
  const updateComponentProps = useCallback(
    <T,>(id: ComponentId, props: Partial<T>) => {
      if (componentsRef.current[id]) {
        componentsRef.current[id].props = {
          ...componentsRef.current[id].props,
          ...props,
        };
        scheduleUpdate();
      }
    },
    [scheduleUpdate],
  );

  // Set component visibility
  const setComponentVisibility = useCallback(
    (id: ComponentId, isVisible: boolean) => {
      if (
        componentsRef.current[id] &&
        componentsRef.current[id].isVisible !== isVisible
      ) {
        componentsRef.current[id].isVisible = isVisible;
        scheduleUpdate();
        console.log(`Set visibility for ${id}: ${isVisible}`);
      }
    },
    [scheduleUpdate],
  );

  // Keep state in sync with ref
  useEffect(() => {
    componentsRef.current = components;
  }, [components]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Create stable context value
  const contextValue = React.useMemo(
    () => ({
      registerComponent,
      updateComponentProps,
      setComponentVisibility,
    }),
    [registerComponent, updateComponentProps, setComponentVisibility],
  );

  return (
    <PersistentComponentContext.Provider value={contextValue}>
      <div className="persistent-components-container">
        {Object.entries(components).map(
          ([id, { Component, props, isVisible }]) => (
            <div
              key={id}
              data-component-id={id}
              style={{
                display: isVisible ? "block" : "none",
                width: "100%",
                height: "100%",
              }}
            >
              <Component {...props} />
            </div>
          ),
        )}
      </div>

      {children}
    </PersistentComponentContext.Provider>
  );
};

// Hook to use the persistent component context
export const usePersistentComponents = () =>
  useContext(PersistentComponentContext);

/**
 * Component placeholder that provides a target location for persistent components
 */
export const PersistentComponentPlaceholder: React.FC<{
  id: string;
  className?: string;
}> = ({ id, className = "" }) => {
  const { setComponentVisibility } = usePersistentComponents();
  console.log(
    "======================== [PersistentComponentPlaceholder] ================================",
  );

  // Make component visible when this placeholder is mounted
  useEffect(() => {
    setComponentVisibility(id, true);
    console.log(`Set visibility for ${id}: true`);

    return () => {
      setComponentVisibility(id, false);
      console.log(`Set visibility for ${id}: false`);
    };
  }, [id, setComponentVisibility]);

  return (
    <div
      data-placeholder-for={id}
      className={`persistent-component-placeholder ${className}`}
      style={{ height: "100%", width: "100%" }}
    />
  );
};
