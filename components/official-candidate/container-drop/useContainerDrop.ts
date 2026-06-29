"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type React from "react";
import type {
  ContainerDropItem,
  UseContainerDropConfig,
  ContainerDropValue,
  DragSnapshot,
} from "./types";

interface InternalDragState {
  itemId: string;
  originContainer: string | null;
  pointerOffset: { x: number; y: number };
  startRect: DOMRect;
  currentPos: { x: number; y: number };
}

export function useContainerDrop(
  config: UseContainerDropConfig,
): ContainerDropValue {
  const {
    items: externalItems,
    containers,
    assignments: controlledAssignments,
    defaultAssignments,
    onAssignmentsChange,
    onAssign,
    onUnassign,
    onMove,
    onAdd,
    onRemove,
  } = config;

  const isControlled = controlledAssignments !== undefined;

  // -----------------------------------------------------------------------
  // Internal state (used in uncontrolled mode)
  // -----------------------------------------------------------------------
  const [internalItems, setInternalItems] =
    useState<ContainerDropItem[]>(externalItems);
  const [internalAssignments, setInternalAssignments] = useState<
    Record<string, string | null>
  >(() => {
    if (defaultAssignments) return { ...defaultAssignments };
    const init: Record<string, string | null> = {};
    externalItems.forEach((item) => (init[item.id] = null));
    return init;
  });

  // Sync internal items when external items change
  useEffect(() => {
    setInternalItems(externalItems);
  }, [externalItems]);

  const items = internalItems;
  const assignments = isControlled
    ? controlledAssignments!
    : internalAssignments;

  // -----------------------------------------------------------------------
  // Drag state
  // -----------------------------------------------------------------------
  const [dragState, setDragState] = useState<InternalDragState | null>(null);
  const [hoverContainerId, setHoverContainerId] = useState<string | null>(null);

  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<{
    itemId: string;
    offset: { x: number; y: number };
  } | null>(null);
  const refCallbacks = useRef<
    Record<string, (el: HTMLDivElement | null) => void>
  >({});
  const containerIdsRef = useRef(containers);
  containerIdsRef.current = containers;

  // Keep latest values in refs so pointer event handlers read fresh data
  const latestRef = useRef({ assignments, onAssign, onUnassign, onMove });
  latestRef.current = { assignments, onAssign, onUnassign, onMove };

  // -----------------------------------------------------------------------
  // Assignment mutation (handles both controlled and uncontrolled)
  // -----------------------------------------------------------------------
  const setAssignments = useCallback(
    (
      updater: (
        prev: Record<string, string | null>,
      ) => Record<string, string | null>,
    ) => {
      if (isControlled) {
        const next = updater(controlledAssignments!);
        onAssignmentsChange?.(next);
      } else {
        setInternalAssignments(updater);
      }
    },
    [isControlled, controlledAssignments, onAssignmentsChange],
  );

  // -----------------------------------------------------------------------
  // Hit-test
  // -----------------------------------------------------------------------
  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      for (const container of containerIdsRef.current) {
        const el = containerRefs.current[container.id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return container.id;
        }
      }
      return null;
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Pointer event listeners (drag move + drag end)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!dragState) return undefined;

    const handleMove = (e: PointerEvent) => {
      const ref = dragRef.current;
      if (!ref) return;
      const x = e.clientX - ref.offset.x;
      const y = e.clientY - ref.offset.y;
      setDragState((prev) => (prev ? { ...prev, currentPos: { x, y } } : null));
      setHoverContainerId(hitTest(e.clientX, e.clientY));
    };

    const handleUp = (e: PointerEvent) => {
      const ref = dragRef.current;
      if (!ref) return;

      const latest = latestRef.current;
      const targetContainer = hitTest(e.clientX, e.clientY);
      const prevContainer = latest.assignments[ref.itemId] ?? null;

      if (targetContainer !== prevContainer) {
        if (prevContainer && !targetContainer) {
          latest.onUnassign?.(ref.itemId, prevContainer);
        } else if (!prevContainer && targetContainer) {
          latest.onAssign?.(ref.itemId, targetContainer);
        } else if (prevContainer && targetContainer) {
          latest.onUnassign?.(ref.itemId, prevContainer);
          latest.onAssign?.(ref.itemId, targetContainer);
        }
        latest.onMove?.(ref.itemId, prevContainer, targetContainer);

        setAssignments((prev) => ({
          ...prev,
          [ref.itemId]: targetContainer,
        }));
      }

      dragRef.current = null;
      setDragState(null);
      setHoverContainerId(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [!!dragState, hitTest]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  const assign = useCallback(
    (itemId: string, containerId: string | null) => {
      const prevContainer = assignments[itemId] ?? null;
      if (containerId === prevContainer) return;

      if (prevContainer && !containerId) {
        onUnassign?.(itemId, prevContainer);
      } else if (!prevContainer && containerId) {
        onAssign?.(itemId, containerId);
      } else if (prevContainer && containerId) {
        onUnassign?.(itemId, prevContainer);
        onAssign?.(itemId, containerId);
      }
      onMove?.(itemId, prevContainer, containerId);

      setAssignments((prev) => ({ ...prev, [itemId]: containerId }));
    },
    [assignments, onAssign, onUnassign, onMove, setAssignments],
  );

  const addItem = useCallback(
    (item: ContainerDropItem) => {
      setInternalItems((prev) => [...prev, item]);
      setAssignments((prev) => ({ ...prev, [item.id]: null }));
      onAdd?.(item);
    },
    [onAdd, setAssignments],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      setInternalItems((prev) => prev.filter((i) => i.id !== itemId));
      setAssignments((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      onRemove?.(itemId);
    },
    [onRemove, setAssignments],
  );

  const getUnassigned = useCallback(
    () => items.filter((item) => !assignments[item.id]),
    [items, assignments],
  );

  const getContainerItems = useCallback(
    (containerId: string) =>
      items.filter((item) => assignments[item.id] === containerId),
    [items, assignments],
  );

  const getDraggingItem = useCallback(
    () =>
      dragState ? (items.find((i) => i.id === dragState.itemId) ?? null) : null,
    [dragState, items],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, item: ContainerDropItem, origin: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      dragRef.current = { itemId: item.id, offset };

      setDragState({
        itemId: item.id,
        originContainer: origin,
        pointerOffset: offset,
        startRect: rect,
        currentPos: { x: rect.left, y: rect.top },
      });
    },
    [],
  );

  const registerContainer = useCallback((id: string) => {
    if (!refCallbacks.current[id]) {
      refCallbacks.current[id] = (el: HTMLDivElement | null) => {
        containerRefs.current[id] = el;
      };
    }
    return refCallbacks.current[id];
  }, []);

  const isDragging = useCallback(
    (itemId: string) => dragState?.itemId === itemId,
    [dragState],
  );

  // -----------------------------------------------------------------------
  // Build the public drag snapshot (hides internal pointer offset details)
  // -----------------------------------------------------------------------
  const dragSnapshot: DragSnapshot | null = dragState
    ? {
        itemId: dragState.itemId,
        originContainer: dragState.originContainer,
        currentPos: dragState.currentPos,
        startRect: dragState.startRect,
      }
    : null;

  return {
    items,
    assignments,
    containers,
    dragSnapshot,
    hoverContainerId,
    assign,
    addItem,
    removeItem,
    getUnassigned,
    getContainerItems,
    getDraggingItem,
    startDrag,
    registerContainer,
    isDragging,
  };
}
