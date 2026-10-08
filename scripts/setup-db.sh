#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

db_user="$(id -un)"
if [[ ! "$db_user" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]; then
  printf 'Имя Linux-пользователя нельзя безопасно использовать как роль PostgreSQL: %s\n' "$db_user" >&2
  exit 1
fi

if ! sudo -u postgres psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$db_user'" | rg -q '^1$'; then
  sudo -u postgres createuser --login --no-superuser --no-createdb --no-createrole "$db_user"
fi

if ! sudo -u postgres psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'jvxvisual'" | rg -q '^1$'; then
  sudo -u postgres createdb --owner "$db_user" jvxvisual
else
  sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE jvxvisual OWNER TO \"$db_user\"" >/dev/null
fi

database_url="postgresql://${db_user}@localhost/jvxvisual?host=/run/postgresql"
psql "$database_url" -v ON_ERROR_STOP=1 -f db/schema.sql

node - "$database_url" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');

const databaseUrl = process.argv[2];
const envPath = '.env';
const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
const values = new Map();

for (const line of lines) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}

values.set('DATABASE_URL', databaseUrl);
for (const name of ['JWT_SECRET', 'IP_HASH_SECRET']) {
  if (!values.has(name) || values.get(name).length < 32 || values.get(name).startsWith('replace-with-')) {
    values.set(name, crypto.randomBytes(32).toString('hex'));
  }
}
if (values.get('JWT_SECRET') === values.get('IP_HASH_SECRET')) {
  values.set('IP_HASH_SECRET', crypto.randomBytes(32).toString('hex'));
}
if (!values.has('PORT')) values.set('PORT', '3000');
if (!values.has('NODE_ENV')) values.set('NODE_ENV', 'development');

fs.writeFileSync(envPath, `${Array.from(values, ([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
fs.chmodSync(envPath, 0o600);
NODE

printf '\nPostgreSQL настроен, схема применена, .env создан/обновлён с закрытыми правами.\n'
printf 'Запусти сайт командой: npm start\n'