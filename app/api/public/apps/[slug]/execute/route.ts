import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { checkGuestLimit, recordGuestExecution } from '@/lib/services/guest-limit-service';
import { isValidFingerprint, isTempFingerprint } from '@/lib/services/fingerprint-service';
import { getPublicAppsRatelimiter } from '@/lib/rate-limit/client';
import { ipRateLimit } from '@/lib/rate-limit/helpers';
import crypto from 'crypto';
import { graveyardDb } from "@/utils/supabase/graveyardDb";

/**
 * Create backup identifier from IP + User Agent
 * Used when fingerprint is temp or invalid
 */
function createBackupIdentifier(ip: string, userAgent: string): string {
    const combined = `${ip}:${userAgent}`;
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
}

/**
 * OPTIMIZED Public API endpoint for executing prompt apps
 * 
 * POST /api/public/apps/{slug}/execute
 * 
 * OPTIMIZATION: This endpoint now only handles logging and task_id generation.
 * All variable validation, resolution, and config building happens CLIENT-SIDE
 * for maximum speed (~10-20ms response time).
 * 
 * Body: {
 *   app_id: string                     // App ID
 *   variables_provided: Record<string, any>  // Original variables from user
 *   variables_used: Record<string, any>      // Validated/processed variables
 *   chat_config: object                // Pre-built chat config (from client)
 *   fingerprint: string                // REQUIRED - Browser fingerprint
 *   metadata?: Record<string, any>     // Additional metadata
 * }
 * 
 * Returns: {
 *   success: boolean
 *   task_id?: string       // Use this to stream results
 *   guest_limit?: {        // For non-authenticated users
 *     allowed: boolean
 *     remaining: number
 *     total_used: number
 *     is_blocked: boolean
 *   }
 *   error?: { type, message, details }
 * }
 */

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const supabase = await createClient();

    try {
        // Parse request body (OPTIMIZED: receives pre-built config from client)
        const body = await request.json();
        const {
            app_id,
            variables_provided = {},
            variables_used = {},
            chat_config,
            fingerprint,
            metadata = {}
        } = body;

        // Validate required fields
        if (!app_id || !chat_config) {
            return NextResponse.json({
                success: false,
                error: {
                    type: 'invalid_request',
                    message: 'Missing required fields: app_id and chat_config'
                }
            }, { status: 400 });
        }

        // Get IP address and user agent
        const ip_address = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                          request.headers.get('x-real-ip') || 
                          'unknown';
        const user_agent = request.headers.get('user-agent') || 'unknown';
        const referer = request.headers.get('referer') || undefined;

        // Get current user (if authenticated)
        const { data: { user } } = await supabase.auth.getUser();
        
        // Check IP-based rate limit for non-authenticated users via Upstash
        const isPublicAccess = !user?.id;
        if (isPublicAccess) {
            const rateLimited = await ipRateLimit(request, getPublicAppsRatelimiter());
            if (rateLimited) {
                return NextResponse.json({
                    success: false,
                    error: {
                        type: 'ip_rate_limit_exceeded',
                        message: 'Too many requests from this network. Please try again later or sign up for unlimited access.',
                    }
                }, { status: 429 });
            }
        }
        
        // REQUIRE fingerprint for non-authenticated users
        if (isPublicAccess && !fingerprint) {
            return NextResponse.json({
                success: false,
                error: {
                    type: 'invalid_request',
                    message: 'Fingerprint is required for guest access'
                }
            }, { status: 400 });
        }

        // Validate fingerprint format
        if (isPublicAccess && !isValidFingerprint(fingerprint)) {
            console.warn('⚠️ Invalid fingerprint rejected:', fingerprint?.substring(0, 10));
            return NextResponse.json({
                success: false,
                error: {
                    type: 'invalid_fingerprint',
                    message: 'Invalid guest identification. Please refresh the page.'
                }
            }, { status: 400 });
        }

        // Create backup identifier from IP + User Agent
        const backupIdentifier = createBackupIdentifier(ip_address, user_agent);

        // Determine primary identifier and flag temp fingerprints
        let primaryIdentifier = fingerprint || '';
        let identifierType: 'fingerprint' | 'ip_hash' | 'temp' = 'fingerprint';

        if (isPublicAccess) {
            if (isTempFingerprint(fingerprint)) {
                primaryIdentifier = backupIdentifier;
                identifierType = 'ip_hash';
                console.warn('⚠️ Temp fingerprint detected - using IP+UA backup identifier:', fingerprint);
            }
        }

        // OPTIMIZATION: Check guest limit (for tracking, not blocking - client already checked)
        let guestLimitResult = null;
        if (isPublicAccess) {
            try {
                guestLimitResult = await checkGuestLimit(supabase, primaryIdentifier);
                
                // If limit exceeded, still log but return error
                if (!guestLimitResult.allowed || guestLimitResult.is_blocked) {
                    const taskId = uuidv4();
                    
                    // Track failed execution due to guest limit (fire-and-forget)
                    graveyardDb(supabase).from("prompt_app_executions").insert({
                        app_id,
                        user_id: null,
                        fingerprint: primaryIdentifier,
                        ip_address,
                        user_agent,
                        task_id: taskId,
                        variables_provided,
                        variables_used,
                        success: false,
                        error_type: 'rate_limit_exceeded',
                        error_message: 'Guest execution limit reached. Please sign up to continue.',
                        referer,
                        metadata: {
                            ...metadata,
                            guest_limit_hit: true,
                            total_used: guestLimitResult.total_used,
                            identifier_type: identifierType,
                            backup_identifier: backupIdentifier
                        }
                    }).then(({ error }) => {
                        if (error) console.error('Failed to log rate limit:', error);
                    });

                    return NextResponse.json({
                        success: false,
                        guest_limit: guestLimitResult,
                        error: {
                            type: 'guest_limit_exceeded',
                            message: 'You have reached the maximum number of free executions. Please sign up to continue.',
                            details: {
                                remaining: guestLimitResult.remaining,
                                total_used: guestLimitResult.total_used,
                                is_blocked: guestLimitResult.is_blocked
                            }
                        }
                    }, { status: 429 });
                }
            } catch (error) {
                console.error('Guest limit check failed:', error);
                // Fail closed - reject guest access if limit check fails
                return NextResponse.json({
                    success: false,
                    error: {
                        type: 'service_error',
                        message: 'Unable to verify guest access. Please try again or sign up.'
                    }
                }, { status: 503 });
            }
        }

        // OPTIMIZATION: Generate task ID immediately (no more DB fetches or processing!)
        const taskId = uuidv4();

        // OPTIMIZATION: Record execution - FIRE AND FORGET (non-blocking)
        graveyardDb(supabase)
            .from("prompt_app_executions")
            .insert({
                app_id,
                user_id: user?.id || null,
                fingerprint: isPublicAccess ? primaryIdentifier : null,
                ip_address,
                user_agent,
                task_id: taskId,
                variables_provided,
                variables_used,
                success: true, // Will be updated by backend if it fails
                referer,
                metadata: {
                    ...metadata,
                    is_public_access: isPublicAccess,
                    identifier_type: isPublicAccess ? identifierType : undefined,
                    backup_identifier: isPublicAccess ? backupIdentifier : undefined
                }
            })
            .then(({ error: executionError }) => {
                if (executionError) {
                    console.error('Failed to record execution:', executionError);
                }
            });

        // OPTIMIZATION: Record guest execution for tracking (non-authenticated only) - FIRE AND FORGET (non-blocking)
        if (isPublicAccess) {
            recordGuestExecution(supabase, {
                fingerprint: primaryIdentifier,
                resourceType: 'prompt_app',
                resourceId: app_id,
                resourceName: slug, // Use slug as name for now
                taskId: taskId,
                ipAddress: ip_address,
                userAgent: user_agent,
                referer
            }).catch(error => {
                console.error('Failed to record guest execution:', error);
                // Continue anyway - tracking failure shouldn't break the execution
            });
            
            // IP rate limiting is now handled by Upstash (atomic, distributed)
        }

        // OPTIMIZATION: Return task ID IMMEDIATELY (client already has socket_config built)
        return NextResponse.json({
            success: true,
            task_id: taskId,
            guest_limit: guestLimitResult
        });

    } catch (error) {
        console.error('Execution error:', error);
        
        return NextResponse.json({
            success: false,
            error: {
                type: 'execution_error',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            }
        }, { status: 500 });
    }
}

