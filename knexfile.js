// knexfile.js
require('dotenv').config();

module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    },
    migrations: {
      directory: './server/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './server/seeds'
    }
  },
  production: {
    client: 'postgresql',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
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