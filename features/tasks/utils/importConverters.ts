// features/tasks/utils/importConverters.ts
// Converters to transform various AI-generated content into task format

import type { TaskItemType } from '@/components/mardown-display/blocks/tasks/TaskChecklist';

/**
 * Convert Progress Tracker items to task format
 */
export interface ProgressItem {
  id: string;
  text: string;
  completed: boolean;
  optional?: boolean;
  priority?: 'low' | 'medium' | 'high';
  estimatedHours?: number;
  category?: string;
}

export interface ProgressCategory {
  id: string;
  name: string;
  description?: string;
  items: ProgressItem[];
}

export function convertProgressToTasks(
  title: string,
  categories: ProgressCategory[]
): TaskItemType[] {
  const tasks: TaskItemType[] = [];

  categories.forEach((category, catIndex) => {
    // Add items as subtasks
    const children: TaskItemType[] = category.items.map((item, itemIndex) => ({
      id: `subtask-${catIndex}-${itemIndex}-${item.id}`,
      title: item.text + (item.optional ? ' (optional)' : ''),
      type: 'subtask',
      checked: item.completed,
    }));

    // Create a parent task for each category
    const parentTask: TaskItemType = {
      id: `task-${catIndex}-${category.id}`,
      title: category.name,
      type: 'task',
      bold: true,
      checked: category.items.every(item => item.completed),
      children,
    };

    tasks.push(parentTask);
  });

  return tasks;
}

/**
 * Convert Timeline events to task format
 */
export interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  description: string;
  status?: 'completed' | 'in-progress' | 'pending';
  category?: string;
}

export interface TimelinePeriod {
  period: string;
  events: TimelineEvent[];
}

export function convertTimelineToTasks(
  title: string,
  periods: TimelinePeriod[]
): TaskItemType[] {
  const tasks: TaskItemType[] = [];

  periods.forEach((period, periodIndex) => {
    // Add events as tasks
    const children: TaskItemType[] = period.events.map((event, eventIndex) => ({
      id: `task-${periodIndex}-${eventIndex}-${event.id}`,
      title: `${event.title}${event.date ? ` (${event.date})` : ''}`,
      type: 'task',
      checked: event.status === 'completed',
      children: event.description ? [
        {
          id: `subtask-${periodIndex}-${eventIndex}-desc`,
          title: event.description,
          type: 'subtask',
          checked: false,
        }
      ] : [],
    }));

    // Create a section for each period
    const section: TaskItemType = {
      id: `section-${periodIndex}`,
      title: period.period,
      type: 'section',
      children,
    };

    tasks.push(section);
  });

  return tasks;
}

/**
 * Convert Troubleshooting steps to task format
 */
export interface TroubleshootingStep {
  id: string;
  title: string;
  description: string;
  commands?: string[];
  links?: { title: string; url: string }[];
  difficulty?: 'easy' | 'medium' | 'hard';
  estimatedTime?: string;
}

export interface TroubleshootingSolution {
  id: string;
  title: string;
  description?: string;
  steps: TroubleshootingStep[];
  priority?: 'low' | 'medium' | 'high';
  successRate?: number;
}

export interface TroubleshootingIssue {
  id: string;
  symptom: string;
  description?: string;
  causes: string[];
  solutions: TroubleshootingSolution[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export function convertTroubleshootingToTasks(
  title: string,
  issues: TroubleshootingIssue[]
): TaskItemType[] {
  const tasks: TaskItemType[] = [];

  issues.forEach((issue, issueIndex) => {
    issue.solutions.forEach((solution, solutionIndex) => {
      // Add steps as subtasks
      const children: TaskItemType[] = solution.steps.map((step, stepIndex) => ({
        id: `subtask-${issueIndex}-${solutionIndex}-${stepIndex}-${step.id}`,
        title: step.title,
        type: 'subtask',
        checked: false,
      }));

      // Create a main task for each solution
      const mainTask: TaskItemType = {
        id: `task-${issueIndex}-${solutionIndex}-${solution.id}`,
        title: `${solution.title} (${issue.symptom})`,
        type: 'task',
        bold: true,
        checked: false,
        children,
      };

      tasks.push(mainTask);
    });
  });

  return tasks;
}

