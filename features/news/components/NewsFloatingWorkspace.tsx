"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCcw, ExternalLink, Globe, Hash, Newspaper } from "lucide-react";
import { fetchNews } from "@/actions/ai-actions/news-api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { InlineMediaRef } from "@/features/files";

const CATEGORIES = [
  "general",
  "business",
  "technology",
  "science",
  "health",
  "sports",
  "entertainment",
  "ai",
];

const COUNTRIES = [
  { code: "us", name: "United States" },
  { code: "gb", name: "United Kingdom" },
  { code: "ca", name: "Canada" },
  { code: "au", name: "Australia" },
  { code: "in", name: "India" },
];

interface Article {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: {
    name: string;
  };
}

export function NewsFloatingWorkspace() {
  const [news, setNews] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("general");
  const [country, setCountry] = useState("us");

  const handleFetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchNews(category, country);
      if (result.data?.articles) {
        setNews(result.data.articles);
      } else {
        setNews([]);
      }
    } catch (error) {
      console.error("Error fetching news:", error);
    }
    setLoading(false);
  }, [category, country]);

  useEffect(() => {
    handleFetchNews();
  }, [handleFetchNews]);

  return (
    <div className="flex h-full w-full bg-background overflow-hidden relative">
      {/* Sidebar for Filters */}
      <div className="w-[120px] shrink-0 border-r border-border bg-muted/10 flex flex-col p-2 space-y-4 overflow-y-auto">
        <div className="space-y-1 mt-1">
          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 mb-2 flex items-center gap-1.5">
            <Hash className="w-3 h-3" />
            Category
          </div>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-md text-[11px] capitalize transition-colors font-medium",
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="border-t border-border pt-3 space-y-1">
          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 mb-2 flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            Country
          </div>
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-md text-[11px] transition-colors font-medium",
                country === c.code
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-background relative">
        {/* Header Bar */}
        <div className="h-10 border-b border-border flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur z-10 sticky top-0 shadow-sm">
           <div className="flex items-center space-x-2">
              <Newspaper className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold capitalize">{category} News</span>
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full uppercase">{country}</span>
           </div>
           <Button
              variant="ghost"
              size="sm"
              onClick={handleFetchNews}
              disabled={loading}
              className="h-6 px-2 text-[10px]"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3 mr-1.5" />}
              Refresh
           </Button>
        </div>

        {/* Scrollable Feed */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
           {loading ? (
             // Loading Skeletons
             Array.from({ length: 4 }).map((_, i) => (
               <div key={i} className="rounded-lg border border-border p-3 space-y-3 flex gap-3 opacity-60">
                 <div className="w-20 h-20 bg-muted shrink-0 rounded-md animate-pulse" />
                 <div className="flex-1 space-y-2">
                   <div className="h-4 bg-muted w-3/4 rounded animate-pulse" />
                   <div className="h-3 bg-muted w-1/2 rounded animate-pulse" />
                   <div className="h-3 bg-muted w-full mt-2 rounded animate-pulse" />
                 </div>
               </div>
             ))
           ) : news.length > 0 ? (
             news.map((article, i) => (
               <NewsItem key={i} article={article} />
             ))
           ) : (
             <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground opacity-60">
               <Newspaper className="w-10 h-10 mb-3" />
               <p className="text-xs">No articles found for this selection.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

function NewsItem({ article }: { article: Article }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-border bg-card hover:bg-accent/30 hover:border-primary/30 transition-all p-2.5 shadow-sm"
    >
      <div className="flex gap-3">
        {/* Thumbnail — InlineMediaRef shows a Newspaper icon when the article
            has no urlToImage, and its built-in informative error fallback
            when the URL exists but fails to load. */}
        <div className="w-20 h-20 shrink-0 bg-muted rounded border border-border/50 relative overflow-hidden flex items-center justify-center">
          <InlineMediaRef
            ref={article.urlToImage ?? null}
            size="fill"
            fit="cover"
            rounded="none"
            alt={article.title}
            className="group-hover:scale-105 transition-transform duration-300"
            fallbackIcon={
              <Newspaper className="w-6 h-6 text-muted-foreground/30" />
            }
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors text-foreground">
              {article.title}
            </h4>
            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
              {article.description}
            </p>
          </div>
          
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center gap-1.5 text-[9px] font-medium text-muted-foreground">
              <span className="truncate max-w-[100px]">{article.source?.name}</span>
              <span>•</span>
              <span>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : ""}</span>
            </div>
            <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </a>
  );
}
