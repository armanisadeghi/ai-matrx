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
        for (const child of paragraph.children) {
            if (child.type === "strong" && !title) {
                title = extractText(child).replace(/^\*\*|\*\*$/g, "");
            } else {
                textParts.push(extractText(child));
            }
        }
    }

    // Clean the text: remove leading colons, dashes, and normalize whitespace
    let text = textParts.join("").trim();
    text = text.replace(/^[-\s:]+/, "").trim();

    return {
        title: title, // Empty string if no strong text
        text: text || extractText(paragraph).replace(/^[-\s:]+/, "").trim(),
    };
}

// Helper function to process nested lists
function extractNestedListText(list: AstNode): string[] {
    if (list.type !== "list" || !list.children) {
        return [];
    }

    const nestedItems: string[] = [];
    for (const listItem of list.children) {
        if (listItem.type === "listItem" && listItem.children) {
            for (const child of listItem.children) {
                if (child.type === "paragraph") {
                    const { title, text } = extractTitleAndText(child);
                    // Combine title and text, only include title if it exists
                    const itemText = title ? `**${title}**: ${text}` : text;
                    if (itemText) {
                        nestedItems.push(itemText);
                    }
                }
            }
        }
    }

    return nestedItems;
}

interface IntroOutroListProcessorInput {
    ast: AstNode;
    config: Record<string, unknown>;
}

export function introOutroNestedListProcessor({ ast, config }: IntroOutroListProcessorInput): OutputContent {
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

    let listCounter = 0;

    for (const child of ast.children) {
        if (child.type === "paragraph" && listCounter === 0) {
            // Handle intro (first paragraph before list)
            const { title, text } = extractTitleAndText(child);
            output.intro = { title, text: text || extractText(child) };
        } else if (child.type === "list" && child.ordered) {
            // Handle ordered list
            listCounter++;
            if (child.children) {
                let id = 1;
                for (const listItem of child.children) {
                    if (listItem.type === "listItem" && listItem.children) {
                        let itemTitle = "";
                        let itemText = "";
                        let nestedItems: string[] = [];

                        // Process all children of the list item
                        for (const itemChild of listItem.children) {
                            if (itemChild.type === "paragraph") {
                                const { title, text } = extractTitleAndText(itemChild);
                                itemTitle = title || `Item ${id}`;
                                itemText = text || extractText(itemChild);
                            } else if (itemChild.type === "list") {
                                // Handle nested list
                                nestedItems = extractNestedListText(itemChild);
                                if (nestedItems.length > 0) {
                                    output.hasNestedLists = true;
                                }
                            }
                        }

                        // Assign text: use nestedItems if present, otherwise use itemText
                        const finalText = nestedItems.length > 0 ? nestedItems : itemText;

                        output.items.push({
                            id: id++,
                            title: itemTitle,
                            text: finalText,
                        });
                    }
                }
            }
        } else if (child.type === "paragraph" && listCounter > 0) {
            // Handle outro (paragraph after list)
            const { title, text } = extractTitleAndText(child);
            output.outro = { title, text: text || extractText(child) };
        }
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

export default introOutroNestedListProcessor;