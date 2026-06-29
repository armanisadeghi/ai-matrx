'use client';

import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

interface ShadowWrapperProps {
    children: React.ReactNode;
    className?: string;
    mode?: 'open' | 'closed';
    delegatesFocus?: boolean;
}

export const ShadowWrapper = (
    {
        children,
        className,
        mode = 'open',
        delegatesFocus = false,
    }: ShadowWrapperProps) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const shadowRootRef = useRef<ShadowRoot | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!hostRef.current) return undefined;

        // Only create shadow root if it doesn't exist
        if (!shadowRootRef.current) {
            shadowRootRef.current = hostRef.current.attachShadow({
                mode,
                delegatesFocus
            });

            // Create container only once
            containerRef.current = document.createElement('div');
            containerRef.current.className = className || '';

            // Inject Tailwind styles
            const styleSheet = document.createElement('style');
            styleSheet.textContent = `
                @import url('/tailwind.css');
                .shadow-container { 
                    all: initial;
                    contain: content;
                }
            `;

            shadowRootRef.current.appendChild(styleSheet);
            shadowRootRef.current.appendChild(containerRef.current);
        }

        // Cleanup function
        return () => {
            if (shadowRootRef.current && hostRef.current) {
                // Clean up only if component is unmounting
                if (!document.body.contains(hostRef.current)) {
                    shadowRootRef.current = null;
                    containerRef.current = null;
                }
            }
        };
    }, [className, mode, delegatesFocus]);

    // Only render if we have a container
    if (!containerRef.current) {
        return <div ref={hostRef}/>;
    }

    // Use createPortal instead of manual root creation
    return (
        <div ref={hostRef}>
            {containerRef.current && createPortal(children, containerRef.current)}
        </div>
    );
};

/*
// Usage example:
export const LastPassIsolatedComponent = ({children}: { children: React.ReactNode }) => (
    <ShadowWrapper className="shadow-container">
        {children}
    </ShadowWrapper>
);*/
