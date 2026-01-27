// db.js — MySQL (JS / ESM) for Railway
import mysql from "mysql2/promise";

let pool = null;

function getPool() {
  if (pool) return pool;

  const databaseUrl = process.env.DATABASE_URL || "mysql://root:pBjfyRvkqbAEmCgJBGcVIYGDvzqDhLnt@mysql.railway.internal:3306/railway"; // <-- define it!

  if (databaseUrl) {
    pool = mysql.createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    return pool;
  }

  // Split vars fallback
  const host = process.env.MYSQLHOST;
  const port = Number(process.env.MYSQLPORT || 3306);
  const user = process.env.MYSQLUSER;
  const password = process.env.MYSQLPASSWORD;
  const database = process.env.MYSQLDATABASE;

  // Fail loud if missing
  if (!host || !user || !password || !database) {
    throw new Error(
      `Missing MySQL env vars. Got host=${host}, user=${user}, db=${database}. ` +
        `Set DATABASE_URL or MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE (and MYSQLPORT).`
    );
  }

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return pool;
}

export async function initDb() {
  const p = getPool();

  await p.execute(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      zip VARCHAR(20) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      email VARCHAR(255) NULL,
      plan_interest VARCHAR(50) NOT NULL,
      note TEXT NULL,
      ip VARCHAR(45) NULL,
      user_agent TEXT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // create indexes (safe if already exist by checking info_schema)
  const ensureIndex = async (indexName, ddl) => {
    const [rows] = await p.query(
      `
      SELECT COUNT(1) AS count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'waitlist'
        AND INDEX_NAME = ?
      `,
      [indexName]
    );

    if (!rows[0] || rows[0].count === 0) {
      await p.execute(ddl);
    }
  };

  await ensureIndex(
    "idx_waitlist_created_at",
    `CREATE INDEX idx_waitlist_created_at ON waitlist (created_at);`
  );
  await ensureIndex("idx_waitlist_zip", `CREATE INDEX idx_waitlist_zip ON waitlist (zip);`);
  await ensureIndex(
    "idx_waitlist_phone",
    `CREATE INDEX idx_waitlist_phone ON waitlist (phone);`
  );

  return p;
}

export function db() {
  return getPool();
}
