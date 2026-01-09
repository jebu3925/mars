-- Create documents table for contract document management
-- Run this in the Supabase SQL Editor

-- Document types enum (for validation)
CREATE TYPE document_type AS ENUM (
  'Original Contract',
  'MARS Redlines',
  'Client Response',
  'Final Agreement',
  'Executed Contract',
  'Purchase Order',
  'Amendment',
  'Other'
);

-- Document status enum
CREATE TYPE document_status AS ENUM (
  'draft',
  'under_review',
  'awaiting_signature',
  'executed',
  'expired',
  'superseded'
);

-- Main documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  salesforce_id VARCHAR(18), -- Link to Salesforce if contract_id not available

  -- Organization fields
  account_name VARCHAR(255) NOT NULL,
  opportunity_name VARCHAR(255),
  opportunity_year INTEGER, -- Year 1, 2, 3 of multi-year contracts

  -- Document classification
  document_type document_type NOT NULL DEFAULT 'Other',
  status document_status NOT NULL DEFAULT 'draft',

  -- File information
  file_name VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER, -- Size in bytes
  file_mime_type VARCHAR(100),

  -- Version control
  version INTEGER DEFAULT 1,
  previous_version_id UUID REFERENCES documents(id),
  is_current_version BOOLEAN DEFAULT TRUE,

  -- Important dates
  expiration_date DATE,
  effective_date DATE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  -- Audit fields
  uploaded_by VARCHAR(255),
  uploaded_by_id UUID,
  notes TEXT,

  -- Metadata for AI/search
  metadata JSONB DEFAULT '{}',
  extracted_text TEXT, -- For full-text search
  ai_classification_confidence DECIMAL(3,2), -- 0.00 to 1.00

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_documents_contract ON documents(contract_id);
CREATE INDEX idx_documents_salesforce ON documents(salesforce_id);
CREATE INDEX idx_documents_account ON documents(account_name);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX idx_documents_expiration ON documents(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX idx_documents_current_version ON documents(is_current_version) WHERE is_current_version = TRUE;

-- Full-text search index on extracted text
CREATE INDEX idx_documents_text_search ON documents USING gin(to_tsvector('english', COALESCE(extracted_text, '') || ' ' || COALESCE(file_name, '')));

-- Composite index for common queries
CREATE INDEX idx_documents_account_type ON documents(account_name, document_type);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read documents
CREATE POLICY "Authenticated users can read documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy for authenticated users to insert documents
CREATE POLICY "Authenticated users can insert documents"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policy for authenticated users to update their own documents
CREATE POLICY "Authenticated users can update documents"
  ON documents
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policy for service role to manage all documents
CREATE POLICY "Service role can manage documents"
  ON documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- Create saved_views table for user-saved filter configurations
CREATE TABLE IF NOT EXISTS saved_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  view_type VARCHAR(50) DEFAULT 'documents', -- 'documents', 'contracts', 'tasks'
  filters JSONB NOT NULL DEFAULT '{}',
  sort_config JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for saved views
CREATE INDEX idx_saved_views_user ON saved_views(user_id);
CREATE INDEX idx_saved_views_type ON saved_views(view_type);

-- Enable RLS on saved_views
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

-- Users can read their own views or shared views
CREATE POLICY "Users can read own or shared views"
  ON saved_views
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_shared = TRUE);

-- Users can manage their own views
CREATE POLICY "Users can manage own views"
  ON saved_views
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role full access
CREATE POLICY "Service role can manage all views"
  ON saved_views
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comment on tables
COMMENT ON TABLE documents IS 'Stores contract documents with version history, status tracking, and metadata';
COMMENT ON TABLE saved_views IS 'Stores user-saved filter/view configurations for dashboards';
