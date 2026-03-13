const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const init = async () => {
  try {
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    await pool.query(sql);
    console.log('Base de datos inicializada correctamente.');
  } catch (error) {
    console.error('Error inicializando DB:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

init();
