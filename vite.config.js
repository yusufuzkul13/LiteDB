import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

// ── Directory Paths ──────────────────────────────────────────────────────────
const rootDir     = path.resolve(__dirname);                      // LiteDB/
const dataDir     = path.join(rootDir, 'data');                   // LiteDB/data/
const connsDir    = path.join(dataDir, 'connections');            // LiteDB/data/connections/
const diagsDir    = path.join(dataDir, 'diagrams');               // LiteDB/data/diagrams/
const sqlProjDir  = path.resolve(__dirname, '../sql/projects/default'); // sql/projects/default/

// ── Encryption (AES-256-CBC) ─────────────────────────────────────────────────
function getKey() {
  // Load from .env (Vite loads .env automatically)
  const raw = process.env.LITEDB_SECRET || 'litedb-default-dev-key-32chars!!';
  return Buffer.from(raw.padEnd(32, '0').substring(0, 32), 'utf8');
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let enc = cipher.update(String(plaintext), 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}

function decrypt(ciphertext) {
  if (!ciphertext || !ciphertext.includes(':')) return '';
  try {
    const [ivHex, enc] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch { return ''; }
}

// ── Folder helpers ───────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ── SQL Schema Helpers ───────────────────────────────────────────────────────
function parseSqlFile(content, fileName, folderName) {
  let tableName = fileName.replace('.sql', '');
  const tableMatch = content.match(/CREATE TABLE\s+(?:\[\w+\]\.)?\[(\w+)\]/i)
                  || content.match(/CREATE TABLE\s+(\w+)/i);
  if (tableMatch) tableName = tableMatch[1];

  const firstParen = content.indexOf('(');
  const lastParen  = content.lastIndexOf(')');
  if (firstParen === -1 || lastParen === -1) return null;

  const columnLines = content.substring(firstParen + 1, lastParen)
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('--') && !l.startsWith('CONSTRAINT')
              && !l.startsWith('PRIMARY KEY') && !l.startsWith('FOREIGN KEY')
              && !l.startsWith('UNIQUE'));

  const fields = [];
  for (const line of columnLines) {
    const match = line.match(/^\[?([\w_]+)\]?\s+([A-Z0-9_]+(?:\([\d,MAX\s]+\))?)(.*)$/i);
    if (!match) continue;
    const name      = match[1];
    const type      = match[2];
    const rest      = match[3].toUpperCase();
    const primary   = rest.includes('PRIMARY KEY') || rest.includes('IDENTITY');
    const notNull   = rest.includes('NOT NULL') || primary;
    const unique    = rest.includes('UNIQUE');
    const increment = rest.includes('IDENTITY');
    let   defVal    = '';
    const dm = rest.match(/DEFAULT\s+\(?([^),]+)\)?/i);
    if (dm) defVal = dm[1].replace(/['"]/g, '');
    fields.push({ id: `f_${tableName.toLowerCase()}_${name.toLowerCase()}`, name, type, primary, notNull, unique, increment, default: defVal });
  }

  const folderColors = { admin: '#a855f7', llm: '#f43f5e', web: '#10b981', other: '#3b82f6' };
  return { id: `tbl_${tableName.toLowerCase()}`, name: tableName, color: folderColors[folderName] || '#6366f1', folder: folderName, fields };
}

function generateTableSql(table) {
  let sql = `CREATE TABLE [dbo].[${table.name}] (\n`;
  const cols = table.fields.map(f => {
    let line = `  [${f.name}] ${f.type}`;
    if (f.primary) { line += ' NOT NULL'; if (f.increment) line += ' IDENTITY(1,1)'; }
    else { line += f.notNull ? ' NOT NULL' : ' NULL'; }
    return line;
  });
  sql += cols.join(',\n') + '\n);\n';
  return sql;
}

function scanDbObjects(dirName, tables) {
  const targetDir = path.join(sqlProjDir, dirName);
  const items = [];
  if (!fs.existsSync(targetDir)) return items;
  for (const folder of fs.readdirSync(targetDir)) {
    const folderPath = path.join(targetDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath)) {
      if (!file.endsWith('.sql')) continue;
      const filePath = path.join(folderPath, file);
      const content  = fs.readFileSync(filePath, 'utf-8');
      const name     = file.replace('.sql', '');
      const dependencies = tables
        .filter(t => new RegExp(`\\b${t.name}\\b`, 'i').test(content))
        .map(t => t.id);
      items.push({ id: `${dirName}_${name.toLowerCase()}`, name, type: dirName.slice(0, -1), folder, sql: content, dependencies });
    }
  }
  return items;
}

// ── Response helpers ─────────────────────────────────────────────────────────
function jsonOk(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function jsonErr(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: msg }));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

