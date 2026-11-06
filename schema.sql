-- One row per person. `sub` is Google's stable user id; the email is kept only
-- so the page can show who is signed in.
CREATE TABLE IF NOT EXISTS users (
  id      TEXT PRIMARY KEY,
  sub     TEXT UNIQUE NOT NULL,
  email   TEXT,
  created TEXT NOT NULL
);

-- One row per word per person. The word itself is kept as JSON because the
-- shape belongs to the page, not to the database: adding a field to a card
-- should not need a migration.
--
-- `updated` is what makes two devices safe to merge: the later edit wins.
-- `deleted` is a tombstone rather than a DELETE, because a row that simply
-- vanishes here comes straight back from whichever device has not synced yet.
CREATE TABLE IF NOT EXISTS words (
  user_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  body    TEXT NOT NULL,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, word_id)
);

CREATE INDEX IF NOT EXISTS words_by_user ON words (user_id, updated);
