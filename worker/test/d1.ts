import initSqlJs, { type Database, type SqlValue } from 'sql.js'

/**
 * A small D1 stand-in on real SQLite (sql.js), so worker tests run the real SQL, constraints and RETURNING
 * clauses. Implements only what the Worker uses: prepare/bind/first/run/all and batch.
 */
export async function createD1(migrations: readonly string[], log?: string[]): Promise<D1Database> {
  const SQL = await initSqlJs()
  const db: Database = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  for (const m of migrations) db.exec(m)
  return new FakeD1(db, log) as unknown as D1Database
}

type Row = Record<string, SqlValue>

class FakeStatement {
  constructor(
    private readonly db: Database,
    readonly sql: string,
    private params: SqlValue[] = [],
    private readonly log?: string[],
  ) {}

  bind(...values: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, values.map((v) => (v === undefined ? null : (v as SqlValue))), this.log)
  }

  private rows(): { rows: Row[]; changes: number } {
    this.log?.push(this.sql)
    const stmt = this.db.prepare(this.sql)
    try {
      stmt.bind(this.params)
      const rows: Row[] = []
      while (stmt.step()) rows.push(stmt.getAsObject())
      return { rows, changes: this.db.getRowsModified() }
    } finally {
      stmt.free()
    }
  }

  async first<T>(col?: string): Promise<T | null> {
    const { rows } = this.rows()
    const row = rows[0]
    if (!row) return null
    return (col ? row[col] : row) as T
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: { changes: number } }> {
    const { rows, changes } = this.rows()
    return { results: rows as T[], success: true, meta: { changes } }
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const { changes } = this.rows()
    return { success: true, meta: { changes } }
  }
}

class FakeD1 {
  constructor(
    private readonly db: Database,
    private readonly log?: string[],
  ) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.db, sql, [], this.log)
  }

  /** D1 batches are transactions. */
  async batch(statements: FakeStatement[]): Promise<unknown[]> {
    // Real D1 runs one batch at a time; concurrent callers here queue the same way.
    const turn = this.tail
    let done!: () => void
    this.tail = new Promise<void>((r) => (done = r))
    await turn
    try {
      return await this.runBatch(statements)
    } finally {
      done()
    }
  }

  private tail: Promise<void> = Promise.resolve()

  private async runBatch(statements: FakeStatement[]): Promise<unknown[]> {
    this.db.run('BEGIN')
    try {
      const out: unknown[] = []
      for (const s of statements) out.push(await s.run())
      this.db.run('COMMIT')
      return out
    } catch (e) {
      this.db.run('ROLLBACK')
      throw e
    }
  }
}
