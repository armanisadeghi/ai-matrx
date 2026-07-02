import React from "react";
import {
  FileCode,
  Coffee,
  Hash,
  Globe,
  File,
  Code2,
  Terminal,
  FileText,
  Braces,
  GitCompare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SiKotlin,
  SiSwift,
  SiDocker,
  SiGraphql,
  SiRuby,
  SiGo,
  SiRust,
  SiR,
} from "react-icons/si";
import { SiJavascript } from "react-icons/si";
import { SiTypescript } from "react-icons/si";
import { PiFileSqlBold } from "react-icons/pi";
import { TwoColorPythonIcon } from "@/features/code/styles/custom-icons";

// Default icon size that's a bit larger than before
const DEFAULT_ICON_SIZE = 18;
const MOBILE_ICON_SIZE = 14;

type IconProps = { size?: number; className?: string };

interface LanguageInfo {
  name: string;
  icon: React.FC<IconProps>;
  color: string;
  /** null → icon has its own fixed size (e.g. custom SVGs). */
  size: number | null;
}

export const languageMap: Record<string, LanguageInfo> = {
  code: {
    name: "Code",
    icon: (props: IconProps) => <Code2 {...props} />,
    color: "text-blue-500",
    size: DEFAULT_ICON_SIZE,
  },
  diff: {
    name: "Updates",
    icon: (props: IconProps) => <GitCompare {...props} />,
    color: "text-emerald-500",
    size: DEFAULT_ICON_SIZE,
  },
  javascript: {
    name: "JavaScript",
    icon: (props: IconProps) => <SiJavascript {...props} />,
    color: "text-yellow-500",
    size: DEFAULT_ICON_SIZE,
  },
  typescript: {
    name: "TypeScript",
    icon: (props: IconProps) => <SiTypescript {...props} />,
    color: "text-blue-500",
    size: DEFAULT_ICON_SIZE,
  },
  jsx: {
    name: "JavaScript",
    icon: (props: IconProps) => <SiJavascript {...props} />,
    color: "text-yellow-500",
    size: DEFAULT_ICON_SIZE,
  },
  tsx: {
    name: "TypeScript",
    icon: (props: IconProps) => <SiTypescript {...props} />,
    color: "text-blue-500",
    size: DEFAULT_ICON_SIZE,
  },
  python: {
    name: "Python",
    icon: () => <TwoColorPythonIcon />, // Python icon already has perfect size
    color: "text-green-500",
    size: null, // null means use the icon's default size
  },
  java: {
    name: "Java",
    icon: (props: IconProps) => <Coffee {...props} />,
    color: "text-red-500",
    size: DEFAULT_ICON_SIZE,
  },
  csharp: {
    name: "C#",
    icon: (props: IconProps) => <Hash {...props} />,
    color: "text-purple-500",
    size: DEFAULT_ICON_SIZE,
  },
  cpp: {
    name: "C++",
    icon: (props: IconProps) => <Code2 {...props} />,
    color: "text-blue-600",
    size: DEFAULT_ICON_SIZE,
  },
  sql: {
    name: "SQL",
    icon: (props: IconProps) => <PiFileSqlBold {...props} />,
    color: "text-orange-500",
    size: DEFAULT_ICON_SIZE,
  },
  html: {
    name: "HTML",
    icon: (props: IconProps) => <Globe {...props} />,
    color: "text-orange-600",
    size: DEFAULT_ICON_SIZE,
  },
  css: {
    name: "CSS",
    icon: (props: IconProps) => <FileCode {...props} />,
    color: "text-blue-400",
    size: DEFAULT_ICON_SIZE,
  },
  php: {
    name: "PHP",
    icon: (props: IconProps) => <File {...props} />,
    color: "text-indigo-500",
    size: DEFAULT_ICON_SIZE,
  },
  bash: {
    name: "Bash",
    icon: (props: IconProps) => <Terminal {...props} />,
    color: "text-green-600",
    size: DEFAULT_ICON_SIZE,
  },
  shell: {
    name: "Shell",
    icon: (props: IconProps) => <Terminal {...props} />,
    color: "text-gray-500",
    size: DEFAULT_ICON_SIZE,
  },
  powershell: {
    name: "PowerShell",
    icon: (props: IconProps) => <Terminal {...props} />,
    color: "text-blue-700",
    size: DEFAULT_ICON_SIZE,
  },
  ruby: {
    name: "Ruby",
    icon: (props: IconProps) => <SiRuby {...props} />,
    color: "text-red-600",
    size: DEFAULT_ICON_SIZE,
  },
  go: {
    name: "Go",
    icon: (props: IconProps) => <SiGo {...props} />,
    color: "text-cyan-500",
    size: DEFAULT_ICON_SIZE,
  },
  rust: {
    name: "Rust",
    icon: (props: IconProps) => <SiRust {...props} />,
    color: "text-orange-700",
    size: DEFAULT_ICON_SIZE,
  },
  json: {
    name: "JSON",
    icon: (props: IconProps) => <Braces {...props} />,
    color: "text-yellow-600",
    size: DEFAULT_ICON_SIZE,
  },
  yaml: {
    name: "YAML",
    icon: (props: IconProps) => <FileText {...props} />,
    color: "text-purple-400",
    size: DEFAULT_ICON_SIZE,
  },
  xml: {
    name: "XML",
    icon: (props: IconProps) => <FileCode {...props} />,
    color: "text-blue-300",
    size: DEFAULT_ICON_SIZE,
  },
  markdown: {
    name: "Markdown",
    icon: (props: IconProps) => <FileText {...props} />,
    color: "text-gray-600",
    size: DEFAULT_ICON_SIZE,
  },
  r: {
    name: "R",
    icon: (props: IconProps) => <SiR {...props} />,
    color: "text-blue-800",
    size: DEFAULT_ICON_SIZE,
  },
  swift: {
    name: "Swift",
    icon: (props: IconProps) => <SiSwift {...props} />,
    color: "text-orange-500",
    size: DEFAULT_ICON_SIZE,
  },
  kotlin: {
    name: "Kotlin",
    icon: (props: IconProps) => <SiKotlin {...props} />,
    color: "text-purple-600",
    size: DEFAULT_ICON_SIZE,
  },
  docker: {
    name: "Dockerfile",
    icon: (props: IconProps) => <SiDocker {...props} />,
    color: "text-blue-500",
    size: DEFAULT_ICON_SIZE,
  },
  graphql: {
    name: "GraphQL",
    icon: (props: IconProps) => <SiGraphql {...props} />,
    color: "text-pink-600",
    size: DEFAULT_ICON_SIZE,
  },
};

