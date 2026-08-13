/**
 * domicileController.js
 * Handles Steps 4-10 of the Domicile Certificate flow:
 *   Step 4  — Sequential document upload (Aadhaar → Address Proof → Residency Proof)
 *   Step 5  — Document quality check
 *   Step 6  — OCR extraction via Groq Vision
 *   Step 7  — Identity verification (3-way name match + duplicate check)
 *   Step 8  — Address verification
 *   Step 9  — Residency duration verification
 *   Step 10 — Eligibility decision (auto-approve / officer / direct-reject)
 */

const Application = require("../models/Application");
const Document = require("../models/Document");
const Groq = require("groq-sdk");
const axios = require("axios");
const stringSimilarity = require("string-similarity");
const PDFDocument = require("pdfkit");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MAX_RETRIES = 3;
const MIN_AUTO_CONFIDENCE = 85;
const MIN_OCR_CONFIDENCE = 55;
const MIN_RESIDENCY_YEARS = 15;

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

async function urlToBase64(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: 10 * 1024 * 1024,
  });
  return {
    base64: Buffer.from(response.data).toString("base64"),
    mimeType: response.headers["content-type"],
  };
}

function parseAgeFromDOB(dobStr) {
  // Accepts DD/MM/YYYY
  if (!dobStr) return null;
  const parts = dobStr.split("/");
  if (parts.length !== 3) return null;
  const dob = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  if (isNaN(dob)) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function yearsSinceDate(dateStr) {
  // Accepts YYYY or DD/MM/YYYY
  if (!dateStr) return null;
  let year;
  if (/^\d{4}$/.test(dateStr.trim())) {
    year = parseInt(dateStr.trim(), 10);
  } else {
    const parts = dateStr.split("/");
    if (parts.length === 3) year = parseInt(parts[2], 10);
    else if (parts.length === 1) year = parseInt(parts[0], 10);
  }
  if (!year || isNaN(year)) return null;
  return new Date().getFullYear() - year;
}

// ─────────────────────────────────────────────────────────────
// Simple PIN → jurisdiction lookup
// ─────────────────────────────────────────────────────────────
const jurisdictionDB = {
  "400": { state: "Maharashtra", district: "Mumbai", taluka: "Mumbai City", officer: "SDM Mumbai City" },
  "411": { state: "Maharashtra", district: "Pune", taluka: "Pune City", officer: "SDM Pune" },
  "440": { state: "Maharashtra", district: "Nagpur", taluka: "Nagpur City", officer: "SDM Nagpur" },
  "380": { state: "Gujarat", district: "Ahmedabad", taluka: "Ahmedabad City", officer: "SDM Ahmedabad" },
  "110": { state: "Delhi", district: "New Delhi", taluka: "New Delhi", officer: "SDM New Delhi" },
  "500": { state: "Telangana", district: "Hyderabad", taluka: "Hyderabad Central", officer: "SDM Hyderabad" },
  "600": { state: "Tamil Nadu", district: "Chennai", taluka: "Chennai Central", officer: "SDM Chennai" },
  "560": { state: "Karnataka", district: "Bengaluru Urban", taluka: "Bengaluru", officer: "SDM Bengaluru" },
  "700": { state: "West Bengal", district: "Kolkata", taluka: "Kolkata", officer: "SDM Kolkata" },
  "302": { state: "Rajasthan", district: "Jaipur", taluka: "Jaipur", officer: "SDM Jaipur" },
  "226": { state: "Uttar Pradesh", district: "Lucknow", taluka: "Lucknow", officer: "SDM Lucknow" },
  "800": { state: "Bihar", district: "Patna", taluka: "Patna Sadar", officer: "SDM Patna" },
};

function lookupJurisdiction(pin) {
  if (!pin || pin.length < 3) return null;
  return jurisdictionDB[pin.substring(0, 3)] || null;
}

// ─────────────────────────────────────────────────────────────
// Step 5 + 6 — Groq Vision OCR functions
// ─────────────────────────────────────────────────────────────

async function extractAadhaarForDomicile(fileUrl) {
  try {
    const lowerUrl = fileUrl.toLowerCase();
    if (lowerUrl.includes(".pdf") || (lowerUrl.includes("raw/upload") && !lowerUrl.match(/\.(jpg|jpeg|png)(\?|$)/i))) {
      return { error: "PDF Aadhaar cannot be scanned. Please upload JPG or PNG." };
    }
    const { base64, mimeType } = await urlToBase64(fileUrl);
    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          {
            type: "text",
            text: `This is an Aadhaar card issued by UIDAI (India). Extract and reply ONLY this JSON:
{
  "is_aadhaar": true,
  "name": "Full Name",
  "aadhaar_last4": "9012",
  "dob": "DD/MM/YYYY",
  "house_no": "House/Flat number",
  "street": "Street/Area/Locality",
  "city": "City/Village",
  "district": "District",
  "state": "State",
  "pin": "6-digit PIN",
  "ocr_confidence": 85,
  "quality_issues": []
}
IMPORTANT: Set is_aadhaar to true if you can see UIDAI, Aadhaar logo, or an Indian government ID with name and date of birth.
Always attempt to extract all fields even if the image is slightly imperfect or at an angle.
Only add to quality_issues (e.g. "blurry", "tampered") if the text is COMPLETELY unreadable - do NOT flag normal photos as blurry.
Set unknown fields to null.
If this is clearly NOT an Aadhaar card (e.g. a random photo, different document), reply: {"is_aadhaar": false}`
          }
        ]
      }]
    });
    const raw = completion.choices[0].message.content;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { error: "Could not parse Aadhaar OCR response" };
    return JSON.parse(match[0]);
  } catch (err) {
    return { error: "Could not process Aadhaar: " + err.message };
  }
}

