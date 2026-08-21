//! SQLite DB (rusqlite + sqlcipher) - unified persistence
use anyhow::Result;
use rusqlite::{Connection, params};
use std::path::{Path, PathBuf};
use parking_lot::Mutex;
use std::sync::Arc;

/// SQLite wrapper with optional encryption
pub struct SqliteDB {
    conn: Arc<Mutex<Connection>>,
    path: PathBuf,
}

impl SqliteDB {
    pub fn new(path: &Path, key: Option<&str>) -> Result<Self> {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(Path::new("/tmp")));
        let conn = Connection::open(path)?;
        if let Some(k) = key {
            // sqlcipher key
            conn.pragma_update(None, "key", k)?;
        }
        let db = Self { conn: Arc::new(Mutex::new(conn)), path: path.to_path_buf() };
        db.init_schema()?;
        Ok(db)
    }
    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT, path TEXT, config TEXT, created INTEGER);
            CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, workspace_id TEXT, path TEXT, content TEXT, cursor_pos TEXT, scroll_pos TEXT, mode TEXT, dirty INTEGER);
            CREATE TABLE IF NOT EXISTS proxy_events (id TEXT PRIMARY KEY, session_id TEXT, timestamp INTEGER, type TEXT, data TEXT);
            CREATE TABLE IF NOT EXISTS sast_findings (id TEXT PRIMARY KEY, file_id TEXT, rule_id TEXT, severity TEXT, location TEXT, message TEXT);
            CREATE TABLE IF NOT EXISTS sandbox_snapshots (id TEXT PRIMARY KEY, sandbox_id TEXT, timestamp INTEGER, data BLOB);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, encrypted INTEGER);
            CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
        ")?;
        Ok(())
    }
    pub fn set(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?1, ?2)", params![key, value])?;
        Ok(())
    }
    pub fn get(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT value FROM kv WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? { Ok(Some(row.get(0)?)) } else { Ok(None) }
    }
    pub fn delete(&self, key: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM kv WHERE key = ?1", params![key])?;
        Ok(())
    }
    pub fn migrate_from_redb(&self, redb_path: &Path) -> Result<()> {
        // In real impl, open redb and copy
        tracing::info!("Migrating from redb at {:?}", redb_path);
        Ok(())
    }
}
