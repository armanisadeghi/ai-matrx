"use client"

import { useState, useEffect } from "react"

/**
 * Hook that returns true after the component has mounted on the client.
 * Useful for avoiding hydration mismatches with dynamically generated IDs.
 * 
 * @example
 * const isMounted = useIsMounted()
 * if (!isMounted) return null // or a placeholder
 * return <ComponentWithDynamicIds />
 */
export function useIsMounted(): boolean {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  return isMounted
}

/**
 * True only while this component's effects are ATTACHED: false on the first
 * render, true after mount, false again while a React `<Activity
 * mode="hidden">` ancestor has detached its effects (a sleeping board tile,
 * a hidden tab), true again when it is shown.
 *
 * Use it to gate a child that owns an imperative instance created in an
 * effect and destroyed in that effect's cleanup, but guarded against being
 * created twice — `@monaco-editor/react`'s `<Editor>` is the case that
 * forced this: on hide its cleanup disposes the editor, on show its state
 * still says "ready", so it never creates another and the pane stays blank.
 * Rendering it only while attached gives it a fresh mount on every show.
 */
export function useEffectsAttached(): boolean {
  const [attached, setAttached] = useState(false)

  useEffect(() => {
    setAttached(true)
    return () => setAttached(false)
  }, [])

  return attached
}
