const express = require("express");
const router = express.Router();

// Prevent the browser from caching any learner page from its
// back/forward cache. Without this, switching from one learner
// to another can show a stale page for the PREVIOUS learner if
// the user hits the back button.
router.use(function (req, res, next) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    next();
});

// Require a learner session for every route below this point.
// Any route that reads req.session.learner MUST be behind this,
// otherwise a stale/left-open session on a shared browser will
// keep showing the previous learner's data.
function requireLearner(req, res, next) {

    if (!req.session.learner) {
        return res.redirect("/learner/start");
    }

    next();

}

// ==========================================
// GET /learner/start
// Purpose: Show the "enter your details" form and clear any
//          previous learner's session so a new person always
//          starts fresh (this is what fixes the "old learner's
//          bookings show up" bug).
// ==========================================
router.get("/start", function (req, res) {

    // Fully destroy the old session rather than just nulling a field,
    // so nothing from the previous learner can leak into the new one.
    req.session.regenerate(function (err) {

        if (err) {
            throw err;
        }

        res.render("learner_start");

    });

});

// ==========================================
// POST /learner/start
// Purpose: Save the learner's name/email/age_group into a
//          brand new session
// ==========================================
router.post("/start", function (req, res) {

    req.session.learner = {
        name: req.body.learner_name,
        email: req.body.email,
        age_group: req.body.age_group
    };

    console.log("LOGIN:");
    console.log(req.session.learner);

    res.redirect("/learner");
});

// ==========================================
// GET /learner/logout
// Purpose: Let a learner explicitly end their session
//          (e.g. a "Not you? Switch user" link)
// ==========================================
router.get("/logout", function (req, res) {

    req.session.regenerate(function (err) {

        if (err) {
            throw err;
        }

        res.redirect("/learner/start");

    });

});

// ==========================================
// GET /learner
// Purpose: Learner Home Page - shows all published courses
// ==========================================
router.get("/", requireLearner, function (req, res) {

    const coursesQuery = `
        SELECT *
        FROM event_ticket_summary
        WHERE status = 'published'
        ORDER BY event_date
        `;

    const bookingQuery = `
        SELECT COUNT(*) AS activeBookings
        FROM bookings
        WHERE email = ?
    `;

    global.db.get(
        bookingQuery,
        [req.session.learner.email],
        function (err, bookingResult) {

            if (err) throw err;

            global.db.all(
                coursesQuery,
                function (err, events) {

                    if (err) throw err;

                    res.render("learner_home", {
                        learner: req.session.learner,
                        events,
                        activeBookings: bookingResult.activeBookings,
                        cancelledBookings: 0
                    });

                }
            );
        }
    );
});

// ==========================================
// GET /learner/course/:id
// Purpose: View a single course
// ==========================================
router.get("/course/:id", requireLearner, function (req, res) {

    global.db.get(
        `
        SELECT *
        FROM event_ticket_summary
        WHERE id = ?
        `,

        [req.params.id],
        function (err, event) {

            if (err) {
                throw err;
            }

            if (!event) {
                return res.send("Course not found");
            }

            res.render("course_details", {
                event
            });

        }
    );

});


// ==========================================
// GET /learner/bookings
// Purpose: My Bookings page - only ever shows bookings belonging
//          to the CURRENT session's learner (filtered by email)
// ==========================================
router.get("/bookings", requireLearner, function (req, res) {

    console.log("CURRENT SESSION:");
    console.log(req.session);

    console.log("CURRENT LEARNER:");
    console.log(req.session.learner);

    const query = `
        SELECT bookings.*,
               events.title
        FROM bookings
        JOIN events
        ON bookings.event_id = events.id
        WHERE bookings.email = ?
    `;

    global.db.all(
        query,
        [req.session.learner.email],
        function (err, bookings) {

            console.log("BOOKINGS RETURNED:");
            console.log(bookings);

            res.render("mybookings", { bookings });

        }
    );
});

