// EndpointCard.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EndpointCardProps } from './types';

const EndpointCard = ({ endpoint, onTest, response, loading, baseUrl }: EndpointCardProps) => {
    const [queryParams, setQueryParams] = useState<Record<string, string>>(
        endpoint.queryParams
            ? Object.fromEntries(
                Object.entries(endpoint.queryParams).map(([key, value]) => [key, value.default])
            )
            : {}
    );

    const handleTest = () => {
        const params = new URLSearchParams(queryParams).toString();
        const url = params ? `${endpoint.url}?${params}` : endpoint.url;
        onTest(endpoint, url, undefined);
    };

    return (
        <Card className="mt-4">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{endpoint.name}</CardTitle>
                    <Badge variant="outline">{endpoint.method}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{endpoint.description}</p>
            </CardHeader>
            <CardContent>
                {endpoint.queryParams && (
                    <div className="mb-4 space-y-2">
                        <h4 className="text-sm font-medium">Query Parameters</h4>
                        {Object.entries(endpoint.queryParams).map(([key, param]) => (
                            <div key={key} className="flex gap-2 items-center">
                                <span className="text-sm text-muted-foreground min-w-[100px]">{key}:</span>
                                <Input
                                    value={queryParams[key] || ''}
                                    onChange={(e) => setQueryParams(prev => ({
                                        ...prev,
                                        [key]: e.target.value
                                    }))}
                                    placeholder={`Enter ${key}...`}
                                    className="flex-1"
                                />
                            </div>
                        ))}
                    </div>
                )}

                <Button
                    onClick={handleTest}
                    disabled={loading}
                >
                    {loading ? 'Testing...' : 'Test Endpoint'}
                </Button>

                {response && (
                    <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2">
                            <p className="text-sm text-muted-foreground">
                                Last tested: {response.timestamp}
                            </p>
                            <Badge variant={response.status < 400 ? "success" : "destructive"}>
                                Status: {response.status}
                            </Badge>
                        </div>
                        {response.error ? (
                            <Alert variant="destructive" className="mt-2">
                                <AlertDescription>
                                    {response.error}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto max-h-96">
                                {JSON.stringify(response.data, null, 2)}
                            </pre>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default EndpointCard;