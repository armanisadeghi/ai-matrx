import React from "react";
import combinedProcessor, {
    OutputNode,
    AstNode,
} from "@/components/mardown-display/markdown-classification/processors/custom/combined-processor";

interface AstRendererProps {
    data: AstNode;
    className?: string;
    animated?: boolean;
    isLoading?: boolean;
}

interface NodeRendererProps {
    node: OutputNode;
    isRoot?: boolean;
    animated?: boolean;
}

const NodeRenderer: React.FC<NodeRendererProps> = ({ node, isRoot = false, animated = true }) => {
    const getDepthIndentation = (depth: number) => {
        if (depth <= 0) return "";
        return `ml-${Math.min(depth * 3, 12)}`;
    };

    const getTypeStyles = (type: string) => {
        const baseClasses = animated ? "transition-all duration-200 ease-out" : "";

        switch (type) {
            case "heading":
                return `${baseClasses} text-gray-900 dark:text-gray-100 font-semibold mb-3 first:mt-0`;

            case "paragraph":
            case "text - paragraph":
                return `${baseClasses} text-gray-700 dark:text-gray-300 leading-relaxed mb-3 last:mb-0`;

            case "text - strong":
            case "strong":
                return `${baseClasses} font-medium text-gray-900 dark:text-gray-100`;

            case "text - emphasis":
            case "emphasis":
                return `${baseClasses} italic text-gray-700 dark:text-gray-300`;

            case "text":
                return `${baseClasses} text-gray-700 dark:text-gray-300`;

            case "table":
                return `${baseClasses} w-full border-collapse border-border my-4`;

            case "tableRow":
                return `${baseClasses}`;

            case "tableCell":
            case "text - tableCell":
            case "text - strong - tableCell":
                return `${baseClasses} px-3 py-2 text-sm border-border`;

            default:
                if (type.startsWith("listItem")) {
                    return `${baseClasses} text-gray-700 dark:text-gray-300 mb-1 flex items-start`;
                }
                return `${baseClasses} text-gray-700 dark:text-gray-300`;
        }
    };

    const renderListItem = (node: OutputNode) => {
        return (
            <div className={`${getTypeStyles(node.type)} ${getDepthIndentation(node.depth || 0)}`}>
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    {node.content && (
                        <span className={`${node.type.includes("strong") ? "font-medium text-gray-900 dark:text-gray-100" : ""}`}>
                            {node.content}
                        </span>
                    )}
                    {node.children && node.children.length > 0 && (
                        <div className="mt-1">
                            {node.children.map((child, index) => (
                                <NodeRenderer key={index} node={child} animated={animated} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderHeading = (node: OutputNode) => {
        const level = node.depth ? Math.min(node.depth + 1, 6) : 2;
        const HeadingTag = `h${level}` as `h${1 | 2 | 3 | 4 | 5 | 6}`;

        const sizeClasses: Record<`h${1 | 2 | 3 | 4 | 5 | 6}`, string> = {
            h1: "text-2xl",
            h2: "text-xl",
            h3: "text-lg",
            h4: "text-base",
            h5: "text-sm",
            h6: "text-sm",
        };

        return (
            <div className={`${getTypeStyles(node.type)} ${getDepthIndentation(node.depth || 0)}`}>
                {React.createElement(
                    HeadingTag,
                    {
                        className: sizeClasses[HeadingTag],
                    },
                    node.content
                )}
                {node.children && node.children.length > 0 && (
                    <div className="mt-2 ml-3">
                        {node.children.map((child, index) => (
                            <NodeRenderer key={index} node={child} animated={animated} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderTable = (node: OutputNode) => {
        return (
            <div className={getDepthIndentation(node.depth || 0)}>
                <table className={getTypeStyles("table")}>
                    <tbody>
                        {node.children && node.children.map((row, rowIndex) => (
                            <NodeRenderer key={rowIndex} node={row} animated={animated} />
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderTableRow = (node: OutputNode) => {
        return (
            <tr className={getTypeStyles("tableRow")}>
                {node.children && node.children.map((cell, cellIndex) => (
                    <NodeRenderer key={cellIndex} node={cell} animated={animated} />
                ))}
            </tr>
        );
    };

    const renderTableCell = (node: OutputNode) => {
        const isHeader = node.type.includes("strong");

        return React.createElement(
            isHeader ? "th" : "td",
            {
                className: `${getTypeStyles("tableCell")} ${isHeader ? "font-medium bg-gray-50 dark:bg-gray-800" : ""}`,
            },
            node.content
        );
    };

    if (node.type === "skip") {
        return null;
    }

    if (node.type.startsWith("listItem")) {
        return renderListItem(node);
    }

    if (node.type === "heading") {
        return renderHeading(node);
    }

    if (node.type === "table") {
        return renderTable(node);
    }

    if (node.type === "tableRow") {
        return renderTableRow(node);
    }

    if (node.type.includes("tableCell")) {
        return renderTableCell(node);
    }

    if (node.type === "text - strong" || node.type === "strong") {
        return (
            <div className={getDepthIndentation(node.depth || 0)}>
                <strong className={getTypeStyles(node.type)}>
                    {node.content}
                    {node.children && node.children.length > 0 && (
                        <span className="font-normal">
                            {node.children.map((child, index) => (
                                <NodeRenderer key={index} node={child} animated={animated} />
                            ))}
                        </span>
                    )}
                </strong>
            </div>
        );
    }

    if (node.type === "text - emphasis" || node.type === "emphasis") {
        return (
            <div className={getDepthIndentation(node.depth || 0)}>
                <em className={getTypeStyles(node.type)}>
                    {node.content}
                    {node.children && node.children.length > 0 && (
                        <span className="not-italic">
                            {node.children.map((child, index) => (
                                <NodeRenderer key={index} node={child} animated={animated} />
                            ))}
                        </span>
                    )}
                </em>
            </div>
        );
    }

    if (node.type === "paragraph" || node.type === "text - paragraph") {
        return (
            <div className={`${getTypeStyles(node.type)} ${getDepthIndentation(node.depth || 0)}`}>
                <span>{node.content}</span>
                {node.children && node.children.length > 0 && (
                    <div className="mt-2">
                        {node.children.map((child, index) => (
                            <NodeRenderer key={index} node={child} animated={animated} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Default text rendering
    return (
        <div className={getDepthIndentation(node.depth || 0)}>
            <span className={getTypeStyles(node.type)}>
                {node.content && <span>{node.content}</span>}
                {node.children && node.children.length > 0 && (
                    <span>
                        {node.children.map((child, index) => (
                            <NodeRenderer key={index} node={child} animated={animated} />
                        ))}
                    </span>
                )}
            </span>
        </div>
    );
};

const ModernAstRenderer: React.FC<AstRendererProps> = ({ data, className = "", animated = true, isLoading = false }) => {
    const processedNodes = combinedProcessor({ ast: data });

    if (isLoading) {
        return (
            <div className={`flex items-center justify-center py-8 ${className}`}>
                <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    <span className="text-sm">Loading...</span>
                </div>
            </div>
        );
    }

    if (!processedNodes || processedNodes.length === 0) {
        return (
            <div className={`flex items-center max-w-3xljustify-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
                <span className="text-sm">No content available</span>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto rounded-xl overflow-hidden shadow-lg bg-white dark:bg-slate-800">
            <div className={`p-3 prose prose-sm prose-gray dark:prose-invert max-w-none ${className}`}>
                <div className="space-y-4">
                    {processedNodes.map((node, index) => (
                        <NodeRenderer key={index} node={node} isRoot={true} animated={animated} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ModernAstRenderer;
