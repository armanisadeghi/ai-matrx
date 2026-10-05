import Link from "next/link";
import {
  ArrowDownToLine,
  Boxes,
  CircleHelp,
  Code2,
  FolderSync,
  Lock,
  Mic,
  MonitorSmartphone,
  MousePointerClick,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  Smartphone,
  Volume2,
} from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteConfig } from "@/config/extras/site";
import {
  MATRX_DESKTOP_MAC_DOWNLOAD_PATH,
  formatDownloadSize,
  getMatrxDesktopMacRelease,
} from "@/features/matrx-local-download/desktop-release";
import { MATRX_LOCAL_DOWNLOAD_PATH } from "@/features/matrx-local-download/release";
import { createRouteMetadata } from "@/utils/route-metadata";
import {
  CtaBand,
  Faq,
  FeatureGrid,
  ProductBackdrop,
  ProductHero,
  ProductSection,
  Steps,
  TrustList,
  type FaqItem,
  type FeatureItem,
} from "../_product-page/ProductPage";
import { DesktopMock } from "./DesktopMock";

const TITLE = "Matrx Desktop";
const DESCRIPTION =
  "Matrx Desktop connects AI Matrx and your own computer, both ways. Manage your coding agents, give AI the tools to work on your Mac, transcribe on your own machine, and soon run private chats on hardware you own.";

export const metadata = createRouteMetadata("/desktop", {
  title: "Matrx Desktop for Mac",
  description: DESCRIPTION,
  canonicalPath: "/desktop",
  keywords: [
    "Matrx Desktop",
    "AI Matrx desktop app",
    "AI desktop app for Mac",
    "private AI chat on your own computer",
    "AI agent computer control",
    "local transcription Mac",
    "Claude Code and Codex manager",
  ],
  socialCard: { eyebrow: "Matrx Desktop", theme: "cobalt" },
});

export const revalidate = 600;

const AVAILABLE: readonly FeatureItem[] = [
  {
    icon: Code2,
    title: "All your coding work in one place",
    body: "See every coding agent's work together. Browse your Claude and Codex chats live, group them into projects, watch each account's usage and weekly reset, see what chats cost, and manage your coding apps.",
    status: "live",
  },
  {
    icon: MousePointerClick,
    title: "Tools for working on your computer",
    body: "Built-in tools to see the screen, move windows, type and click, read the clipboard, run and watch programs, check memory and power, and notice when a folder changes.",
    status: "live",
  },
  {
    icon: Mic,
    title: "Transcribe on your own machine",
    body: "Turn a recording into text with Whisper running on your computer, so the audio never has to go anywhere.",
    status: "live",
  },
  {
    icon: RefreshCw,
    title: "Updates itself",
    body: "Matrx Desktop checks for a new version when it opens and every half hour, downloads it quietly, and offers a Restart when it's ready.",
    status: "live",
  },
];

const COMING: readonly FeatureItem[] = [
  {
    icon: Lock,
    title: "Confidential Chat",
    body: "Chats and agents that run on hardware you own. Nothing leaves your computer, and you keep the same agents and tools you use in the cloud.",
    status: "soon",
  },
  {
    icon: RouteIcon,
    title: "One chat, three routes",
    body: "Pick where a chat runs: Matrx Cloud, Confidential on your own hardware, or your Subscriptions such as Claude Code and Codex. Set up right, it feels the same on all three.",
    status: "soon",
  },
  {
    icon: Smartphone,
    title: "Reach it from anywhere",
    body: "Use your computer from your phone or another network, and let your agents keep working on it while you're away.",
    status: "soon",
  },
  {
    icon: Boxes,
    title: "Models you run yourself",
    body: "Find, download and start models for text, images, speech, video and more, sized to what your computer can handle.",
    status: "soon",
  },
  {
    icon: FolderSync,
    title: "Files, in sync",
    body: "Browse your files beside your AI Matrx files and keep chosen folders in sync, even offline.",
    status: "soon",
  },
  {
    icon: Volume2,
    title: "Voice",
    body: "Talk to AI Matrx out loud, hear answers read back, and start with a wake word of your own.",
    status: "soon",
  },
];

const TRUST = [
  {
    icon: ShieldCheck,
    title: "Signed and notarized by Apple",
    body: "Every release is signed and notarized, so macOS can check it before it opens.",
  },
  {
    icon: CircleHelp,
    title: "You say yes to each permission",
    body: "To see your screen or press keys for an agent, macOS asks you first. Matrx Desktop shows what it still needs, with a button to fix it.",
  },
  {
    icon: Lock,
    title: "Built for what stays private",
    body: "Confidential Chat is designed so private chats and files stay on hardware you own. It's on the way; the rest of the app is here today.",
  },
  {
    icon: MonitorSmartphone,
    title: "Mac first, every computer next",
    body: "Windows and Linux are in the plan from day one and come after the Mac version is solid.",
  },
] as const;

