'use client';

import React, { useState } from 'react';
import { Tag, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TASK_LABEL_OPTIONS, type TaskLabel } from '@/features/tasks/services/taskService';

interface TaskLabelsProps {
  labels: TaskLabel[];
  onChange: (labels: TaskLabel[]) => void;
  readonly?: boolean;
}

export default function TaskLabels({ labels, onChange, readonly = false }: TaskLabelsProps) {
  const toggle = (value: TaskLabel) => {
    if (labels.includes(value)) {
      onChange(labels.filter((l) => l !== value));
    } else {
      onChange([...labels, value]);
    }
  };

  const availableToAdd = TASK_LABEL_OPTIONS.filter((opt) => !labels.includes(opt.value));

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {labels.map((label) => {
        const opt = TASK_LABEL_OPTIONS.find((o) => o.value === label);
        if (!opt) return null;
        return (
          <span
            key={label}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${opt.color} border-transparent`}
          >
            {opt.label}
            {!readonly && (
              <button
                type="button"
                onClick={() => toggle(label)}
                className="opacity-60 hover:opacity-100 transition-opacity ml-0.5"
              >
                <X size={10} />
              </button>
            )}
          </span>
        );
      })}

      {!readonly && availableToAdd.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={<Plus size={10} />}
              type="button"
              variant="quiet"
            >
              Label
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {availableToAdd.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className="gap-2"
              >
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${opt.color}`}>
                  {opt.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
