import { useState, useEffect } from "react";
import {
  Loader2,
  CircleCheck,
  AlertCircle,
  Lightbulb,
  Image,
  ArrowRight,
} from "lucide-react";

// ======== CONFIGURATION ========
interface LoadingConfigEntry {
  title: string;
  subtitle?: string;
  stages: string[];
  placeholderItems?: number;
  baseColor?: string;
  accentColor?: string;
}

// Predefined loading configs for different components
const LOADING_CONFIGS: Record<
  "default" | "appSuggestions" | "analytics" | "userProfile" | "contentFeed",
  LoadingConfigEntry
> = {
  // Generic default config
  default: {
    title: "Loading Content",
    stages: [
      "Initializing...",
      "Connecting to service...",
      "Processing data...",
      "Preparing results...",
      "Finalizing...",
    ],
  },
  // App suggestions specific config (matches our custom XL component)
  appSuggestions: {
    title: "App Suggestions",
    subtitle: "Review these naming and branding suggestions for new app",
    stages: [
      "Analyzing requirements...",
      "Generating app suggestions...",
      "Preparing branding options...",
      "Creating visual concepts...",
      "Finalizing recommendations...",
    ],
    placeholderItems: 3,
  },
  // Analytics dashboard config
  analytics: {
    title: "Analytics Dashboard",
    subtitle: "Processing your metrics and insights",
    stages: [
      "Collecting data points...",
      "Calculating key metrics...",
      "Generating visualizations...",
      "Identifying trends...",
      "Preparing insights...",
    ],
    placeholderItems: 4,
    baseColor: "blue",
    accentColor: "cyan",
  },
  // User profile config
  userProfile: {
    title: "User Profile",
    subtitle: "Loading user information and preferences",
    stages: [
      "Authenticating user...",
      "Retrieving profile data...",
      "Loading preferences...",
      "Syncing activity history...",
      "Preparing personalized content...",
    ],
    placeholderItems: 1,
    baseColor: "slate",
    accentColor: "emerald",
  },
  // Content feed config
  contentFeed: {
    title: "Content Feed",
    subtitle: "Preparing your personalized content",
    stages: [
      "Retrieving latest posts...",
      "Applying your preferences...",
      "Sorting by relevance...",
      "Loading media content...",
      "Preparing interactive elements...",
    ],
    placeholderItems: 5,
    baseColor: "gray",
    accentColor: "amber",
  },
};

// Color palette options
const COLOR_SCHEMES = {
  // Base colors (for backgrounds, borders, etc)
  base: {
    slate: {
      light: "bg-slate-50 border-slate-200",
      dark: "dark:bg-slate-800/50 dark:border-slate-700",
      header: "from-slate-500/90 via-slate-600/90 to-slate-700/90",
      shimmer: "bg-slate-200 dark:bg-slate-700",
    },
    gray: {
      light: "bg-gray-50 border-gray-200",
      dark: "dark:bg-gray-800/50 dark:border-gray-700",
      header: "from-gray-500/90 via-gray-600/90 to-gray-700/90",
      shimmer: "bg-gray-200 dark:bg-gray-700",
    },
    blue: {
      light: "bg-blue-50 border-blue-200",
      dark: "dark:bg-blue-900/30 dark:border-blue-800/70",
      header: "from-blue-500/90 via-blue-600/90 to-blue-700/90",
      shimmer: "bg-blue-200/50 dark:bg-blue-700/40",
    },
  },
  // Accent colors (for buttons, highlights, etc)
  accent: {
    indigo: {
      primary: "text-indigo-600 dark:text-indigo-400",
      secondary: "bg-indigo-500 hover:bg-indigo-600",
      muted: "bg-indigo-400 dark:bg-indigo-600/70",
      highlight: "text-amber-300",
    },
    violet: {
      primary: "text-violet-600 dark:text-violet-400",
      secondary: "bg-violet-500 hover:bg-violet-600",
      muted: "bg-violet-400 dark:bg-violet-600/70",
      highlight: "text-pink-300",
    },
    emerald: {
      primary: "text-emerald-600 dark:text-emerald-400",
      secondary: "bg-emerald-500 hover:bg-emerald-600",
      muted: "bg-emerald-400 dark:bg-emerald-600/70",
      highlight: "text-sky-300",
    },
    amber: {
      primary: "text-amber-600 dark:text-amber-400",
      secondary: "bg-amber-500 hover:bg-amber-600",
      muted: "bg-amber-400 dark:bg-amber-600/70",
      highlight: "text-indigo-300",
    },
    rose: {
      primary: "text-rose-600 dark:text-rose-400",
      secondary: "bg-rose-500 hover:bg-rose-600",
      muted: "bg-rose-400 dark:bg-rose-600/70",
      highlight: "text-sky-300",
    },
    cyan: {
      primary: "text-cyan-600 dark:text-cyan-400",
      secondary: "bg-cyan-500 hover:bg-cyan-600",
      muted: "bg-cyan-400 dark:bg-cyan-600/70",
      highlight: "text-amber-300",
    },
  },
};

