CREATE TABLE IF NOT EXISTS administration_documents (
  id TEXT PRIMARY KEY,
  administration_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  digest TEXT NOT NULL,
  UNIQUE(administration_id, year, digest)
);
CREATE INDEX IF NOT EXISTS administration_documents_admin ON administration_documents(administration_id, id);
CREATE TABLE IF NOT EXISTS administration_document_parts (
  document_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(document_id, position)
);
