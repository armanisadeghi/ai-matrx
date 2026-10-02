"use client";

/**
 * One pane: a header (tabs · kind action · "…" · full screen · close) over the
 * active item's body. Tabs drag between panes. An empty pane shows the
 * launcher of every kind that offers one.
 */

import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { TapTargetButtonTransparent } from "@ai-matrx/tap-target";
import * as Menu from "@radix-ui/react-dropdown-menu";
import type { CanvasItem, CanvasItemId, CanvasPaneId } from "../index";
import { selectCanvasPaneCount } from "../index";
import {
  AlertIcon,
  CloseIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoreIcon,
  PanelRightIcon,
  PopOutIcon,
  SplitDownIcon,
  SplitRightIcon,
} from "./icons";
import { useCanvas, useCanvasHostPorts, useCanvasKind, useCanvasKinds, useCanvasState } from "./provider";
import type { AnyCanvasKind, CanvasKindProps, CanvasMenuItem } from "./registry";

const DRAG_MIME = "application/x-matrx-canvas-item";

// One lazy component per kind, shared across panes and re-renders.
const LAZY = Symbol.for("ai-matrx.canvas.lazy");
function kindComponent(kind: AnyCanvasKind): ComponentType<CanvasKindProps> {
  if (kind.component) return kind.component;
  const holder = kind as AnyCanvasKind & { [LAZY]?: ComponentType<CanvasKindProps> };
  if (!holder[LAZY] && kind.load) holder[LAZY] = lazy(kind.load);
  const resolved = holder[LAZY];
  if (!resolved) throw new Error(`[@ai-matrx/canvas] kind "${kind.id}" has nothing to render.`);
  return resolved;
}

/** Forgets a kind's cached lazy component so "Try again" re-runs a failed chunk load. */
function resetKindComponent(kind: AnyCanvasKind | undefined) {
  if (kind) delete (kind as AnyCanvasKind & { [LAZY]?: unknown })[LAZY];
}

export function itemTitle(item: CanvasItem, kind: AnyCanvasKind | undefined): string {
  if (item.title) return item.title;
  if (kind?.title) {
    try {
      const title = kind.title(item.data, item);
      if (title) return title;
    } catch {
      // fall through to the label — a title function must never break the tab strip
    }
  }
  return kind?.label ?? item.kind;
}

export function CanvasPaneView({ paneId }: { paneId: CanvasPaneId }) {
  const canvas = useCanvas();
  const pane = useCanvasState((s) => s.panes[paneId]);
  const items = useCanvasState((s) => s.items);
  const focused = useCanvasState((s) => s.focusedPaneId === paneId);
  const [dropActive, setDropActive] = useState(false);

  if (!pane) return null;
  const active = pane.activeItemId ? items[pane.activeItemId] : undefined;

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropActive(true);
  };
  const onDrop = (event: DragEvent) => {
    setDropActive(false);
    const itemId = event.dataTransfer.getData(DRAG_MIME) as CanvasItemId;
    if (!itemId) return;
    event.preventDefault();
    canvas.moveItem(itemId, paneId);
  };

  return (
    <section
      className="mxc-pane"
      data-focused={focused ? "" : undefined}
      data-drop={dropActive ? "" : undefined}
      onPointerDownCapture={() => {
        if (!focused) canvas.focusPane(paneId);
      }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}
    >
      <PaneHeader paneId={paneId} itemIds={pane.itemIds} activeItemId={pane.activeItemId} activeItem={active} />
      <div className="mxc-pane-body">
        {pane.itemIds.length === 0 ? (
          <Launcher paneId={paneId} />
        ) : (
          pane.itemIds.map((itemId) => {
            const item = items[itemId];
            if (!item) return null;
            const isActive = itemId === pane.activeItemId;
            return <ItemBody key={itemId} item={item} paneId={paneId} isActive={isActive} isFocused={focused && isActive} />;
          })
        )}
      </div>
    </section>
  );
}

