import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, createTasks, deleteAutoTasksForContractStage } from '@/lib/supabase';
import { generateTasksForStage, getTaskTemplatesForStage, CONTRACT_STAGES } from '@/lib/task-templates';

/**
 * POST /api/tasks/auto-generate
 * Auto-generate tasks when a contract enters a new stage
 *
 * Body:
 * - contractId: UUID of the contract in Supabase
 * - contractSalesforceId: Salesforce ID of the contract
 * - contractName: Name of the contract
 * - newStage: The stage the contract is entering
 * - closeDate: Expected close date (optional, used for date calculations)
 * - previousStage: The stage the contract is leaving (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      contractId,
      contractSalesforceId,
      contractName,
      newStage,
      closeDate,
      previousStage,
    } = body;

    // Validate required fields
    if (!contractSalesforceId) {
      return NextResponse.json({ error: 'contractSalesforceId is required' }, { status: 400 });
    }
    if (!newStage) {
      return NextResponse.json({ error: 'newStage is required' }, { status: 400 });
    }

    // Validate stage is valid
    if (!CONTRACT_STAGES.includes(newStage as typeof CONTRACT_STAGES[number])) {
      return NextResponse.json({
        error: 'Invalid stage',
        validStages: CONTRACT_STAGES,
      }, { status: 400 });
    }

    // Check if templates exist for this stage
    const templates = getTaskTemplatesForStage(newStage);
    if (templates.length === 0) {
      return NextResponse.json({
        message: 'No task templates defined for this stage',
        tasksCreated: 0,
      });
    }

    // If previous stage provided, clean up pending auto-tasks from that stage
    let deletedCount = 0;
    if (previousStage && previousStage !== newStage) {
      deletedCount = await deleteAutoTasksForContractStage(contractSalesforceId, previousStage);
      console.log(`Deleted ${deletedCount} pending auto-tasks from stage: ${previousStage}`);
    }

    // Look up contract UUID if not provided
    let finalContractId = contractId;
    if (!finalContractId) {
      const admin = getSupabaseAdmin();
      const { data: contract } = await admin
        .from('contracts')
        .select('id')
        .eq('salesforce_id', contractSalesforceId)
        .single();

      finalContractId = contract?.id;
    }

    // Generate new tasks for the stage
    const tasksToCreate = generateTasksForStage(
      finalContractId || '',
      contractSalesforceId,
      contractName || 'Unknown Contract',
      newStage,
      closeDate || null,
      new Date() // Stage entry date is now
    );

    // Create tasks in database
    const createdTasks = await createTasks(tasksToCreate);

    console.log(`Created ${createdTasks.length} auto-tasks for ${contractName} entering ${newStage}`);

    return NextResponse.json({
      success: true,
      tasksCreated: createdTasks.length,
      tasksDeleted: deletedCount,
      tasks: createdTasks,
    });
  } catch (error) {
    console.error('Error in POST /api/tasks/auto-generate:', error);
    return NextResponse.json({ error: 'Failed to auto-generate tasks' }, { status: 500 });
  }
}

/**
 * GET /api/tasks/auto-generate
 * Get info about what tasks would be generated for a stage (preview)
 *
 * Query params:
 * - stage: The stage to preview tasks for
 * - closeDate: Expected close date (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage');
    const closeDate = searchParams.get('closeDate');

    if (!stage) {
      return NextResponse.json({ error: 'stage query param is required' }, { status: 400 });
    }

    const templates = getTaskTemplatesForStage(stage);

    if (templates.length === 0) {
      return NextResponse.json({
        stage,
        templates: [],
        message: 'No task templates defined for this stage',
      });
    }

    // Calculate preview due dates
    const now = new Date();
    const closeDateObj = closeDate ? new Date(closeDate) : null;

    const previewTasks = templates.map(template => {
      let dueDate: Date;
      if (template.dueDateType === 'close_date' && closeDateObj) {
        dueDate = new Date(closeDateObj);
      } else {
        dueDate = new Date(now);
      }
      dueDate.setDate(dueDate.getDate() + template.dueDateOffset);

      return {
        ...template,
        calculatedDueDate: dueDate.toISOString().split('T')[0],
        dueDateDescription:
          template.dueDateType === 'close_date'
            ? `${Math.abs(template.dueDateOffset)} days ${template.dueDateOffset < 0 ? 'before' : 'after'} close date`
            : `${template.dueDateOffset} days after entering stage`,
      };
    });

    return NextResponse.json({
      stage,
      templates: previewTasks,
      totalTasks: templates.length,
    });
  } catch (error) {
    console.error('Error in GET /api/tasks/auto-generate:', error);
    return NextResponse.json({ error: 'Failed to preview tasks' }, { status: 500 });
  }
}
