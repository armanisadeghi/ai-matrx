'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { PermissionLevel } from '@/utils/permissions';
import { Crown, Shield, Eye, Users, Globe } from 'lucide-react';

interface PermissionBadgeProps {
  level: PermissionLevel | 'owner';
  variant?: 'default' | 'compact';
  showIcon?: boolean;
}

/**
 * PermissionBadge - Visual indicator for permission levels
 * 
 * Displays color-coded badges for different permission levels
 * Used throughout the app to show user permissions
 * 
 * @example
 * <PermissionBadge level="editor" />
 * <PermissionBadge level="owner" showIcon />
 */
export function PermissionBadge({ 
  level, 
  variant = 'default',
  showIcon = false 
}: PermissionBadgeProps) {
  const config = {
    owner: {
      label: 'Owner',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-300',
      icon: Crown,
    },
    admin: {
      label: 'Admin',
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300',
      icon: Shield,
    },
    editor: {
      label: 'Editor',
      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-300',
      icon: Users,
    },
    viewer: {
      label: 'Viewer',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300',
      icon: Eye,
    },
  };

  const { label, className, icon: Icon } = config[level];

  if (variant === 'compact') {
    return (
      <Badge className={`${className} text-xs px-2 py-0.5`}>
        {showIcon && <Icon className="w-3 h-3 mr-1" />}
        {label}
      </Badge>
    );
  }

  return (
    <Badge className={`${className} px-3 py-1`}>
      {showIcon && <Icon className="w-3.5 h-3.5 mr-1.5" />}
      {label}
    </Badge>
  );
}

/**
 * PublicBadge - Badge specifically for public resources
 */
export function PublicBadge({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const className = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300';
  
  if (variant === 'compact') {
    return (
      <Badge className={`${className} text-xs px-2 py-0.5`}>
        <Globe className="w-3 h-3 mr-1" />
        Public
      </Badge>
    );
  }

  return (
    <Badge className={`${className} px-3 py-1`}>
      <Globe className="w-3.5 h-3.5 mr-1.5" />
      Public
    </Badge>
  );
}

/**
 * PermissionLevelDescription - Show what each level can do
 */
export function PermissionLevelDescription({ level }: { level: PermissionLevel }) {
  const descriptions = {
    viewer: 'Can view',
    editor: 'Can view and edit',
    admin: 'Full access (view, edit, delete)',
  };

  return (
    <span className="text-xs text-muted-foreground">
      {descriptions[level]}
    </span>
  );
}

