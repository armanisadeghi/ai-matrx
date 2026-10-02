/**
 * Tools rule
 *
 * One row per tool. Each tool's points are independent.
 * Tools mostly add capability surface area rather than narrow the model
 * pool, so values are modest.
 */

import type { PointContribution, PointRule, ToolKey } from '../types';

const POINTS: Record<ToolKey, number> = {
  web_search: 4,
  run_code: 5,
  access_database: 4,
  use_browser: 6,
  news: 3,
  research: 4,
  seo: 3,
  access_files: 3,
};

export const toolPoints: PointRule = (input) => {
  const out: PointContribution[] = [];
  for (const tool of input.tools) {
    out.push({
      source: `tools.${tool}`,
      label: `Tool: ${prettyToolLabel(tool)}`,
      points: POINTS[tool],
    });
  }
  return out;
};

function prettyToolLabel(tool: ToolKey): string {
  switch (tool) {
    case 'web_search': return 'Search the web';
    case 'run_code': return 'Run code';
    case 'access_database': return 'Access database';
    case 'use_browser': return 'Use browser';
    case 'news': return 'News';
    case 'research': return 'Research';
    case 'seo': return 'SEO';
    case 'access_files': return 'Access files';
  }
}