// ==========================================
// GET /learner/book/:id
// Purpose: Display the booking form for a
//          specific course selected by the learner
// Inputs:
//   - event id (route parameter)
// Outputs:
//   - Retrieves the selected course from the
//     database
// ==========================================
router.get("/book/:id", requireLearner, function (req, res) {

    global.db.get(
        `
        SELECT *
        FROM event_ticket_summary
        WHERE id = ?
        `,

        [req.params.id],
        function (err, event) {

            if (err) {
                throw err;
            }

            // Prevent access if course does not exist
            if (!event) {
                return res.send("Course not found");
            }

            // Render booking form with course data
            res.render(
                "booking_form",
                {
                    event,
                    error: null
                }
            );

        }
    );

});
// ==========================================
// POST /learner/book/:id
// Purpose: Save learner booking while preventing
//           overbooking of full and concession tickets
// Inputs:
//   - event id (route parameter)
//   - ticket_type (form field)
//   - quantity (form field)
// Outputs:
//   - Creates booking if tickets are available
//   - Shows error if requested quantity exceeds
//     remaining ticket availability
// ==========================================
router.post("/book/:id", requireLearner, function (req, res) {

    const bookingDate = new Date().toISOString();

    const requestedQty =
        parseInt(req.body.quantity);

    const ticketType =
        req.body.ticket_type;

    // Get course information
    global.db.get(
        `
        SELECT *
        FROM events
        WHERE id = ?
        `,
        [req.params.id],
        function (err, event) {

            if (err) {
                throw err;
            }

            // Calculate tickets already sold
            global.db.get(
                `
                SELECT
                    COALESCE(
                        SUM(quantity),
                        0
                    ) AS sold

                FROM bookings

                WHERE event_id = ?
                AND ticket_type = ?
                `,
                [
                    req.params.id,
                    ticketType
                ],
                function (err, result) {

                    if (err) {
                        throw err;
                    }

                    let remaining;

                    // Determine remaining tickets
                    if (ticketType === "Full Ticket") {

                        remaining =
                            event.full_ticket_qty -
                            result.sold;

                    } else {

                        remaining =
                            event.concession_ticket_qty -
                            result.sold;

                    }

                    // Prevent overbooking

                    if (requestedQty > remaining) {

                        return res.render(
                            "booking_form",
                            {
                                event,
                                error: `Sorry. Only ${remaining} ${ticketType} tickets remain.`
                            }
                        );

                    }

                    // Save booking
                    global.db.run(
                        `
                        INSERT INTO bookings
                        (
                            event_id,
                            learner_name,
                            email,
                            ticket_type,
                            quantity,
                            booking_date
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                        `,
                        [
                            req.params.id,
                            req.session.learner.name,
                            req.session.learner.email,
                            ticketType,
                            requestedQty,
                            bookingDate
                        ],
                        function (err) {

                            if (err) {
                                throw err;
                            }

                            res.redirect(
                                "/learner/bookings"
                            );

                        }
                    );

                }
            );

        }
    );

});

// ==========================================
// GET /learner/edit_booking/:id
// Purpose: Show edit form for a single booking - only allowed if
//          the booking belongs to the current session's learner
// ==========================================
router.get("/edit_booking/:id", requireLearner, function (req, res) {

    global.db.get(
        `
        SELECT bookings.*,
               events.title
        FROM bookings
        JOIN events
        ON bookings.event_id = events.id
        WHERE bookings.id = ?
        AND bookings.email = ?
        `,
        [req.params.id, req.session.learner.email],
        function (err, booking) {

            if (err) {
                throw err;
            }

            if (!booking) {
                return res.redirect("/learner/bookings");
            }

            res.render(
                "edit_booking",
                {
                    booking
                }
            );

        }
    );

});

// ==========================================
// POST /learner/edit_booking/:id
// Purpose: Save changes to a booking - only allowed if it belongs
//          to the current session's learner
// ==========================================
router.post("/edit_booking/:id", requireLearner, function (req, res) {

    global.db.run(
        `
        UPDATE bookings
        SET learner_name = ?,
            email = ?,
            ticket_type = ?,
            quantity = ?
        WHERE id = ?
        AND email = ?
        `,
        [
            req.body.learner_name,
            req.body.email,
            req.body.ticket_type,
            req.body.quantity,
            req.params.id,
            req.session.learner.email
        ],
        function (err) {

            if (err) {
                throw err;
            }

            res.redirect("/learner/bookings");

        }
    );

});

// ==========================================
// GET /learner/cancel/:id
// Purpose: Cancel a booking - only allowed if it belongs to the
//          current session's learner
// ==========================================
router.get("/cancel/:id", requireLearner, function (req, res) {

    global.db.run(
        `
        DELETE FROM bookings
        WHERE id = ?
        AND email = ?
        `,
        [req.params.id, req.session.learner.email],
        function (err) {

            if (err) {
                throw err;
            }

            res.redirect("/learner/bookings");

        }
    );

});

// ==========================================
// GET /learner/courses
// Purpose: Browse all published courses
// ==========================================
router.get("/courses", requireLearner, function (req, res) {

    global.db.all(
        `
        SELECT *
        FROM event_ticket_summary
        WHERE status='published'
        ORDER BY event_date
        `,
        function (err, events) {

            if (err) {
                throw err;
            }

            res.render(
                "browse_courses",
                {
                    events,
                    activePage: "courses"
                }
            );

        }
    );

});

// ==========================================
// GET /learner/profile
// Purpose: Show the current learner's profile + their booking count
// ==========================================
router.get("/profile", requireLearner, function (req, res) {

    global.db.get(
        `
        SELECT COUNT(*) AS totalBookings
        FROM bookings
        WHERE email = ?
        `,
        [req.session.learner.email],
        function (err, bookingResult) {

            if (err) {
                throw err;
            }

            res.render(
                "profile",
                {
                    learner: req.session.learner,
                    totalBookings: bookingResult.totalBookings
                }
            );

        }
    );

});

module.exports = router;