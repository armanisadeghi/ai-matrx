import { readdirSync } from "fs";
import { join } from "path";
import { ExternalLink, FileCode2, FolderOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StaticFile {
  name: string;
  label: string;
  href: string;
  ext: string;
}

interface StaticFilesIndexPageProps {
  /** Subdirectory inside `public/` to scan, e.g. "samples" */
  publicSubdir: string;
  /** URL base that maps to the subdir, e.g. "/samples" */
  basePath: string;
  title?: string;
  description?: string;
  icon?: LucideIcon;
  /** Extensions to include (default: [".html"]) */
  extensions?: string[];
  /** Whether to strip the extension from the link URL (requires a rewrite rule) */
  stripExtension?: boolean;
}

function toLabel(filename: string, ext: string): string {
  return filename
    .slice(0, -ext.length)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function scanStaticFiles(
  publicSubdir: string,
  basePath: string,
  extensions: string[],
  stripExtension: boolean,
): StaticFile[] {
  const dir = join(process.cwd(), "public", publicSubdir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const normalizedBase = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;

  return entries
    .filter((f) => extensions.some((ext) => f.toLowerCase().endsWith(ext)))
    .sort()
    .map((f) => {
      const ext = extensions.find((e) => f.toLowerCase().endsWith(e))!;
      const slug = stripExtension ? f.slice(0, -ext.length) : f;
      return {
        name: f,
        label: toLabel(f, ext),
        href: `${normalizedBase}/${slug}`,
        ext,
      };
    });
}

export function StaticFilesIndexPage({
  publicSubdir,
  basePath,
  title,
  description,
  icon: Icon = FileCode2,
  extensions = [".html"],
  stripExtension = true,
}: StaticFilesIndexPageProps) {
  const files = scanStaticFiles(
    publicSubdir,
    basePath,
    extensions,
    stripExtension,
  );

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {(title || description) && (
          <div className="mb-8">
            {title && (
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-5 w-5 text-primary shrink-0" />
                <h1 className="text-2xl font-bold">{title}</h1>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {description ??
                `${files.length} file${files.length !== 1 ? "s" : ""} in /${publicSubdir}`}
            </p>
          </div>
        )}

        {files.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-10 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No files found in{" "}
              <code className="text-xs">public/{publicSubdir}</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {files.map((file) => (
              <a
                key={file.name}
                href={file.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5 hover:border-primary/50 hover:bg-accent/30 transition-colors"
              >
                <FileCode2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 group-hover:text-primary transition-colors" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm truncate">
                      {file.label}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {file.name}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
