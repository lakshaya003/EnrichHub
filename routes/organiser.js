const express = require("express");
const router = express.Router();

// GET /organiser
// Purpose: Organiser Home Page - shows site name/description, published events, draft events
// Inputs: none
// Outputs: renders organiser_home with settings, publishedEvents, draftEvents
router.get("/", function (req, res) {

    global.db.all(
        "SELECT * FROM events WHERE status='published'",
        function (err, publishedEvents) {

            global.db.all(
                "SELECT * FROM events WHERE status='draft'",
                function (err, draftEvents) {

                    global.db.get(
                        "SELECT * FROM site_settings",
                        function (err, settings) {

                            global.db.get(
                                "SELECT COUNT(*) AS totalBookings FROM bookings",
                                function (err, bookingCount) {

                                    global.db.get(
                                        "SELECT COUNT(DISTINCT email) AS totalLearners FROM bookings",
                                        function (err, learnerCount) {

                                            res.render(
                                                "organiser_home",
                                                {
                                                    settings,
                                                    publishedEvents,
                                                    draftEvents,
                                                    totalBookings: bookingCount.totalBookings,
                                                    totalLearners: learnerCount.totalLearners,
                                                    activePage: "dashboard"
                                                }
                                            );

                                        }
                                    );

                                }
                            );

                        }
                    );

                }
            );

        }
    );

});

// GET /organiser/create_new_course
// Purpose: show the "Create New Event" trigger page
// Inputs: none
// Outputs: renders create_new_course view
router.get("/create_new_course", function (req, res) {

    res.render(
        "create_new_course",
        {
            activePage: "create"
        }
    );

});

// POST /organiser/create_new_course
// Purpose: create a new blank draft event, then redirect to its edit page
// Inputs: none (button-only form, no fields)
// Outputs: inserts new draft row, redirects to /organiser/edit_course/:id
router.post("/create_new_course", function (req, res) {

    const now = new Date().toISOString();

    const query = `
        INSERT INTO events
        (
            title,
            description,
            category,
            age_group,
            venue,
            capacity,
            event_date,
            full_ticket_qty,
            full_ticket_price,
            concession_ticket_qty,
            concession_ticket_price,
            status,
            created_at,
            modified_at
        )
        VALUES
        (
            'Untitled Course', '', 'Technology', 'Young Children', '', 0, ?, 0, 0, 0, 0, 'draft', ?, ?
        )
    `;

    global.db.run(
        query,
        [now, now, now],
        function (err) {

            if (err) {
                throw err;
            }

            // this.lastID is the id of the row just inserted
            res.redirect(`/organiser/edit_course/${this.lastID}`);

        }
    );

});

// GET /organiser/edit_course
// Purpose: show the list of all draft events
// Inputs: none
// Outputs: renders edit_course (draft list view) with draftEvents
router.get("/edit_course", function (req, res) {

    global.db.all(
        "SELECT * FROM events WHERE status='draft' ORDER BY created_at DESC",
        function (err, draftEvents) {

            if (err) {
                throw err;
            }

            res.render(
                "edit_course",
                {
                    draftEvents,
                    activePage: "drafts"
                }
            );

        }
    );

});

// GET /organiser/edit_course/:id
// Purpose: Organiser Edit Event Page - show a single event's data in an editable form
// Inputs: id (route param)
// Outputs: renders edit_event with the event's data
router.get("/edit_course/:id", function (req, res) {

    global.db.get(
        "SELECT * FROM events WHERE id = ?",
        [req.params.id],
        function (err, event) {

            res.render(
                "edit_event",
                {
                    event,
                    activePage: "drafts"   // <- use drafts
                }
            );

        }
    );

});

