import React, {useState} from 'react';
import {useDynamicGateway} from "@/app/(dev)/demos/tests/dynamic-gateway-concept/hooks/useDynamicGateway";


interface ComponentAProps {
    gateway: ReturnType<typeof useDynamicGateway>;
}

export const ComponentA: React.FC<ComponentAProps> = ({gateway}) => {
    React.useEffect(() => {
        const cleanup = gateway.register({
            component: 'ComponentA',
            handlerName: 'greet',
            handler: (name: string) => `Hello, ${name}!`
        });

        return cleanup;
    }, [gateway]);

    return <div>Component A (Handler Provider)</div>;
};


export const ComponentB: React.FC<ComponentAProps> = ({gateway}) => {
    const [result, setResult] = useState<string>('');

    const handleClick = async () => {
        try {
            const response = await gateway.invoke({
                component: 'ComponentA',
                handlerName: 'greet',
                args: ['World']
            });
            setResult(response);
        } catch (error) {
            console.error('Failed to invoke handler:', error);
        }
    };

    return (
        <div>
            <button onClick={handleClick}>Invoke Handler</button>
            {result && <p>Result: {result}</p>}
        </div>
    );
};

// Example Usage
const ExampleUsage: React.FC = () => {
    const gateway = useDynamicGateway();

    return (
        <div>
            <ComponentA gateway={gateway}/>
            <ComponentB gateway={gateway}/>
        </div>
    );
};

export default ExampleUsage;
