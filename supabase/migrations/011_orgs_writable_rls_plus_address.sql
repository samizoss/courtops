-- Migration 011 — Fix silent save failures on Settings → General + add address/website.
--
-- Cause of the bug Sami flagged 2026-05-04: orgs and org_settings have RLS
-- enabled but only SELECT policies. UPDATE was being filtered to 0 rows with
-- no error, so clients saw "success" but nothing persisted (logo, name,
-- timezone, hours all silently dropped). Add UPDATE (and INSERT for
-- org_settings since first-time saves may need it) gated on owner/admin role.

CREATE POLICY "Owners and admins update own org"
  ON orgs
  FOR UPDATE
  USING (id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners and admins update own org_settings"
  ON org_settings
  FOR UPDATE
  USING (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners and admins insert own org_settings"
  ON org_settings
  FOR INSERT
  WITH CHECK (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Sami asked: address, website url on Settings → General.
ALTER TABLE orgs
  ADD COLUMN address TEXT,
  ADD COLUMN website_url TEXT;

COMMENT ON COLUMN orgs.address IS 'Free-text street address. Could be auto-populated from Court Reserve sync later.';
COMMENT ON COLUMN orgs.website_url IS 'Public-facing club website URL (the place to embed the widget.js snippet).';
