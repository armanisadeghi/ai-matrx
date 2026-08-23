// features/auth/components/module-landing/landings/SearchLanding.tsx
//
// Public marketing landing for Matrx Search — served to guests at /search
// (signed-in visitors get the search engine itself at the same URL).
//
// The pitch is only what shipped: a real web search whose answer arrives as
// finished pieces — an answer up top, places with hours and ratings, news,
// video, questions, discussions — instead of ten blue links. Zero jargon: no
// "kind", no "provider", no "adapter", no "translation".

import {
  CalendarClock,
  Link2,
  MapPin,
  Newspaper,
  Search,
  Shapes,
  Sparkle,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "../ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Shapes,
    title: "Answers, not a list of links",
    description:
      "What comes back arrives as the thing it actually is — a direct answer, a place, a news story, a video, a question someone already asked — each one laid out to be read at a glance.",
  },
  {
    icon: MapPin,
    title: "Places you can act on",
    description:
      "Looking for somewhere to go? You get the rating, the price band, today's hours, the address and the map pin — on the card, without opening anything.",
  },
  {
    icon: Newspaper,
    title: "News and video in their own shape",
    description:
      "Stories carry the outlet and when they were published. Videos carry the channel, the length and the thumbnail. Nothing is flattened into a generic row.",
  },
  {
    icon: Link2,
    title: "Every search has a link",
    description:
      "The search you are looking at is in the address bar. Send it to someone and they see the same search. Back and forward move through the ones you ran.",
  },
  {
    icon: Sparkle,
    title: "The same pieces the rest of AI Matrx uses",
    description:
      "A result here is the identical piece an agent, a workflow, or a document works with — so what you find can be handed straight to the work you are doing.",
  },
  {
    icon: CalendarClock,
    title: "Honest about where it came from",
    description:
      "Every set of results says which search service answered it. You always know what you are looking at.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Type what you want",
    description:
      "Plain words. A question, a place, a topic, a name — whatever you would say out loud.",
  },
  {
    number: "02",
    title: "Read the answer",
    description:
      "The most useful piece leads: a direct answer, a card about the thing you asked about, or the places nearby. The rest follows underneath.",
  },
  {
    number: "03",
    title: "Take it with you",
    description:
      "Keep the link, run it again later, or send it to someone. The search is the address.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "What a search gives back",
    status: "Live",
    items: [
      "A direct answer when one exists",
      "A card about the person, place, or thing you named",
      "Local places with rating, price, hours, address and map",
      "Web results, news, video, questions and discussions",
    ],
  },
  {
    title: "Built into the platform",
    status: "Live",
    items: [
      "Results are the same pieces agents and workflows already read",
      "Nothing is re-drawn per screen — one look, everywhere",
      "The search service that answered is always named",
    ],
  },
];

export default function SearchLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:search"
      eyebrow="Matrx Search"
      eyebrowIcon={Search}
      headline="The web, handed back as"
      headlineGradient="finished pieces."
      description="Ask in plain words and get an answer laid out the way it should be — a direct answer, places with hours and ratings, news with its outlet, video with its channel, questions people already asked. Every search keeps its own link."
      primaryCtaHref="/sign-up?source=search-landing"
      primaryCtaLabel="Start Free"
      signInDestination="/search"
      workspaceHref="/search"
      workspaceLabel="Search"
      capabilitiesHeading="Search that gives you the thing, not the link to it"
      capabilitiesDescription="Ten blue links make you do the work of figuring out what each one is. Every result here already knows what it is, and shows it."
      capabilities={CAPABILITIES}
      stepsDescription="Three steps, and the third one is just keeping the link."
      steps={STEPS}
      subAreasHeading="What's inside"
      subAreasDescription="One box, and an answer built out of the pieces the whole platform shares."
      subAreas={SUB_AREAS}
      finalCtaHeading="Try a search"
      finalCtaDescription="Type a question, a place, or a topic and see what comes back when results stop pretending to all be the same thing."
      relatedModules={["/chat", "/research", "/workflows"]}
    />
  );
}
