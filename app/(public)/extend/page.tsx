import Link from "next/link";
import {
  BookOpenCheck,
  Chrome,
  Fingerprint,
  KeyRound,
  Layers,
  MessageSquareText,
  MousePointerClick,
  ScanSearch,
  ShieldCheck,
  Search,
  ToggleLeft,
  UserRoundCheck,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteConfig } from "@/config/extras/site";
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
import { ExtendMock } from "./ExtendMock";

/** The published Chrome Web Store listing (item id from the Store record). */
const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/hnfolienncfklkgmdjjmhhegglimlamg";

const TITLE = "Matrx Extend";
const DESCRIPTION =
  "Matrx Extend is an AI assistant in the Chrome side panel. Ask about the page you're on, capture what matters, run an SEO check, and have it act on the page only when you say so. Try it free, no account needed.";

export const metadata = createRouteMetadata("/extend", {
  title: "Matrx Extend for Chrome",
  description: DESCRIPTION,
  canonicalPath: "/extend",
  keywords: [
    "Matrx Extend",
    "AI Chrome extension",
    "AI side panel for Chrome",
    "chat with any web page",
    "AI assistant for the page you're reading",
    "SEO audit Chrome extension",
    "AI browser assistant",
  ],
  socialCard: { eyebrow: "Matrx Extend", theme: "violet" },
});

export const revalidate = 3600;

const AVAILABLE: readonly FeatureItem[] = [
  {
    icon: MessageSquareText,
    title: "Ask the page anything",
    body: "Chat with an assistant that can see the page you have open. Summarize it, explain it, compare it, or pull out exactly what you need.",
    status: "live",
  },
  {
    icon: BookOpenCheck,
    title: "Capture what matters",
    body: "Save the readable content of a page and keep it in your Saved Captures, ready to use later.",
    status: "live",
  },
  {
    icon: Layers,
    title: "See how a page is built",
    body: "Inspect a page's structure, headings and details without opening developer tools.",
    status: "live",
  },
  {
    icon: Search,
    title: "Check a page's SEO",
    body: "Run an SEO audit on any page and see what to fix, in plain language.",
    status: "live",
  },
  {
    icon: MousePointerClick,
    title: "Let it act, on your terms",
    body: "Ask it to click, fill or navigate. By default it asks before changing a page, and anything sensitive always needs your confirmation.",
    status: "live",
  },
  {
    icon: KeyRound,
    title: "Saved logins in Vault",
    body: "When you're signed in, choose a saved login to fill a sign-in form. Filling never submits the form, and nothing is saved without your click.",
    status: "live",
  },
];

const COMING: readonly FeatureItem[] = [
  {
    icon: Globe,
    title: "Safari",
    body: "The same assistant for Safari is in progress. Chrome comes first.",
    status: "soon",
  },
];

const TRUST = [
  {
    icon: UserRoundCheck,
    title: "Try it without an account",
    body: "Guest mode lets you capture, inspect, audit and chat. Guest AI has a limited number of free tries; a free account continues from there.",
  },
  {
    icon: ToggleLeft,
    title: "Automatic capture is off by default",
    body: "A fresh install reads a page only when you ask for a page-aware feature. You can turn automatic capture on in Settings.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control of actions",
    body: "Browser actions run only when you ask. In the default mode it checks with you before changing a page, and sensitive actions always require confirmation.",
  },
  {
    icon: Fingerprint,
    title: "Plainly written privacy policy",
    body: "Exactly what the extension can access and how it's used is spelled out in the Matrx Extend privacy policy.",
  },
] as const;

