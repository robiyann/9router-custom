export default {
  version: 2,
  name: "apikey-permissions",
  up(db) {
    // Check if the permissions column already exists to ensure idempotency
    const tableInfo = db.all("PRAGMA table_info(apiKeys)");
    const hasPermissions = tableInfo.some(col => col.name === "permissions");
    if (!hasPermissions) {
      db.exec("ALTER TABLE apiKeys ADD COLUMN permissions TEXT;");
    }
  },
};
