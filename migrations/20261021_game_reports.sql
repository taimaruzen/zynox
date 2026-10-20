-- Migration for abuse reporting. Apply to D1 before merging report API.
CREATE TABLE IF NOT EXISTS game_reports (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK(reason IN ('malware','phishing','abuse','copyright','other')),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(game_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_game_reports_game ON game_reports(game_id,created_at);
