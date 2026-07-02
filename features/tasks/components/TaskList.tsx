import React from 'react';
import TaskItem from './TaskItem';
import { useAppSelector } from '@/lib/redux/hooks';
import { selectTasksLoading } from '@/features/tasks/redux/taskUiSlice';
import type { TaskWithProject } from '../types';

export default function TaskList({ tasks }: { tasks: TaskWithProject[] }) {
  const loading = useAppSelector(selectTasksLoading);

  // Don't show empty state while loading - show skeleton tasks
  if (loading && tasks.length === 0) {
    return (
      <div className="space-y-2 animate-pulse">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-muted rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <h3 className="text-lg font-medium">No tasks found</h3>
          <p className="mt-1 text-muted-foreground/80">
            Add your first task to get started
          </p>
        </div>
      )}
    </>
  );
}
