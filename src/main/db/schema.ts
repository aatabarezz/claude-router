export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'onprem',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    api_key_encrypted TEXT,
    budget_monthly_usd REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL REFERENCES departments(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    input_modalities TEXT NOT NULL DEFAULT '["text"]',
    model_used TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    local_quality_score INTEGER,
    llm_quality_feedback TEXT,
    routing_reason TEXT,
    task_category TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pii_audit_log (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    user_id TEXT NOT NULL,
    department_id TEXT NOT NULL,
    routed_to TEXT NOT NULL,
    pii_entities_found TEXT NOT NULL DEFAULT '[]',
    pii_sent_to_cloud INTEGER NOT NULL DEFAULT 0,
    pii_mapping_hash TEXT,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    restored_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    scope_id TEXT,
    key TEXT NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pii_vault (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    pii_type TEXT NOT NULL,
    pii_hash TEXT NOT NULL,
    original_encrypted TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.95,
    detector_used TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    ttl_expires_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pii_vault_token ON pii_vault(token);
  CREATE INDEX IF NOT EXISTS idx_pii_vault_message ON pii_vault(message_id);
  CREATE INDEX IF NOT EXISTS idx_pii_vault_user ON pii_vault(user_id);
  CREATE INDEX IF NOT EXISTS idx_pii_vault_type ON pii_vault(pii_type);

  CREATE TABLE IF NOT EXISTS pii_injection_policy (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL UNIQUE REFERENCES departments(id),
    allowed_roles TEXT NOT NULL DEFAULT '["admin"]',
    allowed_pii_types TEXT NOT NULL DEFAULT '["email","phone","person","address"]',
    allowed_operations TEXT NOT NULL DEFAULT '["restore_after_api"]',
    allowed_llm_targets TEXT NOT NULL DEFAULT '["anthropic:*","openai:*"]',
    exclude_pii_types TEXT NOT NULL DEFAULT '["secret"]',
    require_explicit_consent INTEGER NOT NULL DEFAULT 1,
    max_retention_days INTEGER NOT NULL DEFAULT 30,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pii_audit_log_v2 (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    event_type TEXT NOT NULL,
    pii_type TEXT,
    token TEXT,
    detector_used TEXT,
    operation TEXT,
    target_llm TEXT,
    event_data TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pii_audit_log_v2_event_type ON pii_audit_log_v2(event_type);
  CREATE INDEX IF NOT EXISTS idx_pii_audit_log_v2_user ON pii_audit_log_v2(user_id);
  CREATE INDEX IF NOT EXISTS idx_pii_audit_log_v2_timestamp ON pii_audit_log_v2(timestamp DESC);
`;
