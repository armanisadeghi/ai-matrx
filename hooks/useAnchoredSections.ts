"use client";

import { useEffect, useRef, useState } from "react";

/** URL-backed reading position for a sectioned page inside a scroll container. */
export function useAnchoredSections(pageKey: string) {
  const contentRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const currentContent = contentRef.current;
    const currentNav = navRef.current;
    const currentScroller = currentContent?.closest<HTMLElement>(".shell-main");
    if (!currentContent || !currentNav || !currentScroller) return;
    const content = currentContent;
    const nav = currentNav;
    const scroller = currentScroller;

    let restoring = false;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sections = () =>
      Array.from(content.querySelectorAll<HTMLElement>("section[id]"));
    const clearance = () =>
      parseFloat(getComputedStyle(nav).top) + nav.offsetHeight + 16;

    function restore() {
      const url = new URL(window.location.href);
      const target = sections().find(
        (section) => `#${section.id}` === url.hash,
      );
      restoring = true;
      if (!target) {
        scroller.scrollTo({ top: 0, behavior: "instant" });
        setActiveSection("");
        return;
      }
      const offset = Number(url.searchParams.get("sectionOffset") ?? 0);
      scroller.scrollTo({
        top:
          scroller.scrollTop +
          target.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          clearance() +
          (Number.isFinite(offset) ? Math.max(0, offset) : 0),
        behavior: "instant",
      });
      setActiveSection(target.id);
    }

    function remember() {
      if (restoring) return;
      const line = scroller.getBoundingClientRect().top + clearance();
      const all = sections();
      const target = all.findLast(
        (section) => section.getBoundingClientRect().top <= line + 1,
      );
      if (!target) {
        setActiveSection("");
        const url = new URL(window.location.href);
        url.hash = "";
        url.searchParams.delete("sectionOffset");
        window.history.replaceState(window.history.state, "", url);
        return;
      }
      const url = new URL(window.location.href);
      url.hash = target.id;
      const offset = Math.max(
        0,
        Math.round(line - target.getBoundingClientRect().top),
      );
      if (offset) url.searchParams.set("sectionOffset", String(offset));
      else url.searchParams.delete("sectionOffset");
      window.history.replaceState(window.history.state, "", url);
      setActiveSection(target.id);
    }

    function onScroll() {
      clearTimeout(timer);
      timer = setTimeout(remember, 150);
    }
    function onInput() {
      restoring = false;
    }
    function onKey(event: KeyboardEvent) {
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        onInput();
    }
    function onResize() {
      content.style.setProperty(
        "--section-scroll-clearance",
        `${clearance()}px`,
      );
      if (restoring) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(restore);
      }
    }
    // Keep the bookmarked section aligned while earlier async sections load.
    // User scroll intent releases that alignment immediately.
    const observer = new ResizeObserver(onResize);
    observer.observe(content);
    observer.observe(nav);
    sections().forEach((section) => observer.observe(section));
    onResize();
    restore();
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onInput, { passive: true });
    scroller.addEventListener("touchstart", onInput, { passive: true });
    scroller.addEventListener("pointerdown", onInput, { passive: true });
    scroller.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restore);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onInput);
      scroller.removeEventListener("touchstart", onInput);
      scroller.removeEventListener("pointerdown", onInput);
      scroller.removeEventListener("keydown", onKey);
    };
  }, [pageKey]);

  return { contentRef, navRef, activeSection };
}
