-- Migration 021 — seed The Jar's content config (content v2 Phase 2).
-- Pillars + audiences from the 2026-06-09 design spec (names from The Jar's
-- Social Tracker; descriptions left for Geneva/Maddie to fill in via
-- Settings → Content → Pillars). Channels are intentionally NOT seeded —
-- per spec, defaults are all-off and the admin enables what the club uses.
-- Idempotent: skips rows that already exist by (org_id, name).

INSERT INTO content_pillars (org_id, name, color, display_order)
SELECT v.org_id, v.name, v.color, v.display_order
FROM (VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Community',      '#f97316', 0),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Programming',    '#2563eb', 1),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Education',      '#16a34a', 2),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Tech',           '#9333ea', 3),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Differentiator', '#eab308', 4)
) AS v(org_id, name, color, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM content_pillars p WHERE p.org_id = v.org_id AND p.name = v.name
);

INSERT INTO content_audiences (org_id, name, display_order)
SELECT v.org_id, v.name, v.display_order
FROM (VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Members',                0),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Daily players',          1),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Non-members',            2),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Beginners',              3),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'LTP grads',              4),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Competitive players',    5),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Corporate / event leads', 6),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Family',                 7)
) AS v(org_id, name, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM content_audiences a WHERE a.org_id = v.org_id AND a.name = v.name
);
