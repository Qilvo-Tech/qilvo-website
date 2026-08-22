CREATE TABLE IF NOT EXISTS daily_wishlists (
    date TEXT PRIMARY KEY,
    adds INTEGER NOT NULL,
    deletes INTEGER NOT NULL,
    purchases INTEGER NOT NULL,
    gifts INTEGER NOT NULL,
    steam_generated_at INTEGER NOT NULL,
    fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_status (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    app_min_date TEXT,
    last_checked_at TEXT,
    last_error TEXT
);

INSERT OR IGNORE INTO sync_status(singleton) VALUES (1);