// ── Vite Config ──────────────────────────────────────────────────────────────
export default defineConfig({
  plugins: [
    {
      name: 'litedb-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url    = req.url || '';
          const method = req.method || '';

          // ── GET /api/schema  (load SQL folder schema) ───────────────────────
          if (url === '/api/schema' && method === 'GET') {
            try {
              const tablesDir = path.join(sqlProjDir, 'tables');
              const tables    = [];
              if (fs.existsSync(tablesDir)) {
                for (const folder of fs.readdirSync(tablesDir)) {
                  const fp = path.join(tablesDir, folder);
                  if (!fs.statSync(fp).isDirectory()) continue;
                  for (const file of fs.readdirSync(fp)) {
                    if (!file.endsWith('.sql')) continue;
                    const parsed = parseSqlFile(fs.readFileSync(path.join(fp, file), 'utf-8'), file, folder);
                    if (parsed) tables.push(parsed);
                  }
                }
              }
              const relations = [];
              const relPath   = path.join(sqlProjDir, 'relations.json');
              if (fs.existsSync(relPath)) {
                JSON.parse(fs.readFileSync(relPath, 'utf-8')).forEach((rel, idx) => {
                  const sId = `tbl_${rel.toTable.toLowerCase()}`;
                  const eId = `tbl_${rel.fromTable.toLowerCase()}`;
                  if (tables.some(t => t.id === sId) && tables.some(t => t.id === eId)) {
                    relations.push({
                      id: `rel_${idx}_${Math.random().toString(36).substr(2,5)}`,
                      name: rel.constraintName,
                      startTableId: sId,
                      startFieldId: `f_${rel.toTable.toLowerCase()}_${rel.toColumn.toLowerCase()}`,
                      endTableId: eId,
                      endFieldId: `f_${rel.fromTable.toLowerCase()}_${rel.fromColumn.toLowerCase()}`,
                      type: '1-N'
                    });
                  }
                });
              }
              const cols = 5;
              tables.forEach((t, i) => { t.x = (i % cols) * 280 + 100; t.y = Math.floor(i / cols) * 340 + 100; });
              jsonOk(res, {
                name: 'SQL Klasör Şeması', tables, relationships: relations,
                views: scanDbObjects('views', tables), procedures: scanDbObjects('procedures', tables),
                functions: scanDbObjects('functions', tables), triggers: scanDbObjects('triggers', tables),
                notes: [{ id: 'note_welcome_sql', title: 'SQL Klasörü Aktif', content: "Bu diyagram 'sql/projects/default' dizininden oluşturuldu.", x: 100, y: 10, width: 280, height: 80, color: '#bbf7d0' }],
                areas: [], enums: []
              });
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ── POST /api/save  (save SQL files + relations.json) ───────────────
          if (url === '/api/save' && method === 'POST') {
            try {
              const data     = await readBody(req);
              const relPath  = path.join(sqlProjDir, 'relations.json');
              const outRels  = data.relationships.map(rel => {
                const sT = data.tables.find(t => t.id === rel.startTableId);
                const eT = data.tables.find(t => t.id === rel.endTableId);
                const sF = sT?.fields.find(f => f.id === rel.startFieldId);
                const eF = eT?.fields.find(f => f.id === rel.endFieldId);
                if (sT && eT && sF && eF) return { constraintName: rel.name || `FK_${eT.name}_${sT.name}`, fromTable: eT.name, fromColumn: eF.name, toTable: sT.name, toColumn: sF.name };
                return null;
              }).filter(Boolean);
              writeJson(relPath, outRels);
              for (const table of data.tables) {
                const folderPath = path.join(sqlProjDir, 'tables', table.folder || 'other');
                ensureDir(folderPath);
                fs.writeFileSync(path.join(folderPath, `${table.name}.sql`), generateTableSql(table), 'utf-8');
              }
              jsonOk(res, { success: true });
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ══════════════════════════════════════════════════════════════════
          // CONNECTION MANAGEMENT
          // ══════════════════════════════════════════════════════════════════

          // ── GET /api/connections  (list all saved connections) ──────────────
          if (url === '/api/connections' && method === 'GET') {
            try {
              ensureDir(connsDir);
              const list = fs.readdirSync(connsDir)
                .filter(f => f.endsWith('.enc.json'))
                .map(f => {
                  const c = readJson(path.join(connsDir, f));
                  if (!c) return null;
                  return { id: c.id, name: c.name, server: decrypt(c.server_enc), database: decrypt(c.database_enc), createdAt: c.createdAt };
                })
                .filter(Boolean)
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
              jsonOk(res, list);
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ── POST /api/connections/create  (save new connection encrypted) ───
          if (url === '/api/connections/create' && method === 'POST') {
            try {
              ensureDir(connsDir);
              const body = await readBody(req);
              const id   = 'conn_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
              const conn = {
                id,
                name:        body.name     || 'Unnamed',
                server_enc:  encrypt(body.server   || ''),
                port_enc:    encrypt(String(body.port || 1433)),
                database_enc:encrypt(body.database || ''),
                username_enc:encrypt(body.username || ''),
                password_enc:encrypt(body.password || ''),
                createdAt:   new Date().toISOString()
              };
              const safeName = conn.name.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
              writeJson(path.join(connsDir, `${safeName}_${id}.enc.json`), conn);
              jsonOk(res, { success: true, id, name: conn.name });
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ── DELETE /api/connections/delete?id=...  (remove a connection) ────
          if (url.startsWith('/api/connections/delete?') && method === 'DELETE') {
            try {
              const id = new URLSearchParams(url.split('?')[1]).get('id');
              if (!id || id.includes('..')) { jsonErr(res, 400, 'Invalid id'); return; }
              ensureDir(connsDir);
              const file = fs.readdirSync(connsDir).find(f => {
                const c = readJson(path.join(connsDir, f));
                return c?.id === id;
              });
              if (file) fs.unlinkSync(path.join(connsDir, file));
              jsonOk(res, { success: true });
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ── POST /api/connections/test  (test MSSQL connection) ─────────────
          if (url === '/api/connections/test' && method === 'POST') {
            try {
              const body = await readBody(req);
              // Resolve credentials: either from body (new) or from saved conn by id
              let server, port, database, username, password;
              if (body.id) {
                ensureDir(connsDir);
                const file = fs.readdirSync(connsDir).find(f => {
                  const c = readJson(path.join(connsDir, f));
                  return c?.id === body.id;
                });
                if (!file) { jsonErr(res, 404, 'Connection not found'); return; }
                const c = readJson(path.join(connsDir, file));
                server   = decrypt(c.server_enc);
                port     = parseInt(decrypt(c.port_enc)) || 1433;
                database = decrypt(c.database_enc);
                username = decrypt(c.username_enc);
                password = decrypt(c.password_enc);
              } else {
                server   = body.server   || '';
                port     = parseInt(body.port) || 1433;
                database = body.database || '';
                username = body.username || '';
                password = body.password || '';
              }

              const mssql = _require('mssql');
              const pool  = await mssql.connect({ server, port, database, user: username, password, options: { trustServerCertificate: true, encrypt: false }, connectionTimeout: 8000 });
              await pool.close();
              jsonOk(res, { success: true, message: 'Bağlantı başarılı!' });
            } catch (err) { jsonOk(res, { success: false, message: err.message }); }
            return;
          }

          // ══════════════════════════════════════════════════════════════════
          // DIAGRAM MANAGEMENT
          // ══════════════════════════════════════════════════════════════════

          // ── GET /api/diagrams  (list saved diagrams) ─────────────────────────
          if (url === '/api/diagrams' && method === 'GET') {
            try {
              ensureDir(diagsDir);
              const list = fs.readdirSync(diagsDir)
                .filter(f => f.endsWith('.json'))
                .map(f => {
                  const d = readJson(path.join(diagsDir, f));
                  if (!d) return null;
                  return { file: f, id: d.id || f.replace('.json',''), name: d.name || f.replace('.json',''), connectionId: d.connectionId || null, savedAt: d.savedAt || null, tables: (d.tables||[]).length, relationships: (d.relationships||[]).length };
                })
                .filter(Boolean)
                .sort((a, b) => (b.savedAt||'').localeCompare(a.savedAt||''));
              jsonOk(res, list);
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ── POST /api/diagrams/save  (save full diagram to disk) ─────────────
          if (url === '/api/diagrams/save' && method === 'POST') {
            try {
              ensureDir(diagsDir);
              const data   = await readBody(req);
              const id     = data.id || ('diag_' + Date.now().toString(36));
              const safeName = (data.name || 'diagram').replace(/[^a-zA-Z0-9_\-ÀàÂâÇçÉéÈèÊêËëÎîÏïÔôÙùÛûÜü ]/g, '').replace(/\s+/g, '_').substring(0, 80);
              const fileName = `${safeName}_${id}.json`;
              // Remove old file if id matches an existing one
              const oldFile = fs.readdirSync(diagsDir).find(f => f.includes(`_${id}.json`));
              if (oldFile) fs.unlinkSync(path.join(diagsDir, oldFile));
              const payload  = { ...data, id, savedAt: new Date().toISOString() };
              writeJson(path.join(diagsDir, fileName), payload);
              jsonOk(res, { success: true, id, file: fileName });
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ── GET /api/diagrams/load?id=...  (load diagram) ────────────────────
          if (url.startsWith('/api/diagrams/load?') && method === 'GET') {
            try {
              const id = new URLSearchParams(url.split('?')[1]).get('id');
              if (!id || id.includes('..')) { jsonErr(res, 400, 'Invalid id'); return; }
              ensureDir(diagsDir);
              const file = fs.readdirSync(diagsDir).find(f => f.includes(`_${id}.json`) || f === `${id}.json`);
              if (!file) { jsonErr(res, 404, 'Diagram not found'); return; }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(fs.readFileSync(path.join(diagsDir, file), 'utf-8'));
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ── DELETE /api/diagrams/delete?id=...  (delete diagram) ─────────────
          if (url.startsWith('/api/diagrams/delete?') && method === 'DELETE') {
            try {
              const id = new URLSearchParams(url.split('?')[1]).get('id');
              if (!id || id.includes('..')) { jsonErr(res, 400, 'Invalid id'); return; }
              ensureDir(diagsDir);
              const file = fs.readdirSync(diagsDir).find(f => f.includes(`_${id}.json`) || f === `${id}.json`);
              if (file) fs.unlinkSync(path.join(diagsDir, file));
              jsonOk(res, { success: true });
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ── PATCH /api/diagrams/rename  (rename a diagram) ───────────────────
          if (url === '/api/diagrams/rename' && method === 'PATCH') {
            try {
              const { id, name } = await readBody(req);
              if (!id) { jsonErr(res, 400, 'id required'); return; }
              ensureDir(diagsDir);
              const oldFile = fs.readdirSync(diagsDir).find(f => f.includes(`_${id}.json`) || f === `${id}.json`);
              if (!oldFile) { jsonErr(res, 404, 'Diagram not found'); return; }
              const existing = readJson(path.join(diagsDir, oldFile));
              existing.name  = name;
              existing.savedAt = new Date().toISOString();
              fs.unlinkSync(path.join(diagsDir, oldFile));
              const safeName = (name || 'diagram').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').substring(0, 80);
              writeJson(path.join(diagsDir, `${safeName}_${id}.json`), existing);
              jsonOk(res, { success: true });
            } catch (err) { jsonErr(res, 500, err.message); }
            return;
          }

          // ══════════════════════════════════════════════════════════════════
          // LIVE DB SYNC
          // ══════════════════════════════════════════════════════════════════

          // ── POST /api/sync  (fetch schema from live DB, update sql/ files) ───
          if (url === '/api/sync' && method === 'POST') {
            try {
              const { connectionId } = await readBody(req);
              if (!connectionId) { jsonErr(res, 400, 'connectionId required'); return; }

              // Load + decrypt credentials
              ensureDir(connsDir);
              const connFile = fs.readdirSync(connsDir).find(f => {
                const c = readJson(path.join(connsDir, f));
                return c?.id === connectionId;
              });
              if (!connFile) { jsonErr(res, 404, 'Connection not found'); return; }
              const creds = readJson(path.join(connsDir, connFile));

              const mssql    = _require('mssql');
              const pool     = await mssql.connect({
                server:   decrypt(creds.server_enc),
                port:     parseInt(decrypt(creds.port_enc)) || 1433,
                database: decrypt(creds.database_enc),
                user:     decrypt(creds.username_enc),
                password: decrypt(creds.password_enc),
                options:  { trustServerCertificate: true, encrypt: false },
                connectionTimeout: 12000
              });

              // Query full schema from INFORMATION_SCHEMA
              const result = await pool.request().query(`
                SELECT
                  t.TABLE_NAME    AS tableName,
                  t.TABLE_SCHEMA  AS tableSchema,
                  c.COLUMN_NAME   AS columnName,
                  c.DATA_TYPE     AS dataType,
                  c.CHARACTER_MAXIMUM_LENGTH AS maxLength,
                  c.IS_NULLABLE   AS isNullable,
                  c.COLUMN_DEFAULT AS defaultValue,
                  CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey,
                  COLUMNPROPERTY(OBJECT_ID(t.TABLE_SCHEMA+'.'+t.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS isIdentity
                FROM INFORMATION_SCHEMA.TABLES t
                JOIN INFORMATION_SCHEMA.COLUMNS c
                  ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
                LEFT JOIN (
                  SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.TABLE_SCHEMA
                  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                ) pk ON pk.TABLE_NAME = t.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME AND pk.TABLE_SCHEMA = t.TABLE_SCHEMA
                WHERE t.TABLE_TYPE = 'BASE TABLE'
                ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
              `);
              await pool.close();

              // Group by table
              const tableMap = {};
              for (const row of result.recordset) {
                if (!tableMap[row.tableName]) {
                  tableMap[row.tableName] = { name: row.tableName, schema: row.tableSchema, fields: [] };
                }
                const typeStr = row.maxLength && row.maxLength !== -1
                  ? `${row.dataType.toUpperCase()}(${row.maxLength})`
                  : row.dataType.toUpperCase();
                tableMap[row.tableName].fields.push({
                  id:        `f_${row.tableName.toLowerCase()}_${row.columnName.toLowerCase()}`,
                  name:      row.columnName,
                  type:      typeStr,
                  primary:   !!row.isPrimaryKey,
                  notNull:   row.isNullable === 'NO',
                  unique:    false,
                  increment: !!row.isIdentity,
                  default:   row.defaultValue || ''
                });
              }

              // Write .sql files into sql/projects/default/tables/other/
              const otherDir = path.join(sqlProjDir, 'tables', 'other');
              ensureDir(otherDir);
              let added = 0, updated = 0;
              for (const [tName, tbl] of Object.entries(tableMap)) {
                const filePath = path.join(otherDir, `${tName}.sql`);
                const existed  = fs.existsSync(filePath);
                const mock     = { name: tName, folder: 'other', fields: tbl.fields };
                fs.writeFileSync(filePath, generateTableSql(mock), 'utf-8');
                existed ? updated++ : added++;
              }

              jsonOk(res, { success: true, tables: Object.keys(tableMap).length, added, updated, message: `${Object.keys(tableMap).length} tablo senkronize edildi (${added} yeni, ${updated} güncellendi).` });
            } catch (err) { jsonOk(res, { success: false, message: err.message }); }
            return;
          }

          next();
        });
      }
    }
  ]
});
