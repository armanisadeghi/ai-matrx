import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import React from "react";
import { MarkdownAnalysis } from "./types";


interface AnalysisTabProps {
    analysis: MarkdownAnalysis;
}

const AnalysisTab: React.FC<AnalysisTabProps> = ({ analysis }) => {
    return (
        <div className="w-full">
            <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Analysis Data</h3>
            <div className="space-y-4">
                <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        <tr>
                            <th className="px-3 py-2 text-left border-border">Metric</th>
                            <th className="px-3 py-2 text-left border-border">Value</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {Object.entries(analysis).map(([key, value]) => (
                            <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="px-3 py-2 border-border text-gray-800 dark:text-gray-300">
                                    {humanizeIdentifier(key) || key}
                                </td>
                                <td className="px-3 py-2 border-border text-gray-800 dark:text-gray-300">
                                    {typeof value === "object" ? JSON.stringify(value) : value}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AnalysisTab;