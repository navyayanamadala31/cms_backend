// const express = require("express");
// const db = require("../db");

// const router = express.Router();

// /* =========================================================
//    Helper — insert notifications for a list of user ids
//    Silently ignores errors so it never breaks the main flow.
//    ========================================================= */
// const notifyUsers = async (userIds, { ticket_id, title, message, type }) => {
//   const ids = (userIds || [])
//     .map((v) => Number(v))
//     .filter((v) => Number.isInteger(v) && v > 0);

//   if (ids.length === 0) {
//     console.log("🔔 notifyUsers skipped — no valid recipients", { userIds, type });
//     return;
//   }

//   try {
//     const values = ids.map((uid) => [
//       uid,
//       ticket_id ?? null,
//       title,
//       message,
//       type,
//       0, // is_read = 0 explicitly
//     ]);

//     const [result] = await db.query(
//       `INSERT INTO notifications
//          (user_id, ticket_id, title, message, type, is_read)
//        VALUES ?`,
//       [values]
//     );

//     console.log(
//       `🔔 Notified users [${ids.join(",")}] — ${type} — inserted=${result.affectedRows}`
//     );
//   } catch (err) {
//     console.error("🔔 Notify users FAILED:", err.message);
//   }
// };

// /* =========================================================
//    POST /api/projects
//    Only the assigned admin + customer are notified.
//    ========================================================= */
// router.post("/", async (req, res) => {
//   try {
//     const {
//       name,
//       description = null,
//       start_date = null,
//       end_date = null,
//       customer_id = null,
//       admin_id = null,
//       teamlead_id = null,
//     } = req.body;

//     if (!name || !name.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "Project name is required",
//       });
//     }

//     const [result] = await db.query(
//       `INSERT INTO projects
//         (name, description, start_date, end_date, customer_id, admin_id, teamlead_id)
//        VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       [
//         name.trim(),
//         description || null,
//         start_date || null,
//         end_date || null,
//         customer_id || null,
//         admin_id || null,
//         teamlead_id || null,
//       ]
//     );

//     /* =========================================================
//        NOTIFICATIONS — ONLY the assigned admin + customer
//        ========================================================= */
//     const recipients = [admin_id, customer_id];

//     console.log(
//       `🔔 New project #${result.insertId} — notifying admin_id=${admin_id}, customer_id=${customer_id}`
//     );

//     await notifyUsers(recipients, {
//       ticket_id: result.insertId,
//       title: "New project created",
//       message: `Project "${name.trim()}" (#${result.insertId}) has been created and assigned to you.`,
//       type: "PROJECT_CREATED",
//     });

//     return res.status(201).json({
//       success: true,
//       message: "Project created successfully",
//       data: {
//         id: result.insertId,
//         name,
//         description: description || null,
//         start_date: start_date || null,
//         end_date: end_date || null,
//         customer_id: customer_id || null,
//         admin_id: admin_id || null,
//         teamlead_id: teamlead_id || null,
//       },
//     });
//   } catch (err) {
//     console.error("Create project error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to create project",
//       error: err.message,
//     });
//   }
// });

// /* =========================================================
//    GET /api/projects
//    ========================================================= */
// /* =========================================================
//    GET /api/projects
//    ========================================================= */
// router.get("/", async (_req, res) => {
//   try {
//     const [rows] = await db.query(
//       `SELECT
//          p.id, p.name, p.description, p.start_date, p.end_date,
//          p.customer_id, p.admin_id, p.teamlead_id,
//          p.status, p.progress_notes,
//          p.customer_response, p.customer_status,
//          p.created_at, p.updated_at,
//          c.name AS customer_name, c.email AS customer_email,
//          a.name AS admin_name,    a.email AS admin_email,
//          t.name AS teamlead_name, t.email AS teamlead_email
//        FROM projects p
//        LEFT JOIN users c ON c.id = p.customer_id
//        LEFT JOIN users a ON a.id = p.admin_id
//        LEFT JOIN users t ON t.id = p.teamlead_id
//        ORDER BY p.created_at DESC`
//     );

//     return res.json({ success: true, count: rows.length, data: rows });
//   } catch (err) {
//     console.error("List projects error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch projects",
//       error: err.message,
//     });
//   }
// });

