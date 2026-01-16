import duckdb from 'duckdb';
import path from 'path';
import fs from 'fs';

const DUCKDB_PATH = path.join(process.cwd(), 'data', 'analytics.duckdb');

if (!fs.existsSync(path.dirname(DUCKDB_PATH))) {
  fs.mkdirSync(path.dirname(DUCKDB_PATH), { recursive: true });
}

let db: duckdb.Database | null = null;
let connection: duckdb.Connection | null = null;

export function getDuckDB(): duckdb.Database {
  if (!db) {
    db = new duckdb.Database(DUCKDB_PATH);
    console.log('DuckDB initialized at:', DUCKDB_PATH);
  }
  return db;
}

export function getConnection(): duckdb.Connection {
  if (!connection) {
    connection = getDuckDB().connect();
  }
  return connection;
}

export interface ColumnDef {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean';
}

function mapTypeToDuckDB(type: string): string {
  switch (type) {
    case 'number':
      return 'DOUBLE';
    case 'date':
      return 'TIMESTAMP';
    case 'boolean':
      return 'BOOLEAN';
    default:
      return 'VARCHAR';
  }
}

function sanitizeTableName(name: string, id: number): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `dataset_${id}_${sanitized || 'data'}`;
}

function sanitizeColumnName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized || 'col';
}

export async function createDatasetTable(
  datasetId: number,
  datasetName: string,
  columns: ColumnDef[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = getConnection();
    const tableName = sanitizeTableName(datasetName, datasetId);
    
    const columnDefs = columns.map(col => {
      const colName = sanitizeColumnName(col.name);
      const colType = mapTypeToDuckDB(col.type);
      return `"${colName}" ${colType}`;
    }).join(', ');
    
    const createSql = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs})`;
    
    conn.run(createSql, (err) => {
      if (err) {
        console.error('Failed to create DuckDB table:', err);
        reject(err);
      } else {
        console.log(`DuckDB table created: ${tableName}`);
        resolve(tableName);
      }
    });
  });
}

export async function insertDataRows(
  tableName: string,
  columns: ColumnDef[],
  rows: Record<string, string>[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = getConnection();
    
    const columnNames = columns.map(c => `"${sanitizeColumnName(c.name)}"`).join(', ');
    
    const batchSize = 100;
    let processed = 0;
    
    const processBatch = () => {
      if (processed >= rows.length) {
        resolve();
        return;
      }
      
      const batch = rows.slice(processed, processed + batchSize);
      const values = batch.map(row => {
        const rowValues = columns.map(col => {
          const val = row[col.name];
          if (val === null || val === undefined || val === '') {
            return 'NULL';
          }
          
          switch (col.type) {
            case 'number':
              const num = parseFloat(val);
              return isNaN(num) ? 'NULL' : num.toString();
            case 'boolean':
              const lower = val.toLowerCase();
              if (lower === 'true' || lower === '1' || lower === 'yes') return 'TRUE';
              if (lower === 'false' || lower === '0' || lower === 'no') return 'FALSE';
              return 'NULL';
            case 'date':
              try {
                const date = new Date(val);
                if (isNaN(date.getTime())) return 'NULL';
                return `'${date.toISOString()}'`;
              } catch {
                return 'NULL';
              }
            default:
              const escaped = val.replace(/'/g, "''");
              return `'${escaped}'`;
          }
        });
        return `(${rowValues.join(', ')})`;
      }).join(', ');
      
      const insertSql = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${values}`;
      
      conn.run(insertSql, (err) => {
        if (err) {
          console.error('Failed to insert rows:', err);
          reject(err);
        } else {
          processed += batchSize;
          processBatch();
        }
      });
    };
    
    processBatch();
  });
}

export async function queryDataset(
  tableName: string,
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const conn = getConnection();
    const sql = `SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`;
    
    conn.all(sql, (err, rows) => {
      if (err) {
        console.error('DuckDB query error:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

export async function executeAnalyticsQuery(sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const conn = getConnection();
    
    conn.all(sql, (err, rows) => {
      if (err) {
        console.error('DuckDB analytics query error:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

export async function getTableRowCount(tableName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const conn = getConnection();
    const sql = `SELECT COUNT(*) as count FROM "${tableName}"`;
    
    conn.all(sql, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows && rows[0] ? (rows[0] as any).count : 0);
      }
    });
  });
}

export async function dropDatasetTable(tableName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = getConnection();
    const sql = `DROP TABLE IF EXISTS "${tableName}"`;
    
    conn.run(sql, (err) => {
      if (err) {
        console.error('Failed to drop DuckDB table:', err);
        reject(err);
      } else {
        console.log(`DuckDB table dropped: ${tableName}`);
        resolve();
      }
    });
  });
}

export async function listTables(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const conn = getConnection();
    const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'`;
    
    conn.all(sql, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve((rows || []).map((r: any) => r.table_name));
      }
    });
  });
}

export function closeDuckDB(): void {
  if (connection) {
    connection = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}