// ============================================================================
// Helper Functions (DEPRECATED - moved to client-side for performance)
// ============================================================================

// OPTIMIZATION NOTE: Variable validation and resolution now happen CLIENT-SIDE
// for maximum speed. These functions are kept here commented out for reference
// in case we need to add server-side validation back for security.

/*
function validateVariables(
    providedVariables: Record<string, any>,
    schema: any[]
): {
    validVariables: Record<string, any>;
    validationErrors: string[];
} {
    // ... moved to client-side ...
}

function resolveVariablesInMessages(
    messages: any[],
    variables: Record<string, any>
): any[] {
    // ... moved to client-side ...
}
*/

// ============================================================================
// PATCH endpoint to update execution failure status
// Called by the client when a stream error occurs AFTER the initial log
// ============================================================================

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    await params; // consume params (slug not needed here)
    const supabase = await createClient();

    try {
        const body = await request.json();
        const { task_id, error_type, error_message, metadata } = body;

        if (!task_id) {
            return NextResponse.json({ success: false, error: 'task_id is required' }, { status: 400 });
        }

        const { error: updateError } = await graveyardDb(supabase)
            .from("prompt_app_executions")
            .update({
                success: false,
                error_type: error_type || 'stream_error',
                error_message: error_message || 'Stream error occurred after execution started',
                metadata: metadata || {}
            })
            .eq('task_id', task_id);

        if (updateError) {
            console.error('Failed to update execution failure:', updateError);
            return NextResponse.json({ success: false, error: 'Failed to update record' }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('PATCH execution error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// ============================================================================
// GET endpoint to fetch public app info (no auth required)
// ============================================================================

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const supabase = await createClient();

    const { data: app, error } = await graveyardDb(supabase)
        .from("prompt_apps")
        .select(`
            id,
            slug,
            name,
            tagline,
            description,
            category,
            tags,
            preview_image_url,
            variable_schema,
            layout_config,
            styling_config,
            total_executions,
            success_rate
        `)
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

    if (error || !app) {
        return NextResponse.json({
            error: 'App not found'
        }, { status: 404 });
    }

    return NextResponse.json(app);
}

