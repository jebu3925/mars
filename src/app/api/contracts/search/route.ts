import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Global Search API
 * Searches across contracts, documents, and tasks
 * GET /api/contracts/search?q=query&scope=all|contracts|documents|tasks
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const scope = searchParams.get('scope') || 'all';
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!query || query.length < 2) {
      return NextResponse.json({
        error: 'Query must be at least 2 characters',
        results: { contracts: [], documents: [], tasks: [] },
      });
    }

    const admin = getSupabaseAdmin();
    const searchTerm = `%${query.toLowerCase()}%`;

    const results: {
      contracts: any[];
      documents: any[];
      tasks: any[];
    } = {
      contracts: [],
      documents: [],
      tasks: [],
    };

    // Search contracts
    if (scope === 'all' || scope === 'contracts') {
      const { data: contracts, error } = await admin
        .from('contracts')
        .select('*')
        .or(`name.ilike.${searchTerm},account_name.ilike.${searchTerm},opportunity_name.ilike.${searchTerm},sales_rep.ilike.${searchTerm}`)
        .eq('is_closed', false)
        .limit(limit);

      if (!error && contracts) {
        results.contracts = contracts.map(c => ({
          id: c.id,
          type: 'contract',
          title: c.account_name || c.name,
          subtitle: c.opportunity_name,
          value: c.value,
          status: c.status,
          salesRep: c.sales_rep,
          closeDate: c.close_date,
          url: `/contracts-dashboard?contract=${c.id}`,
          matchedField: getMatchedField(c, query),
        }));
      }
    }

    // Search documents
    if (scope === 'all' || scope === 'documents') {
      const { data: documents, error } = await admin
        .from('documents')
        .select('*')
        .or(`file_name.ilike.${searchTerm},account_name.ilike.${searchTerm},opportunity_name.ilike.${searchTerm},notes.ilike.${searchTerm}`)
        .eq('is_current_version', true)
        .limit(limit);

      if (!error && documents) {
        results.documents = documents.map(d => ({
          id: d.id,
          type: 'document',
          title: d.file_name,
          subtitle: `${d.account_name} - ${d.document_type}`,
          documentType: d.document_type,
          status: d.status,
          uploadedAt: d.uploaded_at,
          fileSize: d.file_size,
          url: d.file_url,
          matchedField: getMatchedFieldDocument(d, query),
        }));
      }
    }

    // Search tasks (if tasks table exists)
    if (scope === 'all' || scope === 'tasks') {
      try {
        const { data: tasks, error } = await admin
          .from('tasks')
          .select('*')
          .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .limit(limit);

        if (!error && tasks) {
          results.tasks = tasks.map(t => ({
            id: t.id,
            type: 'task',
            title: t.title,
            subtitle: t.description,
            status: t.status,
            dueDate: t.due_date,
            assignee: t.assignee,
            url: `/contracts-dashboard?tab=tasks&task=${t.id}`,
            matchedField: t.title?.toLowerCase().includes(query.toLowerCase()) ? 'title' : 'description',
          }));
        }
      } catch {
        // Tasks table might not exist yet
      }
    }

    // Calculate totals
    const totalResults = results.contracts.length + results.documents.length + results.tasks.length;

    return NextResponse.json({
      query,
      scope,
      results,
      totals: {
        contracts: results.contracts.length,
        documents: results.documents.length,
        tasks: results.tasks.length,
        total: totalResults,
      },
    });
  } catch (error) {
    console.error('Error in global search:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

// Helper to determine which field matched
function getMatchedField(contract: any, query: string): string {
  const q = query.toLowerCase();
  if (contract.account_name?.toLowerCase().includes(q)) return 'account';
  if (contract.name?.toLowerCase().includes(q)) return 'name';
  if (contract.opportunity_name?.toLowerCase().includes(q)) return 'opportunity';
  if (contract.sales_rep?.toLowerCase().includes(q)) return 'salesRep';
  return 'unknown';
}

function getMatchedFieldDocument(doc: any, query: string): string {
  const q = query.toLowerCase();
  if (doc.file_name?.toLowerCase().includes(q)) return 'fileName';
  if (doc.account_name?.toLowerCase().includes(q)) return 'account';
  if (doc.opportunity_name?.toLowerCase().includes(q)) return 'opportunity';
  if (doc.notes?.toLowerCase().includes(q)) return 'notes';
  return 'unknown';
}
