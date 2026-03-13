const app = require('./app');
const env = require('./config/env');
const { query } = require('./config/db');
const { runBootMigrations } = require('./config/bootMigrations');

const start = async () => {
  try {
    await query('SELECT 1');
    await runBootMigrations();
    app.listen(env.port, () => {
      console.log(`API ejecutándose en http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

start();