const FAQS: readonly FaqItem[] = [
  {
    question: "Which computers does Matrx Desktop run on?",
    answer:
      "Macs with Apple silicon (M1 and newer). Windows and Linux versions are coming. If you're on Windows or Linux today, the download page has an app that works for you now.",
  },
  {
    question: "What does Confidential mean?",
    answer:
      "Confidential means a chat or agent runs on models on hardware you own, starting with your own computer and later your own server, so what you ask and share doesn't pass through anyone else's servers. It's coming soon to Matrx Desktop.",
  },
  {
    question: "Can AI really use my computer for me?",
    answer:
      "Matrx Desktop includes the tools for it: seeing the screen, moving windows, typing and clicking, reading the clipboard, running programs and watching folders. macOS asks for your permission before any of them can run.",
  },
  {
    question: "How does it stay up to date?",
    answer:
      "It checks for a new version every time it opens and every 30 minutes, downloads in the background, and shows a Restart button when the update is ready.",
  },
  {
    question: "How is this different from Matrx Extend?",
    answer:
      "Matrx Extend lives inside Chrome and helps with the page you're reading. Matrx Desktop connects AI Matrx to your whole computer: your apps, files, screen and local models.",
  },
];

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

export default async function MatrxDesktopPage() {
  const release = await getMatrxDesktopMacRelease();
  const size = formatDownloadSize(release?.sizeBytes ?? null);
  const released = formatDate(release?.releaseDate ?? null);
  // The feed's file when it was readable; otherwise the stable address, which tries again on click.
  const downloadHref = release?.url ?? MATRX_DESKTOP_MAC_DOWNLOAD_PATH;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: TITLE,
      description: DESCRIPTION,
      url: `${siteConfig.url}/desktop`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "macOS",
      ...(release
        ? { softwareVersion: release.version, downloadUrl: release.url }
        : {}),
      publisher: {
        "@type": "Organization",
        name: siteConfig.name,
        url: siteConfig.url,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ];

  return (
    <div className="relative min-h-full overflow-hidden bg-background text-foreground">
      <JsonLd data={jsonLd} />
      <ProductBackdrop />

      <ProductHero
        eyebrow="Matrx Desktop · for Mac"
        title="Your computer, connected to everything AI Matrx can do."
        lead="Matrx Desktop is the companion app that links AI Matrx and your own computer, in both directions. Bring your work in, send answers out, and let AI get things done on the machine you already own."
        visual={<DesktopMock />}
        actions={
          <>
            <Button
              asChild
              size="lg"
              className="h-12 w-full rounded-xl px-6 text-base font-semibold shadow-lg shadow-primary/20 sm:w-auto"
            >
              <a href={downloadHref} rel="noopener noreferrer">
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                Download for Mac
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 w-full rounded-xl px-6 text-base sm:w-auto"
            >
              <a href="#whats-inside">See what&rsquo;s inside</a>
            </Button>
          </>
        }
        note={
          <>
            <p>
              {release
                ? `Version ${release.version}${size ? ` · ${size}` : ""}${released ? ` · released ${released}` : ""} · Apple silicon Macs`
                : "Apple silicon Macs. The latest version couldn't be looked up just now, so the button will check again when you click it."}
            </p>
            <p className="mt-1">
              On Windows or Linux?{" "}
              <Link
                href={MATRX_LOCAL_DOWNLOAD_PATH}
                className="font-medium text-foreground underline underline-offset-4"
              >
                There&rsquo;s an app for you on the download page
              </Link>
              , and Matrx Desktop is coming to both.
            </p>
          </>
        }
      />

      <ProductSection
        id="whats-inside"
        eyebrow="Available now"
        title="What you can do today"
        lead="Matrx Desktop is built one working piece at a time. These parts work now."
      >
        <FeatureGrid items={AVAILABLE} />
      </ProductSection>

      <ProductSection
        eyebrow="Coming soon"
        title="What we're building next"
        lead="We label anything that isn't finished yet, so you always know what you're getting."
      >
        <FeatureGrid items={COMING} />
      </ProductSection>

      <ProductSection
        id="install"
        eyebrow="Get started"
        title="Set up in about two minutes"
      >
        <Steps
          items={[
            {
              title: "Download",
              body: "Use the Download for Mac button. The file is signed and notarized by Apple.",
            },
            {
              title: "Open it",
              body: "Open the downloaded file, then drag the app into your Applications folder and start it.",
            },
            {
              title: "Allow what you want it to do",
              body: "macOS asks before AI can see your screen or press keys. Say yes only to what you want. The app shows what it still needs.",
            },
          ]}
        />
      </ProductSection>

      <ProductSection
        eyebrow="Trust"
        title="Made to be trusted on your own computer"
      >
        <TrustList items={TRUST} />
      </ProductSection>

      <ProductSection id="faq" eyebrow="Questions" title="Good to know">
        <Faq items={FAQS} />
      </ProductSection>

      <CtaBand
        title="Put your computer to work with AI Matrx"
        body="Download Matrx Desktop for Mac, or add Matrx Extend to Chrome to start with the page in front of you."
      >
        <Button
          asChild
          size="lg"
          className="h-12 w-full rounded-xl px-6 text-base font-semibold sm:w-auto"
        >
          <a href={downloadHref}>
            <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
            Download for Mac
          </a>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="h-12 w-full rounded-xl px-6 text-base sm:w-auto"
        >
          <Link href="/extend">Meet Matrx Extend</Link>
        </Button>
      </CtaBand>
    </div>
  );
}
