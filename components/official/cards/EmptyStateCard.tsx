"use client";

import React, { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@ai-matrx/design-system";

interface EmptyStateCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  buttonText?: string;
  onButtonClick?: () => void;
  secondaryButton?: ReactNode;
  alternateState?: boolean;
  alternateTitle?: string;
  alternateDescription?: string;
  alternateIcon?: LucideIcon;
  alternateIconColor?: string;
  alternateIconBgColor?: string;
  alternateButtonText?: string;
  alternateButtonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  alternateButtonColor?: string;
}

const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  title,
  description,
  icon: Icon,
  buttonText,
  onButtonClick,
  secondaryButton,
  alternateState = false,
  alternateTitle,
  alternateDescription,
  alternateIcon,
  alternateIconColor = "text-emerald-600 dark:text-emerald-400",
  alternateIconBgColor = "bg-emerald-100 dark:bg-emerald-900/20",
  alternateButtonText,
  alternateButtonVariant = "outline",
  alternateButtonColor = "border-emerald-500 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
}) => {
  const ActiveIcon = alternateState && alternateIcon ? alternateIcon : Icon;
  const activeTitle = alternateState && alternateTitle ? alternateTitle : title;
  const activeDescription = alternateState && alternateDescription ? alternateDescription : description;
  const activeButtonText = alternateState && alternateButtonText ? alternateButtonText : buttonText;
  
  const iconColorClass = alternateState ? alternateIconColor : "text-blue-500 dark:text-blue-400";
  const iconBgColorClass = alternateState ? alternateIconBgColor : "bg-blue-50 dark:bg-blue-950/30";
  const buttonColorClass = alternateState ? alternateButtonColor : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white";

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className={`${iconBgColorClass} p-6 rounded-full mb-6`}>
        <ActiveIcon 
          className={`h-12 w-12 ${iconColorClass}`} 
          strokeWidth={1.5} 
        />
      </div>
      
      <h3 className={`text-xl font-semibold ${alternateState ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-gray-100"} mb-3`}>
        {activeTitle}
      </h3>
      
      <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
        {activeDescription}
      </p>
      
      {activeButtonText && (
        <div className="flex flex-col sm:flex-row gap-4">
          <Button 
            onClick={onButtonClick}
            variant={alternateState ? alternateButtonVariant : "default"}
            className={alternateState ? alternateButtonColor : buttonColorClass}
          >
            {activeButtonText}
          </Button>
          
          {secondaryButton}
        </div>
      )}
    </div>
  );
};

export default EmptyStateCard; 