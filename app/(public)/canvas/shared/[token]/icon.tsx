import { ImageResponse } from 'next/og';
import { createClient } from '@/utils/supabase/server';
import { getCanvasBlockMeta } from '@/features/canvas/canvas-block-meta';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

interface Props {
    params: Promise<{ token: string }>;
}

export default async function Icon({ params }: Props) {
    const { token } = await params;
    const supabase = await createClient();

    const { data: canvas } = await supabase
        .schema('canvas').from('shared_canvas_items')
        .select('canvas_type')
        .eq('share_token', token)
        .single();

    const type = canvas?.canvas_type ?? 'canvas';
    const meta = getCanvasBlockMeta(type);

    return new ImageResponse(
        (
            <div
                style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '7px',
                    background: meta.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                }}
            >
                {meta.emoji}
            </div>
        ),
        { ...size },
    );
}
