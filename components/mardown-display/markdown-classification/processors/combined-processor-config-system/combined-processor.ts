export interface OutputNode {
  type: string;
  content?: string;
  children?: OutputNode[];
  depth: number;
}

export interface AstNode {
  type: string;
  children?: AstNode[];
  value?: string;
  position?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  [key: string]: any;
}

interface ProcessorInput {
  ast: AstNode;
}

// Utility function to clean content
function cleanContent(content: string | undefined): string {
  if (!content) return "";

  // First trim any whitespace
  let trimmed = content.trim();

  // Then remove any leading or trailing colons, but keep spaces between them
  trimmed = trimmed.replace(/^:+\s*|\s*:+$/g, "");

  return trimmed;
}

// Helper function to combine parenthetical text nodes
function combineParentheticalNodes(nodes: OutputNode[]): OutputNode[] {
  const result: OutputNode[] = [];
  let i = 0;
  while (i < nodes.length) {
    const current = nodes[i];
    // Handle complete parenthetical expression: ( content )
    if (
      current.content === "(" &&
      i + 2 < nodes.length &&
      nodes[i + 2].content === ")"
    ) {
      const combinedContent = `(${nodes[i + 1].content})`;
      result.push({
        type: "text",
        content: combinedContent,
        depth: current.depth,
      });
      i += 3; // Skip the three nodes: (, content, )
    }
    // Handle incomplete parenthetical: text ending with ( or starting with )
    else if (
      current.type === "text" &&
      (current.content?.endsWith("(") || current.content?.startsWith(")"))
    ) {
      let combinedContent = current.content || "";
      let combinedDepth = current.depth;
      let endIndex = i + 1;

      // Merge with next text node if it exists
      const nextNode = nodes[i + 1];
      if (nextNode?.type === "text") {
        const nextContent = nextNode.content;
        // Add a space between the nodes if the current content doesn't end with a space
        // and the next content doesn't start with a space
        if (
          combinedContent &&
          !combinedContent.endsWith(" ") &&
          nextContent &&
          !nextContent.startsWith(" ")
        ) {
          combinedContent += " ";
        }
        combinedContent += nextContent || "";
        combinedDepth = Math.min(combinedDepth, nextNode.depth);
        endIndex = i + 2;
      }

      result.push({
        type: "text",
        content: combinedContent,
        depth: combinedDepth,
      });
      i = endIndex;
    } else {
      result.push(current);
      i++;
    }
  }
  return result;
}

// Helper function to merge standalone periods within children
function mergeStandalonePeriods(nodes: OutputNode[]): OutputNode[] {
  const result: OutputNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].content === "." && result.length > 0) {
      const prevNode = result[result.length - 1];
      // Add the period without adding an extra space
      prevNode.content = (prevNode.content || "") + ".";
    } else {
      const node = { ...nodes[i] };
      if (node.children) {
        node.children = mergeStandalonePeriods(node.children);
      }
      result.push(node);
    }
  }
  return result;
}

// Helper function to merge inline bold text with surrounding text
function mergeInlineBold(nodes: OutputNode[]): OutputNode[] {
  const result: OutputNode[] = [];
  let i = 0;
  while (i < nodes.length) {
    const current = nodes[i];
    // Skip merging if the bold text is the first node
    if (i > 0 && current.type === "text - strong") {
      // Look backward and forward to merge with adjacent text nodes
      let combinedContent = current.content || "";
      let combinedDepth = current.depth;
      let startIndex = i;
      let endIndex = i + 1;

      // Check previous node
      if (result.length > 0 && result[result.length - 1].type === "text") {
        const prevContent = result[result.length - 1].content || "";
        // Add a space if needed
        if (
          prevContent &&
          !prevContent.endsWith(" ") &&
          combinedContent &&
          !combinedContent.startsWith(" ")
        ) {
          combinedContent = prevContent + " " + combinedContent;
        } else {
          combinedContent = prevContent + combinedContent;
        }
        combinedDepth = result[result.length - 1].depth;
        result.pop(); // Remove the previous text node
        startIndex = i - 1;
      }

      // Check next node
      if (i + 1 < nodes.length && nodes[i + 1].type === "text") {
        const nextContent = nodes[i + 1].content || "";
        // Add a space if needed
        if (
          combinedContent &&
          !combinedContent.endsWith(" ") &&
          nextContent &&
          !nextContent.startsWith(" ")
        ) {
          combinedContent += " " + nextContent;
        } else {
          combinedContent += nextContent;
        }
        combinedDepth = Math.min(combinedDepth, nodes[i + 1].depth);
        endIndex = i + 2;
      }

      result.push({
        type: "text",
        content: combinedContent,
        depth: combinedDepth,
      });
      i = endIndex;
    } else {
      result.push(current);
      i++;
    }
  }
  return result;
}

export function combinedProcessor({ ast }: ProcessorInput): OutputNode[] {
  if (ast.type !== "root") {
    return processNode(ast, 0);
  }
  return processRoot(ast, 0);
}

