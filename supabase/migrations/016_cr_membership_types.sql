-- Migration 016 — cache Court Reserve membership types per org so the
-- existing CR sync persists them (vs throwing the result away after building
-- the tier map). Powers Settings → Memberships, a read-only page that gives
-- admins visibility into how their CR membership tiers are configured + priced.

CREATE TABLE cr_membership_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  cr_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  monthly_price NUMERIC(10, 2),
  annual_price NUMERIC(10, 2),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, cr_id)
);

ALTER TABLE cr_membership_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see org membership types"
  ON cr_membership_types FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Owners and admins manage membership types"
  ON cr_membership_types FOR ALL
  USING (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE INDEX idx_cr_membership_types_org ON cr_membership_types(org_id);

COMMENT ON TABLE cr_membership_types IS
  'Court Reserve membership tiers cached per org. Populated by /api/sync/courtreserve. Read-only for staff; admin views in Settings → Memberships.';
