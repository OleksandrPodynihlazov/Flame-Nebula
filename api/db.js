import pg from "pg";

pg.types.setTypeParser(1082, (value) => value);       // DATE → "YYYY-MM-DD"
pg.types.setTypeParser(20, (value) => Number(value)); // BIGINT / COUNT(*) → число

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error(`postgres pool error: ${err.message}`);
});
