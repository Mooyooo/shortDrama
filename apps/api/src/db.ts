import pg from 'pg';

export type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient;

// Kill any query that hangs after 12 s, as socialManager does, rather than waiting forever.
function withStatementTimeout(url: string) {
  return url + (url.includes('?') ? '&' : '?') + 'options=-c%20statement_timeout%3D12000';
}

export function createPool(databaseUrl: string) {
  const pool = new pg.Pool({
    connectionString: withStatementTimeout(databaseUrl),
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => console.error('Unexpected Postgres pool error', err));
  return pool;
}

export async function withTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
