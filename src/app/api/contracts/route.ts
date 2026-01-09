import { NextRequest, NextResponse } from 'next/server';
import { getContracts, getSupabaseAdmin, Contract } from '@/lib/supabase';
import { z } from 'zod';
import { CONTRACT_STATUSES } from '@/lib/validations';
import { requireAuth, isAuthError } from '@/lib/apiAuth';

// Schema for single field update (legacy format)
const contractFieldUpdateSchema = z.object({
  contractId: z.string().optional(),
  salesforceId: z.string().optional(),
  field: z.enum(['status', 'value', 'contractDate', 'awardDate', 'closeDate', 'probability', 'budgeted', 'manualCloseProbability', 'salesRep', 'redlines']),
  value: z.unknown(),
}).refine(data => data.contractId || data.salesforceId, {
  message: 'Either contractId or salesforceId is required',
});

// Validation for field values based on field type
function validateFieldValue(field: string, value: unknown): { valid: boolean; error?: string; parsed?: unknown } {
  switch (field) {
    case 'status':
      if (!CONTRACT_STATUSES.includes(value as typeof CONTRACT_STATUSES[number])) {
        return { valid: false, error: `Invalid status. Valid: ${CONTRACT_STATUSES.join(', ')}` };
      }
      return { valid: true, parsed: value };

    case 'value':
    case 'probability':
    case 'manualCloseProbability':
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (typeof num !== 'number' || isNaN(num)) {
        return { valid: false, error: `${field} must be a number` };
      }
      if (field === 'value' && num < 0) {
        return { valid: false, error: 'Value must be non-negative' };
      }
      if ((field === 'probability' || field === 'manualCloseProbability') && (num < 0 || num > 100)) {
        return { valid: false, error: `${field} must be between 0 and 100` };
      }
      return { valid: true, parsed: num };

    case 'contractDate':
    case 'awardDate':
    case 'closeDate':
      if (value === null || value === '') {
        return { valid: true, parsed: null };
      }
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
      }
      return { valid: true, parsed: value };

    case 'budgeted':
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'budgeted must be a boolean' };
      }
      return { valid: true, parsed: value };

    case 'salesRep':
    case 'redlines':
      if (value !== null && typeof value !== 'string') {
        return { valid: false, error: `${field} must be a string` };
      }
      return { valid: true, parsed: value };

    default:
      return { valid: false, error: `Unknown field: ${field}` };
  }
}

interface DashboardContract {
  id: string;
  salesforceId: string;
  name: string;
  opportunityName: string;
  value: number;
  status: string;
  statusGroup: string;
  salesStage: string;
  contractType: string[];
  daysInStage: number;
  daysUntilDeadline: number;
  closeDate: string | null;
  awardDate: string | null;
  contractDate: string | null;
  statusChangeDate: string | null;
  progress: number;
  isOverdue: boolean;
  nextTask: string;
  salesRep: string;
  probability: number;
  budgeted: boolean;
  manualCloseProbability: number | null;
}

/**
 * Transform Supabase contract to dashboard format
 */
function transformToDashboardFormat(contract: Contract): DashboardContract {
  const closeDate = contract.close_date;
  const now = Date.now();

  // Calculate days until deadline
  const daysUntilDeadline = closeDate
    ? Math.floor((new Date(closeDate).getTime() - now) / (1000 * 60 * 60 * 24))
    : 0;

  // Calculate days in stage (using updated_at as proxy for last status change)
  const lastUpdate = contract.updated_at ? new Date(contract.updated_at).getTime() : now;
  const daysInStage = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));

  return {
    id: contract.id || contract.salesforce_id,
    salesforceId: contract.salesforce_id,
    name: contract.account_name || contract.name,
    opportunityName: contract.opportunity_name,
    value: contract.value,
    status: contract.status,
    statusGroup: contract.status_group,
    salesStage: contract.sales_stage,
    contractType: contract.contract_type || [],
    daysInStage,
    daysUntilDeadline,
    closeDate: contract.close_date,
    awardDate: contract.award_date,
    contractDate: contract.contract_date,
    statusChangeDate: contract.updated_at || null,
    progress: contract.probability,
    isOverdue: daysUntilDeadline < 0,
    nextTask: '',
    salesRep: contract.sales_rep,
    probability: contract.probability,
    budgeted: contract.budgeted,
    manualCloseProbability: contract.manual_close_probability,
  };
}

export async function GET() {
  try {
    // Fetch contracts from Supabase
    const contracts = await getContracts();

    // Filter to only active contracts (not closed)
    const activeContracts = contracts.filter(c => !c.is_closed);

    // Transform to dashboard format
    const dashboardContracts = activeContracts.map(transformToDashboardFormat);

    // Calculate KPIs
    const totalPipeline = dashboardContracts.reduce((sum, c) => sum + c.value, 0);
    const overdueContracts = dashboardContracts.filter(c => c.isOverdue);
    const overdueValue = overdueContracts.reduce((sum, c) => sum + c.value, 0);

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const dueNext30 = dashboardContracts.filter(c => {
      if (!c.closeDate) return false;
      const closeDate = new Date(c.closeDate);
      return closeDate <= thirtyDaysFromNow && closeDate >= new Date();
    });
    const dueNext30Value = dueNext30.reduce((sum, c) => sum + c.value, 0);

    // Group by status for funnel
    const statusCounts: Record<string, { count: number; value: number }> = {};
    dashboardContracts.forEach(c => {
      if (!statusCounts[c.status]) {
        statusCounts[c.status] = { count: 0, value: 0 };
      }
      statusCounts[c.status].count++;
      statusCounts[c.status].value += c.value;
    });

    return NextResponse.json({
      contracts: dashboardContracts,
      kpis: {
        totalPipeline,
        totalCount: dashboardContracts.length,
        overdueValue,
        overdueCount: overdueContracts.length,
        dueNext30Value,
        dueNext30Count: dueNext30.length,
      },
      statusBreakdown: statusCounts,
      lastUpdated: new Date().toISOString(),
      source: 'supabase',
    });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Update a contract in Supabase
 * Supports updating: status, value, contractDate, awardDate, closeDate, probability, budgeted, etc.
 */
export async function PATCH(request: NextRequest) {
  try {
    // Verify user is authenticated
    const authResult = await requireAuth(request);
    if (isAuthError(authResult)) {
      return authResult;
    }

    const body = await request.json();

    // Validate request body with Zod
    const parseResult = contractFieldUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
      }, { status: 400 });
    }

    const { contractId, salesforceId, field, value } = parseResult.data;
    const id = contractId || salesforceId;

    // Validate the field value
    const fieldValidation = validateFieldValue(field, value);
    if (!fieldValidation.valid) {
      return NextResponse.json({ error: fieldValidation.error }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Map field names to database column names
    const fieldToColumn: Record<string, string> = {
      status: 'status',
      value: 'value',
      contractDate: 'contract_date',
      awardDate: 'award_date',
      closeDate: 'close_date',
      probability: 'probability',
      budgeted: 'budgeted',
      manualCloseProbability: 'manual_close_probability',
      salesRep: 'sales_rep',
      redlines: 'redlines',
    };

    const columnName = fieldToColumn[field];
    const updateData: Record<string, unknown> = {
      [columnName]: fieldValidation.parsed,
      updated_at: new Date().toISOString(),
    };

    // Update using salesforce_id as the primary identifier
    const { error } = await admin
      .from('contracts')
      .update(updateData)
      .eq('salesforce_id', id);

    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json({
        error: 'Failed to update contract',
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      contractId: id,
      field,
      value: fieldValidation.parsed,
      updatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error updating contract:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
