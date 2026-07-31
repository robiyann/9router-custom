const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(process.env.APPDATA || 'C:/Users/Administrator/AppData/Roaming', '9router', 'db', 'data.sqlite');
console.log('Opening SQLite DB at:', dbPath);
const db = new Database(dbPath);

const payload = JSON.parse(fs.readFileSync('9router-backup-2026-07-31T09-01-43-701Z.json', 'utf8'));

// Ensure GCP Onboarding is false by default
payload.settings = payload.settings || {};
payload.settings.agOnboardingEnabled = false;

db.transaction(() => {
  db.prepare('DELETE FROM settings').run();
  db.prepare('DELETE FROM providerConnections').run();
  db.prepare('DELETE FROM providerNodes').run();
  db.prepare('DELETE FROM proxyPools').run();
  db.prepare('DELETE FROM apiKeys').run();
  db.prepare('DELETE FROM combos').run();
  db.prepare("DELETE FROM kv WHERE scope IN ('modelAliases', 'customModels', 'mitmAlias', 'pricing')").run();

  if (payload.settings) {
    db.prepare('INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(JSON.stringify(payload.settings));
  }

  const stmtConn = db.prepare('INSERT OR REPLACE INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const c of payload.providerConnections || []) {
    const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = c;
    stmtConn.run(id, provider, authType || 'oauth', name || null, email || null, priority || null, isActive === false ? 0 : 1, JSON.stringify(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString());
  }

  const stmtNodes = db.prepare('INSERT OR REPLACE INTO providerNodes(id, type, name, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)');
  for (const n of payload.providerNodes || []) {
    const { id, type, name, createdAt, updatedAt, ...rest } = n;
    stmtNodes.run(id, type || null, name || null, JSON.stringify(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString());
  }

  const stmtKeys = db.prepare('INSERT OR REPLACE INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)');
  for (const k of payload.apiKeys || []) {
    stmtKeys.run(k.id, k.key, k.name || null, k.machineId || null, k.isActive === false ? 0 : 1, k.createdAt || new Date().toISOString());
  }

  const stmtCombos = db.prepare('INSERT OR REPLACE INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)');
  for (const c of payload.combos || []) {
    stmtCombos.run(c.id, c.name, c.kind || null, JSON.stringify(c.models || []), c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString());
  }

  const stmtKv = db.prepare('INSERT OR REPLACE INTO kv(scope, key, value) VALUES(?, ?, ?)');
  for (const [a, m] of Object.entries(payload.modelAliases || {})) {
    stmtKv.run('modelAliases', a, JSON.stringify(m));
  }
  for (const m of payload.customModels || []) {
    const k = `${m.providerAlias}|${m.id}|${m.type || 'llm'}`;
    stmtKv.run('customModels', k, JSON.stringify(m));
  }
})();

console.log('DB RESTORE SUCCESS!');
