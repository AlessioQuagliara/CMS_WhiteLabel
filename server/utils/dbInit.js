// server/utils/dbInit.js
const db = require('../config/database');
const { exec } = require('child_process');
const path = require('path');

async function initDatabase() {
  try {
    console.log('🔄 Verifica stato database...');
    
    // Controlla se la tabella delle migrazioni esiste
    const migrationTableExists = await db.schema.hasTable('knex_migrations');
    
    if (!migrationTableExists) {
      console.log('📦 Database non inizializzato, esecuzione migrazioni...');
      
      // Esegui migrazioni
      await execKnexCommand('migrate:latest');
      
      console.log('✅ Migrazioni completate');
      
      // Esegui seed iniziali
      console.log('🌱 Esecuzione seed iniziali...');
      await execKnexCommand('seed:run');
      
      console.log('✅ Seed completati');
    } else {
      console.log('✅ Database già inizializzato');
      
      // Controlla se ci sono migrazioni pendenti
      const [, pendingMigrations] = await db.migrate.list();
      
      if (pendingMigrations.length > 0) {
        console.log('🔄 Trovate migrazioni pendenti, esecuzione...');
        await execKnexCommand('migrate:latest');
        console.log('✅ Migrazioni aggiornate');
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Errore inizializzazione database:', error);
    throw error;
  }
}

// Funzione per eseguire comandi Knex
function execKnexCommand(command) {
  return new Promise((resolve, reject) => {
    const knexPath = path.join(__dirname, '../../node_modules/.bin/knex');
    
    exec(`${knexPath} ${command}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Errore comando knex ${command}:`, stderr);
        reject(error);
        return;
      }
      
      console.log(stdout);
      resolve();
    });
  });
}

module.exports = { initDatabase };