-- Create tasks table for contract task management
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Task details
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',

  -- Contract relationship
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  contract_salesforce_id VARCHAR(18),
  contract_name VARCHAR(255),
  contract_stage VARCHAR(100),

  -- Auto-generation tracking
  is_auto_generated BOOLEAN DEFAULT FALSE,
  task_template_id VARCHAR(50),

  -- Dates
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Assignment (simple - just email)
  assignee_email VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for contract lookups
CREATE INDEX IF NOT EXISTS idx_tasks_contract_id ON tasks(contract_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contract_salesforce_id ON tasks(contract_salesforce_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Index for due date queries
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- Index for assignee lookups
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_email);

-- Composite index for common query: pending tasks by due date
CREATE INDEX IF NOT EXISTS idx_tasks_pending_due ON tasks(status, due_date) WHERE status != 'completed';

-- Enable Row Level Security (RLS)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read all tasks
CREATE POLICY "Authenticated users can read tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy for authenticated users to create/update tasks
CREATE POLICY "Authenticated users can create tasks"
  ON tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tasks"
  ON tasks
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policy for service role to manage all tasks
CREATE POLICY "Service role can manage tasks"
  ON tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE tasks IS 'Stores tasks for contract lifecycle management with auto-generation support';

-- Add valid status check constraint
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));

-- Add valid priority check constraint
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
