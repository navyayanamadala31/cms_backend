const express = require("express");
const db = require("../db");
const router = express.Router();

/* =========================================================
   Helper — notify users
   ========================================================= */
const notifyUsers = async (userIds, { ticket_id, title, message, type }) => {
  const ids = (userIds || [])
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0);
  if (ids.length === 0) return;

  try {
    const values = ids.map((uid) => [
      uid,
      ticket_id ?? null,
      title,
      message,
      type,
      0,
    ]);
    await db.query(
      `INSERT INTO notifications (user_id, ticket_id, title, message, type, is_read) VALUES ?`,
      [values]
    );
    console.log(
      `🔔 Notified users [${ids.join(",")}] — ${type} — rows=${values.length}`
    );
  } catch (err) {
    console.error("🔔 Notify failed:", err.message);
  }
};

/* =========================================================
   GET /api/tasks/test
   ========================================================= */
router.get("/test", async (_req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 + 1 AS result");
    const [taskCount] = await db.query("SELECT COUNT(*) AS c FROM tasks");
    res.json({
      success: true,
      db_ok: rows[0].result === 2,
      task_count: taskCount[0].c,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* =========================================================
   POST /api/tasks
   ========================================================= */
router.post("/", async (req, res) => {
  try {
    const {
      project_id,
      member_id,
      assigned_by,
      title,
      description = null,
      priority = "MEDIUM",
      due_date = null,
    } = req.body;

    if (!project_id || !member_id || !assigned_by || !title?.trim()) {
      return res.status(400).json({
        success: false,
        message: "project_id, member_id, assigned_by and title are required",
      });
    }

    const [projRows] = await db.query(
      `SELECT id, name, member_ids, teamlead_id FROM projects WHERE id = ? LIMIT 1`,
      [project_id]
    );

    if (projRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    const project = projRows[0];

    if (Number(project.teamlead_id) !== Number(assigned_by)) {
      return res.status(403).json({
        success: false,
        message: "Only the assigned team lead can assign tasks",
      });
    }

    let memberIds = [];
    try {
      memberIds =
        typeof project.member_ids === "string"
          ? JSON.parse(project.member_ids)
          : project.member_ids || [];
    } catch {
      memberIds = [];
    }

    if (!memberIds.map(Number).includes(Number(member_id))) {
      return res.status(400).json({
        success: false,
        message: "This member is not assigned to the project",
      });
    }

    const [result] = await db.query(
      `INSERT INTO tasks
        (project_id, member_id, assigned_by, title, description, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id,
        member_id,
        assigned_by,
        title.trim(),
        description,
        priority,
        due_date || null,
      ]
    );

    await notifyUsers([member_id], {
      ticket_id: result.insertId,
      title: "New task assigned",
      message: `Task "${title.trim()}" has been assigned to you on project "${project.name}".`,
      type: "TASK_ASSIGNED",
    });

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error("Create task error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create task",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/tasks
   ========================================================= */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         t.id, t.project_id, t.member_id, t.assigned_by,
         t.title, t.description, t.status, t.priority, t.due_date,
         t.progress_notes, t.teamlead_reply,
         t.created_at, t.updated_at,
         p.name AS project_name,
         u.name AS member_name, u.email AS member_email,
         a.name AS assigned_by_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.member_id
       LEFT JOIN users a ON a.id = t.assigned_by
       ORDER BY t.created_at DESC`
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List all tasks error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tasks",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/tasks/project/:projectId
   ========================================================= */
router.get("/project/:projectId", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         t.id, t.project_id, t.member_id, t.assigned_by,
         t.title, t.description, t.status, t.priority, t.due_date,
         t.progress_notes, t.teamlead_reply,
         t.created_at, t.updated_at,
         p.name AS project_name,
         u.name AS member_name, u.email AS member_email,
         a.name AS assigned_by_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.member_id
       LEFT JOIN users a ON a.id = t.assigned_by
       WHERE t.project_id = ?
       ORDER BY t.created_at DESC`,
      [req.params.projectId]
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List project tasks error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tasks",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/tasks/member/:memberId
   ========================================================= */
router.get("/member/:memberId", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         t.id, t.project_id, t.member_id, t.assigned_by,
         t.title, t.description, t.status, t.priority, t.due_date,
         t.progress_notes, t.teamlead_reply,
         t.created_at, t.updated_at,
         p.name AS project_name,
         u.name AS member_name, u.email AS member_email,
         a.name AS assigned_by_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.member_id
       LEFT JOIN users a ON a.id = t.assigned_by
       WHERE t.member_id = ?
       ORDER BY
         FIELD(t.status, 'IN_PROGRESS','TODO','BLOCKED','COMPLETED'),
         t.due_date IS NULL, t.due_date ASC,
         t.created_at DESC`,
      [req.params.memberId]
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List member tasks error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tasks",
      error: err.message,
    });
  }
});

/* =========================================================
   GET /api/tasks/:id
   ========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         t.id, t.project_id, t.member_id, t.assigned_by,
         t.title, t.description, t.status, t.priority, t.due_date,
         t.progress_notes, t.teamlead_reply,
         t.created_at, t.updated_at,
         p.name AS project_name,
         u.name AS member_name, u.email AS member_email,
         a.name AS assigned_by_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.member_id
       LEFT JOIN users a ON a.id = t.assigned_by
       WHERE t.id = ?
       LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get task error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch task",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/tasks/:id/reply
   Team lead sends a reply / message to the team member.
   Saves into tasks.teamlead_reply and notifies the member.
   ========================================================= */
router.put("/:id/reply", async (req, res) => {
  try {
    const { id } = req.params;
    const { reply, teamlead_id } = req.body;

    if (!reply || !String(reply).trim()) {
      return res.status(400).json({
        success: false,
        message: "Reply message is required",
      });
    }

    // Fetch the task + verify the caller is the team lead for this project
    const [rows] = await db.query(
      `SELECT t.id, t.title, t.project_id, t.member_id, t.assigned_by,
              p.name AS project_name, p.teamlead_id
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const task = rows[0];

    // Authorization: only the project's teamlead can reply
    if (teamlead_id && Number(task.teamlead_id) !== Number(teamlead_id)) {
      return res.status(403).json({
        success: false,
        message: "Only the assigned team lead can reply to this task",
      });
    }

    const trimmed = String(reply).trim();

    await db.query(`UPDATE tasks SET teamlead_reply = ? WHERE id = ?`, [
      trimmed,
      id,
    ]);

    // Notify the member
    if (task.member_id) {
      const snippet = trimmed.length > 120 ? trimmed.slice(0, 120) + "…" : trimmed;
      await notifyUsers([task.member_id], {
        ticket_id: task.project_id,
        title: `New message on task "${task.title}"`,
        message: `Team lead replied on "${task.title}": ${snippet}`,
        type: "TASK_REPLY",
      });
    }

    return res.json({
      success: true,
      message: "Reply sent successfully",
      data: { id: Number(id), teamlead_reply: trimmed },
    });
  } catch (err) {
    console.error("Reply to task error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send reply",
      error: err.message,
    });
  }
});

/* =========================================================
   PUT /api/tasks/:id
   Update task (status, title, description, notes, etc.)
   Notifies team lead ONLY when STATUS changes.
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      priority,
      due_date,
      member_id,
      progress_notes,
      teamlead_reply,
    } = req.body;

    const [existing] = await db.query(
      `SELECT t.id, t.project_id, t.member_id, t.assigned_by, t.title, t.status,
              t.progress_notes,
              p.name AS project_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.id = ? LIMIT 1`,
      [id]
    );

    if (existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const before = existing[0];
    const oldStatus = before.status
      ? String(before.status).toUpperCase()
      : null;

    const fields = [];
    const values = [];

    if (title !== undefined) {
      fields.push("title = ?");
      values.push(title);
    }
    if (description !== undefined) {
      fields.push("description = ?");
      values.push(description);
    }
    if (priority !== undefined) {
      fields.push("priority = ?");
      values.push(priority);
    }
    if (due_date !== undefined) {
      fields.push("due_date = ?");
      values.push(due_date || null);
    }
    if (member_id !== undefined) {
      fields.push("member_id = ?");
      values.push(member_id);
    }
    if (progress_notes !== undefined) {
      fields.push("progress_notes = ?");
      values.push(progress_notes);
    }
    if (teamlead_reply !== undefined) {
      fields.push("teamlead_reply = ?");
      values.push(teamlead_reply);
    }

    const allowed = ["TODO", "IN_PROGRESS", "COMPLETED", "BLOCKED"];
    let newStatus = null;
    if (status && allowed.includes(String(status).toUpperCase())) {
      newStatus = String(status).toUpperCase();
      fields.push("status = ?");
      values.push(newStatus);
    }

    if (fields.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No fields to update" });
    }

    values.push(id);
    await db.query(
      `UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    const statusActuallyChanged = newStatus && newStatus !== oldStatus;

    if (statusActuallyChanged && before.assigned_by) {
      const pretty =
        {
          TODO: "To Do",
          IN_PROGRESS: "In Progress",
          COMPLETED: "Completed",
          BLOCKED: "Blocked",
        }[newStatus] || newStatus;

      const notesSource =
        typeof progress_notes === "string"
          ? progress_notes
          : before.progress_notes || "";
      const trimmedNotes = notesSource.trim();
      const notesSnippet = trimmedNotes
        ? trimmedNotes.length > 140
          ? trimmedNotes.slice(0, 140) + "…"
          : trimmedNotes
        : "";

      console.log(
        `🔔 Task #${id} status changed ${oldStatus} → ${newStatus} — notifying teamlead_id=${before.assigned_by}`
      );

      await notifyUsers([before.assigned_by], {
        ticket_id: before.project_id,
        title: `Task "${before.title}" — ${pretty}`,
        message:
          `Task "${before.title}" on project "${before.project_name}" ` +
          `was marked as ${pretty}.` +
          (notesSnippet ? ` Notes: ${notesSnippet}` : ""),
        type: "TASK_UPDATED",
      });
    }

    return res.json({
      success: true,
      message: "Task updated successfully",
      data: { id: Number(id), status: newStatus ?? oldStatus },
    });
  } catch (err) {
    console.error("Update task error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update task",
      error: err.message,
    });
  }
});

/* =========================================================
   DELETE /api/tasks/:id
   ========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM tasks WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }
    return res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (err) {
    console.error("Delete task error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete task",
      error: err.message,
    });
  }
});

module.exports = router;