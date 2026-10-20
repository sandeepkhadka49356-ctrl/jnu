-- Faculty pages gain a body of typed content blocks.
--
-- Defaults to an empty array so every existing row is valid immediately and
-- the faculty pages render exactly as before until content is added.
ALTER TABLE "Faculty" ADD COLUMN "body" TEXT NOT NULL DEFAULT '[]';
