CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(24) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    uid CHAR(8) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    last_ip_hash CHAR(64)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS users_uid_idx ON users (uid);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS ip_uid_links (
    id BIGSERIAL PRIMARY KEY,
    ip_hash CHAR(64),
    device_hash CHAR(64),
    uid CHAR(8) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((ip_hash IS NOT NULL AND device_hash IS NULL) OR (ip_hash IS NULL AND device_hash IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ip_uid_links_ip_hash_uq ON ip_uid_links (ip_hash) WHERE ip_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ip_uid_links_device_hash_uq ON ip_uid_links (device_hash) WHERE device_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ip_uid_links_uid_idx ON ip_uid_links (uid);

CREATE TABLE IF NOT EXISTS bans (
    id BIGSERIAL PRIMARY KEY,
    uid CHAR(8) NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    banned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS bans_uid_active_idx ON bans (uid, active, expires_at);

CREATE TABLE IF NOT EXISTS mod_logs (
    id BIGSERIAL PRIMARY KEY,
    moderator_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(48) NOT NULL,
    target_uid CHAR(8),
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mod_logs_created_at_idx ON mod_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS mod_logs_target_uid_idx ON mod_logs (target_uid);

CREATE TABLE IF NOT EXISTS downloads (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS downloads_created_at_idx ON downloads (created_at DESC);