// parser.ts

import { parseMarkdownTable } from "../bock-processors/parse-markdown-table";
import { ParsedContent, Section } from "@/components/mardown-display/types";

export function enhancedMarkdownParser(markdown: string): ParsedContent {
  // Split into lines (preserve full lines for table parsing)
  const allLines = markdown.split("\n");

  // Regex helpers
  const isHeading = (line: string) => /^#{1,3}\s+/.test(line.trim());
  const isBoldHeading = (line: string) => /^\*\*[^*]+\*\*$/.test(line.trim());
  const isDivider = (line: string) => /^={3,}$/.test(line.trim());
  const isListItem = (line: string) =>
    /^[*-]\s+/.test(line.trim()) || /^\d+\.\s+/.test(line.trim());

  // Remove inline bold
  const extractBold = (text: string) => text.replace(/\*\*(.*?)\*\*/g, "$1");

  // Final results
  let intro = "";
  let sections: Section[] = [];
  let outro = "";

  // State for current section
  let currentSection: Section | null = null;
  let hasSeenFirstItem = false; // used to split a section's intro vs. outro
  let collectingIntro = true; // top-level intro until the first heading/divider
  let collectingOutro = false; // after final heading or divider

  // Helper: finalize (push) the current section
  function finalizeSection() {
    if (currentSection) {
      sections.push(currentSection);
      currentSection = null;
    }
    hasSeenFirstItem = false;
  }

  // Main loop uses manual index to let us jump over table lines
  let i = 0;
  while (i < allLines.length) {
    const rawLine = allLines[i];
    const trimmed = rawLine.trim();

    // 1. Divider => finalize section
    if (isDivider(trimmed)) {
      finalizeSection();
      collectingIntro = false; // no longer top-level intro
      collectingOutro = false; // not top-level outro yet (until after last heading)
      i++;
      continue;
    }

    // 2. Heading => finalize old section, create new
    if (isHeading(trimmed) || isBoldHeading(trimmed)) {
      // finalize old
      finalizeSection();
      collectingIntro = false;
      collectingOutro = false;

      // remove heading markers
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
        outro: "",
      };

      i++;
      continue;
    }

    // 3. Check if line starts with "|". If so, we might parse a table block
    //    We'll gather consecutive lines that start with "|"
    if (trimmed.startsWith("|")) {
      // Collect consecutive table lines
      const tableLines: string[] = [];
      let j = i;
      while (j < allLines.length && allLines[j].trim().startsWith("|")) {
        tableLines.push(allLines[j]);
        j++;
      }

      // Attempt to parse as table
      const tableBlock = tableLines.join("\n");
      const tableData = parseMarkdownTable(tableBlock);

      if (tableData?.markdown) {
        if (!currentSection) {
          outro += (outro ? "\n" : "") + "[Table found outside any section]";
        } else {
          currentSection.tables.push({
            title: currentSection.title,
            data: tableData.markdown,
          });
        }

        i = j;
        continue;
      } else {
      }
    }

    // 4. Check if it's a list item
    if (isListItem(trimmed)) {
      if (!currentSection) {
        // top-level list item => might still be in global intro or outro
        if (collectingIntro) {
          intro += (intro ? "\n" : "") + extractBold(trimmed);
        } else if (collectingOutro) {
          outro += (outro ? "\n" : "") + extractBold(trimmed);
        }
      } else {
        // we're in a section
        const match = trimmed.match(/^([*\-]|\d+\.)\s+(.*)/);
        if (match) {
          currentSection.items.push({ name: extractBold(match[2]) });
          hasSeenFirstItem = true;
        }
      }
      i++;
      continue;
    }

    // 5. Plain text line
    if (!currentSection) {
      // not in any section => global intro or outro
      if (collectingIntro) {
        if (trimmed.length) {
          intro += (intro ? "\n" : "") + extractBold(trimmed);
        }
      } else {
        // collectingOutro = true
        collectingOutro = true;
        if (trimmed.length) {
          outro += (outro ? "\n" : "") + extractBold(trimmed);
        }
      }
    } else {
      // within a section
      if (!hasSeenFirstItem) {
        // goes into section intro
        if (trimmed.length) {
          if (currentSection.intro) {
            currentSection.intro += " ";
          }
          currentSection.intro += extractBold(trimmed);
        }
      } else {
        // goes into section outro
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

  // Finalize the last section if open
  finalizeSection();

  return {
    intro: intro.trim(),
    sections,
    outro: outro.trim(),
  };
}

export default enhancedMarkdownParser;
