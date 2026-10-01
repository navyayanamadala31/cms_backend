const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

/* =========================================================
   POST /api/admins
   Create an Admin or TeamLead
   Body: { name, email, phone, password, role }
   role: "admin" | "teamlead"
   ========================================================= */
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    // ---- Validation ----
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "name, email and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const allowedRoles = ["admin", "teamlead"];
    const finalRole = role && allowedRoles.includes(role) ? role : "admin";

    // ---- Duplicate check ----
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists"
      });
    }

    // ---- Hash password ----
    const hashedPassword = await bcrypt.hash(password, 10);

    // ---- Insert ----
    const [result] = await db.query(
      `INSERT INTO users (name, email, phone, password, role)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, phone || null, hashedPassword, finalRole]
    );

    return res.status(201).json({
      success: true,
      message: `${finalRole === "teamlead" ? "Team Lead" : "Admin"} created successfully`,
      data: {
        id: result.insertId,
        name,
        email,
        phone: phone || null,
        role: finalRole
      }
    });
  } catch (err) {
    console.error("Create admin error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create admin",
      error: err.message
    });
  }
});

/* =========================================================
   GET /api/admins
   List all admins & teamleads
   Query: ?role=admin | teamlead | all
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const { role } = req.query;

    let sql = `SELECT id, name, email, phone, role, status, created_at
               FROM users
               WHERE role IN ('admin', 'teamlead')`;
    const params = [];

    if (role && ["admin", "teamlead"].includes(role)) {
      sql += " AND role = ?";
      params.push(role);
    }

    sql += " ORDER BY created_at DESC";

    const [rows] = await db.query(sql, params);

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("List admins error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admins",
      error: err.message
    });
  }
});

/* =========================================================
   GET /api/admins/:id
   ========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, status, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Get admin error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin",
      error: err.message
    });
  }
});

/* =========================================================
   PUT /api/admins/:id
   Update admin / teamlead (optional: password, role, status)
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password, role, status } = req.body;

    const [existing] = await db.query(
      "SELECT id FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const fields = [];
    const values = [];

    if (name) { fields.push("name = ?"); values.push(name); }
    if (email) { fields.push("email = ?"); values.push(email); }
    if (phone !== undefined) { fields.push("phone = ?"); values.push(phone); }
    if (role && ["admin", "teamlead"].includes(role)) {
      fields.push("role = ?"); values.push(role);
    }
    if (status && ["active", "inactive"].includes(status)) {
      fields.push("status = ?"); values.push(status);
    }
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters"
        });
      }
      const hashed = await bcrypt.hash(password, 10);
      fields.push("password = ?");
      values.push(hashed);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update"
      });
    }

    values.push(id);
    await db.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    return res.json({ success: true, message: "User updated successfully" });
  } catch (err) {
    console.error("Update admin error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update admin",
      error: err.message
    });
  }
});

/* =========================================================
   DELETE /api/admins/:id
   ========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM users WHERE id = ? AND role IN ('admin', 'teamlead')",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete admin error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete admin",
      error: err.message
    });
  }
});


/* =========================================================
   POST /api/admins/login
   Body: { email, password }
   Only allows role === 'admin'
   ========================================================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
    const [rows] = await db.query(
      `SELECT id, name, email, phone, password, role, status
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = rows[0];

    // Compare password with hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Role check — only admin allowed on this endpoint
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not an admin.",
      });
    }

    // Status check
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact superadmin.",
      });
    }

    // Return user info (never return password)
    return res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      // Simple token — replace with JWT later if you want
      token: `admin-${user.id}-${Date.now()}`,
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: err.message,
    });
  }
});

module.exports = router;