async function extractAddressProof(fileUrl) {
  try {
    const lowerUrl = fileUrl.toLowerCase();
    const isPdf = lowerUrl.includes(".pdf") || (lowerUrl.includes("raw/upload") && !lowerUrl.match(/\.(jpg|jpeg|png)(\?|$)/i));
    if (isPdf) {
      // For PDFs we return a partial result indicating manual review
      return { is_address_doc: true, name: null, address: null, issue_date: null, doc_type: "PDF Document", ocr_confidence: 65, quality_issues: [] };
    }
    const { base64, mimeType } = await urlToBase64(fileUrl);
    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          {
            type: "text",
            text: `This is an address proof document (Voter ID, Electricity Bill, Ration Card, Passport, Rent Agreement, etc).
Extract and reply ONLY this JSON:
{
  "is_address_doc": true,
  "doc_type": "Voter ID / Electricity Bill / Ration Card / Passport / Rent Agreement / Other",
  "name": "Full Name on document",
  "full_address": "Complete address as printed",
  "city": "City/Village",
  "district": "District",
  "state": "State",
  "pin": "6-digit PIN if visible",
  "issue_date": "DD/MM/YYYY or MM/YYYY or YYYY",
  "ocr_confidence": 85,
  "quality_issues": []
}
quality_issues: "blurry", "cropped", "tampered", "low_resolution"
If NOT an address document reply: {"is_address_doc": false}
Set unknown fields to null.`
          }
        ]
      }]
    });
    const raw = completion.choices[0].message.content;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { error: "Could not parse address proof response" };
    return JSON.parse(match[0]);
  } catch (err) {
    return { error: "Could not process address proof: " + err.message };
  }
}

