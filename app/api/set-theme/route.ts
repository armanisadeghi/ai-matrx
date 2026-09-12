import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const { theme } = await request.json();

        if (theme !== 'light' && theme !== 'dark') {
            return NextResponse.json(
                { success: false, message: 'Invalid theme value' },
                { status: 400 }
            );
        }

        // Get the cookies instance
        const cookieStore = await cookies();

        // Create a new ResponseCookies instance for setting the cookie
        const response = NextResponse.json({ success: true });
        response.cookies.set({
            name: 'theme',
            value: theme,
            path: '/',
            maxAge: 60 * 60 * 24 * 365, // 1 year
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
        });

        return response;
    } catch (error) {
        console.error('Error setting theme cookie:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 }
        );
    }
}
