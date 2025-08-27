// knexfile.js
const path = require('path');

// Carica le variabili d'ambiente con path assoluto
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Configurazione connessione database comune
const getConnectionConfig = () => {
  const baseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8'
  };

  // Aggiungi SSL solo in produzione se richiesto
  if (process.env.NODE_ENV === 'production') {
    return {
      ...baseConfig,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
  }

  return baseConfig;
};

module.exports = {
  development: {
    client: 'postgresql',
    connection: getConnectionConfig(),
    pool: {
      min: 2,
      max: 10,
      afterCreate: (conn, done) => {
        console.log('✅ Connessione al database stabilita (development)');
        done(null, conn);
      }
    },
    migrations: {
      directory: './server/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './server/seeds'
    },
    debug: process.env.KNEX_DEBUG === 'true'
  },

  production: {
    client: 'postgresql',
    connection: getConnectionConfig(),
    pool: {
      min: 2,
      max: 15,
      afterCreate: (conn, done) => {
        console.log('✅ Connessione al database stabilita (production)');
        done(null, conn);
      }
    },
    migrations: {
      directory: './server/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './server/seeds'
    },
    debug: false
  },

  // Ambiente di test
  test: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME + '_test'
    },
    migrations: {
      directory: './server/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './server/seeds'
    }
  }
};