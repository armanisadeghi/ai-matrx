// lib/logger/server-logger.ts
import { BaseLogger } from './base-logger';
import { LogEntry, ApplicationLog, LogLevel } from './types';
import { v4 as uuidv4 } from 'uuid';
import { logConfig } from './config';

class ServerLogger extends BaseLogger {
    private static instance: ServerLogger;

    private constructor() {
        super('server-logger');
    }

    static getInstance(): ServerLogger {
        if (!ServerLogger.instance) {
            ServerLogger.instance = new ServerLogger();
            console.log(`\x1b[36m✅ Server Logger Active | Level: ${logConfig.logLevel}\x1b[0m`);
        }
        return ServerLogger.instance;
    }

    static setLogLevel(level: LogLevel) {
        BaseLogger.setModuleLogLevel('server', level);
        console.log(`\x1b[36m✅ Server Logger Level Set: ${level}\x1b[0m`);
    }

    static disableLogging() {
        this.setLogLevel('none');
    }

    static enableLogging(level: LogLevel = 'info') {
        this.setLogLevel(level);
    }

    log(entry: Omit<ApplicationLog, 'id' | 'context' | 'category'>): void {
        // Check if we should log at this level
        if (!this.shouldLog(entry.level, 'server')) {
            return;
        }

        const enhancedEntry: ApplicationLog = {
            ...entry,
            id: uuidv4(),
            context: {
                timestamp: new Date().toISOString(),
                environment: logConfig.environment,
                component: 'Server'
            },
            category: 'application'
        };

        this.addLog(enhancedEntry);
        this.consoleOutput(enhancedEntry);
        this.processLog(enhancedEntry);
    }

    error(error: Error, metadata?: Record<string, unknown>): void {
        // Errors always log unless explicitly disabled
        if (!this.shouldLog('error', 'server')) {
            return;
        }

        const errorLog: LogEntry = {
            id: uuidv4(),
            category: 'error',
            level: 'error',
            message: error.message,
            context: {
                timestamp: new Date().toISOString(),
                environment: logConfig.environment,
                component: 'Server'
            },
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            metadata
        };

        this.addLog(errorLog);
        this.consoleOutput(errorLog);
        this.processLog(errorLog);
    }
}

// Add global controls for Node environment
declare global {
    namespace NodeJS {
        interface Global {
            serverLogger: {
                setLogLevel: (level: LogLevel) => void;
                disableLogging: () => void;
                enableLogging: (level?: LogLevel) => void;
            };
        }
    }
}

if (typeof global !== 'undefined') {
    (global as typeof globalThis & NodeJS.Global).serverLogger = {
        setLogLevel: ServerLogger.setLogLevel,
        disableLogging: ServerLogger.disableLogging,
        enableLogging: ServerLogger.enableLogging
    };
}

export const serverLogger = ServerLogger.getInstance();