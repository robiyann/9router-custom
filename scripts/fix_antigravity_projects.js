const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

function fixAntigravity() {
  const dbPath = path.join(process.env.APPDATA, '9router', 'db', 'data.sqlite');
  console.log(`Updating Antigravity connections in: ${dbPath}`);
  const db = new Database(dbPath);

  const rows = db.prepare("SELECT id, name, email, data FROM providerConnections WHERE provider = 'antigravity'").all();
  
  const stmt = db.prepare("UPDATE providerConnections SET data = ? WHERE id = ?");
  db.transaction(() => {
    for (const r of rows) {
      const data = JSON.parse(r.data);
      const seed = r.email || r.name || r.id;
      const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 10);
      
      data.projectId = `cloudcode-pa-${hash}`;
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
      console.log(`- ${seed} => fixed projectId: ${data.projectId}`);
    }
  })();
  console.log(`Successfully updated ${rows.length} Antigravity accounts with stable Project IDs!`);
}

fixAntigravity();
