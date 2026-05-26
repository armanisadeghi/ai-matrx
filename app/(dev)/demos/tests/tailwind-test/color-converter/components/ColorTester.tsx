'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { normalizeColorInput } from '@/utils/color-utils/color-change-util';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";

const testColorValues = [
    "hwb(199 24% 20%)",
    "lab(55.715 -14.02 -32.329)",
    "lch(55.715 35.17 246.6)",
    "0x3d87cc",
    "skyblue600",
    "hwb(199deg 24% 20%)",



    // Existing test cases
    "3d87cc",
    "rgb(61, 135, 204)",
    "(61, 135, 204)",
    "61, 135, 204",
    '{"r":61,"g":135,"b":204,"a":1}',
    '"r":61,"g":135,"b":204,"a":1',
    "r:61,g:135,b:204,a:1",
    '{"h":199,"s":89,"l":48,"a":1}',
    '"h":199,"s":89,"l":48,"a":1',
    "h:199,s:89,l:48,a:1",
    "sky-600",
    "sky600",
    "sky 600",
    "sky598",
    "sky",
    '{"c":94,"m":29,"y":0,"k":9,"a":1}',
    '"c":94,"m":29,"y":0,"k":9,"a":1',
    "c:94,m:29,y:0,k:9,a:1",
    "device-cmyk(94% 29% 0% 9%)",
    "(94% 29% 0% 9%)",
    "94% 29% 0% 9%",

    // Additional test cases
    "#3d87cc",
    "3d87cc00",
    "#3d87cc00",
    "rgb(61 135 204)",
    "rgb(61,135,204)",
    "rgba(61, 135, 204, 1)",
    "rgba(61 135 204 / 1)",
    "rgba(61 135 204 / 100%)",
    "hsl(199, 89%, 48%)",
    "hsla(199, 89%, 48%, 1)",
    "hsla(199 89% 48% / 1)",
    "hsla(199deg 89% 48% / 100%)",
    "color(display-p3 0.243 0.533 0.796)",
    "blue",
    "lightblue",
    "rgb(24%, 53%, 80%)",
    "hsl(199turn 89% 48%)",
    "hsla(3.472rad 89% 48% / 1)",
    "device-cmyk(94%, 29%, 0%, 9%)",
    "cmyk(94%, 29%, 0%, 9%)",
    "sky-blue-600",
    "sky blue 600",
    "sky_blue_600",
    '{"red":61,"green":135,"blue":204,"alpha":1}',
    '"red":61,"green":135,"blue":204,"alpha":1',
    "red:61,green:135,blue:204,alpha:1",
    '{"hue":199,"saturation":89,"lightness":48,"alpha":1}',
    '"hue":199,"saturation":89,"lightness":48,"alpha":1',
    "hue:199,saturation:89,lightness:48,alpha:1",
    "rgb(061, 135, 204)",  // with leading zero
    "rgb(100%, 50%, 0%)",  // percentages
    "#3D87CC",  // uppercase hex
    "3D87CC",   // uppercase hex without #
    "rgb(61.5, 135.7, 204.2)",  // fractional RGB values
    "hsl(199.5, 89.3%, 48.1%)",  // fractional HSL values
];


interface ColorTestResult {
    input: string;
    isValid: boolean;
    result: string | null;
    type?: string;  // Add type field to store the identified format type
}

const ColorTester = () => {
    const [results, setResults] = useState<ColorTestResult[]>([]);
    const [score, setScore] = useState<string>('');
    const [jsonData, setJsonData] = useState<object>({});

    const testColors = useCallback(() => {
        const newResults: ColorTestResult[] = testColorValues.map((colorValue) => {
            console.log(`Testing color value: ${colorValue}`); // Log each color test

            const normalizedValue = normalizeColorInput(colorValue);
            const isValid = normalizedValue !== null;

            console.log(`Test result for ${colorValue}:`, {
                isValid,
                normalizedValue
            });

            return {
                input: colorValue,
                isValid,
                result: isValid ? normalizedValue?.value : 'Invalid Color', // Use .value from normalized object
                type: isValid ? normalizedValue?.type : 'Invalid',  // Use .type from normalized object
            };
        });

        setResults(newResults);

        const validCount = newResults.filter(result => result.isValid).length;
        const totalCount = newResults.length;
        setScore(`${validCount} / ${totalCount}`);

        const resultObject = newResults.reduce((acc, result) => {
            acc[result.input] = result.result || 'Invalid Color';
            return acc;
        }, {} as { [key: string]: string });

        setJsonData(resultObject);
    }, []);

    useEffect(() => {
        testColors();
    }, [testColors]);

    return (
        <div className="flex flex-col space-y-4 p-4">
            <h1 className="text-2xl font-semibold">Color Validator Results</h1>

            <Button onClick={testColors} className="w-fit">Re-evaluate Colors</Button>

            <div className="text-xl font-medium">
                Score: {score}
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Input</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Type</TableHead> {/* New column to display type */}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {results.map((result, index) => (
                        <TableRow key={index}>
                            <TableCell>{result.input}</TableCell>
                            <TableCell>
                                <span className={result.isValid ? 'text-green-600' : 'text-red-600'}>
                                    {result.isValid ? 'Valid' : 'Invalid'}
                                </span>
                            </TableCell>
                            <TableCell>{result.result}</TableCell>
                            <TableCell>{result.type}</TableCell> {/* Display the type */}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <JsonViewer
                data={jsonData}
                title="Color Test Results"
            />
        </div>
    );
};

export default ColorTester;





