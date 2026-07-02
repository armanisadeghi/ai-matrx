'use client';

import { BaseLogger } from './base-logger';
import { v4 as uuidv4 } from 'uuid';
import { ApplicationLog, ErrorLog, LogEntry, LogLevel } from './types';
import { logConfig } from './config';

interface NextJsLogEvent {
    type: 'build' | 'runtime' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: number;
    stack?: string;
}

class NextJsLogger extends BaseLogger {
    private static instance: NextJsLogger;
    private originalConsole: typeof console;

    private constructor() {
        super('nextjs-logger');
        this.originalConsole = { ...console };
        
        // Only intercept logs if we're in development and logging is enabled
        if (logConfig.environment === 'development' && logConfig.console) {
            this.interceptConsoleLogs();
            this.interceptNextJsLogs();
            console.log(`\x1b[36m✅ NextJS Logger Active | Level: ${logConfig.consoleLogLevel}\x1b[0m`);
        }
    }

    static getInstance(): NextJsLogger {
        if (!NextJsLogger.instance) {
            NextJsLogger.instance = new NextJsLogger();
        }
        return NextJsLogger.instance;
    }

    static setLogLevel(level: LogLevel) {
        BaseLogger.setModuleLogLevel('nextjs', level);
        console.log(`\x1b[36m✅ NextJS Logger Level Set: ${level}\x1b[0m`);
    }

    static disableLogging() {
        this.setLogLevel('none');
    }

    static enableLogging(level: LogLevel = 'info') {
        this.setLogLevel(level);
    }

    private interceptConsoleLogs() {
        const nextJsFilter = (args: unknown[]) => {
            // Only intercept Next.js related logs
            const message = args.join(' ');
            return message.includes('Next.js') || 
                   message.includes('[webpack]') ||
                   message.includes('HMR') ||
                   message.includes('Fast Refresh');
        };
    
        const originalLog = console.log;
        
        console.log = (...args) => {
            originalLog.apply(console, args);
            if (nextJsFilter(args) && this.shouldLog('debug', 'nextjs')) {
                this.logConsoleMessage('debug', args);
            }
        };
    
        console.log = (...args) => {
            originalLog.apply(console, args);
            if (nextJsFilter(args) && this.shouldLog('info', 'nextjs')) {
                this.logConsoleMessage('info', args);
            }
        };

        console.log = (...args) => {
            originalLog.apply(console, args);
            if (nextJsFilter(args) && this.shouldLog('warn', 'nextjs')) {
                this.logConsoleMessage('warn', args);
            }
        };

        console.log = (...args) => {
            originalLog.apply(console, args);
            if (nextJsFilter(args) && this.shouldLog('error', 'nextjs')) {
                this.logConsoleMessage('error', args);
            }
        };
    }

    private logConsoleMessage(level: LogLevel, args: unknown[]) {
        const logEntry: ApplicationLog = {
            id: uuidv4(),
            level,
            message: args.map(arg => this.stringify(arg)).join(' '),
            category: 'application',
            subCategory: 'nextjs',
            context: {
                timestamp: new Date().toISOString(),
                environment: logConfig.environment,
                component: 'NextJS'
            },
            metadata: { args }
        };
        this.addLog(logEntry);
        this.processLog(logEntry);
    }

    private logErrorMessage(args: unknown[]) {
        const errorEntry: ErrorLog = {
            id: uuidv4(),
            level: 'error',
            message: args.map(arg => this.stringify(arg)).join(' '),
            category: 'error',
            context: {
                timestamp: new Date().toISOString(),
                environment: logConfig.environment,
                component: 'NextJS'
            },
            error: {
                name: 'NextJSError',
                message: args.map(arg => this.stringify(arg)).join(' '),
                stack: new Error().stack
            }
        };
        this.addLog(errorEntry);
        this.processLog(errorEntry);
    }

    private interceptNextJsLogs() {
        if (typeof window === 'undefined') return;

        // Handle unhandled rejections
        window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));

        // Monitor Next.js performance
        this.setupPerformanceMonitoring();
    }

    private handleUnhandledRejection(event: PromiseRejectionEvent) {
        if (!this.shouldLog('error', 'nextjs')) return;

        const errorEntry: ErrorLog = {
            id: uuidv4(),
            level: 'error',
            message: `Unhandled Promise Rejection: ${event.reason}`,
            category: 'error',
            context: {
                timestamp: new Date().toISOString(),
                environment: logConfig.environment,
                component: 'NextJS'
            },
            error: {
                name: 'UnhandledRejection',
                message: String(event.reason),
                stack: event.reason?.stack
            }
        };
        this.addLog(errorEntry);
        this.processLog(errorEntry);
    }

    private setupPerformanceMonitoring() {
        const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach(this.handlePerformanceEntry.bind(this));
        });

        observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
    }

    private handlePerformanceEntry(entry: PerformanceEntry) {
        if (!entry.name.startsWith('Next.js') || !this.shouldLog('info', 'nextjs')) return;

        const logEntry: ApplicationLog = {
            id: uuidv4(),
            level: 'info',
            message: `Next.js Performance: ${entry.name}`,
            category: 'application',
            subCategory: 'nextjs',
            context: {
                timestamp: new Date().toISOString(),
                environment: logConfig.environment,
                component: 'Performance'
            },
            metadata: {
                duration: entry.duration,
                startTime: entry.startTime,
                entryType: entry.entryType
            }
        };
        this.addLog(logEntry);
        this.processLog(logEntry);
    }

    private stringify(arg: unknown): string {
        if (typeof arg === 'string') return arg;
        try {
            return JSON.stringify(arg, null, 2);
        } catch {
            return String(arg);
        }
    }

    public restoreConsole() {
        Object.assign(console, this.originalConsole);
    }
}

// Add window controls for console debugging
declare global {
    interface Window {
        nextJsLogger: {
            setLogLevel: (level: LogLevel) => void;
            disableLogging: () => void;
            enableLogging: (level?: LogLevel) => void;
            restore: () => void;
        };
    }
}

if (typeof window !== 'undefined') {
    window.nextJsLogger = {
        setLogLevel: NextJsLogger.setLogLevel,
        disableLogging: NextJsLogger.disableLogging,
        enableLogging: NextJsLogger.enableLogging,
        restore: () => NextJsLogger.getInstance().restoreConsole()
    };
}

export const nextJsLogger = NextJsLogger.getInstance();