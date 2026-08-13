PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS site_settings;

CREATE TABLE site_settings (
    id INTEGER PRIMARY KEY,
    site_name TEXT NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT NOT NULL,
    description TEXT NOT NULL,

    category TEXT NOT NULL,
    age_group TEXT NOT NULL,

    venue TEXT,

    capacity INTEGER DEFAULT 0,

    event_date TEXT NOT NULL,

    full_ticket_qty INTEGER DEFAULT 0,
    full_ticket_price REAL DEFAULT 0,

    concession_ticket_qty INTEGER DEFAULT 0,
    concession_ticket_price REAL DEFAULT 0,

    status TEXT DEFAULT 'draft',

    created_at TEXT,
    modified_at TEXT,
    published_at TEXT
);

CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    event_id INTEGER NOT NULL,

    learner_name TEXT NOT NULL,
    email TEXT NOT NULL,

    ticket_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,

    booking_date TEXT,

    FOREIGN KEY(event_id)
        REFERENCES events(id)
        ON DELETE CASCADE
);

CREATE VIEW event_ticket_summary AS
SELECT
    e.*,

    COALESCE(
        (
            SELECT SUM(quantity)
            FROM bookings
            WHERE event_id = e.id
            AND ticket_type = 'Full Ticket'
        ),
        0
    ) AS full_tickets_sold,

    COALESCE(
        (
            SELECT SUM(quantity)
            FROM bookings
            WHERE event_id = e.id
            AND ticket_type = 'Concession Ticket'
        ),
        0
    ) AS concession_tickets_sold,

    (
        e.full_ticket_qty -
        COALESCE(
            (
                SELECT SUM(quantity)
                FROM bookings
                WHERE event_id = e.id
                AND ticket_type = 'Full Ticket'
            ),
            0
        )
    ) AS full_tickets_left,

    (
        e.concession_ticket_qty -
        COALESCE(
            (
                SELECT SUM(quantity)
                FROM bookings
                WHERE event_id = e.id
                AND ticket_type = 'Concession Ticket'
            ),
            0
        )
    ) AS concession_tickets_left

FROM events e;

INSERT INTO site_settings
VALUES (
    1,
    'EnrichHub',
    'Discover enriching courses and workshops for learners of all ages'
);

COMMIT;