// /* =========================================================
//    GET /api/projects/:id
//    ========================================================= */
// /* =========================================================
//    GET /api/projects/:id
//    ========================================================= */
// router.get("/:id", async (req, res) => {
//   try {
//     const [rows] = await db.query(
//       `SELECT
//          p.id, p.name, p.description, p.start_date, p.end_date,
//          p.customer_id, p.admin_id, p.teamlead_id,
//          p.status, p.progress_notes,
//          p.customer_response, p.customer_status,
//          p.created_at, p.updated_at,
//          c.name AS customer_name, c.email AS customer_email,
//          a.name AS admin_name,    a.email AS admin_email,
//          t.name AS teamlead_name, t.email AS teamlead_email
//        FROM projects p
//        LEFT JOIN users c ON c.id = p.customer_id
//        LEFT JOIN users a ON a.id = p.admin_id
//        LEFT JOIN users t ON t.id = p.teamlead_id
//        WHERE p.id = ?
//        LIMIT 1`,
//       [req.params.id]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Project not found",
//       });
//     }

//     return res.json({ success: true, data: rows[0] });
//   } catch (err) {
//     console.error("Get project error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch project",
//       error: err.message,
//     });
//   }
// });

// /* =========================================================
//    PUT /api/projects/:id
//    Team lead updates status + progress notes.
//    Notifications go ONLY to this project's customer + admin.
//    ========================================================= */
// /* =========================================================
//    PUT /api/projects/:id
//    Team lead updates status + progress notes.
//    Customer submits response + customer_status.
//    Notifications go ONLY to this project's customer + admin.
//    ========================================================= */
// router.put("/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       name,
//       description,
//       start_date,
//       end_date,
//       customer_id,
//       admin_id,
//       teamlead_id,
//       status,
//       progress_notes,
//       customer_response,   // 👈 new
//       customer_status,     // 👈 new
//     } = req.body;

//     // ---- Fetch current project (we need customer_id + admin_id) ----
//     const [existing] = await db.query(
//       `SELECT id, name, customer_id, admin_id, teamlead_id, status,
//               customer_response, customer_status
//        FROM projects WHERE id = ? LIMIT 1`,
//       [id]
//     );

//     if (existing.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Project not found",
//       });
//     }

//     const before = existing[0];

//     console.log("🧾 PUT /projects/" + id + " — before =", before);
//     console.log("🧾 PUT /projects/" + id + " — body   =", req.body);

//     // ---- Build dynamic UPDATE ----
//     const fields = [];
//     const values = [];

//     if (name) {
//       fields.push("name = ?");
//       values.push(name);
//     }
//     if (description !== undefined) {
//       fields.push("description = ?");
//       values.push(description);
//     }
//     if (start_date !== undefined) {
//       fields.push("start_date = ?");
//       values.push(start_date || null);
//     }
//     if (end_date !== undefined) {
//       fields.push("end_date = ?");
//       values.push(end_date || null);
//     }
//     if (customer_id !== undefined) {
//       fields.push("customer_id = ?");
//       values.push(customer_id || null);
//     }
//     if (admin_id !== undefined) {
//       fields.push("admin_id = ?");
//       values.push(admin_id || null);
//     }
//     if (teamlead_id !== undefined) {
//       fields.push("teamlead_id = ?");
//       values.push(teamlead_id || null);
//     }

//     const allowedStatuses = [
//       "ASSIGNED",
//       "IN_PROGRESS",
//       "COMPLETED",
//       "ON_HOLD",
//       "CLOSED",
//     ];
//     const newStatus = status ? String(status).toUpperCase() : null;
//     if (newStatus && allowedStatuses.includes(newStatus)) {
//       fields.push("status = ?");
//       values.push(newStatus);
//     }

//     if (progress_notes !== undefined) {
//       fields.push("progress_notes = ?");
//       values.push(progress_notes);
//     }

//     // ---- Customer response + status (NEW) ----
//     if (customer_response !== undefined) {
//       fields.push("customer_response = ?");
//       values.push(customer_response);
//     }

//     const allowedCustomerStatuses = ["RESOLVED", "PENDING"];
//     const newCustomerStatus = customer_status
//       ? String(customer_status).toUpperCase()
//       : null;
//     if (newCustomerStatus && allowedCustomerStatuses.includes(newCustomerStatus)) {
//       fields.push("customer_status = ?");
//       values.push(newCustomerStatus);
//     }

