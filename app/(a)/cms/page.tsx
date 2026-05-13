"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CmsSiteService } from "@/features/cms/services/cmsService";
import type { ClientSite } from "@/features/cms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Globe,
  Plus,
  Loader2,
  AlertCircle,
  PanelTop,
  ExternalLink,
  FileText,
  Settings,
  ArrowRight,
} from "lucide-react";

export default function SitesListPage() {
  const router = useRouter();
  const [sites, setSites] = useState<ClientSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchSites = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await CmsSiteService.listSites();
      setSites(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const handleNameChange = (val: string) => {
    setNewName(val);
    setNewSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    );
  };

  const handleCreate = async () => {
    if (!newName || !newSlug) return;
    setIsCreating(true);
    try {
      const site = await CmsSiteService.createSite({
        name: newName,
        slug: newSlug,
        domain: newDomain || undefined,
      });
      setDialogOpen(false);
      setNewName("");
      setNewSlug("");
      setNewDomain("");
      router.push(`/cms/${site.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--shell-header-h,56px))]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading your sites…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error && sites.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--shell-header-h,56px))]">
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to load sites</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchSites}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-var(--shell-header-h,56px))] flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex-none border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <PanelTop className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">
              Content Manager
            </h1>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 text-sm">
                <Plus className="h-4 w-4" />
                New Site
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Site</DialogTitle>
                <DialogDescription>
                  Set up a new site to manage its pages, components, and
                  content.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium block mb-1.5">
                    Site Name
                  </label>
                  <Input
                    value={newName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="My Website"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">
                    Slug
                  </label>
                  <Input
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="my-website"
                    className="text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    URL identifier — lowercase letters, numbers, and hyphens
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">
                    Domain (optional)
                  </label>
                  <Input
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="www.example.com"
                    className="text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isCreating || !newName || !newSlug}
                  className="gap-1.5"
                >
                  {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Site
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Sites grid ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {sites.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4 text-muted-foreground max-w-md text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Globe className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                No sites yet
              </h2>
              <p className="text-sm">
                Create your first website to start managing pages, components,
                and content.
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Your First Site
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {sites.map((site) => (
              <button
                key={site.id}
                onClick={() => router.push(`/cms/${site.id}`)}
                className="group text-left rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer active:scale-[0.97] active:transition-none"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  {site.name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono mb-3">
                  {site.domain || site.slug}
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={site.is_active ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {site.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </button>
            ))}

            {/* Create new card */}
            <button
              onClick={() => setDialogOpen(true)}
              className="rounded-xl border border-dashed border-border p-5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors min-h-[160px] cursor-pointer active:scale-[0.97] active:transition-none"
            >
              <Plus className="h-6 w-6" />
              <span className="text-sm font-medium">Add Site</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
