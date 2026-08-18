"use client";
import React, { useState } from "react";
import { InlineCopyButton } from "@/components/matrx/buttons/InlineCopyButton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function InlineCopyButtonDisplay({ component }: ComponentDisplayProps) {
    if (!component) return null;

    const code = `import { InlineCopyButton } from "@/components/matrx/buttons/InlineCopyButton";

// Basic usage
<div className="relative p-4 bg-gray-100 dark:bg-gray-800 rounded-md">
  <InlineCopyButton
    content="Content to be copied to clipboard"
    position="top-right"       // Position: top-right, top-left, bottom-right, bottom-left, center-right, center-left
    size="sm"                  // Size: xs, sm, md
    className=""               // Additional CSS classes
    showTooltip={true}         // Whether to show tooltip on hover
    tooltipText="Copy to clipboard" // Text to display in tooltip
    successDuration={2000}     // Duration (ms) to show success state
    formatJson={true}          // Whether to format JSON before copying
    onCopySuccess={() => console.log('Copied!')}  // Callback on successful copy
    onCopyError={(err) => console.error(err)}     // Callback on copy error
  />
  <p>Your content that needs a copy button goes here.</p>
</div>

// JSON formatting example
<InlineCopyButton
  content={{ name: "John", age: 30, roles: ["admin", "user"] }}
  tooltipText="Copy JSON"
/>`;

    // Original demo content preserved completely
    const DemoContent = () => {
        const [testResult, setTestResult] = useState<string>("");
        const [activeTab, setActiveTab] = useState("basic");
    
        // Example of a complex JSON object with nested stringified JSON
        const complexJsonExample = {
            id: 123,
            name: "Product Example",
            metadata: JSON.stringify({
                tags: ["electronics", "sale"],
                variants: JSON.stringify([
                    { color: "red", stock: 5 },
                    { color: "blue", stock: 10 },
                ]),
            }),
            details: {
                description: "This is a sample product",
                price: 99.99,
                specifications: JSON.stringify({
                    dimensions: "10x20x5",
                    weight: "1.5kg",
                }),
            },
        };
    
        // Test function to verify clipboard content
        const verifyClipboard = async () => {
            try {
                const clipboardText = await navigator.clipboard.readText();
                setTestResult(`Content from clipboard: ${clipboardText.slice(0, 100)}${clipboardText.length > 100 ? "..." : ""}`);
            } catch (err) {
                setTestResult(`Error reading clipboard: ${err}`);
            }
        };
    
        return (
            <div className="container mx-auto py-8 px-4 bg-gray-50 dark:bg-gray-900">
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md dark:bg-gray-900 dark:border-yellow-200">
                    <h2 className="text-lg font-medium mb-2">Clipboard Test</h2>
                    <div className="flex gap-4 items-center">
                        <Button onClick={verifyClipboard} variant="outline">
                            Verify Clipboard Content
                        </Button>
                        <span className="text-sm">{testResult}</span>
                    </div>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
                    <TabsList>
                        <TabsTrigger value="basic">Basic Examples</TabsTrigger>
                        <TabsTrigger value="json">JSON Examples</TabsTrigger>
                        <TabsTrigger value="positioning">Positioning</TabsTrigger>
                        <TabsTrigger value="sizing">Sizing</TabsTrigger>
                    </TabsList>
                    {/* Basic Examples */}
                    <TabsContent value="basic">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Text Example</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <InlineCopyButton
                                            content="This is some plain text that will be copied exactly as is."
                                            formatJson={false}
                                        />
                                        <p>This is some plain text that will be copied exactly as is.</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Code Example</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <InlineCopyButton
                                            content="function sayHello() {\n  console.log('Hello world!');\n}"
                                            formatJson={false}
                                        />
                                        <pre className="font-mono text-sm">
                                            {`function sayHello() {
  console.log('Hello world!');
}`}
                                        </pre>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>URL Example</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative flex items-center p-3 bg-gray-100 dark:bg-gray-800 rounded">
                                        <span className="font-mono">https://example.com/very/long/path</span>
                                        <InlineCopyButton
                                            content="https://example.com/very/long/path/that/would/be/annoying/to/select/manually"
                                            position="top-right"
                                            tooltipText="Copy URL"
                                            formatJson={false}
                                            className="ml-2"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>API Key Example</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative flex items-center p-3 bg-gray-100 dark:bg-gray-800 rounded">
                                        <div className="font-mono">sk_test_12345...67890</div>
                                        <InlineCopyButton
                                            content="sk_test_123456789012345678901234567890"
                                            position="top-right"
                                            tooltipText="Copy API key"
                                            formatJson={false}
                                            className="ml-2"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                    {/* JSON Examples */}
                    <TabsContent value="json">
                        <div className="grid grid-cols-1 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Simple JSON Object</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <InlineCopyButton
                                            content={{ name: "John", age: 30, roles: ["admin", "user"] }}
                                            tooltipText="Copy JSON"
                                        />
                                        <pre className="font-mono text-sm">
                                            {`{
  "name": "John",
  "age": 30,
  "roles": ["admin", "user"]
}`}
                                        </pre>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>JSON String</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <InlineCopyButton
                                            content='{"name":"Jane","data":"{\"items\":[1,2,3]}"}'
                                            tooltipText="Copy and format JSON"
                                        />
                                        <pre className="font-mono text-sm">{`{"name":"Jane","data":"{\"items\":[1,2,3]}"}`}</pre>
                                        <p className="mt-2 text-sm text-gray-500">
                                            (Click copy to get properly formatted JSON with nested objects parsed)
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Complex Nested JSON</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <InlineCopyButton content={complexJsonExample} tooltipText="Copy formatted JSON" />
                                        <pre className="font-mono text-sm overflow-x-auto">{JSON.stringify(complexJsonExample, null, 2)}</pre>
                                        <p className="mt-2 text-sm text-gray-500">(Copy button will auto-parse nested stringified JSON)</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                    {/* Positioning Examples */}
                    <TabsContent value="positioning">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Top Right (Default)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex justify-center items-center h-40">
                                        <span>Content</span>
                                        <InlineCopyButton content="Top Right Position" position="top-right" formatJson={false} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Top Left</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex justify-center items-center h-40">
                                        <span>Content</span>
                                        <InlineCopyButton content="Top Left Position" position="top-left" formatJson={false} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Bottom Right</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex justify-center items-center h-40">
                                        <span>Content</span>
                                        <InlineCopyButton content="Bottom Right Position" position="bottom-right" formatJson={false} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Bottom Left</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex justify-center items-center h-40">
                                        <span>Content</span>
                                        <InlineCopyButton content="Bottom Left Position" position="bottom-left" formatJson={false} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Center Right</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex justify-center items-center h-40">
                                        <span>Content</span>
                                        <InlineCopyButton content="Center Right Position" position="center-right" formatJson={false} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Center Left</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex justify-center items-center h-40">
                                        <span>Content</span>
                                        <InlineCopyButton content="Center Left Position" position="center-left" formatJson={false} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="col-span-2 md:col-span-3">
                                <CardHeader>
                                    <CardTitle>Practical Use Cases</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Tall container example for center positions */}
                                        <div className="relative h-64 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center">
                                            <div className="w-full h-full flex flex-col justify-center">
                                                <p className="text-center mb-2">Center-right is ideal for tall containers</p>
                                                <div className="w-full h-32 relative bg-white dark:bg-gray-700 rounded p-3 flex items-center justify-center">
                                                    <span>Content area</span>
                                                    <InlineCopyButton 
                                                        content="Center-right position works well with tall containers" 
                                                        position="center-right" 
                                                        formatJson={false}
                                                        tooltipText="Copy example text" 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Code box example */}
                                        <div className="relative p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                            <h3 className="text-md font-medium mb-2">Code block with side buttons</h3>
                                            <div className="relative rounded-md bg-textured p-4 h-44 overflow-y-auto">
                                                <pre className="font-mono text-sm">
{`function processData(data) {
  if (!data || !data.items) {
    return [];
  }
  
  return data.items.map(item => {
    return {
      id: item.id,
      name: item.displayName,
      value: item.metrics.value,
      trend: calculateTrend(item)
    };
  });
}`}
                                                </pre>
                                                <InlineCopyButton
                                                    content={`function processData(data) {
  if (!data || !data.items) {
    return [];
  }
  
  return data.items.map(item => {
    return {
      id: item.id,
      name: item.displayName,
      value: item.metrics.value,
      trend: calculateTrend(item)
    };
  });
}`}
                                                    position="center-right"
                                                    formatJson={false}
                                                    tooltipText="Copy code"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="col-span-2 md:col-span-3">
                                <CardHeader>
                                    <CardTitle>Inline Usage</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <p className="mb-4">Sometimes you need the copy button to appear within text content:</p>
                                        <div className="flex items-center gap-2 mb-4">
                                            <span>Your repository URL is:</span>
                                            <code className="relative px-3 py-1 bg-gray-200 dark:bg-gray-800 rounded font-mono">
                                                https://github.com/username/repo
                                                <InlineCopyButton
                                                    content="https://github.com/username/repo"
                                                    formatJson={false}
                                                    size="xs"
                                                    position="center-right"
                                                    className="absolute"
                                                />
                                            </code>
                                        </div>
                                        <p>This approach works well for short snippets that need to be copyable.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                    {/* Sizing Examples */}
                    <TabsContent value="sizing">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Extra Small (XS)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-4 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center h-24">
                                        <InlineCopyButton
                                            content="Extra Small Size"
                                            size="xs"
                                            position="top-right"
                                            formatJson={false}
                                            className="static"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Small (SM, Default)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-4 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center h-24">
                                        <InlineCopyButton
                                            content="Small Size"
                                            size="sm"
                                            position="top-right"
                                            formatJson={false}
                                            className="static"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Medium (MD)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative p-4 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center h-24">
                                        <InlineCopyButton
                                            content="Medium Size"
                                            size="md"
                                            position="top-right"
                                            formatJson={false}
                                            className="static"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
                <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
                    <h2 className="text-xl font-semibold mb-4">Component Options</h2>
                    <table className="w-full text-sm">
                        <thead>
                            <tr>
                                <th className="text-left pb-2">Prop</th>
                                <th className="text-left pb-2">Type</th>
                                <th className="text-left pb-2">Default</th>
                                <th className="text-left pb-2">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="py-2 font-mono">content</td>
                                <td className="py-2">string | object</td>
                                <td className="py-2">-</td>
                                <td className="py-2">The content to copy to clipboard</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">position</td>
                                <td className="py-2">string</td>
                                <td className="py-2">'top-right'</td>
                                <td className="py-2">Button position (top-right, top-left, bottom-right, bottom-left, center-right, center-left)</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">size</td>
                                <td className="py-2">string</td>
                                <td className="py-2">'sm'</td>
                                <td className="py-2">Button size (xs, sm, md, lg, xl)</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">className</td>
                                <td className="py-2">string</td>
                                <td className="py-2">''</td>
                                <td className="py-2">Additional CSS classes</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">showTooltip</td>
                                <td className="py-2">boolean</td>
                                <td className="py-2">true</td>
                                <td className="py-2">Whether to show tooltip on hover</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">tooltipText</td>
                                <td className="py-2">string</td>
                                <td className="py-2">'Copy to clipboard'</td>
                                <td className="py-2">Text to display in tooltip</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">successDuration</td>
                                <td className="py-2">number</td>
                                <td className="py-2">2000</td>
                                <td className="py-2">Duration (ms) to show success state</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">formatJson</td>
                                <td className="py-2">boolean</td>
                                <td className="py-2">true</td>
                                <td className="py-2">Whether to format JSON before copying</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">onCopySuccess</td>
                                <td className="py-2">function</td>
                                <td className="py-2">undefined</td>
                                <td className="py-2">Callback function when copy succeeds</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-mono">onCopyError</td>
                                <td className="py-2">function</td>
                                <td className="py-2">undefined</td>
                                <td className="py-2">Callback function when copy fails</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <ComponentDisplayWrapper
            component={component}
            code={code}
            description="A versatile copy button that can be positioned around content. Supports copying text, code, and JSON with automatic formatting."
            className="p-0"
        >
            <DemoContent />
        </ComponentDisplayWrapper>
    );
}