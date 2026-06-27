import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { graveyardDb } from "@/utils/supabase/graveyardDb";

/**
 * POST /api/admin/prompt-builtins/create-from-ai
 * 
 * Creates a new builtin from AI-generated prompt data
 * Optionally links it to a shortcut if shortcut_id is provided
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, description, messages, variable_defaults, tools, settings, shortcut_id, tags, category, model_id, output_format, output_schema } = body;

    if (!name || !messages) {
      return NextResponse.json(
        { error: 'name and messages are required' },
        { status: 400 }
      );
    }

    // Create the builtin using admin client (bypasses RLS on prompt_builtins)
    const { data: builtin, error: createError } = await graveyardDb(adminClient)
      .from("prompt_builtins")
      .insert([{
        name,
        description: description || null,
        messages,
        variable_defaults: variable_defaults || null,
        tools: tools || null,
        settings: settings || null,
        created_by_user_id: user.id,
        is_active: true,
        tags: tags || null,
        category: category || null,
        model_id: model_id || null,
        output_format: output_format || null,
        output_schema: output_schema || null,
        // No source_prompt_id - this is AI-generated standalone
      }])
      .select()
      .single();

    if (createError) {
      console.error('Error creating builtin from AI:', createError);
      return NextResponse.json(
        { 
          error: 'Failed to create builtin',
          details: createError.message,
          code: createError.code
        },
        { status: 500 }
      );
    }

    if (!builtin) {
      return NextResponse.json(
        { error: 'No builtin returned after creation' },
        { status: 500 }
      );
    }

    // If shortcut_id provided, link the builtin to the shortcut (admin client for prompt_shortcuts)
    if (shortcut_id) {
      const { error: linkError } = await graveyardDb(adminClient)
        .from("prompt_shortcuts")
        .update({ 
          prompt_builtin_id: builtin.id,
        })
        .eq('id', shortcut_id);

      if (linkError) {
        console.error('Error linking builtin to shortcut:', linkError);
        // Don't fail the whole operation - builtin was created successfully
        return NextResponse.json({
          builtin_id: builtin.id,
          linked: false,
          message: 'Builtin created but failed to link to shortcut',
          error: linkError.message
        });
      }
    }

    return NextResponse.json({
      builtin_id: builtin.id,
      builtin,
      linked: !!shortcut_id,
      message: shortcut_id 
        ? 'Builtin created and linked to shortcut successfully'
        : 'Builtin created successfully'
    });

  } catch (error: any) {
    console.error('Error in create-from-ai route:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

