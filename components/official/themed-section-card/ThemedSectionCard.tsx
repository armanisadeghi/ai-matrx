"use client";

import React, { ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";
import styles from "./ThemedSectionCard.module.css";
import { useThemeMode } from "@/styles/themes/useThemeMode";

// Available theme options - all standard Tailwind colors
export type MainColor = "slate" | "gray" | "zinc" | "neutral" | "stone";
export type AccentColor = 
  "slate" | "gray" | "zinc" | "neutral" | "stone" | 
  "red" | "orange" | "amber" | "yellow" | "lime" | 
  "green" | "emerald" | "teal" | "cyan" | "sky" | 
  "blue" | "indigo" | "violet" | "purple" | 
  "fuchsia" | "pink" | "rose";

// For backward compatibility
export type ThemeColor = "rose" | "blue" | "green" | "purple" | "amber" | "slate";

// Theme preset system - predefined combinations of main + accent colors
export type ThemePreset = 
  "default" | "primary" | "success" | "info" | "warning" | "danger" | 
  "neutral" | "elegant" | "vibrant" | "subtle" | "professional" | "creative";

// Map theme presets to specific color combinations
export const THEME_PRESETS: Record<ThemePreset, { main: MainColor, accent: AccentColor }> = {
  // Standard system presets
  default: { main: "gray", accent: "rose" },      // Original design
  primary: { main: "slate", accent: "blue" },     // Primary system action
  success: { main: "stone", accent: "green" },    // Success/completion
  info: { main: "slate", accent: "cyan" },        // Information/help
  warning: { main: "gray", accent: "amber" },     // Warning/attention
  danger: { main: "gray", accent: "red" },        // Errors/danger

  // Special combinations
  neutral: { main: "zinc", accent: "slate" },     // Neutral/systematic
  elegant: { main: "stone", accent: "purple" },   // Elegant/professional
  vibrant: { main: "gray", accent: "fuchsia" },   // Bold/vibrant
  subtle: { main: "gray", accent: "stone" },      // Subtle/minimal
  professional: { main: "slate", accent: "indigo" }, // Business/professional
  creative: { main: "neutral", accent: "lime" },  // Creative/energetic
};

interface ThemedSectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  headerActions?: ReactNode[];
  footerLeft?: ReactNode;
  footerCenter?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
  // Theme customization options
  mainColor?: MainColor;
  accentColor?: AccentColor;
  theme?: ThemeColor;        // Legacy theme prop
  preset?: ThemePreset;      // New theme preset prop
}

const ThemedSectionCard: React.FC<ThemedSectionCardProps> = ({
  title,
  description,
  children,
  headerActions = [],
  footerLeft,
  footerCenter,
  footerRight,
  className,
  mainColor,
  accentColor,
  theme,               // Optional legacy prop
  preset = "default",  // Default to original design
}) => {
  // Use ThemeProvider to detect app's light/dark mode
  const mode = useThemeMode();
  
  // Determine if footer should be rendered
  const hasFooter = footerLeft || footerCenter || footerRight;
  
  // Get the appropriate theme classes
  let themeClasses;
  
  // Priority order: 1. theme (backward compatibility), 2. explicit colors, 3. preset
  if (theme) {
    // 1. Handle legacy theme prop for backwards compatibility
    themeClasses = styles[`theme${theme.charAt(0).toUpperCase() + theme.slice(1)}`];
  } else if (mainColor && accentColor) {
    // 2. Use explicit color selections if provided
    const mainClass = styles[`main${mainColor.charAt(0).toUpperCase() + mainColor.slice(1)}`];
    const accentClass = styles[`accent${accentColor.charAt(0).toUpperCase() + accentColor.slice(1)}`];
    themeClasses = cn(mainClass, accentClass);
  } else {
    // 3. Use theme preset
    const { main, accent } = THEME_PRESETS[preset];
    const mainClass = styles[`main${main.charAt(0).toUpperCase() + main.slice(1)}`];
    const accentClass = styles[`accent${accent.charAt(0).toUpperCase() + accent.slice(1)}`];
    themeClasses = cn(mainClass, accentClass);
  }

  // Create a container ref that we'll use to set dark mode
  const [containerRef, setContainerRef] = React.useState<HTMLDivElement | null>(null);
  
  // Apply dark mode class to the container when mode changes
  useEffect(() => {
    if (!containerRef) return;
    
    if (mode === 'dark') {
      containerRef.classList.add('dark');
    } else {
      containerRef.classList.remove('dark');
    }
  }, [mode, containerRef]);

  // Default to themeRose if no theme options are provided (failsafe)
  const effectiveThemeClasses = themeClasses || styles.themeRose;

  return (
    <div 
      ref={setContainerRef}
      className={cn(
        styles.card, 
        effectiveThemeClasses, 
        className,
        // Ensure dark mode styles are properly applied
        mode === 'dark' ? 'dark' : ''
      )}
      data-mode={mode}
      data-preset={preset}
    >
      {/* Header with title, description, and actions */}
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          {description && (
            <p className={styles.description}>{description}</p>
          )}
        </div>
        
        {headerActions && headerActions.length > 0 && (
          <div className={styles.headerActions}>
            {headerActions.map((action, index) => (
              <React.Fragment key={index}>{action}</React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className={styles.content}>{children}</div>

      {/* Footer with 3 columns if any footer content exists */}
      {hasFooter && (
        <div className={styles.footer}>
          {/* Left column */}
          <div className={styles.footerLeft}>
            {footerLeft}
          </div>
          
          {/* Center column */}
          <div className={styles.footerCenter}>
            {footerCenter}
          </div>
          
          {/* Right column */}
          <div className={styles.footerRight}>
            {footerRight}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemedSectionCard; 