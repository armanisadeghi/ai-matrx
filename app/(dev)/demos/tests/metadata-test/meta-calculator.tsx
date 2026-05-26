"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Smartphone, Monitor, ExternalLink, AlertTriangle, Search } from "lucide-react";

const GoogleLogo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const StatusDot = ({ ok }: { ok: boolean }) => (
  <span className={`inline-flex w-2 h-2 rounded-full ${ok ? "bg-[#34A853]" : "bg-[#EA4335]"}`} />
);

export default function Page() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState({
    titleWidth: 0,
    descriptionWidth: 0,
    titleCharCount: 0,
    descriptionCharCount: 0,
  });

  const calculatePixelWidths = useCallback(() => {
    const titleCharCount = title.length;
    const descriptionCharCount = description.length;

    if (!title && !description) {
      setResult({ titleWidth: 0, descriptionWidth: 0, titleCharCount: 0, descriptionCharCount: 0 });
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    context.font = "400 20px 'Google Sans', 'Roboto', Arial, sans-serif";
    const titleWidth = title ? context.measureText(title).width : 0;

    context.font = "400 13px 'Google Sans', 'Roboto', Arial, sans-serif";
    const descriptionWidth = description ? context.measureText(description).width : 0;

    setResult({ titleWidth, descriptionWidth, titleCharCount, descriptionCharCount });
  }, [title, description]);

  useEffect(() => {
    const timer = setTimeout(calculatePixelWidths, 150);
    return () => clearTimeout(timer);
  }, [calculatePixelWidths]);

  const titleDesktopOk = result.titleWidth <= 580;
  const titleMobileOk = result.titleWidth <= 920;
  const titleCharOk = result.titleCharCount <= 60;
  const descDesktopOk = result.descriptionWidth <= 920;
  const descMobileOk = result.descriptionWidth <= 680;
  const descCharOk = result.descriptionCharCount <= 160;

  const hasData =
    result.titleWidth > 0 ||
    result.descriptionWidth > 0 ||
    result.titleCharCount > 0 ||
    result.descriptionCharCount > 0;

  const getDisplayUrl = () => {
    if (!url) return "example.com";
    try {
      return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    } catch {
      return url;
    }
  };

  const getUrlBreadcrumb = () => {
    if (!url) return " › category › page";
    try {
      const segments = new URL(url.startsWith("http") ? url : `https://${url}`)
        .pathname.split("/").filter(Boolean);
      if (!segments.length) return " › category › page";
      return " › " + segments.slice(-3).join(" › ");
    } catch {
      return " › category › page";
    }
  };

  const titlePct = Math.min((result.titleWidth / 580) * 100, 100);
  const descPct = Math.min((result.descriptionWidth / 920) * 100, 100);
  const titleCharPct = Math.min((result.titleCharCount / 60) * 100, 100);
  const descCharPct = Math.min((result.descriptionCharCount / 160) * 100, 100);

  const barColor = (pct: number) =>
    pct >= 100 ? "#EA4335" : pct >= 85 ? "#FBBC05" : "#34A853";

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-zinc-900 font-[system-ui,sans-serif]">

      {/* ── Top nav ─────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-zinc-800 border-b border-[#dfe1e5] dark:border-zinc-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GoogleLogo size={28} />
          <span className="text-[#202124] dark:text-zinc-100 text-lg font-medium tracking-tight">
            Meta Width Calculator
          </span>
        </div>
        <span className="text-xs text-[#70757a] dark:text-zinc-400 hidden sm:block">
          Updated for 2024 · Google Sans font · 13px descriptions
        </span>
      </header>

      {/* ── Google search bar hero ───────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-800 border-b border-[#dfe1e5] dark:border-zinc-700 px-6 py-5">
        <div className="max-w-[720px] mx-auto space-y-4">
          {/* Fake search bar */}
          <div className="flex items-center gap-3 bg-white dark:bg-zinc-700 border border-[#dfe1e5] dark:border-zinc-600 rounded-full px-5 py-3 shadow-[0_1px_6px_rgba(32,33,36,.28)] dark:shadow-[0_1px_6px_rgba(0,0,0,.4)] hover:shadow-[0_1px_6px_rgba(32,33,36,.38)] dark:hover:shadow-[0_1px_10px_rgba(0,0,0,.5)] transition-shadow">
            <Search className="w-4 h-4 text-[#9aa0a6] dark:text-zinc-400 flex-shrink-0" />
            <span className="text-[#202124] dark:text-zinc-200 text-base flex-1 truncate">
              {title || "Paste your meta title to preview…"}
            </span>
            <GoogleLogo size={20} />
          </div>

          {/* Google tabs */}
          <div className="flex gap-6 text-sm border-b border-[#dfe1e5] dark:border-zinc-600 pb-0">
            {["All", "Images", "Videos", "News", "Maps", "More"].map((tab, i) => (
              <button
                key={tab}
                className={`pb-3 border-b-2 transition-colors ${
                  i === 0
                    ? "border-[#1a73e8] text-[#1a73e8] font-medium"
                    : "border-transparent text-[#70757a] dark:text-zinc-400 hover:text-[#202124] dark:hover:text-zinc-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <p className="text-xs text-[#70757a] dark:text-zinc-500 pt-1">
            About 600,000,000 results (0.54 seconds)
          </p>
        </div>
      </div>

      {/* ── Main body ────────────────────────────────────────────── */}
      <main className="max-w-[1400px] mx-auto px-4 py-6 xl:px-8">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

          {/* ── LEFT: Inputs + Analysis ── */}
          <aside className="xl:col-span-4 space-y-4">

            {/* Input card */}
            <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-[#dfe1e5] dark:border-zinc-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f1f3f4] dark:border-zinc-700">
                <h2 className="text-xs font-semibold text-[#5f6368] dark:text-zinc-400 uppercase tracking-wider">Input</h2>
              </div>
              <div className="px-5 py-5 space-y-5">

                {/* URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#5f6368] dark:text-zinc-400 uppercase tracking-wide">
                    Website URL
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/category/page"
                      className="flex-1 h-9 text-sm bg-[#f8f9fa] dark:bg-zinc-700 border-[#dfe1e5] dark:border-zinc-600 text-[#202124] dark:text-zinc-100 placeholder:text-[#9aa0a6] dark:placeholder:text-zinc-500 rounded-lg focus-visible:ring-[#1a73e8] focus-visible:border-[#1a73e8]"
                    />
                    <Button
                      onClick={() => console.log("Fetching:", url)}
                      disabled={!url}
                      size="sm"
                      className="h-9 px-3 bg-[#1a73e8] hover:bg-[#1765cc] text-white rounded-lg text-xs font-medium shrink-0 disabled:opacity-40"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Meta Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-[#5f6368] dark:text-zinc-400 uppercase tracking-wide">
                      Meta Title
                    </label>
                    {title && (
                      <span className={`text-xs font-medium ${titleCharOk ? "text-[#34A853]" : "text-[#EA4335]"}`}>
                        {result.titleCharCount}/60
                      </span>
                    )}
                  </div>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter your meta title…"
                    className="h-9 text-sm bg-[#f8f9fa] dark:bg-zinc-700 border-[#dfe1e5] dark:border-zinc-600 text-[#202124] dark:text-zinc-100 placeholder:text-[#9aa0a6] dark:placeholder:text-zinc-500 rounded-lg focus-visible:ring-[#1a73e8] focus-visible:border-[#1a73e8]"
                  />
                </div>

                {/* Meta Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-[#5f6368] dark:text-zinc-400 uppercase tracking-wide">
                      Meta Description
                    </label>
                    {description && (
                      <span className={`text-xs font-medium ${descCharOk ? "text-[#34A853]" : "text-[#EA4335]"}`}>
                        {result.descriptionCharCount}/160
                      </span>
                    )}
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter your meta description…"
                    rows={4}
                    className="text-sm bg-[#f8f9fa] dark:bg-zinc-700 border-[#dfe1e5] dark:border-zinc-600 text-[#202124] dark:text-zinc-100 placeholder:text-[#9aa0a6] dark:placeholder:text-zinc-500 rounded-lg resize-none focus-visible:ring-[#1a73e8] focus-visible:border-[#1a73e8]"
                  />
                </div>
              </div>
            </div>

            {/* Analysis card */}
            {hasData && (
              <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-[#dfe1e5] dark:border-zinc-700 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#f1f3f4] dark:border-zinc-700">
                  <h2 className="text-xs font-semibold text-[#5f6368] dark:text-zinc-400 uppercase tracking-wider">Analysis</h2>
                </div>
                <div className="px-5 py-5 space-y-6">

                  {title && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#202124] dark:text-zinc-200 uppercase tracking-wide">Meta Title</span>
                        <span className="ml-auto text-xs text-[#70757a] dark:text-zinc-400">{result.titleWidth.toFixed(0)}px</span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#70757a] dark:text-zinc-400">
                          <span>Pixel width (desktop 580px)</span>
                          <span style={{ color: barColor(titlePct) }}>{titlePct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-[#f1f3f4] dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${titlePct}%`, backgroundColor: barColor(titlePct) }}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#70757a] dark:text-zinc-400">
                          <span>Characters (60 limit)</span>
                          <span style={{ color: barColor(titleCharPct) }}>{result.titleCharCount}/60</span>
                        </div>
                        <div className="h-1.5 bg-[#f1f3f4] dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${titleCharPct}%`, backgroundColor: barColor(titleCharPct) }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9fa] dark:bg-zinc-700/60 rounded-lg">
                          <Monitor className="w-3.5 h-3.5 text-[#70757a] dark:text-zinc-400" />
                          <span className="text-xs text-[#5f6368] dark:text-zinc-300">Desktop</span>
                          <span className="ml-auto">
                            {titleDesktopOk
                              ? <CheckCircle className="w-4 h-4 text-[#34A853]" />
                              : <XCircle className="w-4 h-4 text-[#EA4335]" />}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9fa] dark:bg-zinc-700/60 rounded-lg">
                          <Smartphone className="w-3.5 h-3.5 text-[#70757a] dark:text-zinc-400" />
                          <span className="text-xs text-[#5f6368] dark:text-zinc-300">Mobile</span>
                          <span className="ml-auto">
                            {titleMobileOk
                              ? <CheckCircle className="w-4 h-4 text-[#34A853]" />
                              : <XCircle className="w-4 h-4 text-[#EA4335]" />}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {description && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#202124] dark:text-zinc-200 uppercase tracking-wide">Meta Description</span>
                        <span className="ml-auto text-xs text-[#70757a] dark:text-zinc-400">{result.descriptionWidth.toFixed(0)}px</span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#70757a] dark:text-zinc-400">
                          <span>Pixel width (desktop 920px)</span>
                          <span style={{ color: barColor(descPct) }}>{descPct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-[#f1f3f4] dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${descPct}%`, backgroundColor: barColor(descPct) }}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#70757a] dark:text-zinc-400">
                          <span>Characters (160 limit)</span>
                          <span style={{ color: barColor(descCharPct) }}>{result.descriptionCharCount}/160</span>
                        </div>
                        <div className="h-1.5 bg-[#f1f3f4] dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${descCharPct}%`, backgroundColor: barColor(descCharPct) }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9fa] dark:bg-zinc-700/60 rounded-lg">
                          <Monitor className="w-3.5 h-3.5 text-[#70757a] dark:text-zinc-400" />
                          <span className="text-xs text-[#5f6368] dark:text-zinc-300">Desktop</span>
                          <span className="ml-auto">
                            {descDesktopOk
                              ? <CheckCircle className="w-4 h-4 text-[#34A853]" />
                              : <XCircle className="w-4 h-4 text-[#EA4335]" />}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9fa] dark:bg-zinc-700/60 rounded-lg">
                          <Smartphone className="w-3.5 h-3.5 text-[#70757a] dark:text-zinc-400" />
                          <span className="text-xs text-[#5f6368] dark:text-zinc-300">Mobile</span>
                          <span className="ml-auto">
                            {descMobileOk
                              ? <CheckCircle className="w-4 h-4 text-[#34A853]" />
                              : <XCircle className="w-4 h-4 text-[#EA4335]" />}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>

          {/* ── RIGHT: Google SERP Preview ── */}
          <section className="xl:col-span-8 space-y-4">

            {/* Section header */}
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#5f6368] dark:text-zinc-400 uppercase tracking-wider">
                Live SERP Preview
              </h2>
              <div className="flex items-center gap-4 text-xs text-[#70757a] dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <StatusDot ok={titleDesktopOk && titleMobileOk && titleCharOk} /> Title
                </span>
                <span className="flex items-center gap-1.5">
                  <StatusDot ok={descDesktopOk && descMobileOk && descCharOk} /> Description
                </span>
              </div>
            </div>

            {/*
              SERP preview panels are intentionally locked to white/light.
              Google's search results page is always a light UI — keeping it
              accurate is more useful than theming it with the OS dark mode.
              A subtle dark-mode frame wrapper distinguishes the preview from
              the surrounding dark shell.
            */}

            {/* Desktop preview */}
            <div className="rounded-2xl border border-[#dfe1e5] dark:border-zinc-600 shadow-sm overflow-hidden">
              {/* Header bar — themed */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[#dfe1e5] dark:border-zinc-600 bg-[#f8f9fa] dark:bg-zinc-700">
                <Monitor className="w-3.5 h-3.5 text-[#70757a] dark:text-zinc-300" />
                <span className="text-xs text-[#5f6368] dark:text-zinc-300 font-medium">Desktop</span>
                <span className="ml-auto text-[10px] text-[#9aa0a6] dark:text-zinc-400">
                  Max 580px title · 920px description
                </span>
              </div>
              {/* Preview body — always light (authentic Google) */}
              <div className="bg-white px-8 py-6" style={{ fontFamily: "'Google Sans', Roboto, Arial, sans-serif" }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-7 h-7 bg-[#f1f3f4] rounded-full flex items-center justify-center text-xs text-[#70757a] font-bold">
                    {getDisplayUrl().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm text-[#202124] font-medium leading-tight">{getDisplayUrl()}</div>
                    <div className="text-xs text-[#70757a] leading-tight">{getDisplayUrl()}{getUrlBreadcrumb()}</div>
                  </div>
                </div>

                <div
                  className="text-xl leading-[1.3] mb-1.5 hover:underline cursor-pointer"
                  style={{ color: "#1a0dab", maxWidth: "600px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {title || <span style={{ color: "#70757a", fontWeight: 400, fontSize: "1rem" }}>Your meta title will appear here…</span>}
                </div>

                <div className="text-sm leading-[1.58] text-[#4d5156]" style={{ maxWidth: "600px" }}>
                  {description || (
                    <span style={{ color: "#9aa0a6" }}>
                      Your meta description will appear here. This is usually taken from the Meta Description tag if relevant to the query.
                    </span>
                  )}
                </div>

                <div className="flex gap-5 text-xs text-[#70757a] mt-2.5">
                  <span style={{ color: "#FBBC05" }}>★★★★☆</span>
                  <span>$99 – $199</span>
                  <span>In stock</span>
                </div>
              </div>
            </div>

            {/* Mobile preview */}
            <div className="rounded-2xl border border-[#dfe1e5] dark:border-zinc-600 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[#dfe1e5] dark:border-zinc-600 bg-[#f8f9fa] dark:bg-zinc-700">
                <Smartphone className="w-3.5 h-3.5 text-[#70757a] dark:text-zinc-300" />
                <span className="text-xs text-[#5f6368] dark:text-zinc-300 font-medium">Mobile</span>
                <span className="ml-auto text-[10px] text-[#9aa0a6] dark:text-zinc-400">
                  Max 920px title · 680px description
                </span>
              </div>
              {/* Always light */}
              <div className="bg-white px-4 py-5 max-w-[380px]" style={{ fontFamily: "'Google Sans', Roboto, Arial, sans-serif" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#f1f3f4] rounded-full flex items-center justify-center text-[10px] text-[#70757a] font-bold">
                    {getDisplayUrl().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs text-[#202124] font-medium">{getDisplayUrl()}</div>
                    <div className="text-[10px] text-[#70757a]">{getDisplayUrl()}{getUrlBreadcrumb()}</div>
                  </div>
                </div>

                <div
                  className="text-base leading-[1.3] mb-1 hover:underline cursor-pointer"
                  style={{ color: "#1a0dab", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {title || <span style={{ color: "#70757a", fontWeight: 400, fontSize: "0.875rem" }}>Your meta title will appear here…</span>}
                </div>

                <div className="text-xs leading-[1.5] text-[#4d5156]">
                  {description || (
                    <span style={{ color: "#9aa0a6" }}>
                      Your meta description will appear here with mobile-specific line wrapping applied.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Recommendations */}
            {hasData && (
              <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-[#dfe1e5] dark:border-zinc-700 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#f1f3f4] dark:border-zinc-700">
                  <h2 className="text-xs font-semibold text-[#5f6368] dark:text-zinc-400 uppercase tracking-wider">
                    Recommendations
                  </h2>
                </div>
                <div className="px-5 py-4 space-y-2.5">
                  {title && (
                    <>
                      {!titleDesktopOk && (
                        <div className="flex items-start gap-2.5 text-xs text-[#EA4335]">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Title exceeds <strong>580px</strong> desktop limit ({result.titleWidth.toFixed(0)}px) — may be truncated.</span>
                        </div>
                      )}
                      {!titleMobileOk && (
                        <div className="flex items-start gap-2.5 text-xs text-[#EA4335]">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Title exceeds <strong>920px</strong> mobile limit ({result.titleWidth.toFixed(0)}px) — may be truncated on mobile.</span>
                        </div>
                      )}
                      {!titleCharOk && (
                        <div className="flex items-start gap-2.5 text-xs text-[#FBBC05]">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Title has <strong>{result.titleCharCount} characters</strong> — SEO best practice is ≤60 chars.</span>
                        </div>
                      )}
                      {titleDesktopOk && titleMobileOk && titleCharOk && (
                        <div className="flex items-start gap-2.5 text-xs text-[#34A853]">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Title looks great — within pixel and character limits on all devices.</span>
                        </div>
                      )}
                    </>
                  )}
                  {description && (
                    <>
                      {!descDesktopOk && (
                        <div className="flex items-start gap-2.5 text-xs text-[#EA4335]">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Description exceeds <strong>920px</strong> desktop limit — may be truncated.</span>
                        </div>
                      )}
                      {!descMobileOk && (
                        <div className="flex items-start gap-2.5 text-xs text-[#EA4335]">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Description exceeds <strong>680px</strong> mobile limit — may be truncated on mobile.</span>
                        </div>
                      )}
                      {!descCharOk && (
                        <div className="flex items-start gap-2.5 text-xs text-[#FBBC05]">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Description has <strong>{result.descriptionCharCount} characters</strong> — SEO best practice is ≤160 chars.</span>
                        </div>
                      )}
                      {descDesktopOk && descMobileOk && descCharOk && (
                        <div className="flex items-start gap-2.5 text-xs text-[#34A853]">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>Description looks great — within pixel and character limits on all devices.</span>
                        </div>
                      )}
                    </>
                  )}
                  {!title && !description && (
                    <p className="text-xs text-[#9aa0a6] dark:text-zinc-500">
                      Enter a title or description above to see recommendations.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
