"use client";

import { InlineCopyButton } from "@/components/matrx/buttons/InlineCopyButton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ProcessorExtractor from "@/components/official/processor-extractor/ProcessorExtractor";
import { ViewRenderer, AstViewRenderer } from "@/components/mardown-display/markdown-classification/custom-views/ViewRenderer";
import { getCoordinatorConfig } from "@/components/mardown-display/markdown-classification/markdown-coordinator";
import { ViewId } from "./custom-views/view-registry";
import { AstNode } from "./processors/types";


interface MarkdownProcessingTabsProps {
    ast: AstNode | null;
    parsedMarkdown: string;
    processedData: unknown;
    selectedCoordinatorId: string;
    selectedViewId: ViewId | null;
    mode: "light" | "dark";
    onParse: () => void;
    isLoading?: boolean;
}

const MarkdownProcessingTabs = ({
    ast,
    parsedMarkdown,
    processedData,
    selectedCoordinatorId,
    selectedViewId,
    mode,
    onParse,
    isLoading = false,
}: MarkdownProcessingTabsProps) => {
    // Get coordinator config for fallback views if needed
    const coordinator = getCoordinatorConfig(selectedCoordinatorId);
    const defaultViewId = coordinator?.defaultView || "dynamic" as ViewId;
    const availableViews = coordinator?.availableViews || [];

    const isDirectAstRenderer = selectedViewId === "astRenderer" || selectedViewId === "modernAstRenderer";

    return (
        <div className="w-2/3 flex flex-col">
            <Tabs defaultValue="processor-extractor" className="w-full h-full flex flex-col">
                <TabsList className="mx-2 my-1 gap-1 bg-transparent flex-shrink-0">
                    <TabsTrigger value="processor-extractor">Processor Extractor</TabsTrigger>
                    <TabsTrigger value="ast">Raw AST</TabsTrigger>
                    <TabsTrigger value="explorer">AST Explorer</TabsTrigger>
                    <TabsTrigger value="processedJson">Processed JSON</TabsTrigger>
                    <TabsTrigger value="structured">Structured View</TabsTrigger>
                </TabsList>


                {/* Tab 1: Processor Extractor */}
                <TabsContent value="processor-extractor" className="h-full overflow-auto flex-grow">
                    {processedData ? (
                        <div className="h-full">
                            <ProcessorExtractor jsonData={processedData} configKey={selectedCoordinatorId} />
                        </div>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 m-2">Click "Parse Markdown" to see the processor extractor.</p>
                    )}
                </TabsContent>

                {/* Tab 2: Raw AST JSON */}
                <TabsContent value="ast" className="h-full w-full relative">
                    {ast ? (
                        <>
                            <pre className="bg-gray-800 dark:bg-gray-950 text-gray-100 rounded-md overflow-x-auto h-full m-0 p-2 ">
                                <code>{JSON.stringify(ast, null, 2)}</code>
                            </pre>
                            <InlineCopyButton content={JSON.stringify(ast, null, 2)} position="top-right" size="md" />
                        </>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 m-2">Click "Parse Markdown" to see the AST.</p>
                    )}
                </TabsContent>

                {/* Tab 3: JSON Explorer for AST */}
                <TabsContent value="explorer" className="h-full overflow-auto flex-grow">
                    {ast ? (
                        <div className="h-full">
                            <ProcessorExtractor jsonData={ast} configKey={selectedCoordinatorId} />
                        </div>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 m-2">Click "Parse Markdown" to see the JSON Explorer.</p>
                    )}
                </TabsContent>

                {/* Tab 4: Processed JSON Explorer */}
                <TabsContent value="processedJson" className="h-full overflow-auto flex-grow">
                    {processedData ? (
                        <div className="h-full">
                            <ProcessorExtractor jsonData={processedData} configKey={selectedCoordinatorId} />
                        </div>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 m-2">Click "Parse Markdown" to see the processed JSON data.</p>
                    )}
                </TabsContent>


                {/* Tab 5: Structured View */}
                <TabsContent value="structured" className="h-full overflow-auto p-0 flex-grow">


                    {processedData || ast ? (
                        isDirectAstRenderer && ast && selectedViewId ? (
                            <AstViewRenderer
                                viewId={selectedViewId}
                                ast={ast}
                                className="h-full"
                                isLoading={isLoading}
                            />
                        ) : (
                            <ViewRenderer
                                requestedViewId={selectedViewId || defaultViewId}
                                data={processedData}
                                coordinatorId={selectedCoordinatorId}
                                className="h-full"
                                isLoading={isLoading}
                            />
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                            <p className="text-gray-500 dark:text-gray-400 mb-4">Click "Parse Markdown" to see the structured view</p>
                            <Button onClick={onParse}>Parse Markdown</Button>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default MarkdownProcessingTabs;
