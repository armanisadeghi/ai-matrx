import React, { useState } from "react";
import { LineCategory, SegmentType, SectionGroup, LineData } from "../types";

interface SectionGroupTabProps {
    data: SectionGroup;
}

const SectionGroupTab: React.FC<SectionGroupTabProps> = ({ data }) => {
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    const getRowKey = (sectionPosition: number, linePosition: number) =>
        `${sectionPosition}.${linePosition}`;

    const toggleRow = (key: string) => {
        setExpandedRows((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const getCategoryColor = (category: LineCategory) => {
        switch (category) {
            case LineCategory.HEADER:
                return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
            case LineCategory.BULLET:
            case LineCategory.SUB_BULLET:
            case LineCategory.NUMBERED_LIST:
                return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
            case LineCategory.TABLE_ROW:
            case LineCategory.TABLE_DIVIDER:
                return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
            case LineCategory.CODE_BLOCK_START:
            case LineCategory.CODE_BLOCK_END:
                return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
            case LineCategory.QUOTE:
                return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
            case LineCategory.IMAGE:
            case LineCategory.LINK:
                return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200";
            case LineCategory.BOLD_TEXT:
            case LineCategory.ITALIC_TEXT:
                return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
            case LineCategory.ENTRY_AND_VALUE:
                return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
            default:
                return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
        }
    };

    const getSegmentTypeColor = (type: SegmentType) => {
        switch (type) {
            case SegmentType.BOLD_TEXT:
            case SegmentType.BOLD_AND_ITALIC_TEXT:
                return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
            case SegmentType.ITALIC_TEXT:
                return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
            case SegmentType.INLINE_CODE_TEXT:
                return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
            case SegmentType.LINK_TITLE_TEXT:
            case SegmentType.LINK_URL_TEXT:
                return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
            case SegmentType.NUMBERED_LIST_MARKER_TEXT:
                return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
            case SegmentType.PLAIN_TEXT:
            default:
                return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
        }
    };

    const getRelevantMetadata = (metadata: LineData["metadata"]) => {
        return Object.entries(metadata).filter(([_, value]) => value !== null && value !== "");
    };

    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    <tr>
                        <th className="px-3 py-2 w-16">Pos</th>
                        <th className="px-3 py-2 w-32">Category</th>
                        <th className="px-3 py-2">Content</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {data.sections.flatMap((section) =>
                        section.lines.map((item) => {
                            const rowKey = getRowKey(section.position, item.position);
                            return (
                                <React.Fragment key={rowKey}>
                                    <tr
                                        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                                        onClick={() => toggleRow(rowKey)}
                                    >
                                        <td className="px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-300 align-top">
                                            {item.position}
                                            {item.metadata.level && (
                                                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                                                    (L{item.metadata.level})
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <span
                                                className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${getCategoryColor(
                                                    item.category
                                                )}`}
                                            >
                                                {item.category}
                                            </span>
                                            {item.metadata.code_language && (
                                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    {item.metadata.code_language}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 dark:text-gray-300">
                                            <div className="flex items-start justify-between">
                                                <div className="font-mono text-xs break-words text-gray-800 dark:text-gray-300 whitespace-pre-wrap pr-3">
                                                    {item.line}
                                                </div>
                                                <button className="ml-2 text-xs text-blue-600 dark:text-blue-400  focus:outline-none whitespace-nowrap">
                                                    {expandedRows[rowKey] ? "Collapse" : "Expand"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedRows[rowKey] && (
                                        <tr className="bg-gray-50 dark:bg-gray-800">
                                            <td colSpan={3} className="px-4 py-3">
                                                <div className="space-y-4">
                                                    {item.segmentation.segments.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">
                                                                Segments
                                                            </h4>
                                                            <table className="w-full text-xs border-collapse">
                                                                <thead className="bg-gray-100 dark:bg-gray-700">
                                                                    <tr>
                                                                        <th className="px-2 py-1 text-left border-border">
                                                                            Type
                                                                        </th>
                                                                        <th className="px-2 py-1 text-left border-border">
                                                                            Content
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {item.segmentation.segments.map(([type, text], index) => (
                                                                        <tr
                                                                            key={index}
                                                                            className="border-b border-border"
                                                                        >
                                                                            <td className="px-2 py-1 border-border align-top">
                                                                                <span
                                                                                    className={`inline-block px-2 py-0.5 text-xs rounded-full ${getSegmentTypeColor(
                                                                                        type
                                                                                    )}`}
                                                                                >
                                                                                    {type}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-2 py-1 border-border font-mono whitespace-pre-wrap">
                                                                                {text}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                    {getRelevantMetadata(item.metadata).length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">
                                                                Metadata
                                                            </h4>
                                                            <table className="w-full text-xs border-collapse">
                                                                <thead className="bg-gray-100 dark:bg-gray-700">
                                                                    <tr>
                                                                        <th className="px-2 py-1 text-left border-border">
                                                                            Key
                                                                        </th>
                                                                        <th className="px-2 py-1 text-left border-border">
                                                                            Value
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {getRelevantMetadata(item.metadata).map(([key, value], index) => (
                                                                        <tr
                                                                            key={index}
                                                                            className="border-b border-border"
                                                                        >
                                                                            <td className="px-2 py-1 border-border">
                                                                                {key}
                                                                            </td>
                                                                            <td className="px-2 py-1 border-border">
                                                                                {value}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                    {item.clean_line && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">
                                                                Clean Line
                                                            </h4>
                                                            <div className="p-2 bg-textured border-border rounded font-mono text-xs whitespace-pre-wrap">
                                                                {item.clean_line}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <h4 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">
                                                            Raw Data
                                                        </h4>
                                                        <div className="p-2 bg-textured border-border rounded">
                                                            <pre className="text-xs overflow-auto max-h-40">
                                                                {JSON.stringify(item, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default SectionGroupTab;