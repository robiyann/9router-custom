const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, '9router', 'db', 'data.sqlite');
const db = new Database(dbPath);

const rows = db.prepare("SELECT id, name, email, data FROM providerConnections WHERE provider = 'antigravity'").all();
console.log(`Found ${rows.length} Antigravity connections:\n`);

for (const r of rows) {
  const data = JSON.parse(r.data);
  const activeLocks = Object.keys(data)
    .filter(k => k.startsWith('modelLock_') && data[k])
    .map(k => `${k}=${data[k]}`);

  console.log(`- Account: ${r.email || r.name}`);
  console.log(`  testStatus  : ${data.testStatus || 'unknown'}`);
  console.log(`  errorCode   : ${data.errorCode || 'none'}`);
  console.log(`  backoffLevel: ${data.backoffLevel || 0}`);
  console.log(`  ActiveLocks : ${activeLocks.length > 0 ? activeLocks.join(', ') : 'NONE'}`);
  console.log(`----------------------------------------`);
}