// POST /organiser/edit_course/:id
// Purpose: save changes to an event, stamp modified date, and optionally publish it
//          if the organiser clicked "Publish Course" instead of "Submit Changes"
// Inputs: id (route param), form fields (title, description, category, age_group,
//         venue, capacity, event_date, ticket qty/prices, action)
// Outputs: updates the event row (and published_at if publishing), redirects to Organiser Home Page
router.post("/edit_course/:id", function (req, res) {

    const now = new Date().toISOString();
    const isPublishing = req.body.action === "publish";

    if (isPublishing) {

        global.db.get(
            `
            SELECT *
            FROM events
            WHERE title = ?
            AND event_date = ?
            AND status = 'published'
            AND id != ?
            `,
            [
                req.body.title,
                req.body.event_date,
                req.params.id
            ],
            function (err, existingCourse) {

                if (err) {
                    throw err;
                }

                if (existingCourse) {
                    return res.send(
                        "A published course with the same title and date already exists."
                    );
                }

                updateCourse();
            }
        );

    } else {

        updateCourse();

    }

    function updateCourse() {

        let query = `
        UPDATE events
        SET title = ?,
            description = ?,
            category = ?,
            age_group = ?,
            venue = ?,
            capacity = ?,
            event_date = ?,
            full_ticket_qty = ?,
            full_ticket_price = ?,
            concession_ticket_qty = ?,
            concession_ticket_price = ?,
            modified_at = ?
    `;

        const params = [
            req.body.title,
            req.body.description,
            req.body.category,
            req.body.age_group,
            req.body.venue,
            req.body.capacity,
            req.body.event_date,
            req.body.full_ticket_qty,
            req.body.full_ticket_price,
            req.body.concession_ticket_qty,
            req.body.concession_ticket_price,
            now
        ];

        if (isPublishing) {
            query += `, status = 'published', published_at = ? `;
            params.push(now);
        }

        query += ` WHERE id = ? `;
        params.push(req.params.id);

        global.db.run(
            query,
            params,
            function (err) {

                if (err) {
                    throw err;
                }

                if (isPublishing) {
                    res.redirect("/organiser/published");
                } else {
                    res.redirect("/organiser/edit_course");
                }

            }
        );

    }

});

// GET /organiser/publish/:id
// Purpose: publish a draft event directly from the dashboard or draft list
// Inputs: id (route param)
// Outputs: sets status='published', stamps published_at, redirects back to dashboard
router.get("/published", function (req, res) {

    const query = `
    SELECT *
    FROM event_ticket_summary
    WHERE status = 'published'
    ORDER BY event_date
    
    `;

    global.db.all(query, function (err, events) {

        if (err) {
            throw err;
        }

        res.render(
            "published_courses",
            {
                events,
                activePage: "published"
            }
        );

    });

});

// GET /organiser/delete/:id
// Purpose: delete an event (published or draft) from the database
// Inputs: id (route param)
// Outputs: removes the event row, redirects back to Organiser Home Page
router.get("/delete/:id", function (req, res) {

    global.db.run(
        "DELETE FROM events WHERE id = ?",
        [req.params.id],
        function (err) {

            if (err) {
                throw err;
            }

            res.redirect("/organiser");

        }
    );

});


// GET /organiser/bookings
// Purpose: show all learner bookings joined with event titles
// Inputs: none
// Outputs: renders learner_bookings
router.get("/bookings", function (req, res) {

    const query = `
        SELECT bookings.*,
               events.title
        FROM bookings
        JOIN events
        ON bookings.event_id = events.id
        ORDER BY bookings.booking_date DESC
    `;

    global.db.all(query, function (err, bookings) {

        if (err) {
            throw err;
        }

        res.render(
            "learner_bookings",
            {
                bookings,
                activePage: "bookings"
            }
        );

    });

});

