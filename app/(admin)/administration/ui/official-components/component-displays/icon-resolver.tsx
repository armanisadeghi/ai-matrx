"use client";

import React from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import IconResolver, {
  getIconComponent,
  DynamicIcon,
} from "@/components/official/icons/IconResolver";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function IconResolverDisplay({
  component,
}: ComponentDisplayProps) {
  if (!component) return null;

  // Example code with all available props and their default values
  const code = `import IconResolver, { getIconComponent, DynamicIcon } from '@/components/official/IconResolver';

// Component Usage - Full featured with dynamic loading
<IconResolver 
  iconName="Home"           // Icon name (string) - Lucide or custom icons
  className="h-6 w-6"       // Default: "h-4 w-4"
  size={24}                 // Optional size prop
  fallbackIcon="Zap"        // Default: "Zap" - used if icon not found
  style={{ color: '#666' }} // Optional inline styles
/>

// Utility Function - Synchronous (only works with static/cached icons)
const Icon = getIconComponent("Settings", "Zap");
<Icon className="h-5 w-5" />

// Dynamic Icon Component - Smart color support (Tailwind names OR hex codes)
<DynamicIcon 
  name="Star"               // Icon name
  color="blue"              // Tailwind color: "blue", "red", "zinc", etc. (uses Tailwind classes)
  size={5}                  // Optional size (default: 4)
  className=""              // Additional classes
  fallbackIcon="Zap"        // Fallback icon name
/>

<DynamicIcon 
  name="Folder" 
  color="#666666"           // Hex color: "#666", "#ff0000", etc. (uses inline styles)
  size={4} 
/>

// Color Support Examples:
<DynamicIcon name="Heart" color="red" />          // Tailwind: text-red-600 dark:text-red-400
<DynamicIcon name="Star" color="#fbbf24" />       // Hex: style={{ color: '#fbbf24' }}
<DynamicIcon name="Check" color="emerald" />      // Tailwind: text-emerald-600
<DynamicIcon name="Info" color="#3b82f6" />       // Hex: perfect for database colors

// Custom Icons (react-icons)
<IconResolver iconName="FcGoogle" className="h-6 w-6" />
<IconResolver iconName="FaBrave" className="h-6 w-6" />

// Benefits:
// - Static imports for 140+ common icons (~50KB)
// - Dynamic imports for rare icons (loaded once, cached forever)
// - Replaces 'import * as LucideIcons' (~600KB)
// - 99% bundle size reduction for icon imports
// - Seamless loading (shows fallback while loading dynamic icons)
// - Smart color detection: Tailwind classes for named colors, inline styles for hex`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Hybrid icon resolver with static imports for common icons and dynamic imports for others. Dramatically reduces bundle size by avoiding wildcard imports while supporting all 1000+ Lucide icons. DynamicIcon component intelligently handles both Tailwind color names and hex codes."
    >
      <div className="w-full space-y-6">
        {/* IconResolver Component Demo */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            IconResolver Component
          </h3>
          <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-white dark:bg-gray-800">
            <div className="flex flex-col items-center gap-2">
              <IconResolver iconName="Home" className="h-8 w-8 text-blue-500" />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Static (Home)
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconResolver
                iconName="Settings"
                className="h-8 w-8 text-green-500"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Static (Settings)
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconResolver
                iconName="Gem"
                className="h-8 w-8 text-purple-500"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Dynamic (Gem)
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconResolver
                iconName="Rocket"
                className="h-8 w-8 text-orange-500"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Dynamic (Rocket)
              </span>
            </div>
          </div>
        </div>

        {/* DynamicIcon with Tailwind Colors */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            DynamicIcon with Tailwind Colors
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Uses Tailwind classes like{" "}
            <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
              text-blue-600 dark:text-blue-400
            </code>
          </p>
          <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-white dark:bg-gray-800">
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="Star" color="yellow" size={8} />
              <span className="text-xs text-gray-500">yellow</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="Heart" color="red" size={8} />
              <span className="text-xs text-gray-500">red</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="Check" color="green" size={8} />
              <span className="text-xs text-gray-500">green</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="AlertCircle" color="orange" size={8} />
              <span className="text-xs text-gray-500">orange</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="Info" color="blue" size={8} />
              <span className="text-xs text-gray-500">blue</span>
            </div>
          </div>
        </div>

        {/* DynamicIcon with Hex Colors */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            DynamicIcon with Hex Colors
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Uses inline styles like{" "}
            <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
              style=&#123;&#123; color: '#ff6b6b' &#125;&#125;
            </code>{" "}
            - perfect for database colors!
          </p>
          <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-white dark:bg-gray-800">
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="Folder" color="#ff6b6b" size={8} />
              <span className="text-xs font-mono text-gray-500">#ff6b6b</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="FolderOpen" color="#4ecdc4" size={8} />
              <span className="text-xs font-mono text-gray-500">#4ecdc4</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="FileText" color="#feca57" size={8} />
              <span className="text-xs font-mono text-gray-500">#feca57</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="Zap" color="#a29bfe" size={8} />
              <span className="text-xs font-mono text-gray-500">#a29bfe</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="Package" color="#fd79a8" size={8} />
              <span className="text-xs font-mono text-gray-500">#fd79a8</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <DynamicIcon name="Database" color="#666" size={8} />
              <span className="text-xs font-mono text-gray-500">#666</span>
            </div>
          </div>
        </div>

        {/* Custom Icons (react-icons) */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Custom Icons (react-icons)
          </h3>
          <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-white dark:bg-gray-800">
            <div className="flex flex-col items-center gap-2">
              <IconResolver iconName="FcGoogle" className="h-8 w-8" />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                FcGoogle
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconResolver iconName="FaBrave" className="h-8 w-8" />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                FaBrave
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconResolver iconName="FcDocument" className="h-8 w-8" />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                FcDocument
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconResolver iconName="FcCalendar" className="h-8 w-8" />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                FcCalendar
              </span>
            </div>
          </div>
        </div>

        {/* getIconComponent Utility */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            getIconComponent() Utility
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Synchronous utility for getting icon components directly. Only
              works with static/cached icons.
            </p>
            <div className="flex flex-wrap gap-4">
              {(() => {
                const HomeIcon = getIconComponent("Home");
                const SettingsIcon = getIconComponent("Settings");
                const ZapIcon = getIconComponent("Zap");
                return (
                  <>
                    <HomeIcon className="h-6 w-6 text-blue-500" />
                    <SettingsIcon className="h-6 w-6 text-green-500" />
                    <ZapIcon className="h-6 w-6 text-yellow-500" />
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Practical Use Case: Database Colors */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Real-World Example: Category Icons from Database
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Perfect for rendering icons with colors stored in your database. The
            component automatically detects hex codes and applies them
            correctly.
          </p>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800">
            <div className="flex flex-wrap gap-6">
              {[
                { icon: "FolderOpen", color: "#3b82f6", label: "Projects" },
                { icon: "FileText", color: "#10b981", label: "Documents" },
                { icon: "Image", color: "#f59e0b", label: "Media" },
                { icon: "Code", color: "#8b5cf6", label: "Code" },
                { icon: "Database", color: "#ef4444", label: "Data" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <DynamicIcon name={item.icon} color={item.color} size={5} />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {item.label}
                    </div>
                    <div className="text-xs font-mono text-gray-500">
                      {item.color}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bundle Size Info */}
        <div className="p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Key Features & Benefits
          </h3>
          <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <p>
              ✅ <strong>Bundle Size:</strong>{" "}
              <code className="px-1 py-0.5 bg-white dark:bg-gray-800 rounded">
                import * as LucideIcons
              </code>{" "}
              = ~600KB → IconResolver = ~50KB (99% reduction)
            </p>
            <p>
              ✅ <strong>Smart Colors:</strong> Auto-detects Tailwind names vs
              hex codes, applies appropriate styling
            </p>
            <p>
              ✅ <strong>Database Ready:</strong> Perfect for dynamic icons with
              colors from database (no Tailwind purge issues)
            </p>
            <p>
              ✅ <strong>Performance:</strong> Static imports for common icons,
              dynamic loading + caching for rare ones
            </p>
            <p className="mt-2 text-xs">
              <strong>How it works:</strong> 140+ common icons statically
              imported. Rare icons load dynamically once and cached forever.
              Color detection: Tailwind classes for names, inline styles for
              hex.
            </p>
          </div>
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
}
