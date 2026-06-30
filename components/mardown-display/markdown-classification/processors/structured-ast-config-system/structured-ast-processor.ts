import combinedProcessor from "../custom/combined-processor";
import { AstNode } from "../types";

// Configuration type for structured output
export interface StructuredConfig {
    groupTrigger: {
        type: string; // Node type to identify a group (e.g., 'heading')
        contentPattern: string; // Regex or exact content to match group headings
        depth?: number; // Optional depth to filter group nodes
    };
    fields: {
        [key: string]: {
            trigger?: {
                type: string; // Node type to trigger field (e.g., 'listItem - text - strong')
                content?: string; // Exact content to match (e.g., 'App Name')
            };
            contentPath?: {
                type: string; // Node type to extract content from (e.g., 'text')
                depth?: number; // Optional depth to filter content nodes
            };
            collectAllChildren?: boolean; // Collect all child content recursively
            useTriggerContent?: boolean; // Use the group trigger's content for this field
        };
    };
}

// Output type for structured groups
export interface StructuredOutput {
    groups: {
        [key: string]: string | string[];
    }[];
}

// Processor function to create structured output
export function processStructuredAST(nodes: any[], config: StructuredConfig): StructuredOutput {
    const output: StructuredOutput = { groups: [] };
    let currentGroup: { [key: string]: string | string[] } | null = null;

    // Recursive function to collect all child content
    function collectAllChildContent(node: any, content: string[] = []): string[] {
        if (node.content) {
            content.push(node.content);
        }
        if (node.children) {
            node.children.forEach((child) => collectAllChildContent(child, content));
        }
        return content;
    }

    // Recursive function to process a single node
    function processNode(node: any, depth: number) {
        // Check if this node triggers a new group
        if (
            node.type === config.groupTrigger.type &&
            node.content.match(config.groupTrigger.contentPattern) &&
            (!config.groupTrigger.depth || node.depth === config.groupTrigger.depth)
        ) {
            // Save previous group if exists
            if (currentGroup) {
                output.groups.push(currentGroup);
            }
            // Start new group
            currentGroup = {};
            // Handle fields that use the trigger content
            for (const [fieldKey, fieldConfig] of Object.entries(config.fields)) {
                if (fieldConfig.useTriggerContent) {
                    currentGroup[fieldKey] = node.content;
                }
            }
        }

        // Check for field triggers
        if (currentGroup) {
            for (const [fieldKey, fieldConfig] of Object.entries(config.fields)) {
                // Handle collectAllChildren
                if (fieldConfig.collectAllChildren && node !== currentGroup && fieldConfig.trigger) {
                    const trigger = fieldConfig.trigger;
                    if (
                        trigger.type === node.type &&
                        (!trigger.content || node.content === trigger.content)
                    ) {
                        const childContent = collectAllChildContent(node);
                        currentGroup[fieldKey] = ((currentGroup[fieldKey] as string[]) || []).concat(childContent);
                    }
                }
                // Handle specific content path
                else if (
                    fieldConfig.trigger &&
                    fieldConfig.contentPath &&
                    node.type === fieldConfig.trigger.type &&
                    node.content === fieldConfig.trigger.content
                ) {
                    const contentPath = fieldConfig.contentPath;
                    if (node.children) {
                        const contentNode = node.children.find(
                            (child) =>
                                child.type === contentPath.type &&
                                (!contentPath.depth || child.depth === contentPath.depth)
                        );
                        if (contentNode && contentNode.content) {
                            currentGroup[fieldKey] = contentNode.content;
                        }
                    }
                }
            }
        }

        // Process children recursively
        if (node.children && node.children.length > 0) {
            node.children.forEach((child) => processNode(child, depth + 1));
        }
    }

    // Process all nodes
    nodes.forEach((node) => processNode(node, 1));

    // Save the last group if exists
    if (currentGroup) {
        output.groups.push(currentGroup);
    }

    return output;
}

interface ProcessorInput {
    ast: AstNode;
    config: StructuredConfig;
}

export function processStructuredASTWithConfig({ ast, config }: ProcessorInput): StructuredOutput {
    const processedAst = combinedProcessor({ ast });

    return processStructuredAST(processedAst, config);
}

export default processStructuredASTWithConfig;
