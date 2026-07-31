const Database = require('better-sqlite3');
const path = require('path');

function resetDb(dbPath) {
  console.log(`Resetting Antigravity connections in: ${dbPath}`);
  const db = new Database(dbPath);

  const rows = db.prepare("SELECT id, name, email, data FROM providerConnections WHERE provider = 'antigravity'").all();
  
  const stmt = db.prepare("UPDATE providerConnections SET data = ? WHERE id = ?");
  db.transaction(() => {
    for (const r of rows) {
      const data = JSON.parse(r.data);
      data.testStatus = "active";
      data.errorCode = null;
      data.lastError = null;
      data.lastErrorAt = null;
      data.backoffLevel = 0;
      for (const k of Object.keys(data)) {
        if (k.startsWith('modelLock_')) {
          data[k] = null;
        }
      }
      stmt.run(JSON.stringify(data), r.id);
    }
  })();
  console.log(`Successfully reset ${rows.length} Antigravity accounts to 'active'!`);
}

const localDb = path.join(process.env.APPDATA, '9router', 'db', 'data.sqlite');
resetDb(localDb);
