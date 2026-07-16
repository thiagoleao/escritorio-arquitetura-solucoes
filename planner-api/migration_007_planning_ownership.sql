ALTER TABLE plannings ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);

UPDATE plannings
SET created_by_user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1)
WHERE created_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_plannings_created_by_user ON plannings(created_by_user_id);
