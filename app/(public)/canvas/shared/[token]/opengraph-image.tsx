import { ImageResponse } from 'next/og';
import { createClient } from '@/utils/supabase/server';
import { getCanvasBlockMeta } from '@/features/canvas/canvas-block-meta';

export const runtime = 'nodejs';
export const alt = 'AI Matrx Canvas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Props {
    params: Promise<{ token: string }>;
}

export default async function OgImage({ params }: Props) {
    const { token } = await params;
    const supabase = await createClient();

    const { data: canvas } = await supabase
        .schema('canvas').from('shared_canvas_items')
        .select('title, description, canvas_type, creator_display_name, creator_username')
        .eq('share_token', token)
        .single();

    const type = canvas?.canvas_type ?? 'canvas';
    const title = canvas?.title ?? 'AI Matrx Canvas';
    const description = canvas?.description ?? 'Interactive content powered by AI Matrx';
    const creator = canvas?.creator_display_name ?? canvas?.creator_username ?? null;
    const meta = getCanvasBlockMeta(type);

    // Gradient stop colors derived from the brand color
    const brandColor = meta.color;

    return new ImageResponse(
        (
            <div
                style={{
                    display: 'flex',
                    width: '1200px',
                    height: '630px',
                    background: '#0f172a',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {/* Left accent bar */}
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '8px',
                        height: '630px',
                        background: brandColor,
                    }}
                />

                {/* Large blurred glow blob top-right */}
                <div
                    style={{
                        position: 'absolute',
                        right: '-120px',
                        top: '-120px',
                        width: '520px',
                        height: '520px',
                        borderRadius: '50%',
                        background: brandColor,
                        opacity: 0.12,
                        filter: 'blur(80px)',
                    }}
                />

                {/* Bottom-left subtle glow */}
                <div
                    style={{
                        position: 'absolute',
                        left: '-80px',
                        bottom: '-80px',
                        width: '360px',
                        height: '360px',
                        borderRadius: '50%',
                        background: brandColor,
                        opacity: 0.08,
                        filter: 'blur(60px)',
                    }}
                />

                {/* Main content */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '60px 70px 52px 80px',
                        width: '100%',
                        height: '100%',
                    }}
                >
                    {/* Top section: badge + type icon */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {/* Block-type badge */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: `${brandColor}22`,
                                border: `1.5px solid ${brandColor}55`,
                                borderRadius: '100px',
                                padding: '8px 20px',
                            }}
                        >
                            {/* Icon circle */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: brandColor,
                                }}
                            >
                                <span style={{ fontSize: '14px', lineHeight: 1 }}>{meta.emoji}</span>
                            </div>
                            <span
                                style={{
                                    color: '#e2e8f0',
                                    fontSize: '18px',
                                    fontWeight: 600,
                                    letterSpacing: '-0.01em',
                                }}
                            >
                                {meta.badge}
                            </span>
                        </div>

                        {/* AI Matrx wordmark */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '16px',
                                    fontWeight: 800,
                                    color: '#fff',
                                }}
                            >
                                M
                            </div>
                            <span style={{ color: '#94a3b8', fontSize: '18px', fontWeight: 600 }}>
                                AI Matrx
                            </span>
                        </div>
                    </div>

                    {/* Title + description */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, justifyContent: 'center' }}>
                        <div
                            style={{
                                fontSize: title.length > 50 ? '44px' : title.length > 30 ? '52px' : '60px',
                                fontWeight: 800,
                                color: '#f1f5f9',
                                lineHeight: 1.1,
                                letterSpacing: '-0.03em',
                                maxWidth: '820px',
                            }}
                        >
                            {title}
                        </div>
                        {description && (
                            <div
                                style={{
                                    fontSize: '22px',
                                    color: '#94a3b8',
                                    lineHeight: 1.5,
                                    maxWidth: '780px',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {description}
                            </div>
                        )}
                    </div>

                    {/* Bottom row: creator + CTA */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {creator && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {/* Avatar circle */}
                                <div
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        background: `linear-gradient(135deg, ${brandColor}, #1e40af)`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        fontSize: '16px',
                                        fontWeight: 700,
                                    }}
                                >
                                    {creator.slice(0, 1).toUpperCase()}
                                </div>
                                <span style={{ color: '#64748b', fontSize: '17px' }}>
                                    by{' '}
                                    <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{creator}</span>
                                </span>
                            </div>
                        )}

                        {/* CTA pill */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: brandColor,
                                borderRadius: '100px',
                                padding: '12px 28px',
                            }}
                        >
                            <span style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>
                                Open on AI Matrx →
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        ),
        {
            ...size,
        },
    );
}
