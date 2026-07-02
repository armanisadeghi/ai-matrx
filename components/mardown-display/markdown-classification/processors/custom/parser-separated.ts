import { parseMarkdownTable } from "../bock-processors/parse-markdown-table";

export interface ListItem {
    name: string;
    children?: ListItem[];
}

export interface CodeBlock {
    language: string;
    content: string;
}

export interface JsonBlock {
    [key: string]: unknown; // Parsed JSON (object, array, primitive, or null)
    parseError?: string; // Optional error message if parsing fails
}

export interface Section {
    title: string;
    intro: string;
    items: ListItem[];
    tables: { title: string; data: unknown }[];
    codeBlocks: CodeBlock[];
    jsonBlocks: JsonBlock[];
    outro: string;
}

export interface ParsedContent {
    intro: string;
    sections: Section[];
    outro: string;
}

export function separatedMarkdownParser(markdown: string): ParsedContent {
    const allLines = markdown.split("\n");
    const isHeading = (line: string) => /^#{1,3}\s+/.test(line.trim());
    const isBoldHeading = (line: string) => /^\*\*[^*]+\*\*$/.test(line.trim());
    const isDivider = (line: string) => /^(?:={3,}|-{3,}|\*{3,}|_{3,})$/.test(line.trim());
    const isListItem = (line: string) => /^[*\-]\s+/.test(line.trim()) || /^\d+\.\s+/.test(line.trim());
    const extractBold = (text: string) => text.replace(/\*\*(.*?)\*\*/g, "$1");

    let intro = "";
    let sections: Section[] = [];
    let outro = "";

    let currentSection: Section | null = null;
    let hasSeenFirstItem = false;
    let collectingIntro = true;
    let collectingOutro = false;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLanguage = "plaintext";

    function finalizeSection() {
        if (currentSection && (currentSection.intro || currentSection.outro || currentSection.items.length || currentSection.tables.length || currentSection.codeBlocks.length || currentSection.jsonBlocks.length)) {
            if (!currentSection.items) currentSection.items = [];
            if (!currentSection.codeBlocks) currentSection.codeBlocks = [];
            if (!currentSection.jsonBlocks) currentSection.jsonBlocks = [];
            sections.push(currentSection);
        }
        currentSection = null;
        hasSeenFirstItem = false;
    }

    let i = 0;
    while (i < allLines.length) {
        const rawLine = allLines[i];
        const trimmed = rawLine.trim();

        if (trimmed.startsWith("```")) {
            if (inCodeBlock) {
                const codeContent = codeBlockContent.join("\n");
                if (!currentSection) {
                    currentSection = {
                        title: "Code Block",
                        intro: "",
                        items: [],
                        tables: [],
                        codeBlocks: [],
                        jsonBlocks: [],
                        outro: "",
                    };
                }

                // Always store the raw content in codeBlocks
                currentSection.codeBlocks.push({
                    language: codeBlockLanguage,
                    content: codeContent,
                });

                // If JSON, parse and store in jsonBlocks
                if (codeBlockLanguage.toLowerCase() === "json") {
                    let jsonBlock: JsonBlock = {};
                    try {
                        jsonBlock = JSON.parse(codeContent);
                    } catch (error) {
                        jsonBlock.parseError = error instanceof Error ? error.message : "Invalid JSON";
                    }
                    currentSection.jsonBlocks.push(jsonBlock);
                }

                inCodeBlock = false;
                codeBlockContent = [];
                codeBlockLanguage = "plaintext";
            } else {
                inCodeBlock = true;
                codeBlockLanguage = trimmed.slice(3).trim() || "plaintext";
            }
            i++;
            continue;
        }

        if (inCodeBlock) {
            codeBlockContent.push(rawLine);
            i++;
            continue;
        }

        if (isDivider(trimmed)) {
            finalizeSection();
            collectingIntro = false;
            collectingOutro = false;
            i++;
            continue;
        }

        if (isHeading(trimmed) || isBoldHeading(trimmed)) {
            finalizeSection();
            collectingIntro = false;
            collectingOutro = false;

            let headingText = trimmed;
            if (isHeading(trimmed)) {
                headingText = headingText.replace(/^#{1,3}\s+/, "");
            } else {
                headingText = headingText.replace(/^\*\*(.*)\*\*$/, "$1");
            }

            currentSection = {
                title: extractBold(headingText),
                intro: "",
                items: [],
                tables: [],
                codeBlocks: [],
                jsonBlocks: [],
                outro: "",
            };

            i++;
            continue;
        }

        if (trimmed.startsWith("|")) {
            const tableLines: string[] = [];
            let j = i;
            while (j < allLines.length && allLines[j].trim().startsWith("|")) {
                tableLines.push(allLines[j]);
                j++;
            }

            const tableBlock = tableLines.join("\n");
            const tableData = parseMarkdownTable(tableBlock);

            if (tableData) {
                if (!currentSection) {
                    currentSection = {
                        title: "",
                        intro: "",
                        items: [],
                        tables: [],
                        codeBlocks: [],
                        jsonBlocks: [],
                        outro: "",
                    };
                }

                const alreadyExists = currentSection.tables.some(
                    (table) => JSON.stringify(table.data) === JSON.stringify(tableData)
                );

                if (!alreadyExists) {
                    currentSection.tables.push({
                        title: currentSection.title,
                        data: tableData,
                    });
                }

                i = j;
                continue;
            }
        }

        if (isListItem(rawLine)) {
            if (!currentSection) {
                if (collectingIntro) {
                    const [parsedList, linesConsumed] = parseListBlock(allLines, i, extractBold);
                    parsedList.forEach((item) => {
                        intro += (intro ? "\n" : "") + item.name;
                    });
                    i += linesConsumed;
                    continue;
                } else if (collectingOutro) {
                    const [parsedList, linesConsumed] = parseListBlock(allLines, i, extractBold);
                    parsedList.forEach((item) => {
                        outro += (outro ? "\n" : "") + item.name;
                    });
                    i += linesConsumed;
                    continue;
                }
            } else {
                const [parsedListItems, linesConsumed] = parseListBlock(allLines, i, extractBold);
                currentSection.items.push(...parsedListItems);
                hasSeenFirstItem = true;
                i += linesConsumed;
                continue;
            }
        }

        if (!currentSection) {
            if (collectingIntro) {
                if (trimmed.length) {
                    intro += (intro ? "\n" : "") + extractBold(trimmed);
                }
            } else {
                collectingOutro = true;
                if (trimmed.length) {
                    outro += (outro ? "\n" : "") + extractBold(trimmed);
                }
            }
        } else {
            if (!hasSeenFirstItem) {
                if (trimmed.length) {
                    if (currentSection.intro) {
                        currentSection.intro += " ";
                    }
                    currentSection.intro += extractBold(trimmed);
                }
            } else {
                if (trimmed.length) {
                    if (currentSection.outro) {
                        currentSection.outro += " ";
                    }
                    currentSection.outro += extractBold(trimmed);
                }
            }
        }

        i++;
    }

    finalizeSection();

    return {
        intro: intro.trim(),
        sections: sections.filter((section): section is Section => section !== null),
        outro: outro.trim(),
    };
}

function parseListBlock(lines: string[], startIndex: number, extractBold: (text: string) => string): [ListItem[], number] {
    const items: ListItem[] = [];
    const stack: Array<{ indent: number; list: ListItem[] }> = [{ indent: 0, list: items }];

    let i = startIndex;

    while (i < lines.length) {
        const rawLine = lines[i];
        if (!rawLine.trim()) {
            i++;
            continue;
        }
        if (!isListItem(rawLine)) {
            break;
        }
        const leadingSpaceMatch = rawLine.match(/^( +)/);
        const indent = leadingSpaceMatch ? leadingSpaceMatch[1].length : 0;

        const trimmed = rawLine.trim();
        const match = trimmed.match(/^([*\-]|\d+\.)\s+(.*)/);
        if (!match) {
            break;
        }
        const text = match[2];

        while (indent < stack[stack.length - 1].indent) {
            stack.pop();
        }
        if (indent > stack[stack.length - 1].indent) {
            const parentList = stack[stack.length - 1].list;
            const parentItem = parentList.length > 0 ? parentList[parentList.length - 1] : null;

            if (parentItem) {
                if (!parentItem.children) {
                    parentItem.children = [];
                }
                stack.push({ indent, list: parentItem.children });
            } else {
                stack[stack.length - 1].list.push({
                    name: extractBold(text),
                    children: [],
                });
            }
        }

        stack[stack.length - 1].list.push({
            name: extractBold(text),
        });

        i++;
    }

    return [items ?? [], i - startIndex];
}

function isListItem(line: string): boolean {
    const t = line.trim();
    return /^[*\-]\s+/.test(t) || /^\d+\.\s+/.test(t);
}


export default separatedMarkdownParser;