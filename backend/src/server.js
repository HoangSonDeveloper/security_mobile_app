const { createApp } = require('./app');
const { resetDbFile } = require('./db');

function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has('--reset-db')) {
    resetDbFile();
  }

  const { app, db } = createApp();

  if (args.has('--seed-only') || args.has('--reset-db')) {
    console.log('Database ready.');
    db.close();
    return;
  }

  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`OWASP demo backend listening on http://localhost:${port}`);
  });
}

main();
