import pg from 'pg';

export function createStore(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  pool.on('error', (error) => console.error(JSON.stringify({ level: 'error', event: 'database_pool_error', code: error.code })));
  return {
    async migrate() {
      // Additive first migration: existing rows are preserved on every restart.
      await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY,
        title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    },
    async ready() { await pool.query('SELECT 1'); },
    async list(limit, offset) {
      return (await pool.query('SELECT * FROM tasks ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2', [limit, offset])).rows;
    },
    async get(id) { return (await pool.query('SELECT * FROM tasks WHERE id = $1', [id])).rows[0]; },
    async create(id, title) {
      return (await pool.query('INSERT INTO tasks (id, title) VALUES ($1, $2) RETURNING *', [id, title])).rows[0];
    },
    async update(id, fields) {
      return (await pool.query(`UPDATE tasks SET title = COALESCE($2, title),
        completed = COALESCE($3, completed), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, fields.title ?? null, fields.completed ?? null])).rows[0];
    },
    async remove(id) { return (await pool.query('DELETE FROM tasks WHERE id = $1', [id])).rowCount > 0; },
    async close() { await pool.end(); }
  };
}