function processNode(node: AstNode, parentDepth: number): OutputNode[] {
  const depth = node.depth !== undefined ? node.depth : parentDepth;
  let result: OutputNode[];
  switch (node.type) {
    case "root":
      result = processRoot(node, depth);
      break;
    case "text":
      result = [processText(node, depth)];
      break;
    case "paragraph":
      result = processParagraph(node, depth);
      break;
    case "heading":
      result = [processHeading(node, depth)];
      break;
    case "list":
      result = processList(node, depth);
      break;
    case "listItem":
      result = processListItem(node, depth);
      break;
    case "strong":
      result = processStrong(node, depth);
      break;
    case "break":
      result = [processBreak(node, depth)];
      break;
    case "thematicBreak":
      result = [{ type: "skip", content: "", depth }];
      break;
    case "table":
      result = processTable(node, depth);
      break;
    case "tableRow":
      result = [processTableRow(node, depth)];
      break;
    case "tableCell":
      result = [processTableCell(node, depth)];
      break;
    default:
      result = processDefault(node, depth);
      break;
  }
  // Apply parenthetical merging to the result
  return combineParentheticalNodes(result);
}

function processRoot(node: AstNode, parentDepth: number): OutputNode[] {
  if (!node.children) return [];
  const result: OutputNode[] = [];
  let i = 0;
  while (i < node.children.length) {
    const current = node.children[i];
    if (current.type === "thematicBreak") {
      i++;
      continue;
    }
    let processed = processNode(current, parentDepth);
    // Check if the next node is a list
    if (i + 1 < node.children.length && node.children[i + 1].type === "list") {
      const listNode = node.children[i + 1];
      const listChildren = processList(listNode, parentDepth);
      if (processed.length === 1) {
        processed = [
          {
            ...processed[0],
            children: [...(processed[0].children || []), ...listChildren],
          },
        ];
      } else {
        processed = [...processed, ...listChildren];
      }
      i += 2; // Skip the list node
    } else {
      i++;
    }
    result.push(...processed.filter((n) => n.type !== "skip"));
  }
  // Merge standalone periods
  return mergeStandalonePeriods(result);
}

function processText(node: AstNode, parentDepth: number): OutputNode {
  const content = cleanContent(node.value);
  // Skip creating text nodes with empty content
  if (!content) return { type: "skip", content: "", depth: parentDepth };
  return {
    type: "text",
    content,
    depth: node.depth !== undefined ? node.depth : parentDepth,
  };
}

function processParagraph(node: AstNode, parentDepth: number): OutputNode[] {
  const children = node.children
    ? node.children
        .flatMap((child) => processNode(child, parentDepth + 1))
        .filter((n) => n.type !== "skip")
    : [];
  const depth = node.depth !== undefined ? node.depth : parentDepth + 1;
  if (children.length === 0) return [];
  // Merge standalone periods and inline bold text
  let mergedChildren = mergeStandalonePeriods(children);
  mergedChildren = mergeInlineBold(mergedChildren);
  if (mergedChildren.length === 1 && !mergedChildren[0].children?.length) {
    return [
      {
        type: `text - paragraph`,
        content: cleanContent(mergedChildren[0].content),
        depth,
      },
    ];
  }
  if (mergedChildren.every((child) => child.type === "text")) {
    // Join with spaces and then clean, but preserve intentional spacing
    const joinedContent = mergedChildren.map((c) => c.content || "").join(" ");
    const content = joinedContent
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^:+|:+$/g, "");
    if (!content) return [];
    return [
      {
        type: "paragraph",
        content,
        depth,
      },
    ];
  }
  return mergedChildren;
}

function processHeading(node: AstNode, parentDepth: number): OutputNode {
  const children = node.children
    ? node.children
        .flatMap((child) => processNode(child, parentDepth + 1))
        .filter((n) => n.type !== "skip")
    : [];

  // Join with spaces and preserve intentional spacing
  const joinedContent = children.map((child) => child.content || "").join(" ");
  const content = joinedContent
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^:+|:+$/g, "");

  if (!content) return { type: "skip", content: "", depth: parentDepth };
  return {
    type: "heading",
    content,
    depth: node.depth !== undefined ? node.depth : parentDepth,
  };
}

function processList(node: AstNode, parentDepth: number): OutputNode[] {
  if (!node.children) return [];
  const children = node.children
    .flatMap((child) => processNode(child, parentDepth))
    .filter((n) => n.type !== "skip");
  return children;
}

