const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, '9router', 'db', 'data.sqlite');
const db = new Database(dbPath);

const arg = process.argv[2]?.toLowerCase();

const row = db.prepare("SELECT data FROM settings WHERE id = 1").get();
if (!row) {
  console.log("No settings row found.");
  process.exit(1);
}

const data = JSON.parse(row.data);

if (arg === "on" || arg === "true" || arg === "1") {
  data.agOnboardingEnabled = true;
  db.prepare("UPDATE settings SET data = ? WHERE id = 1").run(JSON.stringify(data));
  console.log("✅ GCP Onboarding ON (agOnboardingEnabled = true)");
} else if (arg === "off" || arg === "false" || arg === "0") {
  data.agOnboardingEnabled = false;
  db.prepare("UPDATE settings SET data = ? WHERE id = 1").run(JSON.stringify(data));
  console.log("❌ GCP Onboarding OFF (agOnboardingEnabled = false)");
} else {
  console.log(`Current GCP Onboarding status: ${data.agOnboardingEnabled === true ? "ON (true)" : "OFF (false)"}`);
  console.log("\nTo change status, run:");
  console.log("  node scripts/toggle_onboarding.js on");
  console.log("  node scripts/toggle_onboarding.js off");
}