function PaneHeader({
  paneId,
  itemIds,
  activeItemId,
  activeItem,
}: {
  paneId: CanvasPaneId;
  itemIds: readonly CanvasItemId[];
  activeItemId: CanvasItemId | null;
  activeItem: CanvasItem | undefined;
}) {
  const canvas = useCanvas();
  const isFullscreen = useCanvasState((s) => s.isFullscreen);
  const paneCount = useCanvasState(selectCanvasPaneCount);
  const kind = useCanvasKind(activeItem?.kind ?? "");
  const kindProps: CanvasKindProps | null =
    activeItem && kind
      ? { item: activeItem, data: activeItem.data, paneId, isFocused: true, canvas }
      : null;
  const HeaderAction = kind?.HeaderAction;

  return (
    <header className="mxc-pane-header">
      <div className="mxc-tabs" role="tablist" aria-label="Canvas tabs">
        {itemIds.map((itemId, index) => (
          <Tab key={itemId} itemId={itemId} paneId={paneId} index={index} active={itemId === activeItemId} />
        ))}
      </div>
      <div className="mxc-pane-actions">
        {HeaderAction && kindProps ? <HeaderAction {...kindProps} /> : null}
        <PaneMenu paneId={paneId} activeItem={activeItem} kind={kind} kindProps={kindProps} canSplitMove={itemIds.length > 1} />
        <TapTargetButtonTransparent
          ariaLabel={isFullscreen ? "Exit full screen" : "Full screen"}
          icon={isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
          onClick={() => canvas.setFullscreen(!isFullscreen)}
        />
        <TapTargetButtonTransparent
          className="mxc-phone-only"
          ariaLabel="Hide canvas"
          icon={<PanelRightIcon />}
          onClick={() => canvas.hide()}
        />
        <TapTargetButtonTransparent
          ariaLabel={paneCount > 1 ? "Close pane" : "Close canvas"}
          icon={<CloseIcon />}
          onClick={() => canvas.closePane(paneId)}
        />
      </div>
    </header>
  );
}

function Tab({
  itemId,
  paneId,
  index,
  active,
}: {
  itemId: CanvasItemId;
  paneId: CanvasPaneId;
  index: number;
  active: boolean;
}) {
  const canvas = useCanvas();
  const item = useCanvasState((s) => s.items[itemId]);
  const kind = useCanvasKind(item?.kind ?? "");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  if (!item) return null;
  const Icon = kind?.icon;
  const title = itemTitle(item, kind);
  return (
    <div
      ref={ref}
      className="mxc-tab"
      role="tab"
      aria-selected={active}
      data-active={active ? "" : undefined}
      tabIndex={active ? 0 : -1}
      title={title}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_MIME, itemId);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(DRAG_MIME)) event.preventDefault();
      }}
      onDrop={(event) => {
        const dragged = event.dataTransfer.getData(DRAG_MIME) as CanvasItemId;
        if (!dragged) return;
        // Dropped ON a tab: take that tab's place (the pane-level drop is skipped).
        event.preventDefault();
        event.stopPropagation();
        if (dragged !== itemId) canvas.moveItem(dragged, paneId, index);
      }}
      onClick={() => canvas.activate(itemId)}
      onAuxClick={(event) => {
        if (event.button === 1) canvas.close(itemId);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") canvas.activate(itemId);
      }}
    >
      {Icon ? <Icon className="mxc-tab-icon" /> : <AlertIcon className="mxc-tab-icon" />}
      <span className="mxc-tab-title">{title}</span>
      <button
        type="button"
        className="mxc-tab-close"
        aria-label={`Close ${title}`}
        onClick={(event) => {
          event.stopPropagation();
          canvas.close(itemId);
        }}
      >
        <CloseIcon width={12} height={12} />
      </button>
    </div>
  );
}

