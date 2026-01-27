// db.js — MySQL version (JS, not TS)

import mysql from "mysql2/promise";

let pool = null;

function getPool() {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;

  pool = mysql.createPool(
    url
      ? {
          uri: url,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        }
      : {
          host: process.env.MYSQLHOST || "mysql.railway.internal",
          port: Number(process.env.MYSQLPORT || 3306),
          user: process.env.MYSQLUSER || "root",
          password: process.env.MYSQLPASSWORD || "WashMyBinPre",
          database: process.env.MYSQLDATABASE || "washmybinpre",
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        }
  );

  return pool;
}

console.log("DB using", {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    host: process.env.MYSQLHOST,
    port: process.env.MYSQLPORT,
    user: process.env.MYSQLUSER,
    db: process.env.MYSQLDATABASE,
  });
  

export async function initDb() {
  const pool = getPool();

  await pool.execute(`
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

  const ensureIndex = async (indexName, ddl) => {
    const dbName = process.env.MYSQLDATABASE || null;

    const [rows] = await pool.query(
      `
      SELECT COUNT(1) AS count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = COALESCE(?, DATABASE())
        AND TABLE_NAME = 'waitlist'
        AND INDEX_NAME = ?
      `,
      [dbName, indexName]
    );

    if (!rows[0] || rows[0].count === 0) {
      await pool.execute(ddl);
    }
  };

  await ensureIndex(
    "idx_waitlist_created_at",
    `CREATE INDEX idx_waitlist_created_at ON waitlist (created_at);`
  );
  await ensureIndex(
    "idx_waitlist_zip",
    `CREATE INDEX idx_waitlist_zip ON waitlist (zip);`
  );
  await ensureIndex(
    "idx_waitlist_phone",
    `CREATE INDEX idx_waitlist_phone ON waitlist (phone);`
  );

  return pool;
}

export function db() {
  return getPool();
}