//     if (fields.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "No fields to update",
//       });
//     }

//     values.push(id);
//     await db.query(
//       `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`,
//       values
//     );

//     /* =========================================================
//        NOTIFICATIONS (scoped to THIS project only)
//        ========================================================= */

//     // 1. Teamlead newly assigned → notify the teamlead
//     if (
//       teamlead_id !== undefined &&
//       teamlead_id !== null &&
//       Number(teamlead_id) !== Number(before.teamlead_id)
//     ) {
//       await notifyUsers([teamlead_id], {
//         ticket_id: Number(id),
//         title: "New project assigned to you",
//         message: `Project "${before.name}" has been assigned to you.`,
//         type: "PROJECT_ASSIGNED",
//       });
//     }

//     // 2. Status changed to IN_PROGRESS or COMPLETED → notify this project's customer + admin
//     const oldStatus = before.status ? String(before.status).toUpperCase() : null;
//     const statusChanged = newStatus && newStatus !== oldStatus;

//     console.log("🔔 statusChanged?", statusChanged, { oldStatus, newStatus });

//     if (
//       statusChanged &&
//       (newStatus === "IN_PROGRESS" || newStatus === "COMPLETED")
//     ) {
//       const recipients = [before.customer_id, before.admin_id];

//       console.log(
//         `🔔 Scoped recipients for project #${id}: customer_id=${before.customer_id}, admin_id=${before.admin_id}`
//       );

//       const title =
//         newStatus === "COMPLETED" ? "Project completed" : "Project in progress";

//       const message =
//         newStatus === "COMPLETED"
//           ? `Project "${before.name}" has been completed.${
//               progress_notes ? ` Notes: ${progress_notes}` : ""
//             }`
//           : `Project "${before.name}" is now in progress.${
//               progress_notes ? ` Notes: ${progress_notes}` : ""
//             }`;

//       await notifyUsers(recipients, {
//         ticket_id: Number(id),
//         title,
//         message,
//         type:
//           newStatus === "COMPLETED"
//             ? "PROJECT_COMPLETED"
//             : "PROJECT_IN_PROGRESS",
//       });
//     }

//     // 3. Customer submitted a response → notify the admin + teamlead
//     if (customer_response !== undefined && customer_response !== "") {
//       const recipients = [before.admin_id, before.teamlead_id];

//       console.log(
//         `🔔 Customer responded on project #${id} — notifying admin_id=${before.admin_id}, teamlead_id=${before.teamlead_id}`
//       );

//       await notifyUsers(recipients, {
//         ticket_id: Number(id),
//         title: "Customer responded to project",
//         message: `Customer response on "${before.name}": ${customer_response.slice(0, 120)}${
//           customer_response.length > 120 ? "…" : ""
//         }`,
//         type: "PROJECT_CUSTOMER_RESPONSE",
//       });
//     }

//     return res.json({ success: true, message: "Project updated successfully" });
//   } catch (err) {
//     console.error("Update project error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to update project",
//       error: err.message,
//     });
//   }
// });

// /* =========================================================
//    DELETE /api/projects/:id
//    ========================================================= */
// router.delete("/:id", async (req, res) => {
//   try {
//     const [result] = await db.query(
//       "DELETE FROM projects WHERE id = ?",
//       [req.params.id]
//     );

//     if (result.affectedRows === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Project not found",
//       });
//     }

//     return res.json({ success: true, message: "Project deleted successfully" });
//   } catch (err) {
//     console.error("Delete project error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to delete project",
//       error: err.message,
//     });
//   }
// });

// module.exports = router;





const express = require("express");
const db = require("../db");

const router = express.Router();

/* =========================================================
   Helper — insert notifications for a list of user ids
   Silently ignores errors so it never breaks the main flow.
   ========================================================= */
const notifyUsers = async (userIds, { ticket_id, title, message, type }) => {
  const ids = (userIds || [])
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0);

  if (ids.length === 0) {
    console.log("🔔 notifyUsers skipped — no valid recipients", { userIds, type });
    return;
  }

  try {
    const values = ids.map((uid) => [
      uid,
      ticket_id ?? null,
      title,
      message,
      type,
      0, // is_read = 0 explicitly
    ]);

    const [result] = await db.query(
      `INSERT INTO notifications
         (user_id, ticket_id, title, message, type, is_read)
       VALUES ?`,
      [values]
    );

    console.log(
      `🔔 Notified users [${ids.join(",")}] — ${type} — inserted=${result.affectedRows}`
    );
  } catch (err) {
    console.error("🔔 Notify users FAILED:", err.message);
  }
};