function PaneMenu({
  paneId,
  activeItem,
  kind,
  kindProps,
  canSplitMove,
}: {
  paneId: CanvasPaneId;
  activeItem: CanvasItem | undefined;
  kind: AnyCanvasKind | undefined;
  kindProps: CanvasKindProps | null;
  canSplitMove: boolean;
}) {
  const canvas = useCanvas();
  const ports = useCanvasHostPorts();
  const moveId = canSplitMove ? activeItem?.id : undefined;

  const kindItems: readonly CanvasMenuItem[] = kind?.menuItems && kindProps ? safeMenu(() => kind.menuItems?.(kindProps)) : [];
  const hostItems: readonly CanvasMenuItem[] = activeItem && ports.itemActions ? safeMenu(() => ports.itemActions?.(activeItem, kind)) : [];
  const itemEntries = [...kindItems, ...hostItems];

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <TapTargetButtonTransparent ariaLabel="More" icon={<MoreIcon />} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={4} className="mxc-menu">
          {itemEntries.map((entry) => (
            <Menu.Item
              key={entry.id}
              onSelect={entry.onSelect}
              className="mxc-menu-item"
              data-destructive={entry.destructive ? "" : undefined}
            >
              {entry.icon}
              {entry.label}
            </Menu.Item>
          ))}
          {itemEntries.length > 0 ? <Menu.Separator className="mxc-menu-separator" /> : null}
          <Menu.Item className="mxc-menu-item" onSelect={() => canvas.splitPane(paneId, "horizontal", moveId)}>
            <SplitRightIcon />
            Split right
          </Menu.Item>
          <Menu.Item className="mxc-menu-item" onSelect={() => canvas.splitPane(paneId, "vertical", moveId)}>
            <SplitDownIcon />
            Split down
          </Menu.Item>
          {activeItem && ports.popOut ? (
            <Menu.Item className="mxc-menu-item" onSelect={() => ports.popOut?.(activeItem)}>
              <PopOutIcon />
              Pop out
            </Menu.Item>
          ) : null}
          {activeItem && canSplitMove ? (
            <>
              <Menu.Separator className="mxc-menu-separator" />
              <Menu.Item className="mxc-menu-item" onSelect={() => canvas.closeOthers(activeItem.id)}>
                Close other tabs
              </Menu.Item>
            </>
          ) : null}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function safeMenu(build: () => readonly CanvasMenuItem[] | undefined): readonly CanvasMenuItem[] {
  try {
    return build() ?? [];
  } catch (error) {
    console.error("[@ai-matrx/canvas] a menu builder threw", error);
    return [];
  }
}

function ItemBody({
  item,
  paneId,
  isActive,
  isFocused,
}: {
  item: CanvasItem;
  paneId: CanvasPaneId;
  isActive: boolean;
  isFocused: boolean;
}) {
  const canvas = useCanvas();
  const kind = useCanvasKind(item.kind);
  if (!isActive && !kind?.keepAlive) return null;
  return (
    <div className="mxc-item" hidden={!isActive} data-kind={item.kind}>
      {kind ? (
        <ItemBoundary item={item} onClose={() => canvas.close(item.id)} onRetry={() => resetKindComponent(kind)}>
          <Suspense fallback={<div className="mxc-loading" aria-busy="true" />}>
            <KindRender kind={kind} props={{ item, data: item.data, paneId, isFocused, canvas }} />
          </Suspense>
        </ItemBoundary>
      ) : (
        <ItemProblem message="This item can no longer be shown." onClose={() => canvas.close(item.id)} />
      )}
    </div>
  );
}

function KindRender({ kind, props }: { kind: AnyCanvasKind; props: CanvasKindProps }) {
  const Render = kindComponent(kind);
  return <Render {...props} />;
}

function ItemProblem({ message, onClose, onRetry }: { message: string; onClose: () => void; onRetry?: () => void }) {
  return (
    <div className="mxc-problem" role="alert">
      <AlertIcon />
      <p>{message}</p>
      <div className="mxc-problem-actions">
        {onRetry ? (
          <button type="button" className="mxc-text-button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        <button type="button" className="mxc-text-button" onClick={onClose}>
          Close tab
        </button>
      </div>
    </div>
  );
}

interface BoundaryProps {
  item: CanvasItem;
  onClose: () => void;
  onRetry: () => void;
  children: ReactNode;
}

class ItemBoundary extends Component<BoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[@ai-matrx/canvas] "${this.props.item.kind}" failed to render`, error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <ItemProblem
          message="This item failed to load."
          onClose={this.props.onClose}
          onRetry={() => {
            this.props.onRetry();
            this.setState({ error: null });
          }}
        />
      );
    }
    return this.props.children;
  }
}

function Launcher({ paneId }: { paneId: CanvasPaneId }) {
  const canvas = useCanvas();
  const kinds = useCanvasKinds().filter((kind) => kind.launcher);
  if (kinds.length === 0) return <div className="mxc-empty">Nothing open</div>;
  return (
    <div className="mxc-launcher">
      {kinds.map((kind) => {
        const Icon = kind.icon;
        const launcher = kind.launcher;
        if (!launcher) return null;
        return (
          <button
            key={kind.id}
            type="button"
            className="mxc-launcher-item"
            onClick={() =>
              canvas.open({
                kind: kind.id,
                key: launcher.key,
                data: launcher.data,
                title: launcher.title ?? null,
                target: { paneId },
              })
            }
          >
            <Icon className="mxc-launcher-icon" />
            <span>{launcher.title ?? kind.label}</span>
          </button>
        );
      })}
    </div>
  );
}
