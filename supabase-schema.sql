-- ==============================================================================
-- Table: vision_test_results
-- Schema for Sankara Vision Test Results
-- ==============================================================================

CREATE TABLE IF NOT EXISTS vision_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_number TEXT NOT NULL,
  vision_score TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE vision_test_results ENABLE ROW LEVEL SECURITY;

-- Allow public insert to vision_test_results
CREATE POLICY "Allow insert to vision_test_results" 
ON vision_test_results FOR INSERT 
WITH CHECK (true);

-- Allow reading results
CREATE POLICY "Allow select on vision_test_results" 
ON vision_test_results FOR SELECT 
USING (true);

-- Sample query to view saved vision test results:
-- SELECT mobile_number, vision_score, created_at FROM vision_test_results ORDER BY created_at DESC;
