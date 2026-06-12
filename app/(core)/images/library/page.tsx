import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CloudUpload,
  FolderOpen,
  Layers,
  Library,
  Zap,
} from "lucide-react";
import { CloudFolders } from "@/features/files";

/**
 * /images/library
 *
 * The Image Studio save flow now writes to the user's Cloud Files library at
 * `{CloudFolders.IMAGES_GENERATED}/<folder-segment>` using the shared cloud
 * pipeline. There's a dedicated explorer for all cloud files at
 * `/files` — this page is a lightweight landing that directs users
 * there and explains the folder convention.
 *
 * Pure Server Component. No client JS ships from this route.
 */
export default function LibraryPage() {
  const libraryPath = CloudFolders.IMAGES_GENERATED;

  return (
    <main className="h-full overflow-y-auto overscroll-contain bg-background">
      <header className="border-b border-border bg-card/40 sticky top-0 z-10 backdrop-blur">
        <div className="container mx-auto px-3 sm:px-6 md:px-10 py-2 md:py-3 max-w-[1400px] flex items-center justify-between gap-2 md:gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/images/studio"
              className="h-9 w-9 md:h-8 md:w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Back to Studio"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold flex items-center gap-1.5 truncate">
                <Library className="h-3.5 w-3.5 text-primary" />
                Image Studio — Library
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/images/presets"
              className="hidden sm:flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Layers className="h-3.5 w-3.5" />
              Presets
            </Link>
            <Link
              href="/images/convert"
              className="flex min-h-[36px] items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Convert
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-6 md:px-10 py-4 md:py-10 max-w-[1100px] space-y-4 md:space-y-8">
        {/* Hero explainer */}
        <section className="space-y-2">
          <h2 className="text-xl md:text-3xl font-semibold tracking-tight">
            Your saves live in Cloud Files
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
            Every variant you save from the Studio lands in your{" "}
            <code className="font-mono text-foreground">{libraryPath}</code>{" "}
            folder inside Cloud Files. That&rsquo;s the same library that backs
            every other tool in the app, so your image presets are instantly
            browsable alongside the rest of your content — versioned, sharable,
            and searchable.
          </p>
        </section>

        {/* Primary CTA card */}
        <section className="rounded-lg md:rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-4 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FolderOpen className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold">Open your library</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Jump straight to Cloud Files. Filter by the{" "}
                <span className="font-mono">{libraryPath}</span> folder to see
                only Studio output, or navigate the whole tree.
              </p>
            </div>
            <Link
              href="/files/all"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors"
            >
              Go to Cloud Files
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Workflow reminder */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
          <StepCard
            icon={<Zap className="h-4 w-4" />}
            title="1. Generate"
            body="Drop an image, pick presets, hit Generate."
          />
          <StepCard
            icon={<CloudUpload className="h-4 w-4" />}
            title="2. Save"
            body="Click &lsquo;Save all to library&rsquo; — variants upload under Images/Generated."
          />
          <StepCard
            icon={<Library className="h-4 w-4" />}
            title="3. Reuse"
            body="Browse them anywhere Cloud Files is available — chat pickers, agent apps, sharing links."
          />
        </section>

        {/* Folder convention note */}
        <section className="rounded-lg md:rounded-xl border border-dashed border-border bg-muted/20 p-3 md:p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">
              Folder convention:
            </span>{" "}
            Studio saves go to{" "}
            <code className="font-mono">{libraryPath}/&lt;your-folder&gt;</code>
            . The folder name comes from the &ldquo;Save to library&rdquo; field
            in the export panel — defaults to{" "}
            <code className="font-mono">image-studio</code>. Every variant of a
            single save session shares that folder, so grouped downloads and
            renames stay coherent.
          </p>
        </section>
      </div>
    </main>
  );
}

function StepCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg md:rounded-xl border border-border bg-card p-3 md:p-4 flex items-center gap-3 md:block">
      <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center md:mb-2 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  );
}
