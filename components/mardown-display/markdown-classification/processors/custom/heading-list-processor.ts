export interface Position {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
}

export interface AstNode {
    type: string;
    children?: AstNode[];
    value?: string;
    position?: Position;
    ordered?: boolean;
    start?: number;
    spread?: boolean;
    checked?: boolean | null;
    depth?: number;
}

// Define interfaces for the output structure
export interface ContentItem {
    id: number;
    title: string;
    text: string | string[];
}

export interface ContentSection {
    title: string; // Always a string, empty if no bold text
    text: string;
}

export interface OutputContent {
    intro: ContentSection;
    items: ContentItem[];
    outro: ContentSection;
    hasNestedLists: boolean;
}

// Helper function to extract text from a node and its children
function extractText(node: AstNode): string {
    if (node.type === "text") {
        return node.value || "";
    }
    if (node.type === "inlineCode") {
        return `\`${node.value || ""}\``;
    }
    if (node.type === "strong") {
        return `**${node.children ? node.children.map(extractText).join("") : ""}**`;
    }
    if (node.type === "emphasis") {
        return `*${node.children ? node.children.map(extractText).join("") : ""}*`;
    }
    if (node.children) {
        return node.children.map(extractText).join("");
    }
    return "";
}

// Helper function to extract title (from strong text) and remaining text
function extractTitleAndText(paragraph: AstNode): { title: string; text: string } {
    let title = "";
    const textParts: string[] = [];

    if (paragraph.children) {
        // Check if the first non-whitespace child is strong
        let firstNonWhitespaceIndex = -1;
        for (let i = 0; i < paragraph.children.length; i++) {
            const child = paragraph.children[i];
            if (child.type !== "text" || child.value?.trim()) {
                firstNonWhitespaceIndex = i;
                break;
            }
        }

        // If the first non-whitespace child is strong, use it as title
        if (firstNonWhitespaceIndex !== -1 && paragraph.children[firstNonWhitespaceIndex].type === "strong") {
            for (const child of paragraph.children) {
                if (child.type === "strong" && !title) {
                    title = extractText(child).replace(/^\*\*|\*\*$/g, "");
                } else {
                    textParts.push(extractText(child));
                }
            }
        } else {
            // If strong is not first, treat the entire paragraph as text
            return {
                title: "",
                text: extractText(paragraph).replace(/^[-\s:]+/, "").trim(),
            };
        }
    }

    // Clean the text: remove leading colons, dashes, and normalize whitespace
    let text = textParts.join("").trim();
    text = text.replace(/^[-\s:]+/, "").trim();

    return {
        title: title, // Empty string if no strong text or strong is not first
        text: text || extractText(paragraph).replace(/^[-\s:]+/, "").trim(),
    };
}

// Helper function to process list items (used for sub-items under headings)
function extractListItems(list: AstNode): string[] {
    if (list.type !== "list" || !list.children) {
        return [];
    }

    const items: string[] = [];
    for (const listItem of list.children) {
        if (listItem.type === "listItem" && listItem.children) {
            for (const child of listItem.children) {
                if (child.type === "paragraph") {
                    const { title, text } = extractTitleAndText(child);
                    // Combine title and text if title exists, otherwise use full text
                    const itemText = title ? `**${title}**: ${text}` : text;
                    if (itemText) {
                        items.push(itemText);
                    }
                }
            }
        }
    }

    return items;
}

interface HeadingListProcessorInput {
    ast: AstNode;
    config: Record<string, unknown>;
}

export function headingListProcessor({ ast, config }: HeadingListProcessorInput): OutputContent {
    if (config && Object.keys(config).length > 0) {
        console.warn(
            "IntroOutroListProcessor Does NOT use configs but a config was provided. Config was: ",
            JSON.stringify(config, null, 2)
        );
    }
    const output: OutputContent = {
        intro: { title: "", text: "" },
        items: [],
        outro: { title: "", text: "" },
        hasNestedLists: false,
    };

    if (ast.type !== "root" || !ast.children) {
        throw new Error("Invalid AST: Expected root node with children");
    }

    let itemId = 1;
    let isAfterItems = false;

    for (let i = 0; i < ast.children.length; i++) {
        const child = ast.children[i];

        // Handle intro (first paragraph before any heading or thematic break)
        if (child.type === "paragraph" && !output.intro.text && !isAfterItems) {
            const { title, text } = extractTitleAndText(child);
            output.intro = { title, text: text || extractText(child) };
            continue;
        }

        // Handle main items (level-3 headings)
        if (child.type === "heading" && child.depth === 3) {
            // Extract full title from all text and strong children
            let title = "";
            if (child.children) {
                title = child.children
                    .map(child => {
                        if (child.type === "strong") {
                            // Extract inner text without markdown
                            return child.children ? child.children.map(extractText).join("") : "";
                        }
                        return extractText(child);
                    })
                    .join("")
                    .trim();
            }

            // Look for the next list node (sub-items)
            let subItems: string[] = [];
            if (i + 1 < ast.children.length && ast.children[i + 1].type === "list") {
                subItems = extractListItems(ast.children[i + 1]);
                if (subItems.length > 0) {
                    output.hasNestedLists = true;
                }
                i++; // Skip the list node since we processed it
            }

            // Add the item
            output.items.push({
                id: itemId++,
                title: title || `Item ${itemId}`,
                text: subItems.length > 0 ? subItems : "",
            });
            isAfterItems = true;
            continue;
        }

        // Handle outro (paragraph after items)
        if (child.type === "paragraph" && isAfterItems) {
            const { title, text } = extractTitleAndText(child);
            output.outro = { title, text: text || extractText(child) };
            continue;
        }

        // Ignore thematic breaks and other nodes
    }

    // Ensure all text fields are strings
    if (!output.intro.text) {
        output.intro.text = "";
    }
    if (!output.outro.text) {
        output.outro.text = "";
    }

    return output;
}

export default headingListProcessor;