async function extractResidencyProof(fileUrl) {
  try {
    const lowerUrl = fileUrl.toLowerCase();
    const isPdf = lowerUrl.includes(".pdf") || (lowerUrl.includes("raw/upload") && !lowerUrl.match(/\.(jpg|jpeg|png)(\?|$)/i));
    if (isPdf) {
      return { is_residency_doc: true, name: null, address: null, issue_year: null, doc_type: "PDF Document", ocr_confidence: 65, quality_issues: [] };
    }
    const { base64, mimeType } = await urlToBase64(fileUrl);
    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          {
            type: "text",
            text: `This is a long-term residency proof document (School/College Leaving Certificate, Old Ration Card, Property Tax Receipt, Old Electricity Bills, Bank Passbook, Voter ID).
Extract and reply ONLY this JSON:
{
  "is_residency_doc": true,
  "doc_type": "School Certificate / Old Ration Card / Property Tax / Electricity Bill / Bank Passbook / Voter ID / Other",
  "name": "Name on document",
  "address": "Address on document",
  "state": "State",
  "issue_year": "YYYY (earliest/oldest year on document)",
  "ocr_confidence": 85,
  "quality_issues": []
}
quality_issues: "blurry", "cropped", "tampered", "low_resolution"
If NOT a residency document reply: {"is_residency_doc": false}
Set unknown fields to null.`
          }
        ]
      }]
    });
    const raw = completion.choices[0].message.content;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { error: "Could not parse residency proof response" };
    return JSON.parse(match[0]);
  } catch (err) {
    return { error: "Could not process residency proof: " + err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Certificate Generator
// ─────────────────────────────────────────────────────────────

async function generateDomicileCertificate(app) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder: "senate_bot_certificates",
          public_id: `domicile_certificate_${app._id}`,
          format: "pdf",
          access_mode: "public",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }
      );
      const readable = new Readable();
      readable.push(pdfBuffer);
      readable.push(null);
      readable.pipe(stream);
    });

    const certId = `DC-${app._id.toString().toUpperCase().slice(-8)}-${new Date().getFullYear()}`;
    const fullAddress = [app.dc_house_no, app.dc_street, app.dc_city, app.dc_district, app.dc_state, app.dc_pin]
      .filter(Boolean).join(", ");

    // Border
    doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text("GOVERNMENT OF INDIA", { align: "center" });
    doc.fontSize(16).font("Helvetica").text("Domicile Certificate", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(1);

    doc.fontSize(13).font("Helvetica-Bold").text("CERTIFICATE OF DOMICILE / RESIDENCE");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica").text("This is to certify that:");
    doc.moveDown(0.5);

    doc.fontSize(12).font("Helvetica-Bold").text("Name: ", { continued: true }).font("Helvetica").text(app.dc_full_name || "-");
    doc.fontSize(12).font("Helvetica-Bold").text("Aadhaar (Last 4): ", { continued: true }).font("Helvetica").text(app.dc_aadhaar_last4 || "-");
    doc.fontSize(12).font("Helvetica-Bold").text("Date of Birth: ", { continued: true }).font("Helvetica").text(app.dc_dob || "-");
    doc.moveDown(0.5);

    doc.fontSize(12).font("Helvetica-Bold").text("Permanent Address:");
    doc.fontSize(12).font("Helvetica").text(fullAddress || "-");
    doc.moveDown(0.5);

    doc.fontSize(12).font("Helvetica-Bold").text("Duration of Residence: ", { continued: true }).font("Helvetica").text(`${app.dc_duration_years || "-"} years`);
    doc.fontSize(12).font("Helvetica-Bold").text("Purpose: ", { continued: true }).font("Helvetica").text(app.dc_purpose || "-");
    doc.fontSize(12).font("Helvetica-Bold").text("State of Domicile: ", { continued: true }).font("Helvetica").text(app.dc_state || "-");
    doc.moveDown(0.5);

    doc.fontSize(12).font("Helvetica-Bold").text("Certificate ID: ", { continued: true }).font("Helvetica").text(certId);
    doc.fontSize(12).font("Helvetica-Bold").text("Application ID: ", { continued: true }).font("Helvetica").text(app._id.toString());
    doc.fontSize(12).font("Helvetica-Bold").text("Issue Date: ", { continued: true }).font("Helvetica").text(new Date().toLocaleDateString("en-IN"));
    doc.moveDown(1);

    doc.fontSize(9).font("Helvetica").fillColor("grey")
      .text(`QR Verification: DOMICILE-${certId}`, { align: "center" });
    doc.moveDown(0.5);

    doc.fillColor("black").fontSize(11).font("Helvetica")
      .text("This certificate confirms that the above-named individual is a domicile/resident of the state of " +
        (app.dc_state || "[State]") + " and is issued based on verified documents.", { align: "justify" });
    doc.moveDown(2);

    doc.fontSize(12).font("Helvetica-Bold").text("Authorized Signatory", { align: "right" });
    doc.fontSize(11).font("Helvetica").text("Senate Bot — Government Services", { align: "right" });
    doc.moveDown(1);
    doc.fontSize(9).font("Helvetica").fillColor("grey")
      .text(`Certificate generated on ${new Date().toISOString()}`, { align: "center" });

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Main upload handler
// ─────────────────────────────────────────────────────────────

exports.uploadDocument = async (req, res) => {
  try {
    const { application_id } = req.body;
    const app = await Application.findById(application_id);
    if (!app) return res.status(404).json({ status: "error", message: "Application not found" });

    if (!req.files || !req.files.document) {
      return res.status(400).json({ status: "error", message: "Document file is required." });
    }

    const file = Array.isArray(req.files.document) ? req.files.document[0] : req.files.document;
    const fileUrl = file.path;
    const fileSizeBytes = file.size || 0;

    // 5 MB limit
    if (fileSizeBytes > 5 * 1024 * 1024) {
      return res.json({ status: "error", message: "File exceeds 5 MB limit. Please upload a smaller file." });
    }

    // ─── STEP 4A: Aadhaar Card ───────────────────────────────
    if (app.status === "dc_waiting_for_aadhaar") {
      const ocr = await extractAadhaarForDomicile(fileUrl);

      if (ocr.error) {
        app.dc_aadhaar_retry = (app.dc_aadhaar_retry || 0) + 1;
        if (app.dc_aadhaar_retry >= MAX_RETRIES) {
          app.dc_flags.push("INVALID_DOCUMENT (Aadhaar)");
          app.status = "sent_to_officer";
          app.dc_risk_level = "HIGH";
          await app.save();
          return res.json({ status: "sent_to_officer", message: "Could not process Aadhaar after multiple attempts. Sent for manual review." });
        }
        await app.save();
        return res.json({ status: "retry", message: `Could not read Aadhaar card. Please upload a clear JPG or PNG photo (not a PDF). (Attempt ${app.dc_aadhaar_retry}/${MAX_RETRIES})` });
      }

      if (!ocr.is_aadhaar) {
        app.dc_aadhaar_retry = (app.dc_aadhaar_retry || 0) + 1;
        if (app.dc_aadhaar_retry >= MAX_RETRIES) {
          app.dc_flags.push("INVALID_DOCUMENT (Aadhaar)");
          app.status = "sent_to_officer";
          app.dc_risk_level = "HIGH";
          await app.save();
          return res.json({ status: "sent_to_officer", message: "Invalid Aadhaar document after multiple attempts. Sent for manual review." });
        }
        await app.save();
        return res.json({ status: "retry", message: `The uploaded document does not appear to be an Aadhaar card. Please upload the correct document. (Attempt ${app.dc_aadhaar_retry}/${MAX_RETRIES})` });
      }

      // Quality issues — just log as a flag, do NOT block processing
      // (AI models tend to over-report quality issues even on clear images)
      if (ocr.quality_issues && ocr.quality_issues.length > 0) {
        app.dc_flags = app.dc_flags || [];
        app.dc_flags.push(`QUALITY_NOTE (Aadhaar): ${ocr.quality_issues.join(", ")}`);
      }

      // Save OCR data
      app.dc_aadhaar_ocr = ocr;
      app.dc_aadhaar_last4 = ocr.aadhaar_last4 || null;
      app.dc_dob = ocr.dob || null;

      const confidence = ocr.ocr_confidence || 80;
      if (confidence < MIN_OCR_CONFIDENCE) {
        app.dc_flags.push("LOW_CONFIDENCE_OCR (Aadhaar)");
      }

      await Document.create({
        application_id: app._id,
        user_id: app.user_id,
        file_url: fileUrl,
        file_type: "domicile_aadhaar",
        cloudinary_id: file.filename,
      });

      app.status = "dc_waiting_for_address_proof";
      await app.save();

      return res.json({
        status: "continue",
        message: "✅ Aadhaar Card accepted.\n\nNow please upload your Address Proof.\nAccepted: Voter ID, Electricity/Water/Gas Bill (within 3 months), Ration Card, Passport, Rent Agreement.\nFormats: JPG, PNG, PDF — max 5MB",
        next_step: 2,
        show_domicile_upload: true,
        application_id: app._id.toString(),
      });
    }

    // ─── STEP 4B: Address Proof ──────────────────────────────
    if (app.status === "dc_waiting_for_address_proof") {
      const ocr = await extractAddressProof(fileUrl);

      if (ocr.error) {
        app.dc_addr_proof_retry = (app.dc_addr_proof_retry || 0) + 1;
        if (app.dc_addr_proof_retry >= MAX_RETRIES) {
          app.dc_flags.push("INVALID_DOCUMENT (Address Proof)");
          app.status = "sent_to_officer";
          app.dc_risk_level = "HIGH";
          await app.save();
          return res.json({ status: "sent_to_officer", message: "Could not process address proof after multiple attempts. Sent for manual review." });
        }
        await app.save();
        return res.json({ status: "retry", message: `Could not read address proof. Please upload a clearer image. (Attempt ${app.dc_addr_proof_retry}/${MAX_RETRIES})` });
      }

      if (!ocr.is_address_doc) {
        app.dc_addr_proof_retry = (app.dc_addr_proof_retry || 0) + 1;
        if (app.dc_addr_proof_retry >= MAX_RETRIES) {
          app.dc_flags.push("INVALID_DOCUMENT (Address Proof)");
          app.status = "sent_to_officer";
          app.dc_risk_level = "HIGH";
          await app.save();
          return res.json({ status: "sent_to_officer", message: "Invalid address proof after multiple attempts. Sent for manual review." });
        }
        await app.save();
        return res.json({ status: "retry", message: `The document does not appear to be a valid address proof. Please upload: Voter ID, Electricity Bill, Ration Card, Passport, or Rent Agreement. (Attempt ${app.dc_addr_proof_retry}/${MAX_RETRIES})` });
      }

      // Utility bill recency check — must be within 3 months (90 days)
      if (ocr.doc_type && /electricity|water|gas|bill/i.test(ocr.doc_type) && ocr.issue_date) {
        // Parse issue_date as a date and check if it's older than 3 months
        const rawDate = ocr.issue_date;
        let issueDate = null;
        // Try DD/MM/YYYY
        const dmyMatch = rawDate.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        if (dmyMatch) issueDate = new Date(`${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`);
        // Try MM/YYYY
        const myMatch = rawDate.match(/(\d{2})[\/\-](\d{4})$/);
        if (!issueDate && myMatch) issueDate = new Date(`${myMatch[2]}-${myMatch[1]}-01`);

        if (issueDate && !isNaN(issueDate)) {
          const daysDiff = (new Date() - issueDate) / (1000 * 60 * 60 * 24);
          if (daysDiff > 90) {
            app.dc_flags.push("OUTDATED_DOCUMENT");
          }
        }
      }

      app.dc_address_proof_ocr = ocr;
      const confidence = ocr.ocr_confidence || 80;
      if (confidence < MIN_OCR_CONFIDENCE) {
        app.dc_flags.push("LOW_CONFIDENCE_OCR (Address Proof)");
      }

      await Document.create({
        application_id: app._id,
        user_id: app.user_id,
        file_url: fileUrl,
        file_type: "domicile_address_proof",
        cloudinary_id: file.filename,
      });

      app.status = "dc_waiting_for_residency_proof";
      await app.save();

      return res.json({
        status: "continue",
        message: "✅ Address Proof accepted.\n\nFinally, please upload your Residency Duration Proof.\nAccepted: School/College Leaving Certificate (showing address), Old Ration Card (15+ years), Property Tax Receipt, Old Electricity Bills, Bank Passbook, Voter ID.\nFormats: JPG, PNG, PDF — max 5MB",
        next_step: 3,
        show_domicile_upload: true,
        application_id: app._id.toString(),
      });
    }

    // ─── STEP 4C: Residency Duration Proof ──────────────────
    if (app.status === "dc_waiting_for_residency_proof") {
      const ocr = await extractResidencyProof(fileUrl);

      if (ocr.error) {
        app.dc_residency_proof_retry = (app.dc_residency_proof_retry || 0) + 1;
        if (app.dc_residency_proof_retry >= MAX_RETRIES) {
          app.dc_flags.push("INVALID_DOCUMENT (Residency Proof)");
          app.status = "sent_to_officer";
          app.dc_risk_level = "HIGH";
          await app.save();
          return res.json({ status: "sent_to_officer", message: "Could not process residency proof after multiple attempts. Sent for manual review." });
        }
        await app.save();
        return res.json({ status: "retry", message: `Could not read residency proof. Please upload a clearer image. (Attempt ${app.dc_residency_proof_retry}/${MAX_RETRIES})` });
      }

      if (!ocr.is_residency_doc) {
        app.dc_residency_proof_retry = (app.dc_residency_proof_retry || 0) + 1;
        if (app.dc_residency_proof_retry >= MAX_RETRIES) {
          app.dc_flags.push("INVALID_DOCUMENT (Residency Proof)");
          app.status = "sent_to_officer";
          app.dc_risk_level = "HIGH";
          await app.save();
          return res.json({ status: "sent_to_officer", message: "Invalid residency proof after multiple attempts. Sent for manual review." });
        }
        await app.save();
        return res.json({ status: "retry", message: `The document does not appear to be a valid residency proof. Please upload: School Certificate, Old Ration Card, Property Tax Receipt, Bank Passbook, or Voter ID. (Attempt ${app.dc_residency_proof_retry}/${MAX_RETRIES})` });
      }

      app.dc_residency_proof_ocr = ocr;
      const confidence = ocr.ocr_confidence || 80;
      if (confidence < MIN_OCR_CONFIDENCE) {
        app.dc_flags.push("LOW_CONFIDENCE_OCR (Residency Proof)");
      }

      await Document.create({
        application_id: app._id,
        user_id: app.user_id,
        file_url: fileUrl,
        file_type: "domicile_residency_proof",
        cloudinary_id: file.filename,
      });

      await app.save();

      // ─── ALL 3 DOCUMENTS COLLECTED — RUN FULL VALIDATION ───
      return await runDomicileValidation(app, res);
    }

    return res.status(400).json({ status: "error", message: "Unexpected application state: " + app.status });

  } catch (err) {
    console.error("Domicile upload error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Steps 7–10: Full validation engine
// ─────────────────────────────────────────────────────────────

async function runDomicileValidation(app, res) {
  const flags = [...(app.dc_flags || [])];
  const aadhaarOcr = app.dc_aadhaar_ocr || {};
  const addrOcr = app.dc_address_proof_ocr || {};
  const residOcr = app.dc_residency_proof_ocr || {};

  const enteredName = (app.dc_full_name || "").toLowerCase().trim();
  const aadhaarName = (aadhaarOcr.name || "").toLowerCase().trim();
  const addrName = (addrOcr.name || "").toLowerCase().trim();

  // ── STEP 9: Residency Duration Verification ──────────────

  // Rule 9.1: Minimum 15 years
  const declaredDuration = app.dc_duration_years || 0;
  if (declaredDuration < MIN_RESIDENCY_YEARS) {
    app.dc_flags = flags;
    app.dc_flags.push("INSUFFICIENT_DURATION");
    app.status = "rejected";
    app.dc_risk_level = "HIGH";
    await app.save();
    return res.json({
      status: "rejected",
      direct_reject: true,
      message: `❌ Domicile Certificate requires a minimum of ${MIN_RESIDENCY_YEARS} years of continuous residence in the state. Your declared stay is ${declaredDuration} year(s) which does not meet the requirement.`,
    });
  }

  // Rule 9.4: Duration cannot exceed age
  const applicantAge = parseAgeFromDOB(app.dc_dob);
  if (applicantAge !== null && declaredDuration > applicantAge) {
    flags.push("IMPOSSIBLE_DURATION");
    app.dc_flags = flags;
    app.status = "rejected";
    app.dc_risk_level = "HIGH";
    await app.save();
    return res.json({
      status: "rejected",
      direct_reject: true,
      message: `❌ Your declared residence duration (${declaredDuration} years) exceeds your age (${applicantAge} years). This is not possible. Please verify the information entered.`,
    });
  }

  // Rule 9.2: Proof years must be ≥ declared duration
  const proofYears = yearsSinceDate(residOcr.issue_year);
  if (proofYears !== null && proofYears < declaredDuration) {
    flags.push("DURATION_PROOF_MISMATCH");
  }

  // Rule 9.3: Cross-document duration consistency
  const addrProofYears = addrOcr.issue_date ? yearsSinceDate(addrOcr.issue_date) : null;
  if (addrProofYears !== null && proofYears !== null) {
    const diff = Math.abs(addrProofYears - proofYears);
    if (diff > 5) flags.push("DURATION_INCONSISTENCY"); // >5 year gap is suspicious
  }

  // ── STEP 8: Address Verification ─────────────────────────

  const enteredState = (app.dc_state || "").toLowerCase().trim();
  const aadhaarState = (aadhaarOcr.state || "").toLowerCase().trim();
  const addrState = (addrOcr.state || "").toLowerCase().trim();

  // Rule 8.1: State match using fuzzy comparison (CRITICAL — direct reject)
  if (aadhaarState && enteredState) {
    const stateSim = stringSimilarity.compareTwoStrings(enteredState, aadhaarState);
    if (stateSim < 0.70) {
      flags.push("STATE_MISMATCH");
      app.dc_flags = flags;
      app.status = "rejected";
      app.dc_risk_level = "HIGH";
      await app.save();
      return res.json({
        status: "rejected",
        direct_reject: true,
        message: `❌ Your Aadhaar address shows ${aadhaarOcr.state || "[unknown]"} but you applied for a ${app.dc_state} domicile. Domicile certificate can only be issued for your state of residence.`,
      });
    }
  }

  // Rule 8.2: District match ≥ 90%
  const enteredDistrict = (app.dc_district || "").toLowerCase();
  const aadhaarDistrict = (aadhaarOcr.district || "").toLowerCase();
  if (enteredDistrict && aadhaarDistrict) {
    const districtSim = stringSimilarity.compareTwoStrings(enteredDistrict, aadhaarDistrict);
    if (districtSim < 0.90) flags.push("DISTRICT_MISMATCH");
  }

  // Rule 8.3: City/area match ≥ 80%
  const enteredCity = (app.dc_city || "").toLowerCase();
  const addrCity = (addrOcr.city || "").toLowerCase();
  const aadhaarCity = (aadhaarOcr.city || "").toLowerCase();
  const cityRef = addrCity || aadhaarCity;
  if (enteredCity && cityRef) {
    const citySim = stringSimilarity.compareTwoStrings(enteredCity, cityRef);
    if (citySim < 0.80) flags.push("ADDRESS_MISMATCH");
  }

  // Rule 8.4: PIN code consistency
  const enteredPin = app.dc_pin || "";
  const aadhaarPin = aadhaarOcr.pin || "";
  if (enteredPin && aadhaarPin && enteredPin !== aadhaarPin) {
    flags.push("PIN_MISMATCH");
    // Re-assign officer based on Aadhaar PIN
    const newJurisdiction = lookupJurisdiction(aadhaarPin);
    if (newJurisdiction) {
      app.dc_assigned_officer = newJurisdiction.officer;
    }
  }

  // Rule 8.5: Cross-document address state check
  if (addrState && aadhaarState && addrState !== aadhaarState) {
    flags.push("DOCUMENT_ADDRESS_INCONSISTENCY");
  }

  // ── STEP 7: Identity Verification ────────────────────────

  // Rule 7.1: Three-way name match (≥ 85%)
  if (enteredName && aadhaarName) {
    const sim1 = stringSimilarity.compareTwoStrings(enteredName, aadhaarName);
    if (sim1 < 0.85) flags.push("IDENTITY_MISMATCH (Entered vs Aadhaar)");
  }
  if (enteredName && addrName) {
    const sim2 = stringSimilarity.compareTwoStrings(enteredName, addrName);
    if (sim2 < 0.85) flags.push("IDENTITY_MISMATCH (Entered vs Address Proof)");
  }
  if (aadhaarName && addrName) {
    const sim3 = stringSimilarity.compareTwoStrings(aadhaarName, addrName);
    if (sim3 < 0.85) flags.push("IDENTITY_MISMATCH (Aadhaar vs Address Proof)");
  }

  // Rule 7.2: Duplicate Domicile check (same Aadhaar last4 + same state already approved)
  if (app.dc_aadhaar_last4 && app.dc_state) {
    const duplicate = await Application.findOne({
      service_type: "domicile_certificate",
      status: "approved",
      dc_aadhaar_last4: app.dc_aadhaar_last4,
      dc_state: app.dc_state,
      _id: { $ne: app._id },
    });
    if (duplicate) {
      flags.push("DUPLICATE_DOMICILE");
      app.dc_flags = flags;
      app.status = "rejected";
      app.dc_risk_level = "HIGH";
      await app.save();
      return res.json({
        status: "rejected",
        direct_reject: true,
        message: `❌ A Domicile Certificate has already been issued for this Aadhaar for ${app.dc_state}. Duplicate applications are not allowed.`,
      });
    }
  }

  // ── STEP 10: Final Decision ───────────────────────────────

  app.dc_flags = flags;

  // Compute overall confidence
  const aadhaarConf = aadhaarOcr.ocr_confidence || 80;
  const addrConf = addrOcr.ocr_confidence || 80;
  const residConf = residOcr.ocr_confidence || 80;
  let avgConfidence = Math.round((aadhaarConf + addrConf + residConf) / 3);
  // Deduct for each flag
  avgConfidence = Math.max(0, avgConfidence - flags.length * 10);
  app.dc_confidence_score = avgConfidence;

  // Risk level
  if (flags.length === 0) app.dc_risk_level = "LOW";
  else if (flags.length === 1) app.dc_risk_level = "MEDIUM";
  else app.dc_risk_level = "HIGH";

  // Case A: Auto-approve
  if (flags.length === 0 && avgConfidence >= MIN_AUTO_CONFIDENCE) {
    const certUrl = await generateDomicileCertificate(app);
    app.certificate_url = certUrl;
    app.status = "approved";
    await app.save();
    return res.json({
      status: "approved",
      message: `🎉 Congratulations! Your Domicile Certificate has been generated.\nCertificate ID: DC-${app._id.toString().toUpperCase().slice(-8)}-${new Date().getFullYear()}\nDownload your certificate below.`,
      certificate_url: certUrl,
    });
  }

  // Case B: Officer review (partial match or flags)
  const jurisdictionInfo = lookupJurisdiction(app.dc_pin || "");
  const officerDistrict = jurisdictionInfo
    ? `${jurisdictionInfo.district} SDM office`
    : "District Administration office";

  app.status = "sent_to_officer";
  await app.save();

  const reason = flags.length >= 2
    ? "PRIORITY REVIEW required — multiple flags raised."
    : "Additional verification required.";

  return res.json({
    status: "sent_to_officer",
    message: `📋 Your application has been submitted for review. ${reason}\nSent to: ${officerDistrict}.\nExpected time: 3-5 working days.`,
    flags,
    risk_level: app.dc_risk_level,
    confidence: avgConfidence,
  });
}
