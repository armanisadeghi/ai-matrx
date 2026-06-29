// lib/logger/schema-logger.ts
import { v4 as uuidv4 } from 'uuid';
import { SchemaResolutionLog, LogLevel } from './types';
import { BaseLogger } from './base-logger';
import { LogStorage } from './storage';
import { logConfig } from './config';

export class SchemaLogger extends BaseLogger {
    private static instance: SchemaLogger;

    private constructor() {
        super('schema-logger');
    }

    static getInstance(): SchemaLogger {
        if (!SchemaLogger.instance) {
            SchemaLogger.instance = new SchemaLogger();
        }
        return SchemaLogger.instance;
    }

    static setLogLevel(level: LogLevel) {
        BaseLogger.setModuleLogLevel('schema', level);
        console.log(`\x1b[36m✅ Schema Logger Level Set: ${level}\x1b[0m`);
    }

    static disableLogging() {
        this.setLogLevel('none');
    }

    static enableLogging(level: LogLevel = 'info') {
        this.setLogLevel(level);
    }

    logResolution(
        {
            resolutionType,
            original,
            resolved,
            message,
            level = 'debug',  // Default to most verbose
            trace,
            tableMetrics = undefined,
        }: {
            resolutionType: 'table' | 'field' | 'cache' | 'database' | 'entity';
            original: string;
            resolved: string;
            message: string;
            level?: LogLevel;
            trace: string[];
            tableMetrics?: {
                fieldCount?: number;
                variantCount?: number;
                size?: number;
            };
        }): void {
        // Check if we should log at this level for schema operations
        if (!this.shouldLog(level, 'schema', resolutionType)) {
            return;
        }

        const log: SchemaResolutionLog = {
            id: uuidv4(),
            category: 'schema_resolution',
            level,
            resolutionType,
            original,
            resolved,
            message,
            trace,
            context: {
                timestamp: new Date().toISOString(),
                environment: logConfig.environment,
                component: 'SchemaLogger',
                action: 'Resolution',
                feature: resolutionType  // Use resolutionType as feature for filtering
            },
            ...(tableMetrics && { tableMetrics })
        };

        this.addLog(log);
        LogStorage.saveSchemaLogs([log]);
        this.consoleOutput(log, 'SchemaLogger');
        
        this.processLog(log).catch(error => {
            console.error('Failed to process schema log:', error);
        });
    }

    protected override async processLog(log: SchemaResolutionLog): Promise<void> {
        await super.processLog(log);
    }
}

// Add window controls for console debugging
declare global {
    interface Window {
        schemaLogger: {
            setLogLevel: (level: LogLevel) => void;
            disableLogging: () => void;
            enableLogging: (level?: LogLevel) => void;
        };
    }
}

if (typeof window !== 'undefined') {
    window.schemaLogger = {
        setLogLevel: SchemaLogger.setLogLevel,
        disableLogging: SchemaLogger.disableLogging,
        enableLogging: SchemaLogger.enableLogging
    };
}

export const schemaLogger = SchemaLogger.getInstance();