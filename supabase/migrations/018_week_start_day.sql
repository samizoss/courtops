ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS week_start_day smallint NOT NULL DEFAULT 0 CHECK (week_start_day >= 0 AND week_start_day <= 6);
