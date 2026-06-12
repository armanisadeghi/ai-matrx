/**
 * canvas-block-meta.ts
 *
 * Central registry of per-block-type metadata used for:
 *  - Server-side SEO (generateMetadata / opengraph-image / icon)
 *  - OG image generation
 *  - Per-route favicon color/symbol
 *  - Description templates
 *
 * Add a new entry here whenever a new canvas type is registered in canvasSlice.ts.
 */

export interface CanvasBlockMeta {
  /** Human-readable label shown in UI and OG titles */
  label: string;
  /** Short phrase for OG image badge */
  badge: string;
  /** Description template — {title} and {creator} are replaced at runtime */
  descriptionTemplate: string;
  /** SEO keywords specific to this block type */
  keywords: string[];
  /**
   * Brand color used in OG image header and favicon background.
   * Must be a valid CSS hex color.
   */
  color: string;
  /**
   * SVG path data for the block icon (24×24 viewBox).
   * Taken from Lucide icon paths — single path or array of paths.
   */
  iconPaths: string[];
  /** Lucide icon name — used for documentation / matching only */
  iconName: string;
  /** Emoji fallback for environments that can't render SVG */
  emoji: string;
}

export const CANVAS_BLOCK_META: Record<string, CanvasBlockMeta> = {
  quiz: {
    label: 'Quiz',
    badge: 'Interactive Quiz',
    descriptionTemplate: 'Take the quiz "{title}" — test your knowledge and see how you score.',
    keywords: ['quiz', 'test', 'multiple choice', 'trivia', 'assessment', 'study', 'education'],
    color: '#7c3aed', // violet-700
    iconPaths: [
      'M9 12l2 2 4-4',
      'M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.745 3.745 0 0 1 3.296-1.043A3.745 3.745 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.745 3.745 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12z',
    ],
    iconName: 'BadgeCheck',
    emoji: '📝',
  },

  flashcards: {
    label: 'Flashcards',
    badge: 'Flashcard Deck',
    descriptionTemplate: 'Study "{title}" with interactive flashcards — flip, review, and master the material.',
    keywords: ['flashcards', 'study', 'memorize', 'review', 'spaced repetition', 'learning', 'education'],
    color: '#0891b2', // cyan-600
    iconPaths: [
      'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z',
      'M12 12h.01',
    ],
    iconName: 'CreditCard',
    emoji: '🃏',
  },

  presentation: {
    label: 'Presentation',
    badge: 'Slideshow',
    descriptionTemplate: 'View the presentation "{title}" — an interactive slideshow on AI Matrx.',
    keywords: ['presentation', 'slides', 'slideshow', 'deck', 'visual', 'talk', 'lecture'],
    color: '#dc2626', // red-600
    iconPaths: [
      'M2 3h20',
      'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3',
      'M7 21h10',
      'M12 17v4',
    ],
    iconName: 'Presentation',
    emoji: '🎞️',
  },

  recipe: {
    label: 'Recipe',
    badge: 'Recipe',
    descriptionTemplate: 'Cook "{title}" — ingredients, instructions, and tips all in one place.',
    keywords: ['recipe', 'cooking', 'food', 'ingredients', 'instructions', 'meal', 'cuisine'],
    color: '#ea580c', // orange-600
    iconPaths: [
      'M15 11h.01',
      'M11 15h.01',
      'M16 16h.01',
      'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z',
    ],
    iconName: 'UtensilsCrossed',
    emoji: '🍽️',
  },

  timeline: {
    label: 'Timeline',
    badge: 'Timeline',
    descriptionTemplate: 'Explore "{title}" — an interactive chronological timeline of events.',
    keywords: ['timeline', 'history', 'chronology', 'events', 'sequence', 'dates'],
    color: '#16a34a', // green-600
    iconPaths: [
      'M3 3h.01',
      'M3 12h.01',
      'M3 21h.01',
      'M7 6h14',
      'M7 12h14',
      'M7 18h14',
    ],
    iconName: 'ListOrdered',
    emoji: '📅',
  },

  research: {
    label: 'Research',
    badge: 'Research',
    descriptionTemplate: 'Read the research on "{title}" — sourced findings and analysis on AI Matrx.',
    keywords: ['research', 'analysis', 'study', 'findings', 'report', 'data', 'science'],
    color: '#2563eb', // blue-600
    iconPaths: [
      'M12 20h9',
      'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
    ],
    iconName: 'FileText',
    emoji: '🔬',
  },

  resources: {
    label: 'Resources',
    badge: 'Resource Collection',
    descriptionTemplate: 'Explore "{title}" — a curated collection of resources and links.',
    keywords: ['resources', 'links', 'collection', 'reference', 'tools', 'materials'],
    color: '#9333ea', // purple-600
    iconPaths: [
      'M3 6h18',
      'M3 10h18',
      'M3 14h18',
      'M3 18h18',
    ],
    iconName: 'BookMarked',
    emoji: '📚',
  },

  progress: {
    label: 'Progress Tracker',
    badge: 'Progress Tracker',
    descriptionTemplate: 'Track progress on "{title}" — milestones, goals, and completion status.',
    keywords: ['progress', 'tracker', 'goals', 'milestones', 'completion', 'status', 'checklist'],
    color: '#0d9488', // teal-600
    iconPaths: [
      'M22 12h-4l-3 9L9 3l-3 9H2',
    ],
    iconName: 'Activity',
    emoji: '📊',
  },

  comparison: {
    label: 'Comparison',
    badge: 'Comparison Table',
    descriptionTemplate: 'Compare "{title}" — a side-by-side breakdown of options and features.',
    keywords: ['comparison', 'table', 'versus', 'pros cons', 'difference', 'analysis'],
    color: '#4f46e5', // indigo-600
    iconPaths: [
      'M3 3h18v18H3z',
      'M12 3v18',
      'M3 12h18',
    ],
    iconName: 'Table',
    emoji: '⚖️',
  },

  troubleshooting: {
    label: 'Troubleshooting Guide',
    badge: 'Troubleshooting',
    descriptionTemplate: 'Fix it fast with "{title}" — a step-by-step troubleshooting guide.',
    keywords: ['troubleshooting', 'guide', 'fix', 'problem', 'solution', 'debug', 'support'],
    color: '#b45309', // amber-700
    iconPaths: [
      'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    ],
    iconName: 'Wrench',
    emoji: '🔧',
  },

  'decision-tree': {
    label: 'Decision Tree',
    badge: 'Decision Tree',
    descriptionTemplate: 'Navigate "{title}" — an interactive decision tree to guide your choices.',
    keywords: ['decision', 'tree', 'flowchart', 'guide', 'choices', 'logic', 'workflow'],
    color: '#0369a1', // sky-700
    iconPaths: [
      'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    ],
    iconName: 'GitBranch',
    emoji: '🌳',
  },

  diagram: {
    label: 'Diagram',
    badge: 'Interactive Diagram',
    descriptionTemplate: 'Visualize "{title}" — an interactive diagram on AI Matrx.',
    keywords: ['diagram', 'chart', 'visualization', 'flowchart', 'graph', 'architecture'],
    color: '#6d28d9', // violet-700
    iconPaths: [
      'M3 3v18h18',
      'M18.7 8l-5.1 5.2-2.8-2.7L7 14.3',
    ],
    iconName: 'BarChart2',
    emoji: '📈',
  },

  code: {
    label: 'Code',
    badge: 'Code Snippet',
    descriptionTemplate: 'View and copy "{title}" — a code snippet shared on AI Matrx.',
    keywords: ['code', 'snippet', 'programming', 'developer', 'script', 'source code'],
    color: '#1e293b', // slate-800
    iconPaths: [
      'M16 18l6-6-6-6',
      'M8 6l-6 6 6 6',
    ],
    iconName: 'Code2',
    emoji: '💻',
  },

  math_problem: {
    label: 'Math Problem',
    badge: 'Math Problem',
    descriptionTemplate: 'Solve "{title}" — a step-by-step math problem walkthrough.',
    keywords: ['math', 'problem', 'equation', 'calculus', 'algebra', 'solution', 'STEM'],
    color: '#0f766e', // teal-700
    iconPaths: [
      'M4 7h3',
      'M4 12h16',
      'M4 17h3',
      'M8 7h12',
      'M8 17h12',
      'M15 7l2 2-2 2',
      'M15 15l2 2-2 2',
    ],
    iconName: 'Sigma',
    emoji: '🔢',
  },
  mermaid: {
    label: 'Diagram',
    badge: 'Interactive Diagram',
    descriptionTemplate: 'View "{title}" — an interactive diagram you can explore and edit.',
    keywords: ['diagram', 'flowchart', 'mind map', 'sequence diagram', 'chart', 'visualization', 'mermaid'],
    color: '#e11d48', // rose-600
    iconPaths: [
      // Lucide "Workflow" (rects converted to path data)
      'M5 3h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
      'M7 11v4a2 2 0 0 0 2 2h4',
      'M15 13h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z',
    ],
    iconName: 'Workflow',
    emoji: '📊',
  },
};

/** Default metadata for unknown/unregistered canvas types */
export const DEFAULT_CANVAS_META: CanvasBlockMeta = {
  label: 'Canvas',
  badge: 'Interactive Canvas',
  descriptionTemplate: 'View "{title}" — an interactive canvas shared on AI Matrx.',
  keywords: ['canvas', 'interactive', 'AI', 'shared content'],
  color: '#3b82f6', // blue-500
  iconPaths: ['M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'],
  iconName: 'Layers',
  emoji: '🎨',
};

/**
 * Get metadata for a canvas type, falling back to the default.
 */
export function getCanvasBlockMeta(canvasType: string): CanvasBlockMeta {
  return CANVAS_BLOCK_META[canvasType] ?? DEFAULT_CANVAS_META;
}

/**
 * Build a description string from the template, substituting {title} and {creator}.
 */
export function buildCanvasDescription(
  canvasType: string,
  title: string,
  creator?: string | null,
): string {
  const meta = getCanvasBlockMeta(canvasType);
  let desc = meta.descriptionTemplate.replace('{title}', title);
  if (creator) desc = desc.replace('{creator}', creator);
  return desc;
}
