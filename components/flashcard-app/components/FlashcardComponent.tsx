"use client";

import React from "react";
import { useWindowSize } from "@/hooks/usehooks";
import FlashcardComponentDesktop from "./FlashcardComponentDesktop";
import FlashcardComponentMobile from "./FlashcardComponentMobile";

const FlashcardComponent = ({ dataSetId }: { dataSetId: string }) => {
  const { width } = useWindowSize();

  return (width ?? 0) < 768 ? (
    <FlashcardComponentMobile dataSetId={dataSetId} />
  ) : (
    <FlashcardComponentDesktop dataSetId={dataSetId} />
  );
};

export default FlashcardComponent;
