import { EventEmitter } from "events";
import _ from 'lodash';
import type { LogEntry } from "../types";

// Types
type StateWatcherConfig = {
  label: string;
  previousValue: unknown;
};

type PathConfig = {
  [key: string]: string;
};

/** Minimal Redux-store-shaped dependency — this logger works against any store, not a specific slice tree. */
interface WatchableStore {
  getState: () => unknown;
  subscribe: (listener: () => void) => void;
}

// Create a singleton instance of EventEmitter
class LoggerEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

// Singleton instances
const logEmitter = new LoggerEventEmitter();
let storeInstance: WatchableStore | null = null;
const stateWatchers = new Map<string, StateWatcherConfig>();

// Initialize with store reference
export const initializeLogger = (store: WatchableStore) => {
  if (storeInstance) {
    return;
  }
  
  storeInstance = store;
  const initialState = store.getState();
  
  // Emit initial state
  const initialUpdates: Record<string, unknown> = {};
  stateWatchers.forEach((config, path) => {
    const value = _.get(initialState, path as _.PropertyPath);
    initialUpdates[config.label] = value;
  });
  
  if (Object.keys(initialUpdates).length > 0) {
    emitState(initialUpdates);
  }

  // Set up store subscription
  store.subscribe(() => {
    const currentState = store.getState();
    const updates: Record<string, unknown> = {};
    
    stateWatchers.forEach((config, path) => {
      const currentValue = _.get(currentState, path as _.PropertyPath);
      const previousValue = config.previousValue;
      
      if (!_.isEqual(currentValue, previousValue)) {
        updates[config.label || path] = currentValue;
        config.previousValue = _.cloneDeep(currentValue);
      }
    });
    
    if (Object.keys(updates).length > 0) {
      emitState(updates);
    }
  });
};

// Watch specific paths in the Redux state
export const watchState = (paths: string[] | PathConfig) => {
  const state = storeInstance?.getState();
  if (!state) return;

  const updates: Record<string, unknown> = {};
  
  if (Array.isArray(paths)) {
    paths.forEach((path: string) => {
      try {
        const value = _.get(state, path as _.PropertyPath);
        if (!stateWatchers.has(path)) {
          stateWatchers.set(path, {
            label: path,
            previousValue: _.cloneDeep(value)
          });
          updates[path] = value;
        }
      } catch (error) {
        console.warn(`Failed to get state for path: ${path}`, error);
      }
    });
  } else {
    Object.entries(paths).forEach(([label, path]) => {
      try {
        const value = _.get(state, path as _.PropertyPath);
        stateWatchers.set(path, {
          label,
          previousValue: _.cloneDeep(value)
        });
        updates[label] = value;
      } catch (error) {
        console.warn(`Failed to get state for path: ${path}`, error);
      }
    });
  }

  if (Object.keys(updates).length > 0) {
    emitState(updates);
  }
};

export const clearStateWatchers = () => {
  stateWatchers.clear();
};

export const emitLog = (log: LogEntry) => {
  logEmitter.emit("newLog", log);
};

export const emitConfig = (configs: unknown) => {
  logEmitter.emit("updateConfigs", configs);
};

export const emitState = (state: Record<string, unknown>) => {
  logEmitter.emit("updateState", state);
};

export const debugLog = (message: string, data: unknown = {}) => {
  const timestamp = new Date().toISOString();
  const uniqueId = `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  logEmitter.emit("debugLog", {
    id: uniqueId,
    message,
    data,
    timestamp,
    type: 'debug'
  });
};

export { logEmitter };