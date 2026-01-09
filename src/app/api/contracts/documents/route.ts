import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// Document types matching the database enum
const DOCUMENT_TYPES = [
  'Original Contract',
  'MARS Redlines',
  'Client Response',
  'Final Agreement',
  'Executed Contract',
  'Purchase Order',
  'Amendment',
  'Other',
] as const;

const DOCUMENT_STATUSES = [
  'draft',
  'under_review',
  'awaiting_signature',
  'executed',
  'expired',
  'superseded',
] as const;

// Required document types for completeness calculation
const REQUIRED_DOCUMENT_TYPES = [
  'Original Contract',
  'MARS Redlines',
  'Final Agreement',
  'Executed Contract',
];

const OPTIONAL_DOCUMENT_TYPES = [
  'Client Response',
  'Purchase Order',
  'Amendment',
];

export interface Document {
  id: string;
  contract_id: string | null;
  salesforce_id: string | null;
  account_name: string;
  opportunity_name: string | null;
  opportunity_year: number | null;
  document_type: typeof DOCUMENT_TYPES[number];
  status: typeof DOCUMENT_STATUSES[number];
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_mime_type: string | null;
  version: number;
  previous_version_id: string | null;
  is_current_version: boolean;
  expiration_date: string | null;
  effective_date: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  uploaded_by_id: string | null;
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Priority scoring algorithm
export interface PriorityScore {
  contractId: string;
  score: number;
  reasons: string[];
  category: 'critical' | 'high' | 'medium' | 'low';
}

function calculatePriorityScore(
  contract: any,
  documents: Document[],
  now: Date = new Date()
): PriorityScore {
  let score = 0;
  const reasons: string[] = [];

  const contractDocs = documents.filter(
    d => d.contract_id === contract.id || d.salesforce_id === contract.salesforceId
  );

  // Calculate document completeness
  const requiredDocsPresent = REQUIRED_DOCUMENT_TYPES.filter(type =>
    contractDocs.some(d => d.document_type === type && d.is_current_version)
  ).length;
  const completeness = requiredDocsPresent / REQUIRED_DOCUMENT_TYPES.length;

  // 1. Time-based urgency (up to 40 points)
  if (contract.closeDate || contract.contractDate) {
    const targetDate = new Date(contract.contractDate || contract.closeDate);
    const daysUntil = Math.floor((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      score += 40;
      reasons.push(`Overdue by ${Math.abs(daysUntil)} days`);
    } else if (daysUntil <= 14) {
      score += 35;
      reasons.push(`Due in ${daysUntil} days`);
    } else if (daysUntil <= 30) {
      score += 25;
      reasons.push(`Due in ${daysUntil} days`);
    } else if (daysUntil <= 90) {
      score += 15;
      reasons.push(`Closing in ${daysUntil} days`);
    }
  }

  // 2. Document completeness (up to 30 points - inverse)
  const incompletenessScore = Math.round((1 - completeness) * 30);
  if (incompletenessScore > 0) {
    score += incompletenessScore;
    const missingDocs = REQUIRED_DOCUMENT_TYPES.filter(type =>
      !contractDocs.some(d => d.document_type === type && d.is_current_version)
    );
    if (missingDocs.length > 0) {
      reasons.push(`Missing: ${missingDocs.join(', ')}`);
    }
  }

  // 3. Value-based priority (up to 15 points)
  if (contract.value >= 500000) {
    score += 15;
    reasons.push('High value contract (>$500K)');
  } else if (contract.value >= 100000) {
    score += 10;
    reasons.push('Medium-high value (>$100K)');
  } else if (contract.value >= 50000) {
    score += 5;
  }

  // 4. Staleness penalty (up to 15 points)
  const lastActivity = contractDocs.length > 0
    ? Math.max(...contractDocs.map(d => new Date(d.uploaded_at).getTime()))
    : contract.statusChangeDate
      ? new Date(contract.statusChangeDate).getTime()
      : null;

  if (lastActivity) {
    const daysSinceActivity = Math.floor((now.getTime() - lastActivity) / (1000 * 60 * 60 * 24));
    if (daysSinceActivity > 60) {
      score += 15;
      reasons.push(`No activity for ${daysSinceActivity} days`);
    } else if (daysSinceActivity > 30) {
      score += 10;
      reasons.push(`Inactive for ${daysSinceActivity} days`);
    } else if (daysSinceActivity > 14) {
      score += 5;
    }
  }

  // Determine category based on score
  let category: 'critical' | 'high' | 'medium' | 'low';
  if (score >= 70) {
    category = 'critical';
  } else if (score >= 50) {
    category = 'high';
  } else if (score >= 25) {
    category = 'medium';
  } else {
    category = 'low';
  }

  return {
    contractId: contract.id,
    score: Math.min(score, 100),
    reasons,
    category,
  };
}

// Calculate completeness for a contract
function calculateCompleteness(contractDocs: Document[]): {
  total: number;
  required: number;
  optional: number;
  percentage: number;
  missingRequired: string[];
  missingOptional: string[];
} {
  const currentDocs = contractDocs.filter(d => d.is_current_version);

  const presentRequired = REQUIRED_DOCUMENT_TYPES.filter(type =>
    currentDocs.some(d => d.document_type === type)
  );
  const presentOptional = OPTIONAL_DOCUMENT_TYPES.filter(type =>
    currentDocs.some(d => d.document_type === type)
  );

  const missingRequired = REQUIRED_DOCUMENT_TYPES.filter(type =>
    !currentDocs.some(d => d.document_type === type)
  );
  const missingOptional = OPTIONAL_DOCUMENT_TYPES.filter(type =>
    !currentDocs.some(d => d.document_type === type)
  );

  // Percentage based on required docs (optional don't count toward percentage)
  const percentage = Math.round((presentRequired.length / REQUIRED_DOCUMENT_TYPES.length) * 100);

  return {
    total: currentDocs.length,
    required: presentRequired.length,
    optional: presentOptional.length,
    percentage,
    missingRequired,
    missingOptional,
  };
}

/**
 * GET /api/contracts/documents
 * Fetch all documents with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Filter parameters
    const contractId = searchParams.get('contractId');
    const accountName = searchParams.get('accountName');
    const documentType = searchParams.get('documentType');
    const status = searchParams.get('status');
    const view = searchParams.get('view'); // 'needs_attention', 'closing_soon', 'recent', 'all'

    const admin = getSupabaseAdmin();

    // Build query
    let query = admin
      .from('documents')
      .select('*')
      .eq('is_current_version', true)
      .order('uploaded_at', { ascending: false });

    // Apply filters
    if (contractId) {
      query = query.eq('contract_id', contractId);
    }
    if (accountName) {
      query = query.eq('account_name', accountName);
    }
    if (documentType && DOCUMENT_TYPES.includes(documentType as any)) {
      query = query.eq('document_type', documentType);
    }
    if (status && DOCUMENT_STATUSES.includes(status as any)) {
      query = query.eq('status', status);
    }

    const { data: documents, error } = await query;

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    // Get contracts for priority calculation
    const { data: contracts } = await admin
      .from('contracts')
      .select('*')
      .eq('is_closed', false);

    // Calculate priority scores for each contract
    const priorityScores: Record<string, PriorityScore> = {};
    const completenessScores: Record<string, ReturnType<typeof calculateCompleteness>> = {};

    (contracts || []).forEach(contract => {
      const contractDocs = (documents || []).filter(
        (d: Document) => d.contract_id === contract.id || d.salesforce_id === contract.salesforce_id
      );
      priorityScores[contract.id] = calculatePriorityScore(
        {
          id: contract.id,
          salesforceId: contract.salesforce_id,
          value: contract.value,
          closeDate: contract.close_date,
          contractDate: contract.contract_date,
          statusChangeDate: contract.updated_at,
        },
        documents || []
      );
      completenessScores[contract.id] = calculateCompleteness(contractDocs);
    });

    // Group documents by account and contract
    const byAccount: Record<string, {
      accountName: string;
      contracts: Record<string, {
        contractId: string;
        contractName: string;
        opportunityYear: number | null;
        documents: Document[];
        completeness: ReturnType<typeof calculateCompleteness>;
        priority: PriorityScore;
      }>;
    }> = {};

    (documents || []).forEach((doc: Document) => {
      const accountKey = doc.account_name || 'Unknown';
      const contractKey = doc.contract_id || doc.salesforce_id || 'unknown';

      if (!byAccount[accountKey]) {
        byAccount[accountKey] = {
          accountName: accountKey,
          contracts: {},
        };
      }

      if (!byAccount[accountKey].contracts[contractKey]) {
        const contract = (contracts || []).find(
          c => c.id === doc.contract_id || c.salesforce_id === doc.salesforce_id
        );
        byAccount[accountKey].contracts[contractKey] = {
          contractId: contractKey,
          contractName: doc.opportunity_name || contract?.name || 'Unknown Contract',
          opportunityYear: doc.opportunity_year,
          documents: [],
          completeness: completenessScores[contract?.id] || calculateCompleteness([]),
          priority: priorityScores[contract?.id] || {
            contractId: contractKey,
            score: 0,
            reasons: [],
            category: 'low',
          },
        };
      }

      byAccount[accountKey].contracts[contractKey].documents.push(doc);
    });

    // Also add contracts without documents (for completeness tracking)
    (contracts || []).forEach(contract => {
      const accountKey = contract.account_name || 'Unknown';
      const contractKey = contract.id;

      if (!byAccount[accountKey]) {
        byAccount[accountKey] = {
          accountName: accountKey,
          contracts: {},
        };
      }

      if (!byAccount[accountKey].contracts[contractKey]) {
        byAccount[accountKey].contracts[contractKey] = {
          contractId: contractKey,
          contractName: contract.account_name || contract.name,
          opportunityYear: null,
          documents: [],
          completeness: completenessScores[contract.id] || calculateCompleteness([]),
          priority: priorityScores[contract.id] || {
            contractId: contractKey,
            score: 0,
            reasons: [],
            category: 'low',
          },
        };
      }
    });

    // Calculate summary stats
    const allPriorities = Object.values(priorityScores);
    const stats = {
      totalDocuments: (documents || []).length,
      totalContracts: (contracts || []).length,
      needsAttention: allPriorities.filter(p => p.category === 'critical' || p.category === 'high').length,
      closingSoon: (contracts || []).filter(c => {
        if (!c.contract_date && !c.close_date) return false;
        const targetDate = new Date(c.contract_date || c.close_date);
        const daysUntil = Math.floor((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntil >= 0 && daysUntil <= 90;
      }).length,
      complete: allPriorities.filter(p => {
        const completeness = completenessScores[p.contractId];
        return completeness?.percentage === 100;
      }).length,
      averageCompleteness: Math.round(
        Object.values(completenessScores).reduce((sum, c) => sum + c.percentage, 0) /
        Math.max(Object.values(completenessScores).length, 1)
      ),
    };

    return NextResponse.json({
      documents: documents || [],
      byAccount,
      priorityScores,
      completenessScores,
      stats,
      documentTypes: DOCUMENT_TYPES,
      requiredTypes: REQUIRED_DOCUMENT_TYPES,
      optionalTypes: OPTIONAL_DOCUMENT_TYPES,
    });
  } catch (error) {
    console.error('Error in GET /api/contracts/documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/contracts/documents
 * Create a new document record
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      contractId,
      salesforceId,
      accountName,
      opportunityName,
      opportunityYear,
      documentType,
      status = 'draft',
      fileName,
      fileUrl,
      fileSize,
      fileMimeType,
      expirationDate,
      effectiveDate,
      uploadedBy,
      notes,
      metadata = {},
    } = body;

    // Validation
    if (!accountName) {
      return NextResponse.json({ error: 'accountName is required' }, { status: 400 });
    }
    if (!documentType || !DOCUMENT_TYPES.includes(documentType)) {
      return NextResponse.json({
        error: 'Invalid documentType',
        validTypes: DOCUMENT_TYPES
      }, { status: 400 });
    }
    if (!fileName || !fileUrl) {
      return NextResponse.json({ error: 'fileName and fileUrl are required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Check if a document of this type already exists for this contract
    // If so, we'll create a new version
    let version = 1;
    let previousVersionId = null;

    if (contractId || salesforceId) {
      const existingQuery = admin
        .from('documents')
        .select('id, version')
        .eq('document_type', documentType)
        .eq('is_current_version', true);

      if (contractId) {
        existingQuery.eq('contract_id', contractId);
      } else {
        existingQuery.eq('salesforce_id', salesforceId);
      }

      const { data: existing } = await existingQuery.single();

      if (existing) {
        // Mark old version as not current
        await admin
          .from('documents')
          .update({ is_current_version: false })
          .eq('id', existing.id);

        version = existing.version + 1;
        previousVersionId = existing.id;
      }
    }

    // Insert new document
    const { data: newDoc, error } = await admin
      .from('documents')
      .insert({
        contract_id: contractId || null,
        salesforce_id: salesforceId || null,
        account_name: accountName,
        opportunity_name: opportunityName || null,
        opportunity_year: opportunityYear || null,
        document_type: documentType,
        status,
        file_name: fileName,
        file_url: fileUrl,
        file_size: fileSize || null,
        file_mime_type: fileMimeType || null,
        version,
        previous_version_id: previousVersionId,
        is_current_version: true,
        expiration_date: expirationDate || null,
        effective_date: effectiveDate || null,
        uploaded_by: uploadedBy || null,
        notes: notes || null,
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating document:', error);
      return NextResponse.json({ error: 'Failed to create document', details: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      document: newDoc,
      isNewVersion: version > 1,
      version,
    });
  } catch (error) {
    console.error('Error in POST /api/contracts/documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/contracts/documents
 * Update a document's status or metadata
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, status, notes, metadata, expirationDate } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (status && DOCUMENT_STATUSES.includes(status)) {
      updateData.status = status;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (metadata !== undefined) {
      updateData.metadata = metadata;
    }
    if (expirationDate !== undefined) {
      updateData.expiration_date = expirationDate;
    }

    const { data, error } = await admin
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .select()
      .single();

    if (error) {
      console.error('Error updating document:', error);
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
    }

    return NextResponse.json({ success: true, document: data });
  } catch (error) {
    console.error('Error in PATCH /api/contracts/documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/contracts/documents
 * Delete a document (soft delete - marks as superseded)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const hardDelete = searchParams.get('hardDelete') === 'true';

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    if (hardDelete) {
      // Actually delete the record
      const { error } = await admin
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) {
        console.error('Error deleting document:', error);
        return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
      }
    } else {
      // Soft delete - mark as superseded
      const { error } = await admin
        .from('documents')
        .update({
          status: 'superseded',
          is_current_version: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (error) {
        console.error('Error soft-deleting document:', error);
        return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, documentId, hardDelete });
  } catch (error) {
    console.error('Error in DELETE /api/contracts/documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
