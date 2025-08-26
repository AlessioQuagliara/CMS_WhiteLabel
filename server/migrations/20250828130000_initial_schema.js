// server/migrations/20250828130000_initial_schema.js
// Migrazione iniziale consolidata dello schema. Progettata per essere eseguita su un DB nuovo.
exports.up = function(knex) {
  return knex.schema
    // users
    .createTable('users', (table) => {
      table.increments('id').primary();
      table.string('email', 255).unique().notNullable();
      table.string('password', 255).notNullable();
      table.string('first_name', 255);
      table.string('last_name', 255);
      table.string('phone', 50);
      table.string('verification_token', 255);
      table.boolean('verified').defaultTo(false);
      table.timestamps(true, true);
    })
    // admin_users
    .then(() => knex.schema.createTable('admin_users', (table) => {
      table.increments('id').primary();
      table.string('email', 255).unique().notNullable();
      table.string('password', 255).notNullable();
      table.string('name', 255);
      table.string('first_name', 255);
      table.string('last_name', 255);
      table.string('verification_token', 255);
      table.boolean('verified').defaultTo(false);
      table.timestamps(true, true);
    }))
    // messages
    .then(() => knex.schema.createTable('messages', (table) => {
      table.increments('id').primary();
      table.string('name', 255).notNullable();
      table.string('email', 255).notNullable();
      table.string('phone', 50);
      table.string('subject', 255);
      table.text('message').notNullable();
      table.string('ip_address', 45);
      table.boolean('read').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.integer('from_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.integer('to_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.integer('from_admin_id').unsigned().references('id').inTable('admin_users').onDelete('SET NULL');
      table.integer('to_admin_id').unsigned().references('id').inTable('admin_users').onDelete('SET NULL');

      table.index('email', 'idx_messages_email');
      table.index('created_at', 'idx_messages_created_at');
      table.index('from_user_id', 'idx_messages_from_user_id');
      table.index('to_user_id', 'idx_messages_to_user_id');
      table.index('from_admin_id', 'idx_messages_from_admin_id');
      table.index('to_admin_id', 'idx_messages_to_admin_id');
    }))
    // password_resets (users)
    .then(() => knex.schema.createTable('password_resets', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('token', 255).notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    }))
    // admin_password_resets
    .then(() => knex.schema.createTable('admin_password_resets', (table) => {
      table.increments('id').primary();
      table.integer('admin_user_id').unsigned().references('id').inTable('admin_users').onDelete('CASCADE');
      table.string('token', 255).notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    }))
    // visits
    .then(() => knex.schema.createTable('visits', (table) => {
      table.increments('id').primary();
      table.string('ip_address', 45).notNullable();
      table.text('user_agent');
      table.string('page', 500).notNullable();
      table.string('referrer', 500);
      table.string('country', 100);
      table.string('city', 100);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('created_at', 'idx_visits_created_at');
      table.index('ip_address', 'idx_visits_ip');
    }))
    // companies
    .then(() => knex.schema.createTable('companies', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().unique();
      table.string('ragione_sociale', 255).notNullable();
      table.string('campo_attivita', 255).notNullable();
      table.string('piva', 20).notNullable().unique();
      table.string('codice_fiscale', 16);
      table.decimal('fatturato', 15, 2);
      table.string('pec', 255).notNullable().unique();
      table.string('sdi', 7).notNullable();
      table.string('indirizzo', 255).notNullable();
      table.string('citta', 100).notNullable();
      table.string('cap', 10).notNullable();
      table.string('provincia', 2).notNullable();
      table.string('nazione', 100).defaultTo('Italia');
      table.string('telefono', 20);
      table.string('sito_web', 255);
      table.timestamps(true, true);
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.index('user_id', 'idx_companies_user_id');
      table.index('piva', 'idx_companies_piva');
      table.index('campo_attivita', 'idx_companies_campo_attivita');
    }))
    // events
    .then(() => knex.schema.createTable('events', (table) => {
      table.increments('id').primary();
      table.string('title', 255).notNullable();
      table.text('description').notNullable();
      table.timestamp('event_date').notNullable();
      table.timestamp('end_date');
      table.string('location', 500).notNullable();
      table.integer('max_participants');
      table.boolean('is_active').defaultTo(true);
      table.jsonb('visibility_rules');
      table.integer('created_by').unsigned();
      table.timestamps(true, true);
      table.foreign('created_by').references('id').inTable('admin_users').onDelete('SET NULL');
      table.index('event_date', 'idx_events_date');
      table.index('is_active', 'idx_events_active');
    }))
    // event_registrations
    .then(() => knex.schema.createTable('event_registrations', (table) => {
      table.increments('id').primary();
      table.integer('event_id').unsigned().notNullable();
      table.integer('user_id').unsigned().notNullable();
      table.integer('company_id').unsigned().notNullable();
      table.string('status', 20).defaultTo('pending');
      table.text('notes');
      table.boolean('attended').defaultTo(false);
      table.timestamps(true, true);
      table.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE');
      table.unique(['event_id', 'user_id']);
      table.index('event_id', 'idx_event_registrations_event');
      table.index('user_id', 'idx_event_registrations_user');
      table.index('status', 'idx_event_registrations_status');
    }));
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('event_registrations')
    .then(() => knex.schema.dropTableIfExists('events'))
    .then(() => knex.schema.dropTableIfExists('companies'))
    .then(() => knex.schema.dropTableIfExists('visits'))
    .then(() => knex.schema.dropTableIfExists('admin_password_resets'))
    .then(() => knex.schema.dropTableIfExists('password_resets'))
    .then(() => knex.schema.dropTableIfExists('messages'))
    .then(() => knex.schema.dropTableIfExists('admin_users'))
    .then(() => knex.schema.dropTableIfExists('users'));
};
