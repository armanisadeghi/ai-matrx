import { replaceFences, unwrapCodeSpans } from "@/lib/markdown/code-ranges";
export const cleanMarkdown = (text: string): string => {
    if (!text || typeof text !== 'string') return '';

    let cleanedText = text;

    // Split the text into lines to process each line individually
    const lines = cleanedText.split('\n');
    const processedLines: string[] = [];

    for (let line of lines) {
        let processedLine = line;

        // Skip empty lines to preserve them
        if (processedLine.trim() === '') {
            processedLines.push(processedLine);
            continue;
        }

        // Remove headers (# Header) but keep the text
        processedLine = processedLine.replace(/^#{1,6}\s+(.+)$/, '$1');

        // Remove bold and italic markdown, keep content
        processedLine = processedLine.replace(/(\*\*|__)(.*?)\1/, '$2'); // Bold
        processedLine = processedLine.replace(/(\*|_)(.*?)\1/, '$2');    // Italic

        // Remove inline code backticks, keep content
        processedLine = unwrapCodeSpans(processedLine);

        // Remove link markup, keep link text
        processedLine = processedLine.replace(/\[([^\]]+)\]\(([^)]+)\)/, '$1');

        // Remove image markup, keep alt text
        processedLine = processedLine.replace(/!\[([^\]]*)\]\(([^)]+)\)/, '$1');

        // Remove blockquotes markers (>), keep content
        processedLine = processedLine.replace(/^>\s*(.+)$/, '$1');

        // Remove horizontal rules, as they carry no text content
        processedLine = processedLine.replace(/^(\*{3,}|-{3,}|_{3,})$/, '');

        // Remove list markers (-, *, +, 1.), keep list item content
        processedLine = processedLine.replace(/^(\s*[-+*]\s+|\s*\d+\.\s+)(.+)$/, '$2');

        // Remove HTML tags, keep content between tags
        processedLine = processedLine.replace(/<\/?[^>]+(>|$)/g, '');

        processedLines.push(processedLine);
    }

    // Join lines back together, preserving empty lines
    cleanedText = processedLines.join('\n');

    // Handle code blocks separately to preserve their internal whitespace
    // Fences by THE one code-range rule: keep the code, drop the fence lines.
    cleanedText = replaceFences(cleanedText, ({ body }) => body);

    return cleanedText;
};