/**
 * Flexible Loading Component
 *
 * @param {Object} props
 * @param {string} [props.configKey='default'] - Key for predefined config
 * @param {string} [props.size='medium'] - Size variant: 'small', 'medium', 'large', 'xl'
 * @param {string} [props.baseColor='slate'] - Base color theme
 * @param {string} [props.accentColor='indigo'] - Accent color theme
 * @param {string} [props.title] - Custom title (overrides config)
 * @param {string} [props.subtitle] - Custom subtitle (overrides config)
 * @param {string[]} [props.stages] - Custom loading stages (overrides config)
 * @param {number} [props.placeholderItems=2] - Number of placeholder items to show
 * @param {number} [props.duration=10000] - Total loading animation duration in ms
 */
type LoadingConfigKey = keyof typeof LOADING_CONFIGS;
type BaseColorKey = keyof typeof COLOR_SCHEMES.base;
type AccentColorKey = keyof typeof COLOR_SCHEMES.accent;

const isBaseColorKey = (value: string | undefined): value is BaseColorKey =>
  value !== undefined && value in COLOR_SCHEMES.base;

const isAccentColorKey = (value: string | undefined): value is AccentColorKey =>
  value !== undefined && value in COLOR_SCHEMES.accent;

interface FlexibleLoadingComponentProps {
  configKey?: LoadingConfigKey;
  size?: "small" | "medium" | "large" | "xl";
  baseColor?: BaseColorKey;
  accentColor?: AccentColorKey;
  title?: string;
  subtitle?: string;
  stages?: string[];
  placeholderItems?: number;
  duration?: number;
}

