// app/api/admin/tools/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('tool_def')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Tool not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching tool:', error);
      return NextResponse.json(
        { error: 'Failed to fetch tool', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ tool: data });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();

    // Don't allow updating id, created_at, or updated_at
    const { id: _, created_at, updated_at, ...updateData } = body;

    // Validate JSON fields if provided
    if (updateData.parameters && typeof updateData.parameters !== 'object') {
      return NextResponse.json(
        { error: 'Parameters must be a valid JSON object' },
        { status: 400 }
      );
    }

    if (updateData.output_schema && typeof updateData.output_schema !== 'object') {
      return NextResponse.json(
        { error: 'Output schema must be a valid JSON object' },
        { status: 400 }
      );
    }

    if (updateData.annotations && !Array.isArray(updateData.annotations)) {
      return NextResponse.json(
        { error: 'Annotations must be an array' },
        { status: 400 }
      );
    }

    // Convert empty strings to null for nullable fields
    if (updateData.category === '') updateData.category = null;
    if (updateData.icon === '') updateData.icon = null;

    // Strip dropped columns if the client still sends them.
    delete updateData.function_path;
    delete updateData.source_app;
    delete updateData.privileged;

    const { data, error } = await supabase
      .from('tool_def')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Tool not found' },
          { status: 404 }
        );
      }
      console.error('Error updating tool:', error);
      return NextResponse.json(
        { error: 'Failed to update tool', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Tool updated successfully',
      tool: data
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('tool_def')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting tool:', error);
      return NextResponse.json(
        { error: 'Failed to delete tool', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Tool deleted successfully'
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
