import combinedProcessor, { AstNode, OutputNode } from '../custom/combined-processor';

// Configuration type for defining break points
export interface BreakConfig {
  key: string; // The key for the output object
  breakOn: {
    type?: string; // Node type to break on (e.g., 'heading')
    depth?: number; // Depth to break on
    content?: string; // Specific content to break on
  };
}

// Output type for the processed content
export interface ProcessedContent {
  [key: string]: string[];
}

// Main utility function to process AST
function processAST(nodes: OutputNode[], config: BreakConfig[]): ProcessedContent {
  const result: ProcessedContent = {};
  let currentKey: string | null = null;
  let currentContent: string[] = [];

  // Initialize result with empty arrays for each key
  config.forEach((cfg) => {
    result[cfg.key] = [];
  });

  // Recursive function to process a single node
  function processNode(node: OutputNode, depth: number) {
    // Check if this node triggers a break
    const breakConfig = config.find((cfg) =>
      (!cfg.breakOn.type || node.type === cfg.breakOn.type) &&
      (!cfg.breakOn.depth || node.depth === cfg.breakOn.depth) &&
      (!cfg.breakOn.content || node.content === cfg.breakOn.content)
    );

    if (breakConfig) {
      // If there's a current key, save accumulated content
      if (currentKey) {
        result[currentKey] = [...result[currentKey], ...currentContent];
        currentContent = [];
      }
      // Set new current key
      currentKey = breakConfig.key;
      // Include the break node's content
      if (node.content) {
        currentContent.push(node.content);
      }
    } else {
      // Add content to current content list if no break
      if (node.content) {
        currentContent.push(node.content);
      }
    }

    // Process children recursively
    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => processNode(child, depth + 1));
    }
  }

  // Process all nodes
  nodes.forEach((node) => processNode(node, 1));

  // Save any remaining content
  if (currentKey && currentContent.length > 0) {
    result[currentKey] = [...result[currentKey], ...currentContent];
  }

  return result;
}

interface ProcessorInput {
    ast: AstNode;
    config: BreakConfig[];
}

export function processASTWithConfig({ ast, config }: ProcessorInput): ProcessedContent {
    
    const processedAst = combinedProcessor({ ast });
    
    return processAST(processedAst, config);
}

export default processASTWithConfig;