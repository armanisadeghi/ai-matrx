"use client";

import React, { useState } from "react";
import ThemedSectionCard, { 
  MainColor, 
  AccentColor, 
  ThemeColor, 
  ThemePreset, 
  THEME_PRESETS 
} from "@/components/official/themed-section-card/ThemedSectionCard";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  Palette,
  Check,
  Globe,
  FileText,
  Layout,
  Settings,
  Search,
  SwatchBook,
  Shield,
  Lightbulb,
  AlertTriangle,
  AlertCircle,
  Briefcase,
  MousePointerClick,
  BellRing,
  Zap,
  PenLine,
  Info
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";

// Color dots to visually show the selected colors
const ColorDot: React.FC<{ color: string; className?: string }> = ({ color, className }) => {
  const getColorClass = () => {
    const colorMap: Record<string, string> = {
      slate: "bg-slate-500",
      gray: "bg-gray-500",
      zinc: "bg-zinc-500",
      neutral: "bg-neutral-500",
      stone: "bg-stone-500",
      red: "bg-red-500",
      orange: "bg-orange-500",
      amber: "bg-amber-500",
      yellow: "bg-yellow-500",
      lime: "bg-lime-500",
      green: "bg-green-500",
      emerald: "bg-emerald-500",
      teal: "bg-teal-500",
      cyan: "bg-cyan-500",
      sky: "bg-sky-500",
      blue: "bg-blue-500",
      indigo: "bg-indigo-500",
      violet: "bg-violet-500",
      purple: "bg-purple-500",
      fuchsia: "bg-fuchsia-500",
      pink: "bg-pink-500",
      rose: "bg-rose-500",
    };
    return colorMap[color] || "bg-gray-500";
  };

  return (
    <div className={`rounded-full h-4 w-4 ${getColorClass()} ${className || ""}`} />
  );
};

// Icons for preset themes
const PresetIcon: React.FC<{ preset: ThemePreset }> = ({ preset }) => {
  const iconMap: Record<ThemePreset, React.ReactNode> = {
    default: <SwatchBook className="h-4 w-4" />,
    primary: <Shield className="h-4 w-4" />,
    success: <Check className="h-4 w-4" />,
    info: <Info className="h-4 w-4" />,
    warning: <AlertTriangle className="h-4 w-4" />,
    danger: <AlertCircle className="h-4 w-4" />,
    neutral: <Settings className="h-4 w-4" />,
    elegant: <PenLine className="h-4 w-4" />,
    vibrant: <Zap className="h-4 w-4" />,
    subtle: <BellRing className="h-4 w-4" />,
    professional: <Briefcase className="h-4 w-4" />,
    creative: <MousePointerClick className="h-4 w-4" />,
  };
  
  return <>{iconMap[preset]}</>;
};

