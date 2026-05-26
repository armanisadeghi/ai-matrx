// DirectoryStructureGroup.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DownloadEndpointCard } from './DownloadEndpointCard';
import EndpointCard from "@/app/(dev)/demos/tests/matrx-local/EndpointCard";

interface DirectoryStructureGroupProps {
    endpoints: {
        generateStructureText: any;
        generateStructureJson: any;
        generateStructureZip: any;
    };
    baseUrl: string;
    onTest: (endpoint: any, url: string, body?: any) => Promise<void>;
    responses: Record<string, any>;
    loading: Record<string, boolean>;
}

const DirectoryStructureGroup = ({ endpoints, baseUrl, onTest, responses, loading }: DirectoryStructureGroupProps) => {
    return (
        <Card>
            <CardContent className="pt-6">
                <Tabs defaultValue="text">
                    <TabsList className="grid grid-cols-3 w-full">
                        <TabsTrigger value="text">Text Format</TabsTrigger>
                        <TabsTrigger value="json">JSON Format</TabsTrigger>
                        <TabsTrigger value="zip">All Files (ZIP)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="text">
                        <DownloadEndpointCard
                            endpoint={endpoints.generateStructureText}
                            baseUrl={baseUrl}
                        />
                    </TabsContent>

                    <TabsContent value="json">
                        <EndpointCard
                            endpoint={endpoints.generateStructureJson}
                            onTest={onTest}
                            response={responses[endpoints.generateStructureJson.id]}
                            loading={loading[endpoints.generateStructureJson.id]}
                            baseUrl={baseUrl}
                        />
                    </TabsContent>

                    <TabsContent value="zip">
                        <DownloadEndpointCard
                            endpoint={endpoints.generateStructureZip}
                            baseUrl={baseUrl}
                            onTest={onTest}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};

export default DirectoryStructureGroup;