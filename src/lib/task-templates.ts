/**
 * Task Templates for Auto-Generation
 *
 * Defines tasks that are automatically created when contracts enter each stage.
 * Due dates are calculated relative to stage entry or close date.
 */

export type DueDateType = 'stage_entry' | 'close_date';

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDateType: DueDateType;
  dueDateOffset: number; // Days offset (positive = after, negative = before)
}

export interface StageTaskConfig {
  stage: string;
  tasks: TaskTemplate[];
}

/**
 * Contract stages in order
 */
export const CONTRACT_STAGES = [
  'Discussions Not Started',
  'Initial Agreement Development',
  'Review & Redlines',
  'Approval & Signature',
  'Agreement Submission',
  'PO Received',
] as const;

export type ContractStage = typeof CONTRACT_STAGES[number];

/**
 * Task templates by stage
 *
 * Each stage has 2-3 auto-generated tasks with calculated due dates:
 * - stage_entry: Due date = date contract entered stage + offset
 * - close_date: Due date = expected close date + offset (negative = before close)
 */
export const STAGE_TASK_TEMPLATES: StageTaskConfig[] = [
  {
    stage: 'Discussions Not Started',
    tasks: [
      {
        id: 'dns-schedule-discussion',
        title: 'Schedule initial discussion',
        description: 'Reach out to client to schedule kick-off discussion for contract terms.',
        priority: 'high',
        dueDateType: 'stage_entry',
        dueDateOffset: 7, // Due 7 days after entering stage
      },
      {
        id: 'dns-review-history',
        title: 'Review client history',
        description: 'Review any previous contracts, proposals, or interactions with this client.',
        priority: 'medium',
        dueDateType: 'stage_entry',
        dueDateOffset: 3, // Due 3 days after entering stage
      },
    ],
  },
  {
    stage: 'Initial Agreement Development',
    tasks: [
      {
        id: 'iad-draft-terms',
        title: 'Draft contract terms',
        description: 'Create initial contract draft with standard MARS terms and pricing.',
        priority: 'high',
        dueDateType: 'close_date',
        dueDateOffset: -60, // Due 60 days before close
      },
      {
        id: 'iad-legal-review',
        title: 'Internal legal review',
        description: 'Submit draft to legal team for initial review before sending to client.',
        priority: 'medium',
        dueDateType: 'close_date',
        dueDateOffset: -45, // Due 45 days before close
      },
      {
        id: 'iad-send-draft',
        title: 'Send draft to client',
        description: 'Email contract draft to client contacts for review.',
        priority: 'high',
        dueDateType: 'close_date',
        dueDateOffset: -40, // Due 40 days before close
      },
    ],
  },
  {
    stage: 'Review & Redlines',
    tasks: [
      {
        id: 'rr-review-redlines',
        title: 'Review client redlines',
        description: 'Carefully review all changes and redlines submitted by client.',
        priority: 'high',
        dueDateType: 'stage_entry',
        dueDateOffset: 5, // Due 5 days after entering stage
      },
      {
        id: 'rr-ai-analysis',
        title: 'Run AI contract analysis',
        description: 'Use AI review tool to identify material risks and suggest responses.',
        priority: 'medium',
        dueDateType: 'stage_entry',
        dueDateOffset: 3, // Due 3 days after entering stage
      },
      {
        id: 'rr-prepare-response',
        title: 'Prepare negotiation response',
        description: 'Draft response to client redlines, accepting or countering each item.',
        priority: 'high',
        dueDateType: 'close_date',
        dueDateOffset: -21, // Due 21 days before close
      },
    ],
  },
  {
    stage: 'Approval & Signature',
    tasks: [
      {
        id: 'as-get-approval',
        title: 'Obtain internal approval',
        description: 'Get final approval from management on negotiated terms.',
        priority: 'urgent',
        dueDateType: 'close_date',
        dueDateOffset: -14, // Due 14 days before close
      },
      {
        id: 'as-send-docusign',
        title: 'Send for signature',
        description: 'Upload final contract to DocuSign and send to all parties for signature.',
        priority: 'urgent',
        dueDateType: 'close_date',
        dueDateOffset: -10, // Due 10 days before close
      },
      {
        id: 'as-follow-up',
        title: 'Follow up on signature',
        description: 'Check DocuSign status and follow up with any pending signers.',
        priority: 'high',
        dueDateType: 'close_date',
        dueDateOffset: -5, // Due 5 days before close
      },
    ],
  },
  {
    stage: 'Agreement Submission',
    tasks: [
      {
        id: 'sub-submit-agreement',
        title: 'Submit executed agreement',
        description: 'Submit fully signed contract to client procurement/legal for processing.',
        priority: 'high',
        dueDateType: 'stage_entry',
        dueDateOffset: 2, // Due 2 days after entering stage
      },
      {
        id: 'sub-update-salesforce',
        title: 'Update Salesforce records',
        description: 'Update opportunity stage and attach signed documents in Salesforce.',
        priority: 'medium',
        dueDateType: 'stage_entry',
        dueDateOffset: 1, // Due 1 day after entering stage
      },
    ],
  },
  {
    stage: 'PO Received',
    tasks: [
      {
        id: 'po-verify',
        title: 'Verify PO details',
        description: 'Confirm PO amount, terms, and billing information match contract.',
        priority: 'high',
        dueDateType: 'stage_entry',
        dueDateOffset: 2, // Due 2 days after entering stage
      },
      {
        id: 'po-archive',
        title: 'Archive contract documents',
        description: 'Store all signed contracts, POs, and supporting docs in document system.',
        priority: 'medium',
        dueDateType: 'stage_entry',
        dueDateOffset: 7, // Due 7 days after entering stage
      },
      {
        id: 'po-kickoff',
        title: 'Schedule project kickoff',
        description: 'Coordinate with PM team to schedule project kickoff meeting.',
        priority: 'high',
        dueDateType: 'stage_entry',
        dueDateOffset: 5, // Due 5 days after entering stage
      },
    ],
  },
];

