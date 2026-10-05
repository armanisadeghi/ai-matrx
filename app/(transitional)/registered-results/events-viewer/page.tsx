"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import EventsViewer from "@/features/registered-results/components/EventsViewer";

export default function Page() {
  const router = useRouter();
  const brokerId = "EVENT_LIST_DATA";

  const handleBack = () => {
    router.back();
  };

  return (
    <div className="relative">
      <div className="fixed top-4 left-4 z-50">
        <Button
          icon={<ArrowLeft />}
          onClick={handleBack}
          variant="outline"
        >
          Back
        </Button>
      </div>

      <EventsViewer nodeData={null} brokerId={brokerId} />
    </div>
  );
}