export function getLanguageIconNode(
  language: string,
  compact = false,
  iconOverride?: React.ReactNode,
): React.ReactNode {
  if (iconOverride) return iconOverride;
  const normalizedLang = language.toLowerCase();
  const langInfo = languageMap[normalizedLang] || languageMap["code"];
  const Icon = langInfo.icon;
  const size = compact ? 14 : 16;
  if (langInfo.size === null) {
    return <Icon className={cn(langInfo.color)} />;
  }
  return <Icon size={size} className={cn(langInfo.color)} />;
}

interface LanguageDisplayProps {
  language?: string;
  className?: string;
  iconSize?: number;
  isMobile?: boolean;
}

const LanguageDisplay: React.FC<LanguageDisplayProps> = ({
  language = "code",
  className,
  iconSize,
  isMobile,
}) => {
  const normalizedLang = language.toLowerCase();
  const langInfo = languageMap[normalizedLang] || languageMap["code"];

  const Icon = langInfo.icon;

  // Use the provided iconSize, or the language-specific size, or the default size
  const size = isMobile
    ? MOBILE_ICON_SIZE
    : iconSize || langInfo.size || DEFAULT_ICON_SIZE;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* Only pass size prop if it's not null (for custom icons like Python) */}
      {langInfo.size === null ? (
        <Icon className={cn(langInfo.color)} />
      ) : (
        <Icon size={size} className={cn(langInfo.color)} />
      )}
      <span className="text-sm text-neutral-800 dark:text-neutral-200 font-mono">
        {langInfo.name}
      </span>
    </div>
  );
};

export default LanguageDisplay;
