// This is a targeted fix for the ToolbarButton component that's causing recursion issues

import React, { memo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface StableButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'className'> {
  onClick: () => void;
  icon: React.ReactNode;
  className?: string;
}

// Create a memoized version of the button to prevent unnecessary re-renders
const StableButton = memo<StableButtonProps>(({ onClick, icon, className = '', ...props }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-8 w-8 p-0 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md ${className}`}
    {...props}
  >
    <span className="w-4 h-4 text-neutral-950 dark:text-neutral-50">{icon}</span>
  </button>
));

StableButton.displayName = 'StableButton';

interface ToolbarButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
}

// Create a memoized version of the ToolbarButton to break render cycles
const ToolbarButton = memo<ToolbarButtonProps>(({ onClick, icon, title }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <StableButton onClick={onClick} icon={icon} />
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
));

ToolbarButton.displayName = 'ToolbarButton';

const ToolbarDivider = () => <div className='w-px h-6 bg-neutral-300 dark:bg-neutral-600' />;

export { ToolbarButton, ToolbarDivider };