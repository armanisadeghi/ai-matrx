"use client";

import { getCoordinatorConfig } from "./markdown-coordinator";
import { AstNode } from "./processors/types";
import { ViewId } from "./custom-views/view-registry";
import { executeProcessorWithConfigId } from "./processors/processor-registry";

// Helper to check if code is running on client side
const isClient = typeof window !== "undefined";

export const parseMarkdownToAst = async (markdownText: string): Promise<AstNode> => {
    // Only run parser on the client side
    if (!isClient) {
        return { type: "root", children: [] } as unknown as AstNode;
    }

    try {
        // Dynamically import the modules only on client side
        const [unified, remarkParse, remarkGfm] = await Promise.all([
            import("unified").then((m) => m.unified),
            import("remark-parse").then((m) => m.default),
            import("remark-gfm").then((m) => m.default),
        ]);

        const processor = unified().use(remarkParse).use(remarkGfm);
        return processor.parse(markdownText) as unknown as AstNode;
    } catch (error) {
        console.error("Error parsing markdown to AST:", error);
        return { type: "root", children: [] } as unknown as AstNode;
    }
};

export type ViewComponentInfo = {
    defaultViewId: ViewId;
    availableViews: ViewId[];
    viewId: ViewId;
};

interface PrepareMarkdownForRenderingParams {
    markdown: string;
    processorId: string;
    processorConfigId?: string;
}

export const processMarkdownForRendering = async ({ markdown, processorId, processorConfigId = "noConfig" }: PrepareMarkdownForRenderingParams) => {
    // Return default values when not on client side
    if (!isClient) {
        const emptyAst = { type: "root", children: [] } as unknown as AstNode;
        return {
            ast: emptyAst,
            processedData: { content: emptyAst, metadata: {} },
        };
    }

    const ast = await parseMarkdownToAst(markdown);
    const processedData = await executeProcessorWithConfigId(processorId, ast, processorConfigId);

    return {
        ast,
        processedData,
    };
};

interface ProcessMarkdownForRenderingWithCoordinatorParams {
    markdown: string;
    coordinatorId: string;
}

export const processMarkdownForRenderingWithCoordinator = async ({ markdown, coordinatorId }: ProcessMarkdownForRenderingWithCoordinatorParams) => {
    // Return default values when not on client side
    if (!isClient) {
        const emptyAst = { type: "root", children: [] } as unknown as AstNode;
        return {
            ast: emptyAst,
            processedData: { content: emptyAst, metadata: {} },
        };
    }
    
    const coordinatorDefinition = getCoordinatorConfig(coordinatorId);
    if (!coordinatorDefinition) {
        const emptyAst: AstNode = { type: "root", children: [] };
        return {
            ast: emptyAst,
            processedData: { content: emptyAst, metadata: {} },
        };
    }
    const processedData = await processMarkdownForRendering({
        markdown,
        processorId: coordinatorDefinition.processor,
        processorConfigId: coordinatorDefinition.config ?? undefined,
    });
    return processedData;
};