export default function ThemedSectionCardDemo() {
  // State for the color selectors
  const [mainColor, setMainColor] = useState<MainColor>("gray");
  const [accentColor, setAccentColor] = useState<AccentColor>("rose");
  const [legacyTheme, setLegacyTheme] = useState<ThemeColor>("rose");
  const [selectedPreset, setSelectedPreset] = useState<ThemePreset>("default");
  
  // Available color options
  const mainColors: MainColor[] = ["slate", "gray", "zinc", "neutral", "stone"];
  const accentColors: AccentColor[] = [
    "slate", "gray", "zinc", "neutral", "stone",
    "red", "orange", "amber", "yellow", "lime",
    "green", "emerald", "teal", "cyan", "sky",
    "blue", "indigo", "violet", "purple",
    "fuchsia", "pink", "rose"
  ];
  const legacyThemes: ThemeColor[] = ["rose", "blue", "green", "purple", "amber", "slate"];
  
  // Get all available presets
  const presets = Object.keys(THEME_PRESETS) as ThemePreset[];
  
  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-bold mb-6">Themed Section Card Demo</h1>
      
      <Tabs defaultValue="presets">
        <TabsList className="mb-6">
          <TabsTrigger value="presets">Theme Presets</TabsTrigger>
          <TabsTrigger value="dual-color">Custom Colors</TabsTrigger>
          <TabsTrigger value="legacy">Legacy Themes</TabsTrigger>
        </TabsList>
        
        <TabsContent value="presets">
          {/* Theme presets selector */}
          <div className="mb-10">
            <Card className="p-4 mb-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Theme Preset:</span>
                  <Select value={selectedPreset} onValueChange={(value) => setSelectedPreset(value as ThemePreset)}>
                    <SelectTrigger className="w-40">
                      <div className="flex items-center gap-2">
                        <PresetIcon preset={selectedPreset} />
                        <SelectValue placeholder="Select preset" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map((preset) => {
                        const { main, accent } = THEME_PRESETS[preset];
                        return (
                          <SelectItem key={preset} value={preset}>
                            <div className="flex items-center gap-2">
                              <PresetIcon preset={preset} />
                              <span className="capitalize">{preset}</span>
                              <div className="flex ml-auto">
                                <ColorDot color={main} className="mr-1" />
                                <ColorDot color={accent} />
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-1 ml-2">
                  <ColorDot color={THEME_PRESETS[selectedPreset].main} className="mr-1" />
                  <span>+</span>
                  <ColorDot color={THEME_PRESETS[selectedPreset].accent} />
                </div>
              </div>
            </Card>

            <ThemedSectionCard
              preset={selectedPreset}
              title={`${selectedPreset.charAt(0).toUpperCase() + selectedPreset.slice(1)} Theme`}
              description="Using the preset theme system"
              headerActions={[
                <Button key="switch" size="sm" variant="outline">
                  <Palette className="h-4 w-4 mr-2" />
                  Switch View
                </Button>
              ]}
              footerLeft={
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              }
              footerRight={
                <Button size="sm">
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              }
            >
              <div className="py-8 text-center">
                <div className="inline-flex items-center gap-2 mb-4">
                  <PresetIcon preset={selectedPreset} />
                  <span className="font-medium capitalize">{selectedPreset} Preset</span>
                </div>
                <div className="flex justify-center items-center gap-2">
                  <div className="flex items-center gap-1">
                    <ColorDot color={THEME_PRESETS[selectedPreset].main} />
                    <span className="text-sm">{THEME_PRESETS[selectedPreset].main}</span>
                  </div>
                  <span>+</span>
                  <div className="flex items-center gap-1">
                    <ColorDot color={THEME_PRESETS[selectedPreset].accent} />
                    <span className="text-sm">{THEME_PRESETS[selectedPreset].accent}</span>
                  </div>
                </div>
              </div>
            </ThemedSectionCard>
          </div>
          
          {/* Grid showing all presets */}
          <h2 className="text-xl font-semibold mb-4">Available Presets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {presets.map((preset) => (
              <ThemedSectionCard
                key={preset}
                preset={preset}
                title={preset.charAt(0).toUpperCase() + preset.slice(1)}
                description={`${THEME_PRESETS[preset].main} + ${THEME_PRESETS[preset].accent}`}
                headerActions={[
                  <Button 
                    key="select" 
                    size="sm" 
                    variant="ghost"
                    onClick={() => setSelectedPreset(preset)}
                  >
                    <PresetIcon preset={preset} />
                  </Button>
                ]}
              >
                <div className="py-4 text-center">
                  <div className="flex justify-center items-center gap-2 text-sm">
                    <ColorDot color={THEME_PRESETS[preset].main} />
                    <span>+</span>
                    <ColorDot color={THEME_PRESETS[preset].accent} />
                  </div>
                </div>
              </ThemedSectionCard>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="dual-color">
          {/* Dual-color theme selector */}
          <div className="mb-10">
            <Card className="p-4 mb-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Main Color:</span>
                  <Select value={mainColor} onValueChange={(value) => setMainColor(value as MainColor)}>
                    <SelectTrigger className="w-32">
                      <div className="flex items-center gap-2">
                        <ColorDot color={mainColor} />
                        <SelectValue placeholder="Select main" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {mainColors.map((color) => (
                        <SelectItem key={color} value={color}>
                          <div className="flex items-center gap-2">
                            <ColorDot color={color} />
                            <span>{color.charAt(0).toUpperCase() + color.slice(1)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Accent Color:</span>
                  <Select value={accentColor} onValueChange={(value) => setAccentColor(value as AccentColor)}>
                    <SelectTrigger className="w-32">
                      <div className="flex items-center gap-2">
                        <ColorDot color={accentColor} />
                        <SelectValue placeholder="Select accent" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {accentColors.map((color) => (
                        <SelectItem key={color} value={color}>
                          <div className="flex items-center gap-2">
                            <ColorDot color={color} />
                            <span>{color.charAt(0).toUpperCase() + color.slice(1)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            <ThemedSectionCard
              mainColor={mainColor}
              accentColor={accentColor}
              title="Custom Color Combination"
              description={`Main: ${mainColor}, Accent: ${accentColor}`}
              headerActions={[
                <Button key="switch" size="sm" variant="outline">
                  <Palette className="h-4 w-4 mr-2" />
                  Switch View
                </Button>
              ]}
              footerLeft={
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              }
              footerRight={
                <Button size="sm">
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              }
            >
              <div className="py-8 text-center">
                <div className="inline-flex items-center gap-2 mb-2">
                  <ColorDot color={mainColor} />
                  <span className="font-medium">Main: {mainColor}</span>
                </div>
                <div className="h-2"></div>
                <div className="inline-flex items-center gap-2">
                  <ColorDot color={accentColor} />
                  <span className="font-medium">Accent: {accentColor}</span>
                </div>
              </div>
            </ThemedSectionCard>
          </div>
          
          {/* Grid showing common main/accent combinations */}
          <h2 className="text-xl font-semibold mb-4">Popular Combinations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {[
              { main: "gray", accent: "blue" },
              { main: "slate", accent: "emerald" },
              { main: "zinc", accent: "violet" },
              { main: "stone", accent: "amber" },
              { main: "neutral", accent: "rose" },
              { main: "gray", accent: "indigo" }
            ].map((combo, idx) => (
              <ThemedSectionCard
                key={idx}
                mainColor={combo.main as MainColor}
                accentColor={combo.accent as AccentColor}
                title={`${combo.accent.charAt(0).toUpperCase() + combo.accent.slice(1)} on ${combo.main}`}
                description="Professional color combination"
                headerActions={[
                  <Button 
                    key="action" 
                    size="sm" 
                    variant="ghost"
                    onClick={() => {
                      setMainColor(combo.main as MainColor);
                      setAccentColor(combo.accent as AccentColor);
                    }}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                ]}
              >
                <div className="py-6 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <ColorDot color={combo.main} />
                    <span>+</span>
                    <ColorDot color={combo.accent} />
                  </div>
                </div>
              </ThemedSectionCard>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="legacy">
          {/* Legacy theme selector for backwards compatibility */}
          <div className="mb-10">
            <Card className="p-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Legacy Theme:</span>
                <Select value={legacyTheme} onValueChange={(value) => setLegacyTheme(value as ThemeColor)}>
                  <SelectTrigger className="w-32">
                    <div className="flex items-center gap-2">
                      <ColorDot color={legacyTheme} />
                      <SelectValue placeholder="Select theme" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {legacyThemes.map((theme) => (
                      <SelectItem key={theme} value={theme}>
                        <div className="flex items-center gap-2">
                          <ColorDot color={theme} />
                          <span>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
            
            <ThemedSectionCard
              theme={legacyTheme}
              title="Legacy Theme Example"
              description="Using the original theme system for compatibility"
              headerActions={[
                <Button key="action" size="sm" variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              ]}
              footerRight={
                <Button size="sm">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              }
            >
              <div className="py-8 text-center">
                <div className="inline-flex items-center gap-2">
                  <ColorDot color={legacyTheme} />
                  <span className="font-medium">Theme: {legacyTheme}</span>
                </div>
              </div>
            </ThemedSectionCard>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Practical usage examples */}
      <h2 className="text-xl font-semibold mb-4">Practical Examples</h2>
      <div className="space-y-6">
        {/* Documentation section */}
        <ThemedSectionCard
          preset="info"
          title="Documentation"
          description="Technical guides and resources"
          headerActions={[
            <Button key="search" size="sm" variant="ghost">
              <Search className="h-4 w-4 mr-2" />
              Search Docs
            </Button>
          ]}
        >
          <div className="py-6 text-center text-gray-500 dark:text-gray-400">
            Info preset works well for documentation
          </div>
        </ThemedSectionCard>
        
        {/* Dashboard section */}
        <ThemedSectionCard
          preset="professional"
          title="Analytics Dashboard"
          description="Performance metrics and insights"
          headerActions={[
            <Button key="layout" size="sm" variant="outline">
              <Layout className="h-4 w-4 mr-2" />
              Change Layout
            </Button>
          ]}
        >
          <div className="py-6 text-center text-gray-500 dark:text-gray-400">
            Professional preset is perfect for analytics dashboards
          </div>
        </ThemedSectionCard>
        
        {/* Public content section */}
        <ThemedSectionCard
          preset="success"
          title="Published Content"
          description="Public-facing content management"
          headerActions={[
            <Button key="file" size="sm" variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              New Article
            </Button>,
            <Button key="globe" size="sm" variant="default">
              <Globe className="h-4 w-4 mr-2" />
              Publish
            </Button>
          ]}
          footerLeft={
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Last published: Yesterday
            </div>
          }
          footerRight={
            <Button size="sm" variant="outline" className="border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
              <Check className="h-4 w-4 mr-2" />
              Mark Complete
            </Button>
          }
        >
          <div className="py-6 text-center text-gray-500 dark:text-gray-400">
            Success preset for content management
          </div>
        </ThemedSectionCard>
        
        {/* Warning example */}
        <ThemedSectionCard
          preset="warning"
          title="System Alerts"
          description="Important notifications requiring attention"
          headerActions={[
            <Button key="bell" size="sm" variant="outline">
              <BellRing className="h-4 w-4 mr-2" />
              Manage Alerts
            </Button>
          ]}
        >
          <div className="py-6 text-center text-gray-500 dark:text-gray-400">
            Warning preset for alerts and notifications
          </div>
        </ThemedSectionCard>
        
        {/* Creative example */}
        <ThemedSectionCard
          preset="creative"
          title="Design Studio"
          description="Creative tools and resources"
          headerActions={[
            <Button key="palette" size="sm" variant="outline">
              <Lightbulb className="h-4 w-4 mr-2" />
              Generate Ideas
            </Button>
          ]}
        >
          <div className="py-6 text-center text-gray-500 dark:text-gray-400">
            Creative preset for design-focused sections
          </div>
        </ThemedSectionCard>
      </div>
    </div>
  );
} 