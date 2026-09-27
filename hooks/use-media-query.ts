import * as React from 'react';

export const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = React.useState(false);

    React.useEffect(() => {
        const media = window.matchMedia(query);
        const updateMatch = (e: MediaQueryListEvent | MediaQueryList) => {
            setMatches(e.matches);
        };

        updateMatch(media);

        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', updateMatch);
            return () => media.removeEventListener('change', updateMatch);
        } else {
            media.addListener(updateMatch);
            return () => media.removeListener(updateMatch);
        }
    }, [query]);

    return matches;
};

/**
 * The same question, but honest about not knowing yet: `null` on the server
 * and during hydration, the real answer from the first client render after
 * that. Use it wherever a WRONG guess does work (starting a conversation,
 * fetching) rather than only choosing a layout — `useMediaQuery` answers
 * `false` until its effect runs, so a phone's first commit looks wide.
 */
export function useMediaQueryState(query: string): boolean | null {
    return React.useSyncExternalStore(
        (onChange) => {
            const media = window.matchMedia(query);
            media.addEventListener('change', onChange);
            return () => media.removeEventListener('change', onChange);
        },
        () => window.matchMedia(query).matches,
        () => null,
    );
}
