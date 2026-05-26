'use client';

import React, { useState, useCallback } from 'react';
import {useDynamicGateway} from "@/app/(dev)/demos/tests/dynamic-gateway-concept/hooks/useDynamicGateway";
import { DataProvider } from './DataProvider';

export const TestInterface: React.FC = () => {
    const gateway = useDynamicGateway();
    const [testData, setTestData] = useState({
        inputValue: 10,
        metadata: {
            source: 'user',
            timestamp: new Date().toISOString()
        }
    });
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleTestDataChange = useCallback((key: string, value: any) => {
        setTestData(prev => ({
            ...prev,
            [key]: key === 'inputValue' ? parseFloat(value) : value
        }));
    }, []);

    const handleProcessData = useCallback(async () => {
        try {
            const response = await gateway.invoke({
                component: 'DataProvider',
                handlerName: 'processData',
                args: [testData]
            });
            setResult(JSON.stringify(response, null, 2));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setResult(null);
        }
    }, [gateway, testData]);

    const handleIncrementCounter = useCallback(async () => {
        try {
            const response = await gateway.invoke({
                component: 'DataProvider',
                handlerName: 'incrementCounter',
                args: [testData.inputValue]
            });
            setResult(`Counter incremented by ${testData.inputValue}. New value: ${response}`);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setResult(null);
        }
    }, [gateway, testData.inputValue]);

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-foreground">Dynamic Gateway Test Interface</h1>

            <div className="grid grid-cols-1 gap-6">
                <DataProvider gateway={gateway} />

                <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
                    <div className="p-6">
                        <h3 className="text-lg font-semibold mb-4">Test Controls</h3>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Input Value:</label>
                                <input
                                    type="number"
                                    value={testData.inputValue}
                                    onChange={(e) => handleTestDataChange('inputValue', e.target.value)}
                                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Metadata Source:</label>
                                <input
                                    type="text"
                                    value={testData.metadata.source}
                                    onChange={(e) => handleTestDataChange('metadata', {
                                        ...testData.metadata,
                                        source: e.target.value
                                    })}
                                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground"
                                />
                            </div>

                            <div className="flex flex-wrap gap-4">
                                <button
                                    onClick={handleProcessData}
                                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    Test Process Data
                                </button>

                                <button
                                    onClick={handleIncrementCounter}
                                    className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/90"
                                >
                                    Test Counter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
                    <div className="p-6">
                        <h3 className="text-lg font-semibold mb-4">Results</h3>

                        {error && (
                            <div className="p-4 mb-4 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                                Error: {error}
                            </div>
                        )}

                        {result && (
                            <pre className="p-4 rounded-md bg-muted text-muted-foreground font-mono text-sm overflow-auto">
                {result}
              </pre>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TestInterface;
