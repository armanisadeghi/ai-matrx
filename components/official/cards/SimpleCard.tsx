import React from 'react';
import { cn } from '@/lib/utils';

interface SimpleCardProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const SimpleCard: React.FC<SimpleCardProps> = ({ icon, title, description, onClick, className }) => {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-xl h-64 flex flex-col items-center justify-center space-y-6 p-4 text-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all",
        className
      )}
    >
      {icon && (
        <div className="h-12 w-12 text-blue-500 dark:text-blue-400">
          {icon}
        </div>
      )}
      {title && (
        <span className="font-medium text-blue-500 dark:text-blue-400">
          {title}
        </span>
      )}
      {description && (
        <p className="type-secondary text-center text-gray-600 dark:text-gray-400 mt-1">
          {description}
        </p>
      )}
    </div>
  );
};

export default SimpleCard;