-- Shift Swap V1: restaurant-model post-publish swap/take flow.
-- A published shift can be opened for swap (someone takes it) or take (anyone picks it up).
-- Audit trail fields baked in per docs/scheduling-design-v1.md § 6.

CREATE TABLE shift_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  -- Who originally had the shift and opened the swap
  original_user_id UUID NOT NULL REFERENCES profiles(id),
  -- 'swap' = looking for a specific replacement; 'take' = anyone can grab it
  swap_type TEXT NOT NULL DEFAULT 'take' CHECK (swap_type IN ('swap', 'take')),
  -- Current state machine
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'approved', 'denied', 'cancelled')),
  -- Who picked it up (null while open)
  claimed_by UUID REFERENCES profiles(id),
  claimed_at TIMESTAMPTZ,
  -- Admin approval (null until reviewed)
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  deny_reason TEXT,
  -- Free-text reason from the original owner
  reason TEXT,
  -- Timestamps for audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read org shift swaps" ON shift_swaps
  FOR SELECT USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create shift swaps" ON shift_swaps
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update org shift swaps" ON shift_swaps
  FOR UPDATE USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete org shift swaps" ON shift_swaps
  FOR DELETE USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_shift_swaps_org_status ON shift_swaps(org_id, status);
CREATE INDEX idx_shift_swaps_shift ON shift_swaps(shift_id);
