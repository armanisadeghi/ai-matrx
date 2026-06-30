// lib/logger/base-logger.ts
import { LogEntry, LogLevel, DetailLevel } from "./types";
import {
  logConfig,
  runtimeState,
  LOG_LEVEL_MAPPING,
  LOG_COLORS,
  RESET_COLOR,
} from "./config";

export abstract class BaseLogger {
  protected static logStorage = new Map<string, LogEntry[]>();
  protected static subscribers = new Map<
    string,
    ((logs: LogEntry[]) => void)[]
  >();
  protected loggerId: string;

  constructor(loggerId: string) {
    this.loggerId = loggerId;
    if (!BaseLogger.logStorage.has(loggerId)) {
      BaseLogger.logStorage.set(loggerId, []);
      BaseLogger.subscribers.set(loggerId, []);

      // Only log on first initialization of any logger
      if (BaseLogger.logStorage.size === 1) {
        const effectiveLevel =
          runtimeState.moduleOverrides.get(loggerId) || logConfig.logLevel;
        console.log(
          `\x1b[36m✅ Logger System Active | Effective Level: ${effectiveLevel} | Console: ${logConfig.consoleLogLevel} | Environment: ${logConfig.environment}\x1b[0m`,
        );
      }
    }
  }

  // Feature filter management
  static setFeatureFilter(features: string[]) {
    runtimeState.featureFilter = new Set(features);
  }

  static addFeatureToFilter(feature: string) {
    runtimeState.featureFilter.add(feature);
  }

  static removeFeatureFromFilter(feature: string) {
    runtimeState.featureFilter.delete(feature);
  }

  // Module override management
  static setModuleLogLevel(module: string, level: LogLevel) {
    runtimeState.moduleOverrides.set(module, level);
  }

  static clearModuleLogLevel(module: string) {
    runtimeState.moduleOverrides.delete(module);
  }

  protected isDuplicateLog(message: string): boolean {
    const now = Date.now();
    if (
      runtimeState.lastLogTime &&
      runtimeState.lastLogMessage === message &&
      now - runtimeState.lastLogTime < logConfig.duplicateSuppressionInterval
    ) {
      return true;
    }
    runtimeState.lastLogTime = now;
    runtimeState.lastLogMessage = message;
    return false;
  }

  protected shouldLog(
    level: LogLevel,
    module?: string,
    feature?: string,
  ): boolean {
    // More verbose wins (higher number in LOG_LEVEL_MAPPING)
    let effectiveLevel = logConfig.logLevel;

    // Check module override
    if (module && runtimeState.moduleOverrides.has(module)) {
      const moduleLevel = runtimeState.moduleOverrides.get(module)!;
      if (LOG_LEVEL_MAPPING[moduleLevel] > LOG_LEVEL_MAPPING[effectiveLevel]) {
        effectiveLevel = moduleLevel;
      }
    }

    // Feature filter always allows logging
    if (feature && runtimeState.featureFilter.has(feature)) {
      return true;
    }

    return LOG_LEVEL_MAPPING[level] <= LOG_LEVEL_MAPPING[effectiveLevel];
  }

  protected consoleOutput(
    log: LogEntry,
    trace?: string,
    entityKey?: string,
  ): void {
    if (!logConfig.console || logConfig.consoleLogLevel === "none") return;
    if (logConfig.environment !== "development") return;

    const color = LOG_COLORS[log.level] || LOG_COLORS.info;

    // Safely handle log.message
    const message =
      typeof log.message === "string"
        ? log.message
        : typeof log.message === "object" && log.message !== null
          ? JSON.stringify(log.message)
          : String(log.message ?? ""); // Fallback for other types like numbers, booleans, etc.

    // Safely handle log.metadata?.details
    const details =
      typeof log.metadata?.details === "string"
        ? log.metadata.details
        : typeof log.metadata?.details === "object" &&
            log.metadata.details !== null
          ? JSON.stringify(log.metadata.details)
          : null;

    const detailsExpanded = details
      ? JSON.stringify(log.metadata?.details, null, 4)
      : "";

    // Construct traceAndContext only if at least one value exists
    const context = log.context?.component || "";
    const traceAndContext =
      trace || context ? `[${[trace, context].filter(Boolean).join(" ")}]` : "";

    // Reusable function for optional logging
    const logDetails = (detail: string) => {
      if (detail) console.log(`${color}${detail}${RESET_COLOR}`);
    };

    switch (logConfig.detailLevel) {
      case "minimal":
        console.log(
          `${traceAndContext}${entityKey ? `: ${entityKey}` : ""} ${color}${message}${RESET_COLOR}`,
        );
        break;
      case "standard":
        console.log(
          `${traceAndContext}${entityKey ? `: ${entityKey}` : ""} ${color}${message}${RESET_COLOR}`,
        );
        if (details) logDetails(details); // Log details only if they exist
        break;
      case "verbose":
        console.log(`${traceAndContext}${entityKey ? `: ${entityKey}` : ""}`);
        console.log(`${color}${message}${RESET_COLOR}`);
        if (detailsExpanded) {
          logDetails(detailsExpanded);
          console.log("---");
        } else {
          if (details) logDetails(details); // Log non-expanded details if expanded is unavailable
        }
        break;
    }
  }

  protected async sendToDatadog(log: LogEntry): Promise<void> {
    if (!logConfig.datadog.enabled || !logConfig.datadog.apiKey) return;

    try {
      await fetch(
        `https://http-intake.logs.${logConfig.datadog.site}/api/v2/logs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "DD-API-KEY": logConfig.datadog.apiKey,
          },
          body: JSON.stringify([
            {
              ...log,
              ddsource: "nodejs",
              service: logConfig.service,
              ddtags: `env:${logConfig.environment}`,
            },
          ]),
        },
      );
    } catch (error) {
      console.error("Failed to send log to Datadog:", error);
    }
  }

  protected addLog(log: LogEntry): void {
    const logs = BaseLogger.logStorage.get(this.loggerId) || [];
    logs.unshift(log);
    if (logs.length > logConfig.maxLogEntries) {
      logs.pop();
    }
    BaseLogger.logStorage.set(this.loggerId, logs);
    this.notifySubscribers();
  }

  protected notifySubscribers(): void {
    const subscribers = BaseLogger.subscribers.get(this.loggerId) || [];
    const logs = BaseLogger.logStorage.get(this.loggerId) || [];
    subscribers.forEach((callback) => callback(logs));
  }

  subscribe(callback: (logs: LogEntry[]) => void): () => void {
    const subscribers = BaseLogger.subscribers.get(this.loggerId) || [];
    subscribers.push(callback);
    BaseLogger.subscribers.set(this.loggerId, subscribers);

    const logs = BaseLogger.logStorage.get(this.loggerId) || [];
    callback(logs);

    return () => {
      const currentSubscribers =
        BaseLogger.subscribers.get(this.loggerId) || [];
      BaseLogger.subscribers.set(
        this.loggerId,
        currentSubscribers.filter((cb) => cb !== callback),
      );
    };
  }

  clear(): void {
    BaseLogger.logStorage.set(this.loggerId, []);
    this.notifySubscribers();
  }

  protected async processLog(log: LogEntry): Promise<void> {
    await this.sendToDatadog(log);
  }
}
