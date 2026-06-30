"use client";
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export interface CardPosition {
  id: string;
  x: number;
  y: number;
  zIndex: number;
  group?: string | null;
  containerId?: string | null;
}

export interface Container {
  id: string;
  label: string;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export interface DraggableCardContextValue {
  positions: Record<string, CardPosition>;
  containers: Record<string, Container>;
  registerCard: (id: string, initialPosition?: Partial<CardPosition>) => void;
  unregisterCard: (id: string) => void;
  updatePosition: (id: string, updates: Partial<CardPosition>) => void;
  getCardsInGroup: (group: string) => CardPosition[];
  getCardsInContainer: (containerId: string) => CardPosition[];
  assignToGroup: (id: string, group: string | null) => void;
  assignToContainer: (id: string, containerId: string | null) => void;
  getCardPosition: (id: string) => CardPosition | undefined;
  registerContainer: (id: string, container: Omit<Container, "id">) => void;
  unregisterContainer: (id: string) => void;
  updateContainerBounds: (
    id: string,
    bounds: { left: number; top: number; right: number; bottom: number },
  ) => void;
  checkContainerIntersection: (
    cardId: string,
    cardPosition: { x: number; y: number; width: number; height: number },
    cardRef: React.RefObject<HTMLDivElement | null>,
  ) => string | null;
}

const DraggableCardContext = createContext<
  DraggableCardContextValue | undefined
>(undefined);

export function DraggableCardProvider({ children }: { children: ReactNode }) {
  const [positions, setPositions] = useState<Record<string, CardPosition>>({});
  const [containers, setContainers] = useState<Record<string, Container>>({});
  const maxZIndex = React.useRef(1000);

  const registerCard = useCallback(
    (id: string, initialPosition?: Partial<CardPosition>) => {
      setPositions((prev) => {
        if (prev[id]) return prev;

        maxZIndex.current += 1;
        return {
          ...prev,
          [id]: {
            id,
            x: 0,
            y: 0,
            zIndex: maxZIndex.current,
            group: null,
            containerId: null,
            ...initialPosition,
          },
        };
      });
    },
    [],
  );

  const unregisterCard = useCallback((id: string) => {
    setPositions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updatePosition = useCallback(
    (id: string, updates: Partial<CardPosition>) => {
      setPositions((prev) => {
        if (!prev[id]) return prev;

        // Bring to front when dragging
        if ("x" in updates || "y" in updates) {
          maxZIndex.current += 1;
          updates.zIndex = maxZIndex.current;
        }

        return {
          ...prev,
          [id]: {
            ...prev[id],
            ...updates,
          },
        };
      });
    },
    [],
  );

  const getCardsInGroup = useCallback(
    (group: string) => {
      return Object.values(positions).filter((pos) => pos.group === group);
    },
    [positions],
  );

  const getCardsInContainer = useCallback(
    (containerId: string) => {
      return Object.values(positions).filter(
        (pos) => pos.containerId === containerId,
      );
    },
    [positions],
  );

  const assignToGroup = useCallback((id: string, group: string | null) => {
    setPositions((prev) => {
      if (!prev[id]) return prev;

      return {
        ...prev,
        [id]: {
          ...prev[id],
          group,
        },
      };
    });
  }, []);

  const assignToContainer = useCallback(
    (id: string, containerId: string | null) => {
      setPositions((prev) => {
        if (!prev[id]) return prev;

        return {
          ...prev,
          [id]: {
            ...prev[id],
            containerId,
          },
        };
      });
    },
    [],
  );

  const getCardPosition = useCallback(
    (id: string) => {
      return positions[id];
    },
    [positions],
  );

  const registerContainer = useCallback(
    (id: string, container: Omit<Container, "id">) => {
      setContainers((prev) => ({
        ...prev,
        [id]: {
          ...container,
          id,
        },
      }));
    },
    [],
  );

  const unregisterContainer = useCallback((id: string) => {
    setContainers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    // Clear container association for cards in this container
    setPositions((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((cardId) => {
        if (next[cardId].containerId === id) {
          next[cardId] = {
            ...next[cardId],
            containerId: null,
          };
        }
      });
      return next;
    });
  }, []);

  const updateContainerBounds = useCallback(
    (
      id: string,
      bounds: { left: number; top: number; right: number; bottom: number },
    ) => {
      setContainers((prev) => {
        if (!prev[id]) return prev;

        return {
          ...prev,
          [id]: {
            ...prev[id],
            bounds,
          },
        };
      });
    },
    [],
  );

  // Check if a card intersects with any container and return the container ID if it does
  const checkContainerIntersection = useCallback(
    (
      cardId: string,
      cardPosition: { x: number; y: number; width: number; height: number },
      cardRef: React.RefObject<HTMLDivElement | null>,
    ) => {
      if (!cardRef.current) return null;

      // Get the card's actual DOM position
      const cardRect = cardRef.current.getBoundingClientRect();

      // Calculate the center of the card using its actual DOM position
      const cardCenterX = cardRect.left + cardRect.width / 2;
      const cardCenterY = cardRect.top + cardRect.height / 2;

      // Check each container to see if the card's center is inside it
      for (const containerId in containers) {
        const container = containers[containerId];
        const { bounds } = container;

        if (
          cardCenterX >= bounds.left &&
          cardCenterX <= bounds.right &&
          cardCenterY >= bounds.top &&
          cardCenterY <= bounds.bottom
        ) {
          return containerId;
        }
      }

      return null;
    },
    [containers],
  );

  const value = {
    positions,
    containers,
    registerCard,
    unregisterCard,
    updatePosition,
    getCardsInGroup,
    getCardsInContainer,
    assignToGroup,
    assignToContainer,
    getCardPosition,
    registerContainer,
    unregisterContainer,
    updateContainerBounds,
    checkContainerIntersection,
  };

  return (
    <DraggableCardContext.Provider value={value}>
      {children}
    </DraggableCardContext.Provider>
  );
}

export function useDraggableCard() {
  const context = useContext(DraggableCardContext);
  if (context === undefined) {
    throw new Error(
      "useDraggableCard must be used within a DraggableCardProvider",
    );
  }
  return context;
}