function processListItem(node: AstNode, parentDepth: number): OutputNode[] {
  const children = node.children
    ? node.children
        .flatMap((child) => processNode(child, parentDepth + 1))
        .filter((n) => n.type !== "skip")
    : [];
  const depth = node.depth !== undefined ? node.depth : parentDepth + 1;
  if (children.length === 0) return [];
  // Merge standalone periods and inline bold text
  let mergedChildren = mergeStandalonePeriods(children);
  mergedChildren = mergeInlineBold(mergedChildren);
  if (mergedChildren.length === 1) {
    const child = mergedChildren[0];
    return [
      {
        type: `listItem - ${child.type}`,
        content: cleanContent(child.content),
        children: child.children || undefined,
        depth,
      },
    ];
  }

  // If we have multiple children, make sure content is properly spaced
  const firstChild = mergedChildren[0];
  // Process the remaining children to ensure they don't get stuck together
  const remainingChildren = mergedChildren.slice(1).map((child) => {
    if (child.content && typeof child.content === "string") {
      return {
        ...child,
        content: child.content.trim(), // Make sure each child's content is properly trimmed
      };
    }
    return child;
  });

  return [
    {
      type: `listItem - ${firstChild.type}`,
      content: cleanContent(firstChild.content),
      children: remainingChildren,
      depth,
    },
  ];
}

function processStrong(node: AstNode, parentDepth: number): OutputNode[] {
  const children = node.children
    ? node.children
        .flatMap((child) => processNode(child, parentDepth + 1))
        .filter((n) => n.type !== "skip")
    : [];
  const depth = node.depth !== undefined ? node.depth : parentDepth + 1;
  if (children.length === 0) return [];
  if (children.length === 1 && !children[0].children?.length) {
    return [
      {
        type: `text - strong`,
        content: cleanContent(children[0].content),
        depth,
      },
    ];
  }
  if (children.every((child) => child.type === "text")) {
    // Join with spaces and then clean, but preserve intentional spacing
    const joinedContent = children.map((c) => c.content || "").join(" ");
    const content = joinedContent
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^:+|:+$/g, "");
    if (!content) return [];
    return [
      {
        type: "strong",
        content,
        depth,
      },
    ];
  }
  return children;
}

function processTable(node: AstNode, parentDepth: number): OutputNode[] {
  if (!node.children) return [];
  const depth = node.depth !== undefined ? node.depth : parentDepth;

  // Process all table rows and collect them as children
  const rows = node.children
    .flatMap((row) => processNode(row, depth + 1))
    .filter((n) => n.type !== "skip");

  return [
    {
      type: "table",
      children: rows,
      depth,
    },
  ];
}

function processTableRow(node: AstNode, parentDepth: number): OutputNode {
  if (!node.children) return { type: "skip", content: "", depth: parentDepth };
  const depth = node.depth !== undefined ? node.depth : parentDepth;

  // Process all table cells and collect them as children
  const cells = node.children
    .flatMap((cell) => processNode(cell, depth + 1))
    .filter((n) => n.type !== "skip");

  return {
    type: "tableRow",
    children: cells,
    depth,
  };
}

function processTableCell(node: AstNode, parentDepth: number): OutputNode {
  const children = node.children
    ? node.children
        .flatMap((child) => processNode(child, parentDepth + 1))
        .filter((n) => n.type !== "skip")
    : [];
  const depth = node.depth !== undefined ? node.depth : parentDepth + 1;

  if (children.length === 0) return { type: "skip", content: "", depth };

  // Merge standalone periods and inline bold text
  let mergedChildren = mergeStandalonePeriods(children);
  mergedChildren = mergeInlineBold(mergedChildren);

  if (mergedChildren.length === 1 && !mergedChildren[0].children?.length) {
    return {
      type: `${mergedChildren[0].type} - tableCell`,
      content: cleanContent(mergedChildren[0].content),
      depth,
    };
  }

  if (mergedChildren.every((child) => child.type === "text")) {
    // Join with spaces and then clean, but preserve intentional spacing
    const joinedContent = mergedChildren.map((c) => c.content || "").join(" ");
    const content = joinedContent
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^:+|:+$/g, "");

    if (!content) return { type: "skip", content: "", depth };

    return {
      type: "tableCell",
      content,
      depth,
    };
  }

  return {
    type: "tableCell",
    children: mergedChildren,
    depth,
  };
}

function processBreak(node: AstNode, parentDepth: number): OutputNode {
  return {
    type: "skip",
    content: "",
    depth: node.depth !== undefined ? node.depth : parentDepth,
  };
}

function processDefault(node: AstNode, parentDepth: number): OutputNode[] {
  const children = node.children
    ? node.children
        .flatMap((child) => processNode(child, parentDepth + 1))
        .filter((n) => n.type !== "skip")
    : [];
  const depth = node.depth !== undefined ? node.depth : parentDepth + 1;
  if (children.length === 0) return [];
  if (children.length === 1 && !children[0].children?.length) {
    return [
      {
        type: `${children[0].type} - ${node.type}`,
        content: cleanContent(children[0].content),
        depth,
      },
    ];
  }
  if (children.every((child) => child.type === "text")) {
    // Join with spaces and then clean, but preserve intentional spacing
    const joinedContent = children.map((c) => c.content || "").join(" ");
    const content = joinedContent
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^:+|:+$/g, "");
    if (!content) return [];
    return [
      {
        type: node.type,
        content,
        depth,
      },
    ];
  }
  return children;
}

export default combinedProcessor;
