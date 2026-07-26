import { TaskItemType } from "./TaskChecklist";

// Parse markdown checklist format into structured data
export const parseMarkdownChecklist = (markdownText: string): TaskItemType[] => {
  const lines = markdownText.split('\n');
  const result: TaskItemType[] = [];
  let currentSection: TaskItemType | null = null;
  let insideSection = false;

  lines.forEach((line, index) => {
    // Section header (##)
    if (line.startsWith('##')) {
      insideSection = true;
      currentSection = {
        id: `section-${index}`,
        title: line.replace(/^##\s+/, '').trim(),
        type: 'section',
        children: []
      };
      result.push(currentSection);
    } 
    // Top-level task item (- or * followed by checkbox)
    else if (line.match(/^[-*]\s+\[([ x])\]/)) {
      // Match checkbox and capture all text after it
      const match = line.match(/^[-*]\s+\[([ x])\]\s+(.+)/);
      if (match) {
        const rawTitle = match[2].trim();
        // Check if title contains bold markers
        const boldMatch = rawTitle.match(/^\*\*(.*?)\*\*(.*)?$/);
        const title = boldMatch ? `${boldMatch[1]}${boldMatch[2] || ''}`.trim() : rawTitle;
        const item: TaskItemType = {
          id: `task-${index}-${title.replace(/[^a-zA-Z0-9]/g, '-')}`,
          title,
          type: 'task',
          bold: !!boldMatch,
          checked: match[1] === 'x',
          children: []
        };

        if (insideSection && currentSection) {
          currentSection.children?.push(item);
        } else {
          result.push(item);
        }
      }
    } 
    // Indented sub-task (2+ spaces with - [ ] OR indented * [ ] OR 2+ spaces [ ])
    else if (line.match(/^(?:\s{2,}-\s+\[([ x])\]|\s*\*\s+\[([ x])\]|\s{2,}\[([ x])\])\s+/)) {
      const match = line.match(/^(?:\s{2,}-\s+\[([ x])\]|\s*\*\s+\[([ x])\]|\s{2,}\[([ x])\])\s+(.+)/);
      if (match && result.length > 0) {
        const rawTitle = (match[4] || '').trim();
        // Check if title contains bold markers
        const boldMatch = rawTitle.match(/^\*\*(.*?)\*\*(.*)?$/);
        const title = boldMatch ? `${boldMatch[1]}${boldMatch[2] || ''}`.trim() : rawTitle;
        const checked = match[1] === 'x' || match[2] === 'x' || match[3] === 'x';
        const item: TaskItemType = {
          id: `subtask-${index}-${title.replace(/[^a-zA-Z0-9]/g, '-')}`,
          title,
          type: 'subtask',
          bold: !!boldMatch,
          checked,
        };

        const lastTopLevelItem = insideSection && currentSection?.children && currentSection.children.length > 0
          ? currentSection.children[currentSection.children.length - 1]
          : result[result.length - 1];

        if (lastTopLevelItem && lastTopLevelItem.children) {
          lastTopLevelItem.children.push(item);
        } else if (lastTopLevelItem) {
          lastTopLevelItem.children = [item];
        }
      }
    }
  });

  console.log("result", JSON.stringify(result, null, 2));

  return result;
};