/**
 * Get task templates for a specific stage
 */
export function getTaskTemplatesForStage(stage: string): TaskTemplate[] {
  const config = STAGE_TASK_TEMPLATES.find(s => s.stage === stage);
  return config?.tasks || [];
}

/**
 * Calculate due date based on template configuration
 */
export function calculateDueDate(
  template: TaskTemplate,
  stageEntryDate: Date,
  closeDate: Date | null
): Date {
  const baseDate = template.dueDateType === 'close_date' && closeDate
    ? new Date(closeDate)
    : new Date(stageEntryDate);

  const dueDate = new Date(baseDate);
  dueDate.setDate(dueDate.getDate() + template.dueDateOffset);

  return dueDate;
}

/**
 * Generate tasks for a contract entering a new stage
 */
export function generateTasksForStage(
  contractId: string,
  contractSalesforceId: string,
  contractName: string,
  newStage: string,
  closeDate: string | null,
  stageEntryDate: Date = new Date()
): Array<{
  title: string;
  description: string;
  status: 'pending';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  contract_id: string;
  contract_salesforce_id: string;
  contract_name: string;
  contract_stage: string;
  is_auto_generated: boolean;
  task_template_id: string;
  due_date: string;
}> {
  const templates = getTaskTemplatesForStage(newStage);
  const closeDateObj = closeDate ? new Date(closeDate) : null;

  return templates.map(template => ({
    title: template.title,
    description: template.description,
    status: 'pending' as const,
    priority: template.priority,
    contract_id: contractId,
    contract_salesforce_id: contractSalesforceId,
    contract_name: contractName,
    contract_stage: newStage,
    is_auto_generated: true,
    task_template_id: template.id,
    due_date: calculateDueDate(template, stageEntryDate, closeDateObj).toISOString().split('T')[0],
  }));
}