const FlexibleLoadingComponent = ({
  configKey = "default",
  size = "medium",
  baseColor: propBaseColor,
  accentColor: propAccentColor,
  title: propTitle,
  subtitle: propSubtitle,
  stages: propStages,
  placeholderItems: propPlaceholderItems,
  duration = 10000,
}: FlexibleLoadingComponentProps) => {
  // Merge configuration (props override config)
  const config = LOADING_CONFIGS[configKey] || LOADING_CONFIGS.default;
  const title = propTitle || config.title;
  const subtitle = propSubtitle || config.subtitle;
  const stages = propStages || config.stages || LOADING_CONFIGS.default.stages;
  const placeholderItems = propPlaceholderItems || config.placeholderItems || 2;
  const configBaseColor = isBaseColorKey(config.baseColor) ? config.baseColor : undefined;
  const configAccentColor = isAccentColorKey(config.accentColor) ? config.accentColor : undefined;
  const baseColor = propBaseColor || configBaseColor || "slate";
  const accentColor = propAccentColor || configAccentColor || "indigo";

  // Get color schemes
  const baseTheme = COLOR_SCHEMES.base[baseColor] || COLOR_SCHEMES.base.slate;
  const accentTheme =
    COLOR_SCHEMES.accent[accentColor] || COLOR_SCHEMES.accent.indigo;

  // State for animation
  const [loadingStage, setLoadingStage] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Calculate stage duration based on total duration and number of stages
  const stageDuration = duration / (stages.length || 1);

  // Handle stage progression
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loadingStage < stages.length - 1) {
        setLoadingStage((prev) => prev + 1);
      }
    }, stageDuration);

    return () => clearTimeout(timer);
  }, [loadingStage, stages.length, stageDuration]);

  // Handle progress bar animation
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        const targetProgress = (loadingStage + 1) * (100 / stages.length);
        const step = Math.random() * 3 + 1; // Random increment for natural feel
        const newProgress = prev + step;
        return Math.min(newProgress, targetProgress);
      });
    }, 300);

    return () => clearInterval(interval);
  }, [loadingStage, stages.length]);

  // Determine placeholder items for skeleton UI
  const placeholders = Array(placeholderItems)
    .fill(null)
    .map((_, i) => ({
      id: i,
      title: `Loading item ${i + 1}...`,
      description:
        "This content is being prepared and will be available shortly...",
    }));

  // Conditional rendering based on size
  const renderContent = () => {
    switch (size) {
      case "small":
        return renderSmallSkeleton();
      case "large":
        return renderLargeSkeleton();
      case "xl":
        return renderXLSkeleton();
      case "medium":
      default:
        return renderMediumSkeleton();
    }
  };

  // Small size skeleton (minimal, compact)
  const renderSmallSkeleton = () => (
    <div
      className={`rounded-lg shadow-sm overflow-hidden border ${baseTheme.light} ${baseTheme.dark}`}
    >
      <div className={`p-4 bg-gradient-to-r ${baseTheme.header} text-white`}>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Loader2
              size={16}
              className={`${accentTheme.highlight} animate-spin`}
            />
            {title}
          </h3>
          <span className="text-xs font-light">
            {Math.round(loadingProgress)}%
          </span>
        </div>
        <div className="mt-2 h-1 bg-white/30 rounded-full overflow-hidden">
          <div
            className={`h-full ${accentTheme.highlight} transition-all duration-300 ease-out`}
            style={{ width: `${loadingProgress}%` }}
          ></div>
        </div>
      </div>

      <div className="p-4">
        <div className="text-sm text-center text-slate-600 dark:text-slate-300">
          {stages[loadingStage]}
        </div>
      </div>
    </div>
  );

  // Medium size skeleton (standard card with minimal content)
  const renderMediumSkeleton = () => (
    <div
      className={`rounded-lg shadow-md overflow-hidden border ${baseTheme.light} ${baseTheme.dark}`}
    >
      <div
        className={`px-6 py-5 bg-gradient-to-r ${baseTheme.header} text-white`}
      >
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Loader2
            size={20}
            className={`${accentTheme.highlight} animate-spin`}
          />
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm font-light opacity-90">{subtitle}</p>
        )}

        <div className="mt-3 h-1.5 bg-white/30 rounded-full overflow-hidden">
          <div
            className={`h-full ${accentTheme.highlight} transition-all duration-300 ease-out`}
            style={{ width: `${loadingProgress}%` }}
          ></div>
        </div>
        <p className="mt-1 text-xs font-light opacity-80 text-right">
          {Math.round(loadingProgress)}% • {stages[loadingStage]}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {placeholders.slice(0, Math.min(2, placeholderItems)).map((item) => (
          <div
            key={item.id}
            className={`p-4 ${baseTheme.shimmer} rounded animate-pulse-subtle`}
            style={{ animationDelay: `${item.id * 200}ms` }}
          >
            <div className="h-5 w-1/3 bg-slate-300 dark:bg-slate-600 mb-3 rounded loading-shine"></div>
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className="h-3 bg-slate-300 dark:bg-slate-600 rounded loading-shine"
                  style={{
                    width: `${95 - i * 15}%`,
                    animationDelay: `${i * 150}ms`,
                  }}
                ></div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          <p>Loading content...</p>
        </div>
      </div>
    </div>
  );

  // Large size skeleton (detailed card with multiple content blocks)
  const renderLargeSkeleton = () => (
    <div
      className={`rounded-xl shadow-lg overflow-hidden border ${baseTheme.light} ${baseTheme.dark}`}
    >
      <div
        className={`px-6 py-6 bg-gradient-to-r ${baseTheme.header} text-white relative overflow-hidden`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent shimmer-animation"></div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Lightbulb
            size={24}
            className={`${accentTheme.highlight} animate-pulse`}
          />
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-base font-light opacity-90">{subtitle}</p>
        )}

        <div className="mt-4 h-2 bg-white/30 rounded-full overflow-hidden">
          <div
            className={`h-full ${accentTheme.highlight} transition-all duration-300 ease-out`}
            style={{ width: `${loadingProgress}%` }}
          ></div>
        </div>
        <div className="mt-2 flex justify-between items-center text-sm">
          <p className="font-light">{stages[loadingStage]}</p>
          <p className="font-medium">{Math.round(loadingProgress)}%</p>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {placeholders.map((item) => (
          <div
            key={item.id}
            className={`p-5 ${baseTheme.shimmer} rounded-lg animate-pulse-subtle`}
            style={{ animationDelay: `${item.id * 200}ms` }}
          >
            <div className="flex justify-between items-start mb-4">
              <div
                className={`h-6 w-1/3 ${accentTheme.muted} rounded-md loading-shine`}
              ></div>
              <div className="h-8 w-20 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
            </div>

            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-4 bg-slate-300 dark:bg-slate-600 rounded loading-shine"
                  style={{
                    width: `${95 - i * 10}%`,
                    animationDelay: `${i * 150}ms`,
                  }}
                ></div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <div
                className={`px-4 py-2 ${accentTheme.muted} text-white rounded-lg w-1/3 h-10 flex items-center justify-center`}
              >
                <Loader2 size={16} className="animate-spin mr-2" />
                <div className="h-4 w-16 bg-white/30 rounded"></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          <p>
            Stage {loadingStage + 1} of {stages.length} • Processing content...
          </p>
        </div>
      </div>
    </div>
  );

  // XL size skeleton (full featured with sidebar layout)
  const renderXLSkeleton = () => (
    <div
      className={`rounded-xl shadow-xl overflow-hidden border ${baseTheme.light} ${baseTheme.dark}`}
    >
      <div
        className={`px-8 py-10 bg-gradient-to-r ${baseTheme.header} text-white relative overflow-hidden`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent shimmer-animation"></div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Lightbulb
            size={28}
            className={`${accentTheme.highlight} animate-pulse`}
          />
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 text-lg font-light opacity-90">{subtitle}</p>
        )}

        <div className="mt-6 h-2 bg-white/30 rounded-full overflow-hidden">
          <div
            className={`h-full ${accentTheme.highlight} transition-all duration-300 ease-out`}
            style={{ width: `${loadingProgress}%` }}
          ></div>
        </div>
        <p className="mt-2 text-sm font-light opacity-80 text-right">
          {Math.round(loadingProgress)}% complete
        </p>
        <p className="mt-1 text-sm font-medium">{stages[loadingStage]}</p>
      </div>

      <div className="p-6 md:p-8 space-y-8">
        {placeholders.map((item) => (
          <div
            key={item.id}
            className={`${baseTheme.shimmer} border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden animate-pulse-subtle`}
            style={{ animationDelay: `${item.id * 200}ms` }}
          >
            <div className="p-6 md:p-7">
              <div className="flex flex-col md:flex-row gap-6 md:items-start">
                {/* Main content */}
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-start">
                    <h2
                      className={`text-2xl font-bold ${accentTheme.primary} loading-shine`}
                    >
                      {item.title}
                    </h2>
                    <div className="px-3 py-1.5 rounded-full bg-slate-200 dark:bg-slate-700 w-20"></div>
                  </div>

                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-4 bg-slate-200 dark:bg-slate-700 rounded loading-shine"
                        style={{
                          width: `${95 - i * 15}%`,
                          animationDelay: `${i * 150}ms`,
                        }}
                      ></div>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 mt-2">
                    <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded loading-shine"></div>
                    <ArrowRight
                      size={14}
                      className="text-slate-300 dark:text-slate-600"
                    />
                  </div>
                </div>

                {/* Sidebar */}
                <div className="md:w-1/3 space-y-3">
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Image size={16} />
                    Visual Content
                  </h3>

                  <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-4 text-sm">
                    {[...Array(2)].map((_, i) => (
                      <div
                        key={i}
                        className="h-3 bg-slate-200 dark:bg-slate-600 rounded mb-2 loading-shine"
                        style={{
                          width: `${85 - i * 20}%`,
                          animationDelay: `${i * 150}ms`,
                        }}
                      ></div>
                    ))}

                    <div
                      className={`w-full h-10 mt-3 ${accentTheme.muted} rounded-lg flex items-center justify-center gap-2`}
                    >
                      <Loader2 size={16} className="text-white animate-spin" />
                      <span className="text-white text-sm font-medium">
                        Processing
                      </span>
                    </div>

                    <div className="mt-3 h-40 bg-slate-200 dark:bg-slate-600 rounded-lg loading-shine"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 text-center text-slate-600 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          <p>
            Loading {placeholders.length} items • {stages[loadingStage]}
          </p>
        </div>
      </div>
    </div>
  );

  return renderContent();
};

// Export the main component and useful constants
export { LOADING_CONFIGS, COLOR_SCHEMES };
export default FlexibleLoadingComponent;

// Additional CSS animations and utility classes
export const LoadingStyles = `
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-4 {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fadeIn {
  animation: fadeIn 0.3s ease-in-out;
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.shimmer-animation {
  animation: shimmer 2s infinite linear;
}
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.loading-shine {
  position: relative;
  overflow: hidden;
}
.loading-shine::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0,
    rgba(255, 255, 255, 0.2) 20%,
    rgba(255, 255, 255, 0.5) 60%,
    rgba(255, 255, 255, 0)
  );
  animation: shimmer 2s infinite;
}
.dark .loading-shine::after {
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0,
    rgba(255, 255, 255, 0.05) 20%,
    rgba(255, 255, 255, 0.1) 60%,
    rgba(255, 255, 255, 0)
  );
}
`;
