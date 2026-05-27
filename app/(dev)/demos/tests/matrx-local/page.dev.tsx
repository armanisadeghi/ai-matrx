'use client';

import React, {useState, useEffect} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {API_CONFIG} from './constants';
import {Endpoint, EndpointResponse} from "@/app/(dev)/demos/tests/matrx-local/types";
import ConnectionStatus from './ConnectionStatus';
import MessageLog from './MessageLog';
import EndpointCard from './EndpointCard';
import { DownloadEndpointCard } from './DownloadEndpointCard';
import DirectoryStructureGroup from './DirectoryStructureGroup';


// =====================
// Main Component
// =====================
const ApiTest = () => {
    const [activeTab, setActiveTab] = useState('rest');
    const [responses, setResponses] = useState<Record<string, EndpointResponse>>({});
    const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
    const [wsMessages, setWsMessages] = useState([]);
    const [wsInput, setWsInput] = useState(API_CONFIG.websocket.defaultMessage);
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [connectionStatus, setConnectionStatus] = useState('disconnected');

    // Auto-connect WebSocket on component mount
    useEffect(() => {
        connectWebSocket();
        return () => {
            if (wsConnection) {
                wsConnection.close();
            }
        };
    }, []);

    // Auto-reconnect logic
    useEffect(() => {
        if (connectionStatus === 'disconnected') {
            const timer = setTimeout(() => {
                connectWebSocket();
            }, API_CONFIG.websocket.reconnectInterval);
            return () => clearTimeout(timer);
        }
    }, [connectionStatus]);

    // Test REST API endpoint
    const testEndpoint = async (endpoint: Endpoint, url: string, body?: any) => {
        setLoading(prev => ({...prev, [endpoint.id]: true}));
        try {
            const response = await fetch(`${API_CONFIG.baseUrl}${url}`, {
                method: endpoint.method,
                headers: {
                    'Content-Type': 'application/json',
                },
                ...(body ? {body: JSON.stringify(body)} : {})
            });

            const data = await response.json();
            setResponses(prev => ({
                ...prev,
                [endpoint.id]: {
                    data,
                    timestamp: new Date().toLocaleTimeString(),
                    status: response.status
                }
            }));
        } catch (error) {
            setResponses(prev => ({
                ...prev,
                [endpoint.id]: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toLocaleTimeString(),
                    status: 500
                }
            }));
        } finally {
            setLoading(prev => ({...prev, [endpoint.id]: false}));
        }
    };

    // WebSocket functions
    const connectWebSocket = () => {
        if (wsConnection?.readyState === WebSocket.CONNECTING ||
            wsConnection?.readyState === WebSocket.OPEN) return;

        setConnectionStatus('connecting');
        const socket = new WebSocket(API_CONFIG.websocket.url);

        socket.onopen = () => {
            setConnectionStatus('connected');
            setWsMessages(prev => [...prev, {
                type: 'system',
                message: 'Connected to WebSocket',
                timestamp: new Date().toLocaleTimeString()
            }]);
        };

        socket.onmessage = (event) => {
            setWsMessages(prev => [...prev, {
                type: 'received',
                message: event.data,
                timestamp: new Date().toLocaleTimeString()
            }]);
        };

        socket.onerror = (error) => {
            setConnectionStatus('error');
            setWsMessages(prev => [...prev, {
                type: 'error',
                message: 'WebSocket error occurred',
                timestamp: new Date().toLocaleTimeString()
            }]);
        };

        socket.onclose = () => {
            setConnectionStatus('disconnected');
            setWsMessages(prev => [...prev, {
                type: 'system',
                message: 'Disconnected from WebSocket',
                timestamp: new Date().toLocaleTimeString()
            }]);
            setWsConnection(null);
        };

        setWsConnection(socket);
    };

    const disconnectWebSocket = () => {
        if (wsConnection) {
            wsConnection.close();
        }
    };

    const sendWebSocketMessage = () => {
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(wsInput);
            setWsMessages(prev => [...prev, {
                type: 'sent',
                message: wsInput,
                timestamp: new Date().toLocaleTimeString()
            }]);
        }
    };

    const clearMessages = () => {
        setWsMessages([]);
    };

    return (
        <div className="container mx-auto p-4 space-y-4">
            {/* Connection Status Card */}
            <Card className="mb-4">
                <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <ConnectionStatus status={connectionStatus}/>
                            <div className="flex gap-2">
                                <Button
                                    onClick={connectWebSocket}
                                    disabled={!!wsConnection}
                                    variant="outline"
                                    size="sm"
                                >
                                    Connect
                                </Button>
                                <Button
                                    onClick={disconnectWebSocket}
                                    disabled={!wsConnection}
                                    variant="outline"
                                    size="sm"
                                >
                                    Disconnect
                                </Button>
                            </div>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Input
                                value={wsInput}
                                onChange={(e) => setWsInput(e.target.value)}
                                placeholder="Send WebSocket message..."
                                className="w-64"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        sendWebSocketMessage();
                                    }
                                }}
                            />
                            <Button
                                onClick={sendWebSocketMessage}
                                disabled={!wsConnection}
                                size="sm"
                            >
                                Send
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Main Content */}
            <Card>
                <CardHeader>
                    <CardTitle>API Testing Interface</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid grid-cols-4 mb-4">
                            <TabsTrigger value="messages">Messages</TabsTrigger>
                            {API_CONFIG.categories.map(category => (
                                <TabsTrigger key={category.id} value={category.id}>
                                    {category.name}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        {/* WebSocket Messages Tab */}
                        <TabsContent value="messages">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>WebSocket Messages</CardTitle>
                                        <Button
                                            onClick={clearMessages}
                                            variant="outline"
                                            size="sm"
                                        >
                                            Clear Messages
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <MessageLog messages={wsMessages}/>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* API Category Tabs */}
                        {API_CONFIG.categories.map(category => (
                            <TabsContent key={category.id} value={category.id}>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>{category.name} APIs</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Tabs defaultValue={category.endpoints[0]?.id} className="w-full">
                                            <TabsList className="w-full flex-wrap h-auto gap-2 justify-start">
                                                {category.endpoints.map(endpoint => (
                                                    <TabsTrigger
                                                        key={endpoint.id}
                                                        value={endpoint.id}
                                                        className="flex items-center gap-2"
                                                    >
                                                        {endpoint.name}
                                                        <Badge variant="outline" className="ml-2">
                                                            {endpoint.method}
                                                        </Badge>
                                                    </TabsTrigger>
                                                ))}
                                            </TabsList>

                                            {category.endpoints.map(endpoint => (
                                                <TabsContent key={endpoint.id} value={endpoint.id}>
                                                    {endpoint.id.startsWith('generateStructure') ? (
                                                        <DirectoryStructureGroup
                                                            endpoints={{
                                                                generateStructureText: category.endpoints.find(e => e.id === 'generateStructureText'),
                                                                generateStructureJson: category.endpoints.find(e => e.id === 'generateStructureJson'),
                                                                generateStructureZip: category.endpoints.find(e => e.id === 'generateStructureZip')
                                                            }}
                                                            baseUrl={API_CONFIG.baseUrl}
                                                            onTest={testEndpoint}
                                                            responses={responses}
                                                            loading={loading}
                                                        />
                                                    ) : 'returnsFile' in endpoint && endpoint.returnsFile ? (
                                                        <DownloadEndpointCard
                                                            endpoint={endpoint}
                                                            baseUrl={API_CONFIG.baseUrl}
                                                        />
                                                    ) : (
                                                        <EndpointCard
                                                            endpoint={endpoint}
                                                            onTest={testEndpoint}
                                                            response={responses[endpoint.id]}
                                                            loading={loading[endpoint.id]}
                                                            baseUrl={API_CONFIG.baseUrl}
                                                        />
                                                    )}
                                                </TabsContent>
                                            ))}
                                        </Tabs>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        ))}
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
};

export default ApiTest;
