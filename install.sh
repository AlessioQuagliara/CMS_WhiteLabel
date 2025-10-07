#!/bin/bash

# setup.sh - Script per la configurazione personalizzabile del database e ambiente

echo "🔧 Configurazione del database e ambiente"
echo "=========================================="

# Verifica che PostgreSQL sia installato
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL non è installato. Installa PostgreSQL prima di continuare."
    exit 1
fi

# Controlla se siamo in ambiente di produzione
if [ ! -z "$PRODUCTION_SERVER" ] && [ "$PRODUCTION_SERVER" = "true" ]; then
    echo "🏭 Rilevato ambiente di produzione"
    NODE_ENV="production"
else
    NODE_ENV="development"
fi

# Funzione per verificare se una porta è disponibile
check_port() {
    local port=$1
    if command -v netstat &> /dev/null; then
        if netstat -tuln | grep ":$port " > /dev/null; then
            return 1 # Porta in uso
        else
            return 0 # Porta disponibile
        fi
    elif command -v lsof &> /dev/null; then
        if lsof -i :$port > /dev/null; then
            return 1 # Porta in uso
        else
            return 0 # Porta disponibile
        fi
    else
        # Se non abbiamo netstat o lsof, assumiamo che la porta sia disponibile
        return 0
    fi
}

# Trova una porta disponibile per l'applicazione
find_available_port() {
    local base_port=3000
    local port=$base_port
    
    while ! check_port $port; do
        ((port++))
    done
    
    echo $port
}

# Input personalizzabili
echo ""
echo "Inserisci i dettagli di configurazione:"
echo "----------------------------------------"

read -p "Nome del database (default: myapp_db): " DB_NAME
DB_NAME=${DB_NAME:-myapp_db}

# Valori fissi per le connessioni al database
DB_USER="spotex"
DB_PASSWORD="spotex"
DB_HOST="localhost"
DB_PORT="5432"

read -p "Dominio per l'applicazione (es. miosito.it): " DOMAIN

# Configurazione SMTP personalizzabile
echo ""
echo "Configurazione SMTP:"
read -p "SMTP Host (default: smtps.aruba.it): " SMTP_HOST
SMTP_HOST=${SMTP_HOST:-smtps.aruba.it}

read -p "SMTP Port (default: 465): " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-465}

read -p "SMTP Secure (true/false, default: true): " SMTP_SECURE
SMTP_SECURE=${SMTP_SECURE:-true}

read -p "SMTP User: " SMTP_USER

read -s -p "SMTP Password: " SMTP_PASS
echo ""

# Se non è produzione, chiedi la porta, altrimenti usa quella standard
if [ "$NODE_ENV" = "development" ]; then
    read -p "Porta per l'applicazione (lascia vuoto per auto-rilevamento): " APP_PORT
    if [ -z "$APP_PORT" ]; then
        APP_PORT=$(find_available_port)
        echo "Porta auto-rilevata: $APP_PORT"
    fi
    BASE_URL="http://localhost:$APP_PORT"
    FRONTEND_URL="http://localhost:3000"
else
    # In produzione, usa le porte standard
    APP_PORT=3000
    BASE_URL="https://$DOMAIN"
    FRONTEND_URL="https://$DOMAIN"
fi

# Crea il file .env in una directory con permessi di scrittura
echo ""
echo "📝 Creazione file .env"
ENV_FILE="/tmp/.env_$(date +%s)"

cat > "$ENV_FILE" << EOF
# Database
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME

# JWT Secrets
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# Session
SESSION_SECRET=$(openssl rand -hex 32)

# SMTP
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_SECURE=$SMTP_SECURE
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS

# App
PORT=$APP_PORT
NODE_ENV=$NODE_ENV

# URLs
BASE_URL=$BASE_URL
FRONTEND_URL=$FRONTEND_URL
EOF

# Sposta il file .env nella directory corrente con i permessi corretti
sudo mv "$ENV_FILE" .env
sudo chown $USER:$(id -gn) .env

echo "✅ File .env creato con successo"

# Carica le variabili d'ambiente
set -a
source .env
set +a

# Crea il database e l'utente
echo "🗄️ Creazione database e utente"

# Crea l'utente se non esiste già
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "Utente già esistente o errore"

# Crea il database
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || echo "Database già esistente o errore"

# Concedi privilegi
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# Verifica che il database sia accessibile
if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\q"; then
    echo "✅ Connessione al database riuscita"
else
    echo "❌ Impossibile connettersi al database. Controlla le credenziali e i permessi."
    exit 1
fi

# Esegui migrazioni con Knex
echo "🔄 Esecuzione migrazioni database..."
npx knex migrate:latest

if [ $? -eq 0 ]; then
    echo "✅ Migrazioni completate con successo"
else
    echo "❌ Errore durante le migrazioni"
    echo "Tentativo con variabili d'ambiente esplicite..."
    
    # Esegui migrazioni con variabili d'ambiente esplicite
    PG_HOST=$DB_HOST PG_PORT=$DB_PORT PG_USER=$DB_USER PG_PASSWORD=$DB_PASSWORD PG_DATABASE=$DB_NAME npx knex migrate:latest
    
    if [ $? -ne 0 ]; then
        exit 1
    fi
fi

# Esegui seed iniziali
echo "🌱 Esecuzione seed iniziali..."
npx knex seed:run

if [ $? -eq 0 ]; then
    echo "✅ Seed completati con successo"
else
    echo "❌ Errore durante i seed"
    echo "Tentativo con variabili d'ambiente esplicite..."
    
    # Esegui seed con variabili d'ambiente esplicite
    PG_HOST=$DB_HOST PG_PORT=$DB_PORT PG_USER=$DB_USER PG_PASSWORD=$DB_PASSWORD PG_DATABASE=$DB_NAME npx knex seed:run
    
    if [ $? -ne 0 ]; then
        exit 1
    fi
fi

# Crea ecosystem.config.js
echo "📝 Creazione file ecosystem.config.js"

cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '${DB_NAME}_app',
    script: './server/app.js',
    cwd: '$(pwd)',
    instances: process.env.NODE_ENV === 'production' ? 2 : 1,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: $APP_PORT
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF

# Crea la directory per i log
mkdir -p logs

echo "✅ File ecosystem.config.js creato"
echo ""
echo "🎉 Configurazione completata!"
echo "============================="
echo "File .env creato con le seguenti informazioni:"
echo "   Database: $DB_NAME"
echo "   Utente DB: $DB_USER"
echo "   Host DB: $DB_HOST"
echo "   Porta DB: $DB_PORT"
echo "   Porta applicazione: $APP_PORT"
echo "   Ambiente: $NODE_ENV"
echo "   BASE_URL: $BASE_URL"
echo "   FRONTEND_URL: $FRONTEND_URL"
echo "   SMTP: $SMTP_USER"
echo ""
echo "Per avviare l'applicazione in sviluppo:"
echo "   npm run dev"
echo ""
echo "Per avviare l'applicazione in produzione:"
echo "   npm start"