/* =========================================================
   POST /api/projects
   Only the assigned admin + customer are notified.
   ========================================================= */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      description = null,
      start_date = null,
      end_date = null,
      customer_id = null,
      admin_id = null,
      teamlead_id = null,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Project name is required",
      });
    }

    const [result] = await db.query(
      `INSERT INTO projects
        (name, description, start_date, end_date, customer_id, admin_id, teamlead_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description || null,
        start_date || null,
        end_date || null,
        customer_id || null,
        admin_id || null,
        teamlead_id || null,
      ]
    );

    /* =========================================================
       NOTIFICATIONS — ONLY the assigned admin + customer
       ========================================================= */
    const recipients = [admin_id, customer_id];

    console.log(
      `🔔 New project #${result.insertId} — notifying admin_id=${admin_id}, customer_id=${customer_id}`
    );

    await notifyUsers(recipients, {
      ticket_id: result.insertId,
      title: "New project created",
      message: `Project "${name.trim()}" (#${result.insertId}) has been created and assigned to you.`,
      type: "PROJECT_CREATED",
    });

    return res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: {
        id: result.insertId,
        name,
        description: description || null,
        start_date: start_date || null,
        end_date: end_date || null,
        customer_id: customer_id || null,
        admin_id: admin_id || null,
        teamlead_id: teamlead_id || null,
      },
    });
  } catch (err) {
    console.error("Create project error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create project",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/projects
   ========================================================= */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.id, p.name, p.description, p.start_date, p.end_date,
         p.customer_id, p.admin_id, p.teamlead_id,
         p.status, p.progress_notes,
         p.customer_response, p.customer_status,
         p.created_at, p.updated_at,
         c.name AS customer_name, c.email AS customer_email,
         a.name AS admin_name,    a.email AS admin_email,
         t.name AS teamlead_name, t.email AS teamlead_email
       FROM projects p
       LEFT JOIN users c ON c.id = p.customer_id
       LEFT JOIN users a ON a.id = p.admin_id
       LEFT JOIN users t ON t.id = p.teamlead_id
       ORDER BY p.created_at DESC`
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List projects error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch projects",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/projects/:id
   ========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.id, p.name, p.description, p.start_date, p.end_date,
         p.customer_id, p.admin_id, p.teamlead_id,
         p.status, p.progress_notes,
         p.customer_response, p.customer_status,
         p.created_at, p.updated_at,
         c.name AS customer_name, c.email AS customer_email,
         a.name AS admin_name,    a.email AS admin_email,
         t.name AS teamlead_name, t.email AS teamlead_email
       FROM projects p
       LEFT JOIN users c ON c.id = p.customer_id
       LEFT JOIN users a ON a.id = p.admin_id
       LEFT JOIN users t ON t.id = p.teamlead_id
       WHERE p.id = ?
       LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get project error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch project",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/projects/:id
   Team lead updates status + progress notes.
   Customer submits response + customer_status.
   Notifications go ONLY to this project's customer + admin.
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      start_date,
      end_date,
      customer_id,
      admin_id,
      teamlead_id,
      status,
      progress_notes,
      customer_response,
      customer_status,
    } = req.body;

    // ---- Fetch current project (we need customer_id + admin_id) ----
    const [existing] = await db.query(
      `SELECT id, name, customer_id, admin_id, teamlead_id, status,
              customer_response, customer_status
       FROM projects WHERE id = ? LIMIT 1`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const before = existing[0];

    console.log("🧾 PUT /projects/" + id + " — before =", before);
    console.log("🧾 PUT /projects/" + id + " — body   =", req.body);

    // ---- Build dynamic UPDATE ----
    const fields = [];
    const values = [];

    if (name) {
      fields.push("name = ?");
      values.push(name);
    }
    if (description !== undefined) {
      fields.push("description = ?");
      values.push(description);
    }
    if (start_date !== undefined) {
      fields.push("start_date = ?");
      values.push(start_date || null);
    }
    if (end_date !== undefined) {
      fields.push("end_date = ?");
      values.push(end_date || null);
    }
    if (customer_id !== undefined) {
      fields.push("customer_id = ?");
      values.push(customer_id || null);
    }
    if (admin_id !== undefined) {
      fields.push("admin_id = ?");
      values.push(admin_id || null);
    }
    if (teamlead_id !== undefined) {
      fields.push("teamlead_id = ?");
      values.push(teamlead_id || null);
    }

    const allowedStatuses = [
      "ASSIGNED",
      "IN_PROGRESS",
      "COMPLETED",
      "ON_HOLD",
      "CLOSED",
    ];
    const newStatus = status ? String(status).toUpperCase() : null;
    if (newStatus && allowedStatuses.includes(newStatus)) {
      fields.push("status = ?");
      values.push(newStatus);
    }

    if (progress_notes !== undefined) {
      fields.push("progress_notes = ?");
      values.push(progress_notes);
    }

    // ---- Customer response + status ----
    if (customer_response !== undefined) {
      fields.push("customer_response = ?");
      values.push(customer_response);
    }

    const allowedCustomerStatuses = ["RESOLVED", "PENDING"];
    const newCustomerStatus = customer_status
      ? String(customer_status).toUpperCase()
      : null;
    if (
      newCustomerStatus &&
      allowedCustomerStatuses.includes(newCustomerStatus)
    ) {
      fields.push("customer_status = ?");
      values.push(newCustomerStatus);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    values.push(id);
    await db.query(
      `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    /* =========================================================
       NOTIFICATIONS (scoped to THIS project only)
       ========================================================= */

    // 1. Teamlead newly assigned → notify the teamlead
    if (
      teamlead_id !== undefined &&
      teamlead_id !== null &&
      Number(teamlead_id) !== Number(before.teamlead_id)
    ) {
      await notifyUsers([teamlead_id], {
        ticket_id: Number(id),
        title: "New project assigned to you",
        message: `Project "${before.name}" has been assigned to you.`,
        type: "PROJECT_ASSIGNED",
      });
    }

    // 2. Status changed to IN_PROGRESS or COMPLETED → notify this project's customer + admin
    const oldStatus = before.status ? String(before.status).toUpperCase() : null;
    const statusChanged = newStatus && newStatus !== oldStatus;

    console.log("🔔 statusChanged?", statusChanged, { oldStatus, newStatus });

    if (
      statusChanged &&
      (newStatus === "IN_PROGRESS" || newStatus === "COMPLETED")
    ) {
      const recipients = [before.customer_id, before.admin_id];

      console.log(
        `🔔 Scoped recipients for project #${id}: customer_id=${before.customer_id}, admin_id=${before.admin_id}`
      );

      const title =
        newStatus === "COMPLETED" ? "Project completed" : "Project in progress";

      const message =
        newStatus === "COMPLETED"
          ? `Project "${before.name}" has been completed.${
              progress_notes ? ` Notes: ${progress_notes}` : ""
            }`
          : `Project "${before.name}" is now in progress.${
              progress_notes ? ` Notes: ${progress_notes}` : ""
            }`;

      await notifyUsers(recipients, {
        ticket_id: Number(id),
        title,
        message,
        type:
          newStatus === "COMPLETED"
            ? "PROJECT_COMPLETED"
            : "PROJECT_IN_PROGRESS",
      });
    }

    // 3. Customer submitted a response → notify the admin + teamlead
    if (customer_response !== undefined && customer_response !== "") {
      const recipients = [before.admin_id, before.teamlead_id];

      console.log(
        `🔔 Customer responded on project #${id} — notifying admin_id=${before.admin_id}, teamlead_id=${before.teamlead_id}`
      );

      await notifyUsers(recipients, {
        ticket_id: Number(id),
        title: "Customer responded to project",
        message: `Customer response on "${before.name}": ${customer_response.slice(0, 120)}${
          customer_response.length > 120 ? "…" : ""
        }`,
        type: "PROJECT_CUSTOMER_RESPONSE",
      });
    }

    return res.json({ success: true, message: "Project updated successfully" });
  } catch (err) {
    console.error("Update project error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update project",
      error: err.message,
    });
  }
});

/* =========================================================
   DELETE /api/projects/:id
   ========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM projects WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    return res.json({ success: true, message: "Project deleted successfully" });
  } catch (err) {
    console.error("Delete project error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete project",
      error: err.message,
    });
  }
});

module.exports = router;