// GET /organiser/analytics
// Purpose: show basic site analytics (counts of courses, published, drafts, bookings)
// Inputs: none
// Outputs: renders analytics
// GET /organiser/analytics
// Purpose: show analytics dashboard
router.get("/analytics", function (req, res) {

    global.db.get(
        "SELECT COUNT(*) AS totalCourses FROM events",
        function (err, totalCoursesResult) {

            global.db.get(
                "SELECT COUNT(*) AS publishedCourses FROM events WHERE status='published'",
                function (err, publishedCoursesResult) {

                    global.db.get(
                        "SELECT COUNT(*) AS draftCourses FROM events WHERE status='draft'",
                        function (err, draftCoursesResult) {

                            global.db.get(
                                "SELECT COUNT(*) AS totalBookings FROM bookings",
                                function (err, totalBookingsResult) {

                                    global.db.get(
                                        "SELECT COUNT(DISTINCT email) AS totalLearners FROM bookings",
                                        function (err, learnerResult) {

                                            const analyticsQuery = `
                                                SELECT

                                                SUM(
                                                    CASE
                                                        WHEN b.ticket_type = 'Full Ticket'
                                                        THEN b.quantity
                                                        ELSE 0
                                                    END
                                                ) AS totalFullTickets,

                                                SUM(
                                                    CASE
                                                        WHEN b.ticket_type = 'Concession Ticket'
                                                        THEN b.quantity
                                                        ELSE 0
                                                    END
                                                ) AS totalConcessionTickets,

                                                SUM(
                                                    CASE
                                                        WHEN b.ticket_type = 'Full Ticket'
                                                        THEN b.quantity * e.full_ticket_price
                                                        ELSE 0
                                                    END
                                                ) AS fullRevenue,

                                                SUM(
                                                    CASE
                                                        WHEN b.ticket_type = 'Concession Ticket'
                                                        THEN b.quantity * e.concession_ticket_price
                                                        ELSE 0
                                                    END
                                                ) AS concessionRevenue,

                                                SUM(
                                                    CASE
                                                        WHEN b.ticket_type = 'Full Ticket'
                                                        THEN b.quantity * e.full_ticket_price

                                                        WHEN b.ticket_type = 'Concession Ticket'
                                                        THEN b.quantity * e.concession_ticket_price

                                                        ELSE 0
                                                    END
                                                ) AS totalRevenue

                                                FROM bookings b
                                                JOIN events e
                                                ON b.event_id = e.id
                                            `;

                                            global.db.get(
                                                analyticsQuery,
                                                function (err, analyticsResult) {

                                                    if (err) {
                                                        throw err;
                                                    }

                                                    res.render(
                                                        "analytics",
                                                        {

                                                            totalCourses:
                                                                totalCoursesResult.totalCourses,

                                                            publishedCourses:
                                                                publishedCoursesResult.publishedCourses,

                                                            draftCourses:
                                                                draftCoursesResult.draftCourses,

                                                            totalBookings:
                                                                totalBookingsResult.totalBookings,

                                                            totalLearners:
                                                                learnerResult.totalLearners,

                                                            totalFullTickets:
                                                                analyticsResult?.totalFullTickets || 0,

                                                            totalConcessionTickets:
                                                                analyticsResult?.totalConcessionTickets || 0,

                                                            fullRevenue:
                                                                analyticsResult?.fullRevenue || 0,

                                                            concessionRevenue:
                                                                analyticsResult?.concessionRevenue || 0,

                                                            totalRevenue:
                                                                analyticsResult?.totalRevenue || 0,

                                                            activePage:
                                                                "analytics"
                                                        }
                                                    );

                                                }
                                            );

                                        }
                                    );

                                }
                            );

                        }
                    );

                }
            );

        }
    );

});

// GET /organiser/site_settings
// Purpose: Site Settings Page - show current site name and description in a form
// Inputs: none
// Outputs: renders settings with current site_settings row
router.get("/site_settings", function (req, res) {

    global.db.get(
        "SELECT * FROM site_settings WHERE id = 1",
        function (err, site_settings) {

            if (err) {
                throw err;
            }

            res.render(
                "site_settings",
                {
                    site_settings,
                    activePage: "site_settings",
                    error: null
                }
            );

        }
    );

});

// POST /organiser/site_settings
// Purpose: update site name and description; validates both fields are non-empty
// Inputs: site_name, description (form fields)
// Outputs: updates site_settings row, redirects to Organiser Home Page
router.post("/site_settings", function (req, res) {

    const siteName = (req.body.site_name || "").trim();
    const description = (req.body.description || "").trim();

    if (!siteName || !description) {

        return global.db.get(
            "SELECT * FROM site_settings WHERE id = 1",
            function (err, site_settings) {

                res.render(
                    "site_settings",
                    {
                        site_settings,
                        activePage: "site_settings",
                        error: "Please fill in both the site name and description."
                    }
                );

            }
        );

    }

    global.db.run(
        `
        UPDATE site_settings
        SET site_name = ?,
            description = ?
        WHERE id = 1
        `,
        [siteName, description],
        function (err) {

            if (err) {
                throw err;
            }

            res.redirect("/organiser");

        }
    );

});



module.exports = router;