const FAQS: readonly FaqItem[] = [
  {
    question: "Do I need an account?",
    answer:
      "No. You can capture pages, inspect structure, run an SEO audit and try the assistant without one. Guest AI includes a limited number of free tries, and a free account lets you keep going.",
  },
  {
    question: "Does it read every page I visit?",
    answer:
      "No. By default it reads a page only when you use a feature that needs it. Automatic page capture is optional, off on a new install, and can be turned on in Settings.",
  },
  {
    question: "Can it click things or fill forms without asking?",
    answer:
      "In the default mode it asks before it changes a page, and sensitive actions always need your confirmation. Saved-login filling never submits a form, and nothing is saved without your click.",
  },
  {
    question: "Which browsers does it work in?",
    answer:
      "Chrome today, from the Chrome Web Store. A Safari version is in progress.",
  },
  {
    question: "How is it different from Matrx Desktop?",
    answer:
      "Matrx Extend lives in your browser and works with the page in front of you. Matrx Desktop is a Mac app that connects AI Matrx to your whole computer.",
  },
];

export default function MatrxExtendPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: TITLE,
      description: DESCRIPTION,
      url: `${siteConfig.url}/extend`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Chrome",
      downloadUrl: CHROME_WEB_STORE_URL,
      installUrl: CHROME_WEB_STORE_URL,
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
        eyebrow="Matrx Extend · for Chrome"
        title="An AI assistant beside every page you read."
        lead="Matrx Extend opens a side panel in Chrome that understands the page you're on. Ask questions, capture what matters, check a page's SEO, and have it act on the page when you say so."
        visual={<ExtendMock />}
        actions={
          <>
            <Button
              asChild
              size="lg"
              className="h-12 w-full rounded-xl px-6 text-base font-semibold shadow-lg shadow-primary/20 sm:w-auto"
            >
              <a href={CHROME_WEB_STORE_URL} rel="noopener noreferrer">
                <Chrome className="h-4 w-4" aria-hidden="true" />
                Add to Chrome
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 w-full rounded-xl px-6 text-base sm:w-auto"
            >
              <Link href="/matrx-extend-demo">
                <ScanSearch className="h-4 w-4" aria-hidden="true" />
                Try it on a demo page
              </Link>
            </Button>
          </>
        }
        note={
          <p>
            Free to try, no account needed. Available on the Chrome Web Store.
          </p>
        }
      />

      <ProductSection
        id="whats-inside"
        eyebrow="What it does"
        title="Everything the page in front of you can become"
        lead="One side panel, always one click away."
      >
        <FeatureGrid items={[...AVAILABLE, ...COMING]} />
      </ProductSection>

      <ProductSection
        id="install"
        eyebrow="Get started"
        title="Up and running in a minute"
      >
        <Steps
          items={[
            {
              title: "Add it to Chrome",
              body: "Open the Chrome Web Store listing and choose Add to Chrome.",
            },
            {
              title: "Open the side panel",
              body: "Click the Matrx Extend icon on any page. The panel opens beside it.",
            },
            {
              title: "Ask",
              body: "Type a question about the page, or pick a tool like Capture or the SEO audit.",
            },
          ]}
        />
      </ProductSection>

      <ProductSection
        eyebrow="Trust"
        title="Yours to control"
      >
        <TrustList items={TRUST} />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Read the{" "}
          <Link
            href="/privacy-policy/extension"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Matrx Extend privacy policy
          </Link>
          .
        </p>
      </ProductSection>

      <ProductSection id="faq" eyebrow="Questions" title="Good to know">
        <Faq items={FAQS} />
      </ProductSection>

      <CtaBand
        title="Put an assistant on every page"
        body="Add Matrx Extend to Chrome, or bring AI Matrx to your whole computer with Matrx Desktop."
      >
        <Button
          asChild
          size="lg"
          className="h-12 w-full rounded-xl px-6 text-base font-semibold sm:w-auto"
        >
          <a href={CHROME_WEB_STORE_URL} rel="noopener noreferrer">
            <Chrome className="h-4 w-4" aria-hidden="true" />
            Add to Chrome
          </a>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="h-12 w-full rounded-xl px-6 text-base sm:w-auto"
        >
          <Link href="/desktop">Meet Matrx Desktop</Link>
        </Button>
      </CtaBand>
    </div>
  );
}
