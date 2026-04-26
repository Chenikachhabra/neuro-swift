const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Connect MongoDB ───────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ══════════════════════════════════════════════════════════
//  SCHEMAS
// ══════════════════════════════════════════════════════════
const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  },
  { timestamps: true },
);

const reportSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, unique: true },
    patientName: { type: String, required: true },
    patientAge: { type: String, default: "" },
    doctorName: { type: String },
    doctorEmail: { type: String },
    diagnosis: { type: String },
    confidences: { type: Array, default: [] },
    filename: { type: String },
    reportPdfBase64: { type: String, default: "" },
  },
  { timestamps: true },
);

const Doctor = mongoose.model("Doctor", doctorSchema);
const Report = mongoose.model("Report", reportSchema);

function buildReportPDFBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fontSize(22)
      .fillColor("#1E3A8A")
      .text("NeuroSwift Clinical Report", { align: "left" });
    doc
      .moveDown(0.25)
      .fontSize(10)
      .fillColor("#334155")
      .text("AI-assisted intracranial hemorrhage screening report");

    doc.moveDown(1);
    doc
      .fontSize(11)
      .fillColor("#0F172A")
      .text(`Patient ID: ${report.patientId || "N/A"}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.text(`Patient Name: ${report.patientName || "N/A"}`);
    doc.text(`Patient Age: ${report.patientAge || "N/A"}`);
    doc.text(`Doctor: ${report.doctorName || "N/A"} (${report.doctorEmail || "N/A"})`);
    doc.text(`Scan File: ${report.filename || "N/A"}`);

    doc.moveDown(1);
    doc.fontSize(13).fillColor("#1E3A8A").text("Diagnosis");
    doc
      .fontSize(11)
      .fillColor("#0F172A")
      .text(report.diagnosis || "No diagnosis available");

    doc.moveDown(1);
    doc.fontSize(13).fillColor("#1E3A8A").text("Subtype Confidence Breakdown");
    if (!Array.isArray(report.confidences) || report.confidences.length === 0) {
      doc.fontSize(11).fillColor("#475569").text("No subtype confidence data available.");
    } else {
      report.confidences.forEach((item) => {
        const pct = Math.round((item?.confidence || 0) * 100);
        doc
          .fontSize(11)
          .fillColor("#0F172A")
          .text(`${item?.label || "Unknown"}: ${pct}%`);
      });
    }

    doc.moveDown(1.25);
    doc
      .fontSize(9)
      .fillColor("#64748B")
      .text(
        "Disclaimer: This report is AI-generated for assistive and research use only. Clinical decisions must be made by a licensed medical professional.",
      );

    doc.end();
  });
}

// ══════════════════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ══════════════════════════════════════════════════════════
function protect(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Not authorized" });
  try {
    req.doctor = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalid or expired" });
  }
}

// ══════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Register doctor
app.post("/api/doctor/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "All fields required" });

    const exists = await Doctor.findOne({ email });
    if (exists)
      return res.status(400).json({ error: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const doctor = await Doctor.create({ name, email, password: hashed });
    res.status(201).json({ message: "Doctor registered", email: doctor.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login doctor
app.post("/api/doctor/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const doctor = await Doctor.findOne({ email });
    if (!doctor)
      return res.status(404).json({ error: "No doctor found with this email" });

    const match = await bcrypt.compare(password, doctor.password);
    if (!match) return res.status(401).json({ error: "Incorrect password" });

    const token = jwt.sign(
      { id: doctor._id, email: doctor.email, name: doctor.name },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );
    res.json({ token, name: doctor.name, email: doctor.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save report
app.post("/api/reports", protect, async (req, res) => {
  try {
    const { patientName, patientAge, diagnosis, confidences, filename, reportPdfBase64 } =
      req.body;
    if (!patientName || !diagnosis)
      return res
        .status(400)
        .json({ error: "Patient name and diagnosis required" });

    // Generate unique 6-char patient ID
    let patientId, exists;
    do {
      patientId = Math.random().toString(36).substring(2, 8).toUpperCase();
      exists = await Report.findOne({ patientId });
    } while (exists);

    const report = await Report.create({
      patientId,
      patientName,
      patientAge: patientAge || "",
      diagnosis,
      confidences: confidences || [],
      filename: filename || "",
      reportPdfBase64: reportPdfBase64 || "",
      doctorName: req.doctor.name,
      doctorEmail: req.doctor.email,
    });

    res.status(201).json({ patientId: report.patientId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get report by patient ID (public)
app.get("/api/reports/:patientId", async (req, res) => {
  try {
    const report = await Report.findOne({
      patientId: req.params.patientId.toUpperCase(),
    });
    if (!report) return res.status(404).json({ error: "Report not found" });
    const response = report.toObject();
    delete response.reportPdfBase64;
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download report as PDF by patient ID
app.get("/api/reports/:patientId/pdf", async (req, res) => {
  try {
    const report = await Report.findOne({
      patientId: req.params.patientId.toUpperCase(),
    });
    if (!report) return res.status(404).json({ error: "Report not found" });

    let pdfBuffer;
    if (report.reportPdfBase64) {
      pdfBuffer = Buffer.from(report.reportPdfBase64, "base64");
    } else {
      pdfBuffer = await buildReportPDFBuffer(report);
      report.reportPdfBase64 = pdfBuffer.toString("base64");
      await report.save();
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=NeuroSwift_Report_${report.patientId}.pdf`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Get all reports for logged in doctor
app.get("/api/doctor/reports", protect, async (req, res) => {
  try {
    const reports = await Report.find({ doctorEmail: req.doctor.email })
      .sort({ createdAt: -1 })
      .select("patientId patientName patientAge diagnosis confidences createdAt");
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete report (doctor only)
app.delete("/api/reports/:patientId", protect, async (req, res) => {
  try {
    const report = await Report.findOne({
      patientId: req.params.patientId.toUpperCase(),
      doctorEmail: req.doctor.email,
    });
    if (!report)
      return res.status(404).json({ error: "Report not found or not yours" });

    await report.deleteOne();
    res.json({ message: "Report deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
