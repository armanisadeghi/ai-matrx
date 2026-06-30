// lib/logger/redux-middleware.ts
import { Middleware } from "redux";
import { BaseLogger } from "./base-logger";
import { ReduxLog, LogLevel, LogContext } from "./types";
import { logConfig } from "./config";
import { v4 as uuidv4 } from "uuid";
import { emitLog } from "./components/ReduxLogger";

// https://claude.ai/chat/167f48a5-e715-49c6-98ab-3923ef65e134

interface ReduxAction {
  type: string;
  payload?: unknown;
  result?: unknown;
  error?: unknown;
}

class ReduxLogger extends BaseLogger {
  private static instance: ReduxLogger;

  private constructor() {
    super("redux-logger");
  }

  static getInstance(): ReduxLogger {
    if (!ReduxLogger.instance) {
      ReduxLogger.instance = new ReduxLogger();
    }
    return ReduxLogger.instance;
  }

  logAction(action: ReduxAction, prevState: unknown, nextState: unknown): void {
    // Only log if console logging is enabled and we're in development
    if (!logConfig.console || logConfig.environment !== "development") {
      return;
    }

    // Determine appropriate log level based on action state
    let level: LogLevel = "debug"; // Changed from 'info' to be most verbose by default
    if (action.error) {
      level = "error";
    } else if (action.type.toLowerCase().includes("warning")) {
      level = "warn";
    } else if (action.type.toLowerCase().includes("info")) {
      // Changed condition
      level = "info";
    }

    // Check if we should log based on console log level
    if (!this.shouldLog(level, "redux")) {
      return;
    }

    // Avoid duplicate logs within the suppression interval
    if (this.isDuplicateLog(action.type)) {
      return;
    }

    const context: LogContext = {
      timestamp: new Date().toISOString(),
      environment: logConfig.environment,
      action: action.type,
    };

    const log: ReduxLog = {
      id: uuidv4(),
      category: "redux",
      level,
      message: `Redux Action: ${action.type}`,
      action: {
        type: action.type,
        payload: action.payload,
      },
      prevState,
      nextState,
      context,
    };

    // Only emit and process logs that meet our logging criteria
    emitLog(log);
    this.addLog(log);
    this.consoleOutput(log);
    this.processLog(log);
  }

  logInline(
    message: string,
    contextData: Partial<LogContext> = {},
    level: LogLevel = "info",
  ): void {
    // Only log if console logging is enabled and we're in development
    if (!logConfig.console || logConfig.environment !== "development") {
      return;
    }

    // Check if we should log based on console log level
    if (!this.shouldLog(level, "redux")) {
      return;
    }

    const context: LogContext = {
      timestamp: new Date().toISOString(),
      environment: logConfig.environment,
      ...contextData,
    };

    const log: ReduxLog = {
      id: uuidv4(),
      category: "redux",
      level,
      message,
      action: {
        type: contextData.action || "INLINE_LOG",
        payload: undefined,
      },
      prevState: null,
      nextState: null,
      context,
    };

    emitLog(log);
    this.addLog(log);
    this.consoleOutput(log);
    this.processLog(log);
  }
}

const reduxLogger = ReduxLogger.getInstance();

declare global {
  interface Window {
    reduxLogger: {
      setLogLevel: (level: LogLevel) => void;
      disableLogging: () => void;
      enableLogging: () => void;
    };
  }
}

// Add these control methods
if (typeof window !== "undefined") {
  window.reduxLogger = {
    setLogLevel: (level: LogLevel) => {
      BaseLogger.setModuleLogLevel("redux", level);
      console.log(`Redux log level set to: ${level}`);
    },
    disableLogging: () => {
      BaseLogger.setModuleLogLevel("redux", "none");
      console.log("Redux logging disabled");
    },
    enableLogging: () => {
      BaseLogger.setModuleLogLevel("redux", "info");
      console.log("Redux logging enabled (info level)");
    },
  };
}

// List of prefixes to exclude (case-insensitive)
const excludedPrefixes = [
  "socket",
  "theme",
  "entity",
  "userPreferences",
  "socketResponse",
  "activeRequests",
];

export const loggerMiddleware: Middleware =
  (store) => (next) => async (incomingAction: unknown) => {
    const action = incomingAction as ReduxAction;
    // PERFORMANCE: Early exit for socketResponse actions to avoid middleware overhead
    if (action.type.startsWith("socketResponse/")) {
      return next(action);
    }

    const prevState = store.getState();
    let result;
    let error = null;

    // Check if the action type starts with any excluded prefix (case-insensitive)
    const shouldExclude = excludedPrefixes.some((prefix) =>
      action.type.toLowerCase().startsWith(prefix.toLowerCase()),
    );

    if (shouldExclude) {
      return next(action); // Skip logging and proceed with the action
    }

    try {
      // Process the action and capture its result
      result = await next(action);
    } catch (err) {
      error = err;
      // Log the error with full context
      reduxLogger.logInline(
        `Error processing action ${action.type}`,
        {
          action: action.type,
          trace: err instanceof Error ? [err.stack || err.message] : undefined,
        },
        "error",
      );
    }

    const nextState = store.getState();

    // Extract the slice name (assuming action.type is in the format 'sliceName/actionName')
    const sliceName = action.type.split("/")[0];

    // Extract only the affected slice's state
    const prevSliceState = prevState[sliceName];
    const nextSliceState = nextState[sliceName];

    reduxLogger.logAction(
      {
        type: action.type,
        payload: action.payload,
        result,
        error,
      },
      prevSliceState,
      nextSliceState,
    );

    if (error) {
      throw error; // Rethrow the error for Redux to handle
    }

    return result;
  };

// Export the inline action logger with the updated implementation
export const logInlineAction = (
  message: string,
  contextData: Partial<LogContext> = {},
  level: LogLevel = "info",
) => {
  reduxLogger.logInline(message, contextData, level);
};
