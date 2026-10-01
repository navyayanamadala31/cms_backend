const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

// ============== Middleware ==============
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============== Static uploads ==============
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ============== Routes ==============
const adminRoutes = require("./routes/admins");
const teamleadRoutes = require("./routes/teamleads");
const ticketRoutes = require("./routes/tickets");
const notificationRoutes = require("./routes/notifications");

app.use("/api/admins", adminRoutes);
app.use("/api/teamleads", teamleadRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/notifications", notificationRoutes);
// ============== Health check ==============
app.get("/api/health", (_req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// ============== Error handler ==============
app.use((err, _req, res, _next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message,
  });
});

// ============== Start ==============
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Admin API:     http://localhost:${PORT}/api/admins`);
  console.log(`📝 Team Lead API: http://localhost:${PORT}/api/teamleads`);
  console.log(`📝 Tickets API:   http://localhost:${PORT}/api/tickets`);
  console.log(`📝 Tickets API:   http://localhost:${PORT}/api/notifications`);
});