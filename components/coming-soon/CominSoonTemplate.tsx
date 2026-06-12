const HERO_TITLE_LINE_1 = "Command your";
const HERO_TITLE_LINE_2 = "autonomous future";
const STATUS_BADGE_TEXT = "Something incredible is in the works";
const HERO_DESCRIPTION =
  "AI Matrx Agentic Harness is the most sophisticated platform designed to build, deploy, and manage your AI workforce at scale. We are launching soon.";

interface ComingSoonPageProps {
  heroTitleLine1?: string;
  heroTitleLine2?: string;
  description?: string;
  statusBadgeText?: string;
}

export default function ComingSoonPage({
  heroTitleLine1 = HERO_TITLE_LINE_1,
  heroTitleLine2 = HERO_TITLE_LINE_2,
  description = HERO_DESCRIPTION,
  statusBadgeText = STATUS_BADGE_TEXT,
}: ComingSoonPageProps) {
  return (
    <div className="relative min-h-dvh bg-black text-white flex flex-col justify-between overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500 via-purple-500 to-transparent blur-[100px] rounded-full mix-blend-screen" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between pt-15 w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          {/* Optional: Replace with an SVG logo */}
          <span className="text-xl font-bold tracking-tight text-zinc-100">
            AI Matrx Agentic Harness
          </span>
        </div>
        <a
          href="mailto:hello@ai-matrx.com"
          className="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200"
        >
          Contact Us
        </a>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center w-full max-w-4xl mx-auto mt-[-5dvh]">
        {/* Status Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm text-xs font-medium text-zinc-300 tracking-wide mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          {statusBadgeText}
        </div>

        {/* Hero Typography */}
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500">
          {heroTitleLine1} <br className="hidden sm:block" />
          {heroTitleLine2}.
        </h1>

        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          {description}
        </p>

        {/* Static Notify UI */}
        <div className="w-full max-w-md mx-auto relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative flex flex-col sm:flex-row gap-2 p-1.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <input
              type="email"
              placeholder="Enter your email address"
              disabled
              className="flex-1 px-4 py-3 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none disabled:cursor-not-allowed"
            />
            <button
              disabled
              className="px-6 py-3 rounded-md bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-200 disabled:opacity-90 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Get Early Access
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto p-6 md:px-12 md:py-8 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-zinc-900/50 text-zinc-500 text-sm">
        <p>
          &copy; {new Date().getFullYear()} AI Matrx Agentic Harness. All rights
          reserved.
        </p>
        <div className="flex gap-6">
          <span className="hover:text-zinc-300 cursor-pointer transition-colors">
            Twitter / X
          </span>
          <span className="hover:text-zinc-300 cursor-pointer transition-colors">
            LinkedIn
          </span>
        </div>
      </footer>
    </div>
  );
}
