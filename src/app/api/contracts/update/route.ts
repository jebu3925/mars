import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { CONTRACT_STATUSES } from '@/lib/validations';

/**
 * POST - Update a contract's status
 *
 * Body format:
 * {
 *   salesforceId: string,
 *   contractName?: string,  // for logging
 *   updates: { status: string }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { salesforceId, contractName, updates } = body;

    if (!salesforceId) {
      return NextResponse.json(
        { error: 'salesforceId is required' },
        { status: 400 }
      );
    }

    if (!updates || !updates.status) {
      return NextResponse.json(
        { error: 'updates.status is required' },
        { status: 400 }
      );
    }

    const newStatus = updates.status;

    // Validate status
    if (!CONTRACT_STATUSES.includes(newStatus as typeof CONTRACT_STATUSES[number])) {
      return NextResponse.json(
        { error: `Invalid status. Valid: ${CONTRACT_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    console.log(`[UPDATE] Updating contract ${salesforceId} (${contractName || 'unknown'}) to status: ${newStatus}`);

    const admin = getSupabaseAdmin();

    // Use .select() to get the updated row and verify it exists
    const { data, error } = await admin
      .from('contracts')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('salesforce_id', salesforceId)
      .select('salesforce_id, status');

    if (error) {
      console.error('[UPDATE] Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to update contract', details: error.message },
        { status: 500 }
      );
    }

    // Check if any rows were actually updated
    if (!data || data.length === 0) {
      console.error(`[UPDATE] No contract found with salesforce_id: ${salesforceId}`);
      return NextResponse.json(
        { error: `Contract not found with ID: ${salesforceId}` },
        { status: 404 }
      );
    }

    console.log(`[UPDATE] Successfully updated ${salesforceId} to ${data[0].status}`);

    return NextResponse.json({
      success: true,
      salesforceId,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[UPDATE] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Update failed: ${message}` },
      { status: 500 }
    );
  }
}
