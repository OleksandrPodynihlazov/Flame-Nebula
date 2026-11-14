import pg from "pg";

// One pool for the app. Connects lazily, on the first query.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

pool.on("error", (err) => {
  console.error(`db pool error: ${err.message}`);
});

export default pool;
