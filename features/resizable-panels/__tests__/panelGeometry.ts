/**
 * Geometry stand-in for jsdom, which performs no layout: every offset* is 0 and
 * there is no ResizeObserver, so react-resizable-panels would never leave its
 * "deferred" (unmeasured) state and no toggle could be exercised at all.
 *
 * This models CSS flex for the three element kinds the library measures
 * (`[data-group]`, `[data-panel]`, `[data-separator]`) from the inline flex
 * styles the LIBRARY ITSELF writes (flex-grow = layout %, or flex-basis =
 * defaultSize before the first layout). It makes no layout decision — the real
 * library and the real PanelControlProvider still own every one of those.
 *
 * Pointer drags go through the library's own document-level pointer handlers.
 */
import { act } from "react";

const GROUP_HEIGHT_PX = 600;
let groupPx = 1000;

/** Width of every test group's main axis, in px (a window resize). */
export function setGroupPx(px: number): void {
  groupPx = px;
}

function isLibraryElement(el: Element): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    (el.hasAttribute("data-group") ||
      el.hasAttribute("data-panel") ||
      el.hasAttribute("data-separator"))
  );
}

function panelSiblings(panel: HTMLElement): HTMLElement[] {
  const parent = panel.parentElement;
  if (!parent) return [];
  return Array.from(parent.children).filter(
    (c): c is HTMLElement =>
      c instanceof HTMLElement && c.hasAttribute("data-panel"),
  );
}

function basisPx(style: CSSStyleDeclaration): number {
  const basis = style.flexBasis;
  if (basis.endsWith("%")) return (parseFloat(basis) / 100) * groupPx;
  if (basis.endsWith("px")) return parseFloat(basis);
  return 0;
}

function panelWidth(panel: HTMLElement): number {
  const panels = panelSiblings(panel);
  const bases = panels.map((p) => basisPx(p.style));
  const grows = panels.map((p) => parseFloat(p.style.flexGrow) || 0);
  const free = Math.max(0, groupPx - bases.reduce((a, b) => a + b, 0));
  const totalGrow = grows.reduce((a, b) => a + b, 0);
  const i = panels.indexOf(panel);
  return (bases[i] ?? 0) + (totalGrow > 0 ? (free * (grows[i] ?? 0)) / totalGrow : 0);
}

function widthOf(el: HTMLElement): number {
  if (el.hasAttribute("data-group")) return groupPx;
  if (el.hasAttribute("data-panel")) return panelWidth(el);
  return 0;
}

function leftOf(el: HTMLElement): number {
  const parent = el.parentElement;
  if (!parent || !parent.hasAttribute("data-group")) return 0;
  let x = 0;
  for (const child of Array.from(parent.children)) {
    if (child === el) break;
    if (child instanceof HTMLElement && child.hasAttribute("data-panel")) {
      x += panelWidth(child);
    }
  }
  return x;
}

const observers = new Set<GeometryResizeObserver>();

class GeometryResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly lastWidth = new Map<Element, number | undefined>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.add(this);
  }

  observe(target: Element): void {
    this.lastWidth.set(target, undefined);
  }

  unobserve(target: Element): void {
    this.lastWidth.delete(target);
  }

  disconnect(): void {
    this.lastWidth.clear();
    observers.delete(this);
  }

  /** Deliver entries for targets whose width changed since the last delivery. */
  deliver(): boolean {
    const entries: ResizeObserverEntry[] = [];
    for (const [target, last] of this.lastWidth) {
      const width = target instanceof HTMLElement ? widthOf(target) : 0;
      if (last !== undefined && last === width) continue;
      this.lastWidth.set(target, width);
      const size: ResizeObserverSize = {
        inlineSize: width,
        blockSize: GROUP_HEIGHT_PX,
      };
      entries.push({
        target,
        borderBoxSize: [size],
        contentBoxSize: [size],
        devicePixelContentBoxSize: [size],
        contentRect: new DOMRect(0, 0, width, GROUP_HEIGHT_PX),
      });
    }
    if (entries.length === 0) return false;
    this.callback(entries, this);
    return true;
  }
}

/** Run ResizeObserver deliveries until the layout stops moving. */
export function flushResizeObservers(): void {
  for (let round = 0; round < 10; round++) {
    let delivered = false;
    act(() => {
      for (const observer of Array.from(observers)) {
        if (observer.deliver()) delivered = true;
      }
    });
    if (!delivered) return;
  }
  throw new Error("ResizeObserver deliveries never settled after 10 rounds");
}

export function installPanelGeometry(): () => void {
  const proto = HTMLElement.prototype;
  const saved = {
    offsetWidth: Object.getOwnPropertyDescriptor(proto, "offsetWidth"),
    offsetHeight: Object.getOwnPropertyDescriptor(proto, "offsetHeight"),
    offsetLeft: Object.getOwnPropertyDescriptor(proto, "offsetLeft"),
    offsetTop: Object.getOwnPropertyDescriptor(proto, "offsetTop"),
  };
  const savedRect = Element.prototype.getBoundingClientRect;

  Object.defineProperty(proto, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return widthOf(this);
    },
  });
  Object.defineProperty(proto, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return isLibraryElement(this) ? GROUP_HEIGHT_PX : 0;
    },
  });
  Object.defineProperty(proto, "offsetLeft", {
    configurable: true,
    get(this: HTMLElement) {
      return leftOf(this);
    },
  });
  Object.defineProperty(proto, "offsetTop", {
    configurable: true,
    get() {
      return 0;
    },
  });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (isLibraryElement(this)) {
      return new DOMRect(leftOf(this), 0, widthOf(this), GROUP_HEIGHT_PX);
    }
    return savedRect.call(this);
  };
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: GeometryResizeObserver,
  });

  return () => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(proto, key, descriptor);
    }
    Element.prototype.getBoundingClientRect = savedRect;
    observers.clear();
    groupPx = 1000;
  };
}

function pointer(target: Element, type: string, clientX: number, buttons: number) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY: GROUP_HEIGHT_PX / 2,
      button: 0,
      buttons,
    }),
  );
}

/**
 * A real pointer drag of `separator` through the library's pointer handlers:
 * down at the separator, one move per x in `path` (ResizeObservers delivered
 * after each, exactly like a browser frame), then up at the last x.
 */
export function dragSeparator(separator: Element, path: number[]): void {
  const startX = separator.getBoundingClientRect().left;
  act(() => pointer(separator, "pointerdown", startX, 1));
  for (const x of path) {
    act(() => pointer(separator, "pointermove", x, 1));
    flushResizeObservers();
  }
  const endX = path[path.length - 1] ?? startX;
  act(() => pointer(separator, "pointerup", endX, 0));
  flushResizeObservers();
}

/** The size (%) the library is actually rendering for a panel. */
export function renderedPanelPercent(root: ParentNode, panelId: string): number {
  const el = root.querySelector<HTMLElement>(`[data-panel][id="${panelId}"]`);
  if (!el) throw new Error(`panel "${panelId}" is not rendered`);
  return parseFloat(el.style.flexGrow);
}
