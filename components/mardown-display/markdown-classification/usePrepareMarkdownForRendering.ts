"use client";

import {
  CoordinatorDefinition,
  getCoordinatorConfig,
} from "./markdown-coordinator";
import { AstNode } from "./processors/types";
import { ViewId } from "./custom-views/view-registry";
import { useEffect, useState } from "react";
import { executeProcessorWithConfigId } from "./processors/processor-registry";

// Helper to check if code is running on client side
const isClient = typeof window !== "undefined";

export const parseMarkdownToAst = async (
  markdownText: string,
): Promise<AstNode> => {
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
  coordinatorId?: string | null;
  requestedView?: ViewId | "default";
  requestedProcessor?: string | "default";
  requestedProcessorConfig?: string | "default";
}

export const usePrepareMarkdownForRendering = ({
  markdown,
  coordinatorId,
  requestedView = "default",
  requestedProcessor = "default",
  requestedProcessorConfig = "default",
}: PrepareMarkdownForRenderingParams) => {
  const [coordinatorDefinition, setCoordinatorDefinition] =
    useState<CoordinatorDefinition | null>(null);
  const [ast, setAst] = useState<AstNode | null>(null);
  const [processorId, setProcessorId] = useState<string | null>(null);
  const [processorConfigId, setProcessorConfigId] = useState<string | null>(
    null,
  );
  const [viewId, setViewId] = useState<ViewId | null>(null);
  const [processedData, setProcessedData] = useState<any | null>(null);

  // Handle requested view
  useEffect(() => {
    if (requestedView !== "default") {
      setViewId(requestedView);
    }
  }, [requestedView]);

  // Handle requested processor
  useEffect(() => {
    if (requestedProcessor !== "default") {
      setProcessorId(requestedProcessor);
    }
  }, [requestedProcessor]);

  // Handle requested processor config
  useEffect(() => {
    if (requestedProcessorConfig !== "default") {
      setProcessorConfigId(requestedProcessorConfig);
    }
  }, [requestedProcessorConfig]);

  // Handle coordinator configuration
  useEffect(() => {
    if (coordinatorId) {
      const coordDef = getCoordinatorConfig(coordinatorId);
      if (coordDef) {
        setCoordinatorDefinition(coordDef);
        if (!processorId) {
          setProcessorId(coordDef.processor);
        }
        if (!processorConfigId) {
          setProcessorConfigId(coordDef.config);
        }
        if (!viewId) {
          setViewId(coordDef.defaultView);
        }
      }
    }
  }, [coordinatorId, processorId, processorConfigId, viewId]);

  // Parse markdown to AST
  useEffect(() => {
    if (isClient && markdown) {
      const parseMarkdown = async () => {
        const parsedAst = await parseMarkdownToAst(markdown);
        setAst(parsedAst);
      };
      parseMarkdown();
    }
  }, [markdown]);

  useEffect(() => {
    if (isClient && ast && processorId && processorConfigId) {
      const processData = async () => {
        const data = await executeProcessorWithConfigId(
          processorId,
          ast,
          processorConfigId,
        );
        setProcessedData(data);
      };
      processData();
    }
  }, [ast, processorId, processorConfigId]);

  return {
    ast,
    processedData,
    coordinatorDefinition,
    viewId,
  };
};
