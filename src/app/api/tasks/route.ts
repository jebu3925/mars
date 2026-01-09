import { NextRequest, NextResponse } from 'next/server';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getTaskStats,
  Task
} from '@/lib/supabase';

/**
 * GET /api/tasks
 * Fetch tasks with optional filters
 *
 * Query params:
 * - contractId: Filter by contract UUID
 * - contractSalesforceId: Filter by Salesforce ID
 * - status: Filter by status (pending, in_progress, completed, cancelled)
 * - assignee: Filter by assignee email
 * - stats: If 'true', return task statistics instead of task list
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Check if requesting stats
    if (searchParams.get('stats') === 'true') {
      const stats = await getTaskStats();
      return NextResponse.json(stats);
    }

    // Get filters from query params
    const filters: {
      contractId?: string;
      contractSalesforceId?: string;
      status?: string;
      assigneeEmail?: string;
    } = {};

    const contractId = searchParams.get('contractId');
    if (contractId) filters.contractId = contractId;

    const contractSalesforceId = searchParams.get('contractSalesforceId');
    if (contractSalesforceId) filters.contractSalesforceId = contractSalesforceId;

    const status = searchParams.get('status');
    if (status) filters.status = status;

    const assignee = searchParams.get('assignee');
    if (assignee) filters.assigneeEmail = assignee;

    const tasks = await getTasks(filters);

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error in GET /api/tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

/**
 * POST /api/tasks
 * Create a new task
 *
 * Body:
 * - title: string (required)
 * - description: string (optional)
 * - status: 'pending' | 'in_progress' | 'completed' | 'cancelled' (default: 'pending')
 * - priority: 'low' | 'medium' | 'high' | 'urgent' (default: 'medium')
 * - contract_id: UUID (optional)
 * - contract_salesforce_id: string (optional)
 * - contract_name: string (optional)
 * - contract_stage: string (optional)
 * - due_date: ISO date string (optional)
 * - assignee_email: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 });
    }

    // Validate status if provided
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status', validStatuses }, { status: 400 });
    }

    // Validate priority if provided
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return NextResponse.json({ error: 'Invalid priority', validPriorities }, { status: 400 });
    }

    const task: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
      title: body.title.trim(),
      description: body.description?.trim() || undefined,
      status: body.status || 'pending',
      priority: body.priority || 'medium',
      contract_id: body.contract_id || undefined,
      contract_salesforce_id: body.contract_salesforce_id || undefined,
      contract_name: body.contract_name || undefined,
      contract_stage: body.contract_stage || undefined,
      due_date: body.due_date || undefined,
      assignee_email: body.assignee_email || undefined,
      is_auto_generated: body.is_auto_generated || false,
      task_template_id: body.task_template_id || undefined,
    };

    const createdTask = await createTask(task);

    if (!createdTask) {
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }

    return NextResponse.json({ task: createdTask }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/tasks:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

/**
 * PATCH /api/tasks
 * Update an existing task
 *
 * Body:
 * - id: string (required) - Task ID to update
 * - ...fields to update (same as POST)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // Validate status if provided
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status', validStatuses }, { status: 400 });
    }

    // Validate priority if provided
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return NextResponse.json({ error: 'Invalid priority', validPriorities }, { status: 400 });
    }

    const { id, ...updates } = body;

    // Build updates object, only including provided fields
    const taskUpdates: Partial<Task> = {};
    if (updates.title !== undefined) taskUpdates.title = updates.title.trim();
    if (updates.description !== undefined) taskUpdates.description = updates.description?.trim();
    if (updates.status !== undefined) taskUpdates.status = updates.status;
    if (updates.priority !== undefined) taskUpdates.priority = updates.priority;
    if (updates.due_date !== undefined) taskUpdates.due_date = updates.due_date;
    if (updates.assignee_email !== undefined) taskUpdates.assignee_email = updates.assignee_email;
    if (updates.completed_at !== undefined) taskUpdates.completed_at = updates.completed_at;

    const updatedTask = await updateTask(id, taskUpdates);

    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found or update failed' }, { status: 404 });
    }

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error('Error in PATCH /api/tasks:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks
 * Delete a task
 *
 * Query params:
 * - id: string (required) - Task ID to delete
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('id');

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const success = await deleteTask(taskId);

    if (!success) {
      return NextResponse.json({ error: 'Task not found or delete failed' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: taskId });
  } catch (error) {
    console.error('Error in DELETE /api/tasks:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
