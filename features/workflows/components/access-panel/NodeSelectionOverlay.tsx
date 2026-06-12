"use client";

import React from "react";
import { X, LucideIcon } from "lucide-react";

interface NodeDefinitionWithDescription {
    id: string;
    type?: string;
    icon: LucideIcon;
    label: string;
    description: string;
}

interface NodeSelectionOverlayProps {
    title: string;
    nodes: NodeDefinitionWithDescription[];
    onAddNode: (id: string, type?: string) => void;
    onClose: () => void;
    isOpen: boolean;
}

const NodeSelectionOverlay: React.FC<NodeSelectionOverlayProps> = ({
    title,
    nodes,
    onAddNode,
    onClose,
    isOpen,
}) => {
    const handleNodeClick = (node: NodeDefinitionWithDescription) => {
        onAddNode(node.id, node.type);
        onClose(); // Close overlay after selection
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleBackdropClick}
        >
            <div className="bg-textured rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80dvh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(80dvh-120px)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {nodes.map((node) => {
                            const IconComponent = node.icon;
                            return (
                                <button
                                    key={node.id}
                                    onClick={() => handleNodeClick(node)}
                                    className="group p-4 bg-white dark:bg-gray-700/50 border border-blue-200 dark:border-blue-800/50 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200 text-left"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700 group-hover:bg-blue-100 dark:group-hover:bg-blue-800/40 group-hover:scale-110 transition-all duration-200">
                                            <IconComponent className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1 group-hover:text-blue-700 dark:group-hover:text-blue-200 transition-colors">
                                                {node.label}
                                            </h3>
                                            <p className="text-sm text-blue-600 dark:text-blue-300 leading-relaxed">
                                                {node.description}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-border">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Choose a node to add to your workflow
                        </p>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-200"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NodeSelectionOverlay; 