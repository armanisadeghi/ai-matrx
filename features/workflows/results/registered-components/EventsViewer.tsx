// File: features/workflows/results/registered-components/EventsViewer.tsx
"use client";

import React, { useMemo, useState } from "react";
import {
  Calendar,
  MapPin,
  Clock,
  Users,
  Music,
  ExternalLink,
  Expand,
  Search,
} from "lucide-react";
import { Card, Grid } from "@/components/official/PageTemplate";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DbFunctionNode } from "@/features/workflows/types";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { useRouter } from "next/navigation";
import { asStringArray } from "@/features/workflows/utils/workflow-json-fields";

// Known strings to remove from performer names
const KNOWN_PREFIXES_TO_REMOVE = [
  "EBC at Night ft.",
  "Daylight Beach ft.",
  "Lowkey in the Library ft.",
];

interface EventData {
  date: string;
  name: string;
  venue: string;
  time: string;
  link: string;
  info: string;
}

interface EventsResponse {
  success: boolean;
  data: EventData[];
  errors: string | null;
  execution_time_ms: number;
}

interface ViewerProps {
  nodeData: DbFunctionNode;
  brokerId?: string;
  keyToDisplay?: string;
}

const EventsViewer: React.FC<ViewerProps> = ({
  nodeData,
  brokerId,
  keyToDisplay,
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState("overview");
  const [venueSearch, setVenueSearch] = useState("");
  const [artistSearch, setArtistSearch] = useState("");

  // Memoize the change handlers to prevent recreation
  const handleVenueSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVenueSearch(e.target.value);
    },
    [],
  );

  const handleArtistSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setArtistSearch(e.target.value);
    },
    [],
  );

  if (!brokerId && nodeData) {
    const overrides = asStringArray(nodeData.return_broker_overrides);
    brokerId = overrides[overrides.length - 1];
  }

  const rawData = useAppSelector((state) =>
    brokerSelectors.selectValue(state, brokerId),
  );

  const handleTestPageNavigation = () => {
    router.push("/registered-results/events-viewer");
  };

  const handleTestPageNewTab = () => {
    window.open("/registered-results/events-viewer", "_blank");
  };

  const data: EventsResponse = useMemo(() => {
    if (!keyToDisplay) {
      return rawData;
    }
    return rawData?.[keyToDisplay];
  }, [rawData, keyToDisplay]);

  // Process events data
  const processedData = useMemo(() => {
    if (!data?.data || !Array.isArray(data.data)) {
      return {
        eventsByMonth: {},
        eventsByVenue: {},
        eventsByPerformer: {},
        upcomingEvents: [],
        totalEvents: 0,
        uniqueVenues: 0,
        uniquePerformers: 0,
        dateRange: null,
      };
    }

    const events = data.data;
    const eventsByMonth: { [key: string]: EventData[] } = {};
    const eventsByVenue: { [key: string]: EventData[] } = {};
    const eventsByPerformer: { [key: string]: EventData[] } = {};
    const upcomingEvents: EventData[] = [];

    const now = new Date();
    const venues = new Set<string>();
    const performers = new Set<string>();

    events.forEach((event) => {
      const eventDate = new Date(event.date);
      const monthKey = eventDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      });

      // Group by month
      if (!eventsByMonth[monthKey]) {
        eventsByMonth[monthKey] = [];
      }
      eventsByMonth[monthKey].push(event);

      // Group by venue
      if (!eventsByVenue[event.venue]) {
        eventsByVenue[event.venue] = [];
      }
      eventsByVenue[event.venue].push(event);
      venues.add(event.venue);

      // Group by performer (extract from name, using colon separator logic)
      let performerName = event.name;
      // If there's a colon, take everything after it (removing prefix)
      if (performerName.includes(":")) {
        performerName = performerName.split(":").slice(1).join(":").trim();
      }
      // Remove known prefixes
      KNOWN_PREFIXES_TO_REMOVE.forEach((prefix) => {
        if (performerName.startsWith(prefix)) {
          performerName = performerName.substring(prefix.length).trim();
        }
      });
      // Remove common suffixes like age restrictions
      performerName = performerName.replace(/\s*\(18\+\)$/, "");

      if (!eventsByPerformer[performerName]) {
        eventsByPerformer[performerName] = [];
      }
      eventsByPerformer[performerName].push(event);
      performers.add(performerName);

      // Upcoming events (next 30 days)
      const thirtyDaysFromNow = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
      if (eventDate >= now && eventDate <= thirtyDaysFromNow) {
        upcomingEvents.push(event);
      }
    });

    // Sort upcoming events by date
    upcomingEvents.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Get date range
    const sortedDates = events
      .map((e) => new Date(e.date))
      .sort((a, b) => a.getTime() - b.getTime());
    const dateRange =
      sortedDates.length > 0
        ? {
            start: sortedDates[0],
            end: sortedDates[sortedDates.length - 1],
          }
        : null;

    return {
      eventsByMonth,
      eventsByVenue,
      eventsByPerformer,
      upcomingEvents,
      totalEvents: events.length,
      uniqueVenues: venues.size,
      uniquePerformers: performers.size,
      dateRange,
    };
  }, [data?.data]);

  // Stats for hero section
  const statsItems = [
    {
      label: "Total Events",
      value: processedData.totalEvents.toLocaleString(),
    },
    { label: "Venues", value: processedData.uniqueVenues },
    { label: "Artists", value: processedData.uniquePerformers },
  ];

  // Event card component
  const EventCard: React.FC<{ event: EventData; compact?: boolean }> = ({
    event,
    compact = false,
  }) => {
    const eventDate = new Date(event.date);
    const isUpcoming = eventDate >= new Date();

    return (
      <div
        className={`bg-textured rounded-lg border-border hover:shadow-md transition-all duration-200 ${
          compact ? "p-3" : "p-4"
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3
              className={`font-semibold text-gray-900 dark:text-gray-100 ${compact ? "text-sm" : "text-base"} truncate`}
            >
              {event.name}
            </h3>
            <div className="flex items-center mt-1 text-gray-600 dark:text-gray-400">
              <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
              <span className={`${compact ? "text-xs" : "text-sm"} truncate`}>
                {event.venue}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 ml-2">
            <Badge
              variant={isUpcoming ? "default" : "secondary"}
              className="text-xs"
            >
              {event.info}
            </Badge>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 text-gray-500 dark:text-gray-400">
            <div className="flex items-center">
              <Calendar className="h-3 w-3" />
              <span className={compact ? "text-xs" : "text-sm"}>
                {eventDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center">
              <Clock className="h-3 w-3" />
              <span className={compact ? "text-xs" : "text-sm"}>
                {event.time}
              </span>
            </div>
          </div>

          <a
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium underline"
          >
            Details
          </a>
        </div>
      </div>
    );
  };

  // Overview tab content
  const OverviewContent = () => (
    <Grid cols={1} gap="medium">
      {processedData.upcomingEvents.length > 0 && (
        <Card title="Upcoming Events (Next 30 Days)">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {processedData.upcomingEvents.slice(0, 10).map((event, index) => (
              <EventCard key={index} event={event} compact />
            ))}
            {processedData.upcomingEvents.length > 10 && (
              <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
                ... and {processedData.upcomingEvents.length - 10} more upcoming
                events
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Event Distribution">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {Object.keys(processedData.eventsByMonth).length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Months
            </div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {processedData.upcomingEvents.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Upcoming
            </div>
          </div>
        </div>
      </Card>
    </Grid>
  );

  // Monthly events tab content
  const MonthlyContent = () => (
    <Card title="Events by Month">
      <Accordion type="multiple" className="w-full">
        {Object.entries(processedData.eventsByMonth)
          .sort(
            ([a], [b]) =>
              new Date(a + " 1").getTime() - new Date(b + " 1").getTime(),
          )
          .map(([month, events]) => (
            <AccordionItem
              key={month}
              value={month}
              className="border-b border-border"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {month}
                    </span>
                  </div>
                  <Badge variant="secondary" className="ml-2">
                    {events.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-3 pl-6">
                  {events.map((event, index) => (
                    <EventCard key={index} event={event} compact />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
      </Accordion>
    </Card>
  );

  // Venues tab content
  const filteredVenues = useMemo(() => {
    return Object.entries(processedData.eventsByVenue)
      .filter(([venue]) =>
        venue.toLowerCase().includes(venueSearch.toLowerCase()),
      )
      .sort(([, a], [, b]) => b.length - a.length);
  }, [processedData.eventsByVenue, venueSearch]);

  const VenuesContent = React.useMemo(
    () => (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Events by Venue
          </h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search venues..."
              value={venueSearch}
              onChange={handleVenueSearchChange}
              className="pl-10 pr-4 py-2 text-sm"
            />
          </div>
        </div>
        <Accordion type="multiple" className="w-full">
          {filteredVenues.map(([venue, events]) => (
            <AccordionItem
              key={venue}
              value={venue}
              className="border-b border-border"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center min-w-0 flex-1">
                    <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2 flex-shrink-0" />
                    <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                      {venue}
                    </span>
                  </div>
                  <Badge variant="secondary" className="ml-2 flex-shrink-0">
                    {events.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-3 pl-6">
                  {events.map((event, index) => (
                    <EventCard key={index} event={event} compact />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    ),
    [filteredVenues, venueSearch, handleVenueSearchChange],
  );

  // Artists tab content
  const filteredArtists = useMemo(() => {
    return Object.entries(processedData.eventsByPerformer)
      .filter(([performer]) =>
        performer.toLowerCase().includes(artistSearch.toLowerCase()),
      )
      .sort(([, a], [, b]) => b.length - a.length);
  }, [processedData.eventsByPerformer, artistSearch]);

  const ArtistsContent = React.useMemo(
    () => (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Events by Artist
          </h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search artists..."
              value={artistSearch}
              onChange={handleArtistSearchChange}
              className="pl-10 pr-4 py-2 text-sm"
            />
          </div>
        </div>
        <Accordion type="multiple" className="w-full">
          {filteredArtists.map(([performer, events]) => (
            <AccordionItem
              key={performer}
              value={performer}
              className="border-b border-border"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center min-w-0 flex-1">
                    <Music className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2 flex-shrink-0" />
                    <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                      {performer}
                    </span>
                  </div>
                  <Badge variant="secondary" className="ml-2 flex-shrink-0">
                    {events.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-3 pl-6">
                  {events.map((event, index) => (
                    <EventCard key={index} event={event} compact />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    ),
    [filteredArtists, artistSearch, handleArtistSearchChange],
  );

  // Define tabs
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      icon: Calendar,
      content: <OverviewContent />,
    },
    {
      id: "monthly",
      label: "By Month",
      icon: Calendar,
      content: <MonthlyContent />,
    },
    {
      id: "venues",
      label: "Venues",
      icon: MapPin,
      content: VenuesContent,
    },
    {
      id: "artists",
      label: "Artists",
      icon: Music,
      content: ArtistsContent,
    },
  ];

  // Error state
  if (!data?.success && data?.errors) {
    return (
      <div className="w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 min-h-dvh">
        <div className="max-w-full px-2 sm:px-4 lg:px-6 py-4">
          <Card title="Error">
            <div className="text-red-500 p-4">{data?.errors}</div>
          </Card>
        </div>
      </div>
    );
  }

  // Loading state
  if (!data?.data) {
    return (
      <div className="w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 min-h-dvh">
        <div className="max-w-full px-2 sm:px-4 lg:px-6 py-4">
          <Card title="Loading">
            <div className="text-gray-500 p-4">Loading events data...</div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 min-h-dvh">
      <div className="max-w-full px-2 sm:px-4 lg:px-6 py-4">
        {/* Hero section with compact design for overlay */}
        <div className="mb-6 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-4 sm:px-4 sm:py-6 relative rounded-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/30 to-pink-600/30 backdrop-blur-sm rounded-xl"></div>
            <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between">
              <div className="mb-4 md:mb-0">
                <h1 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-white mb-2 leading-tight">
                  Events Viewer
                </h1>
                {processedData.dateRange && (
                  <p className="text-white/90 text-sm font-medium">
                    {processedData.dateRange.start.toLocaleDateString()} -{" "}
                    {processedData.dateRange.end.toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                {/* Stats */}
                {statsItems.map((stat, index) => (
                  <div
                    key={index}
                    className="bg-white/10 backdrop-blur-md rounded-lg px-3 py-2 text-center"
                  >
                    <div className="text-white/80 text-xs font-medium mb-1">
                      {stat.label}
                    </div>
                    <div className="text-white text-lg font-bold">
                      {stat.value}
                    </div>
                  </div>
                ))}

                {/* Full Screen Button with Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="bg-white/10 backdrop-blur-md rounded-lg px-3 py-2 text-center cursor-pointer hover:bg-white/20 transition-all duration-200 shadow-lg">
                      <div className="text-white/80 text-xs font-medium mb-1">
                        Actions
                      </div>
                      <div className="text-white text-sm font-bold flex items-center justify-center">
                        <ExternalLink className="h-3 w-3" />
                        Full Screen
                      </div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-textured border-border">
                    <DropdownMenuItem
                      onClick={handleTestPageNavigation}
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Expand className="h-4 w-4 mr-2" />
                      Open Full Screen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleTestPageNewTab}
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-3 flex space-x-1 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg flex items-center font-medium transition-all duration-200 text-sm ${
                activeTab === tab.id
                  ? "bg-purple-600 text-white shadow-md"
                  : "bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200"
              }`}
            >
              <tab.icon className="mr-2 h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={activeTab === tab.id ? "block" : "hidden"}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(EventsViewer);
