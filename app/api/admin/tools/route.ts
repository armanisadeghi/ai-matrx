// app/api/admin/tools/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const active_only = searchParams.get('active_only');

    let query = supabase
      .from('tool_def')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (active_only === 'true') {
      query = query.eq('is_active', true);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tools:', error);
      return NextResponse.json(
        { error: 'Failed to fetch tools', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tools: data || [],
      count: data?.length || 0
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Validate required fields
    const { name, description, parameters } = body;
    if (!name || !description || !parameters) {
      return NextResponse.json(
        { error: 'Missing required fields: name, description, parameters' },
        { status: 400 }
      );
    }

    // Validate JSON fields
    if (typeof parameters !== 'object') {
      return NextResponse.json(
        { error: 'Parameters must be a valid JSON object' },
        { status: 400 }
      );
    }

    // source_kind: 'native' | 'mcp_discovered' | 'admin_authored' | 'agent_authored'.
    // Default to 'admin_authored' since these come in via the admin UI.
    // If 'mcp_discovered', managed_by_server_id must be set.
    const sourceKind = body.source_kind || 'admin_authored';
    if (sourceKind === 'mcp_discovered' && !body.managed_by_server_id) {
      return NextResponse.json(
        { error: "source_kind 'mcp_discovered' requires managed_by_server_id" },
        { status: 400 }
      );
    }

    const toolData = {
      name: body.name,
      description: body.description,
      parameters: body.parameters,
      output_schema: body.output_schema || null,
      annotations: body.annotations || [],
      source_kind: sourceKind,
      managed_by_server_id: body.managed_by_server_id || null,
      category: body.category === '' ? null : (body.category || null),
      tags: body.tags || [],
      icon: body.icon === '' ? null : (body.icon || null),
      is_active: body.is_active !== undefined ? body.is_active : true,
      version: body.version || 1,
    };

    const { data, error } = await supabase
      .from('tool_def')
      .insert([toolData])
      .select()
      .single();

    if (error) {
      console.error('Error creating tool:', error);
      return NextResponse.json(
        { error: 'Failed to create tool', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Tool created successfully',
      tool: data
    }, { status: 201 });

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
