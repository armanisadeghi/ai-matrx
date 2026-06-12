import {
    ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
    ArrowLeft, ArrowRight, ArrowUp, ArrowDown
} from 'lucide-react';
import type {CSSProperties} from 'react';

export type PanelPosition = 'left' | 'right' | 'top' | 'bottom';

interface PanelLayoutConfig {
    container: {
        // Core layout
        position: CSSProperties['position']
        inset: Partial<Record<'top' | 'right' | 'bottom' | 'left', number | string>>
        width?: string
        height?: string
        maxWidth?: string
        maxHeight?: string
        minWidth?: string
        minHeight?: string
    }
    resizableGroup: {
        direction: 'horizontal' | 'vertical'
        style: CSSProperties
    }
    handle: {
        cursor: 'col-resize' | 'row-resize'
        isVertical: boolean
    }
    content: {
        border: string
        height: string
        scrollDirection: 'pan-x' | 'pan-y'
    }
    chevrons: {
        collapsed: typeof ChevronLeft
        expanded: typeof ChevronRight
    }
    navigation: {
        buttonPosition: string
        icon: typeof ArrowLeft
    }
    layout: {
        isHorizontal: boolean
        isStartPosition: boolean
    }
}

export const getPanelConfig = (
    position: PanelPosition,
    size: number,
    isFullScreen: boolean,
    minSize: number,
    maxSize: number
): PanelLayoutConfig => {
    const configs: Record<PanelPosition, PanelLayoutConfig> = {
        left: {
            container: {
                position: 'fixed',
                inset: {
                    top: 0,
                    bottom: 0,
                    left: 0
                },
                width: `${isFullScreen ? 100 : size}vw`,
                maxWidth: `${maxSize}vw`,
                minWidth: `${minSize}vw`,
                height: '100dvh'
            },
            resizableGroup: {
                direction: 'horizontal',
                style: {
                    height: '100dvh',
                    width: `${isFullScreen ? 100 : size}vw`, // Match container width
                    touchAction: 'none',
                    userSelect: 'none',
                    pointerEvents: 'none' // Changed to none by default
                }
            },
            handle: {
                cursor: 'col-resize',
                isVertical: false
            },
            content: {
                border: 'border-r',
                height: 'calc(100dvh - 48px)',
                scrollDirection: 'pan-y'
            },
            chevrons: {
                collapsed: ChevronRight,
                expanded: ChevronLeft
            },
            navigation: {
                buttonPosition: 'left-4 top-4',
                icon: ArrowLeft
            },
            layout: {
                isHorizontal: true,
                isStartPosition: true
            }
        },

        right: {
            container: {
                position: 'fixed',
                inset: {
                    top: 0,
                    bottom: 0,
                    right: 0
                },
                width: `${isFullScreen ? 100 : size}vw`,
                maxWidth: `${maxSize}vw`,
                minWidth: `${minSize}vw`,
                height: '100dvh'
            },
            resizableGroup: {
                direction: 'horizontal',
                style: {
                    height: '100dvh',
                    width: '100%',
                    touchAction: 'none',
                    userSelect: 'none',
                    pointerEvents: 'auto'
                }
            },
            handle: {
                cursor: 'col-resize',
                isVertical: false
            },
            content: {
                border: 'border-l',
                height: 'calc(100dvh - 48px)',
                scrollDirection: 'pan-y'
            },
            chevrons: {
                collapsed: ChevronLeft,
                expanded: ChevronRight
            },
            navigation: {
                buttonPosition: 'right-4 top-4',
                icon: ArrowRight
            },
            layout: {
                isHorizontal: true,
                isStartPosition: false
            }
        },

        top: {
            container: {
                position: 'fixed',
                inset: {
                    top: 0,
                    left: 0,
                    right: 0
                },
                height: `${isFullScreen ? 100 : size}vh`,
                maxHeight: `${maxSize}vh`,
                minHeight: `${minSize}vh`,
                width: '100vw'
            },
            resizableGroup: {
                direction: 'vertical',
                style: {
                    width: '100vw',
                    height: '100%',
                    touchAction: 'none',
                    userSelect: 'none',
                    pointerEvents: 'auto'
                }
            },
            handle: {
                cursor: 'row-resize',
                isVertical: true
            },
            content: {
                border: 'border-b',
                height: 'calc(100dvh - 48px)',
                scrollDirection: 'pan-x'
            },
            chevrons: {
                collapsed: ChevronDown,
                expanded: ChevronUp
            },
            navigation: {
                buttonPosition: 'top-4 left-4',
                icon: ArrowUp
            },
            layout: {
                isHorizontal: false,
                isStartPosition: true
            }
        },

        bottom: {
            container: {
                position: 'fixed',
                inset: {
                    bottom: 0,
                    left: 0,
                    right: 0
                },
                height: `${isFullScreen ? 100 : size}vh`,
                maxHeight: `${maxSize}vh`,
                minHeight: `${minSize}vh`,
                width: '100vw'
            },
            resizableGroup: {
                direction: 'vertical',
                style: {
                    width: '100vw',
                    height: '100%',
                    touchAction: 'none',
                    userSelect: 'none',
                    pointerEvents: 'auto'
                }
            },
            handle: {
                cursor: 'row-resize',
                isVertical: true
            },
            content: {
                border: 'border-t',
                height: 'calc(100dvh - 48px)',
                scrollDirection: 'pan-x'
            },
            chevrons: {
                collapsed: ChevronUp,
                expanded: ChevronDown
            },
            navigation: {
                buttonPosition: 'bottom-4 right-4',
                icon: ArrowDown
            },
            layout: {
                isHorizontal: false,
                isStartPosition: false
            }
        }
    };

    return configs[position];
};
