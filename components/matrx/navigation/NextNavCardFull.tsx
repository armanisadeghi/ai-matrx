'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {NavCardProps, NavItem} from "./types";
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ChevronRight, ArrowRight } from 'lucide-react';

const cardColorOptions = ['default', 'primary', 'secondary', 'destructive', 'success', 'warning'] as const;
type CardColor = (typeof cardColorOptions)[number];

const toCardColor = (color: string | undefined): CardColor =>
  cardColorOptions.includes(color as CardColor) ? (color as CardColor) : 'default';


const cardVariants = cva(
    "w-full cursor-pointer transition-all",
    {
      variants: {
        variant: {
          default: "hover:bg-muted",
          compact: "hover:bg-muted hover:shadow-sm",
          feature: "hover:shadow-md hover:border-primary/50 border-2 border-transparent"
        },
        color: {
          default: "",
          primary: "hover:border-primary/70 hover:bg-primary/5",
          secondary: "hover:border-secondary/70 hover:bg-secondary/5",
          destructive: "hover:border-destructive/70 hover:bg-destructive/5",
          success: "hover:border-green-500/70 hover:bg-green-50 dark:hover:bg-green-900/20",
          warning: "hover:border-yellow-500/70 hover:bg-yellow-50 dark:hover:bg-yellow-900/20",
        },
        animated: {
          true: "transition-transform hover:scale-[1.02]",
          false: ""
        }
      },
      defaultVariants: {
        variant: "default",
        color: "default",
        animated: true
      }
    }
  );
  
  /**
   * Enhanced navigation card component that supports grid layouts and various visual styles
   */
  const NextNavCardFull = ({ 
    items, 
    basePath = '', 
    columns = 1, 
    variant = 'default', 
    showPath = true,
    className = '',
    cardClassName = '',
    animated = true
  }: NavCardProps) => {
    const currentPath = usePathname();
    
    const getFullPath = (item: NavItem) => {
      if (item.relative) {
        return `${basePath || currentPath}/${item.path}`.replace(/\/+/g, '/');
      }
      return item.path.startsWith('/') ? item.path : `/${item.path}`;
    };
    
    // Determine grid column class based on columns prop
    const gridClassName = typeof columns === 'number' 
      ? `grid grid-cols-1 ${
          columns === 1 ? '' : 
          columns === 2 ? 'md:grid-cols-2' :
          columns === 3 ? 'md:grid-cols-2 lg:grid-cols-3' :
          columns === 4 ? 'md:grid-cols-2 lg:grid-cols-4' :
          'md:grid-cols-2 lg:grid-cols-3'
        }`
      : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    
    return (
      <div className={cn(
        columns === 1 ? "flex flex-col space-y-4" : gridClassName,
        "gap-4",
        className
      )}>
        {items.map((item) => {
          const fullPath = getFullPath(item);
          return (
            <Link
              key={item.path}
              href={fullPath}
              className={animated ? "transition-transform hover:scale-[1.01]" : ""}
            >
              <Card
                className={cn(
                  cardVariants({
                    variant,
                    color: toCardColor(item.color),
                    animated
                  }),
                  cardClassName
                )}
              >
                <CardHeader className={variant === 'compact' ? "p-4" : undefined}>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        {item.icon && (
                          <div className="flex-shrink-0">
                            {typeof item.icon === 'function'
                              ? React.createElement(item.icon, { className: 'h-5 w-5' })
                              : item.icon}
                          </div>
                        )}
                        <CardTitle className={cn(
                          "text-xl",
                          variant === 'compact' ? "text-lg" : ""
                        )}>
                          {item.title}
                        </CardTitle>
                      </div>
                      
                      {item.badge && (
                        <div className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          item.color === 'primary' ? "bg-primary/10 text-primary" :
                          item.color === 'secondary' ? "bg-secondary/10 text-secondary" :
                          item.color === 'destructive' ? "bg-destructive/10 text-destructive" :
                          item.color === 'success' ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                          item.color === 'warning' ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {item.badge}
                        </div>
                      )}
                    </div>
                    
                    {item.description && (
                      <CardDescription className={cn(
                        "text-base whitespace-pre-line",
                        variant === 'compact' ? "text-sm" : ""
                      )}>
                        {item.description}
                      </CardDescription>
                    )}
                  </div>
                </CardHeader>
                
                {showPath && (
                  <CardFooter className={cn(
                    "flex justify-between items-center pt-0",
                    variant === 'compact' ? "px-4 pb-4" : "pb-6"
                  )}>
                    <CardDescription className="text-sm font-mono truncate max-w-[70%]">
                      {fullPath}
                    </CardDescription>
                    
                    {variant === 'feature' ? (
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CardFooter>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    );
  };
  
  export default NextNavCardFull;