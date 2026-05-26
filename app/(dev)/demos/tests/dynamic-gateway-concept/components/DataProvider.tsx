import React, { useState, useCallback, useRef } from 'react';
import { useDynamicGateway } from '../hooks/useDynamicGateway';

export const DataProvider: React.FC<{ gateway: ReturnType<typeof useDynamicGateway> }> = ({ gateway }) => {
    const [counter, setCounter] = useState(0);
    const counterRef = useRef(counter);

    // Update ref when counter changes
    React.useEffect(() => {
        counterRef.current = counter;
    }, [counter]);

    const handleProcessData = useCallback((data: any) => {
        return {
            processed: true,
            timestamp: new Date().toISOString(),
            value: data.value,
            metadata: data.meta
        };
    }, []);

    const handleIncrementCounter = useCallback((amount: number) => {
        const newValue = counterRef.current + amount;
        setCounter(newValue);
        return newValue;
    }, []);

    React.useEffect(() => {
        const registrations = [
            gateway.register({
                component: 'DataProvider',
                handlerName: 'processData',
                handler: handleProcessData,
                propMappings: [
                    {
                        source: ['0', 'inputValue'],
                        target: ['0', 'value'],
                        transform: (value) => value * 2
                    },
                    {
                        source: ['0', 'metadata'],
                        target: ['0', 'meta']
                    }
                ]
            }),
            gateway.register({
                component: 'DataProvider',
                handlerName: 'incrementCounter',
                handler: handleIncrementCounter
            })
        ];

        return () => {
            registrations.forEach(cleanup => cleanup());
        };
    }, [gateway, handleProcessData, handleIncrementCounter]);

    return (
        <div className="p-4 rounded-lg border border-border bg-card text-card-foreground shadow-sm">
            <h3 className="text-lg font-semibold mb-2">Data Provider</h3>
            <p className="text-muted-foreground">Current Counter: {counter}</p>
        </div>
    );
};
