const Application = require("../models/Application");
const Document = require("../models/Document");
const User = require("../models/User");
const PDFDocument = require("pdfkit");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

function getFinancialYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4) return `${year}-${year + 1}`;
  else return `${year - 1}-${year}`;
}

async function generateCertificate(app, userName) {
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
          public_id: `certificate_officer_${app._id}`,
          format: "pdf",
          access_mode: "public"
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

    if (app.service_type === "domicile_certificate") {
      // Domicile Certificate PDF
      const certId = `DC-${app._id.toString().toUpperCase().slice(-8)}-${new Date().getFullYear()}`;
      const fullAddress = [app.dc_house_no, app.dc_street, app.dc_city, app.dc_district, app.dc_state, app.dc_pin].filter(Boolean).join(", ");

      doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();
      doc.fontSize(22).font("Helvetica-Bold").text("GOVERNMENT OF INDIA", { align: "center" });
      doc.fontSize(16).font("Helvetica").text("Domicile Certificate", { align: "center" });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
      doc.moveDown(1);
      doc.fontSize(13).font("Helvetica-Bold").text("CERTIFICATE OF DOMICILE / RESIDENCE");
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica").text("This is to certify that:");
      doc.moveDown(0.5);
      doc.fontSize(12).font("Helvetica-Bold").text("Name: ", { continued: true }).font("Helvetica").text(app.dc_full_name || userName || "-");
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
      doc.fontSize(9).font("Helvetica").fillColor("grey").text(`QR Verification: DOMICILE-${certId}`, { align: "center" });
      doc.fillColor("black").moveDown(0.5);
      doc.fontSize(11).font("Helvetica").text(`This certificate confirms that the above-named individual is a domicile/resident of ${app.dc_state || "[State]"}. Approved by officer.`, { align: "justify" });
      doc.moveDown(2);
      doc.fontSize(12).font("Helvetica-Bold").text("Authorized Signatory", { align: "right" });
      doc.fontSize(11).font("Helvetica").text("Senate Bot — Government Services", { align: "right" });
      doc.fontSize(9).font("Helvetica").fillColor("grey").text(`Certificate generated on ${new Date().toISOString()}`, { align: "center" });
    } else {
      // Income / Birth / generic certificate PDF
      doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();
      doc.fontSize(22).font("Helvetica-Bold").text("GOVERNMENT OF INDIA", { align: "center" });
      doc.fontSize(16).font("Helvetica").text("Income Certificate", { align: "center" });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
doc.moveDown(0.5);
      doc.moveDown(1);
      doc.fontSize(13).font("Helvetica-Bold").text("CERTIFICATE OF INCOME");
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica").text("This is to certify that:");
      doc.moveDown(0.5);
      doc.fontSize(12).font("Helvetica-Bold").text("Name: ", { continued: true }).font("Helvetica").text(userName || "Applicant");
      doc.fontSize(12).font("Helvetica-Bold").text("Application ID: ", { continued: true }).font("Helvetica").text(app._id.toString());
      if (app.aadhaar_number) {
        doc.fontSize(12).font("Helvetica-Bold").text("Aadhaar No: ", { continued: true }).font("Helvetica").text(app.aadhaar_number);
      }
      doc.fontSize(12).font("Helvetica-Bold").text("Annual Income: ", { continued: true }).font("Helvetica").text(`Rs. ${app.extracted_income?.toLocaleString("en-IN") || "As verified by officer"}`);
      doc.fontSize(12).font("Helvetica-Bold").text("Financial Year: ", { continued: true }).font("Helvetica").text(app.financial_year || getFinancialYear());
      doc.fontSize(12).font("Helvetica-Bold").text("Status: ", { continued: true }).font("Helvetica").text("APPROVED");
      doc.fontSize(12).font("Helvetica-Bold").text("Issue Date: ", { continued: true }).font("Helvetica").text(new Date().toLocaleDateString("en-IN"));
      doc.moveDown(1);
      doc.fontSize(11).font("Helvetica").text("This certificate is issued based on documents submitted and verified by officer.", { align: "justify" });
      doc.moveDown(2);
      doc.fontSize(12).font("Helvetica-Bold").text("Authorized Signatory", { align: "right" });
      doc.fontSize(11).font("Helvetica").text("Senate Bot — Government Services", { align: "right" });
    }

    doc.end();
  });
}

// GET pending applications with full details
exports.getPendingApplications = async (req, res) => {
  try {
    const apps = await Application.find({
      status: { $in: ["sent_to_officer", "documents_uploaded"] }
    }).sort({ createdAt: -1 });

    // Enrich with user details
    const enriched = await Promise.all(apps.map(async (app) => {
      const user = await User.findById(app.user_id).select("name email phone createdAt");
      const docs = await Document.find({ application_id: app._id.toString() });

      return {
        _id: app._id,
        service_type: app.service_type,
        status: app.status,
        financial_year: app.financial_year,
        entered_income: app.entered_income,
        extracted_income: app.extracted_income,
        aadhaar_number: app.aadhaar_number,
        name_from_chat: app.name_from_chat,
        mobile_from_chat: app.mobile_from_chat,
        applying_for: app.applying_for || "self",
        beneficiary_relationship: app.beneficiary_relationship || (app.applying_for === "other" ? "Other" : "Self"),
        beneficiary_name: app.beneficiary_name || app.name_from_chat || app.dc_full_name || app.child_name || (user ? user.name : "Applicant"),
        child_name: app.child_name,
        dob: app.dob,
        place_of_birth: app.place_of_birth,
        father_name: app.father_name,
        mother_name: app.mother_name,
        bc_mobile: app.bc_mobile,
        bc_flags: app.bc_flags,
        bc_confidence_score: app.bc_confidence_score,
        bc_risk_level: app.bc_risk_level,
        bc_parent_detected: app.bc_parent_detected,
        bc_birth_proof_ocr: app.bc_birth_proof_ocr,
        bc_aadhaar_ocr: app.bc_aadhaar_ocr,
        // Domicile Certificate fields
        dc_full_name: app.dc_full_name,
        dc_mobile: app.dc_mobile,
        dc_aadhaar_last4: app.dc_aadhaar_last4,
        dc_dob: app.dc_dob,
        dc_house_no: app.dc_house_no,
        dc_street: app.dc_street,
        dc_city: app.dc_city,
        dc_district: app.dc_district,
        dc_state: app.dc_state,
        dc_pin: app.dc_pin,
        dc_duration_years: app.dc_duration_years,
        dc_purpose: app.dc_purpose,
        dc_flags: app.dc_flags,
        dc_confidence_score: app.dc_confidence_score,
        dc_risk_level: app.dc_risk_level,
        dc_assigned_officer: app.dc_assigned_officer,
        dc_jurisdiction_flag: app.dc_jurisdiction_flag,
        dc_aadhaar_ocr: app.dc_aadhaar_ocr,
        dc_address_proof_ocr: app.dc_address_proof_ocr,
        dc_residency_proof_ocr: app.dc_residency_proof_ocr,
        officer_note: app.officer_note,
        auto_decision: app.auto_decision,
        certificate_url: app.certificate_url,
        createdAt: app.createdAt,
        user: user ? {
          name: user.name,
          email: user.email,
          phone: user.phone,
          createdAt: user.createdAt
        } : null,
        documents: docs.map(d => ({
          file_type: d.file_type,
          file_url: d.file_url
        }))
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
};

// GET all applications with full details
exports.getAllApplications = async (req, res) => {
  try {
    const apps = await Application.find().sort({ createdAt: -1 });

    const enriched = await Promise.all(apps.map(async (app) => {
      const user = await User.findById(app.user_id).select("name email phone createdAt");
      const docs = await Document.find({ application_id: app._id.toString() });

      return {
        _id: app._id,
        service_type: app.service_type,
        status: app.status,
        financial_year: app.financial_year,
        entered_income: app.entered_income,
        extracted_income: app.extracted_income,
        aadhaar_number: app.aadhaar_number,
        name_from_chat: app.name_from_chat,
        mobile_from_chat: app.mobile_from_chat,
        applying_for: app.applying_for || "self",
        beneficiary_relationship: app.beneficiary_relationship || (app.applying_for === "other" ? "Other" : "Self"),
        beneficiary_name: app.beneficiary_name || app.name_from_chat || app.dc_full_name || app.child_name || (user ? user.name : "Applicant"),
        child_name: app.child_name,
        dob: app.dob,
        place_of_birth: app.place_of_birth,
        father_name: app.father_name,
        mother_name: app.mother_name,
        bc_mobile: app.bc_mobile,
        bc_flags: app.bc_flags,
        bc_confidence_score: app.bc_confidence_score,
        bc_risk_level: app.bc_risk_level,
        bc_parent_detected: app.bc_parent_detected,
        bc_birth_proof_ocr: app.bc_birth_proof_ocr,
        bc_aadhaar_ocr: app.bc_aadhaar_ocr,
        // Domicile Certificate fields
        dc_full_name: app.dc_full_name,
        dc_mobile: app.dc_mobile,
        dc_aadhaar_last4: app.dc_aadhaar_last4,
        dc_dob: app.dc_dob,
        dc_house_no: app.dc_house_no,
        dc_street: app.dc_street,
        dc_city: app.dc_city,
        dc_district: app.dc_district,
        dc_state: app.dc_state,
        dc_pin: app.dc_pin,
        dc_duration_years: app.dc_duration_years,
        dc_purpose: app.dc_purpose,
        dc_flags: app.dc_flags,
        dc_confidence_score: app.dc_confidence_score,
        dc_risk_level: app.dc_risk_level,
        dc_assigned_officer: app.dc_assigned_officer,
        dc_jurisdiction_flag: app.dc_jurisdiction_flag,
        dc_aadhaar_ocr: app.dc_aadhaar_ocr,
        dc_address_proof_ocr: app.dc_address_proof_ocr,
        dc_residency_proof_ocr: app.dc_residency_proof_ocr,
        officer_note: app.officer_note,
        auto_decision: app.auto_decision,
        certificate_url: app.certificate_url,
        createdAt: app.createdAt,
        user: user ? {
          name: user.name,
          email: user.email,
          phone: user.phone,
          createdAt: user.createdAt
        } : null,
        documents: docs.map(d => ({
          file_type: d.file_type,
          file_url: d.file_url
        }))
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
};

exports.getApplicationDocuments = async (req, res) => {
  try {
    const docs = await Document.find({ application_id: req.params.id });
    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch documents" });
  }
};

exports.approveApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const app = await Application.findById(id);
    if (!app) return res.status(404).json({ error: "Application not found" });

    const user = await User.findById(app.user_id);
    const userName = app.beneficiary_name || app.name_from_chat || app.dc_full_name || app.child_name || (user ? user.name : "Applicant");

    console.log("Generating certificate for officer approval:", userName);
    const certificateUrl = await generateCertificate(app, userName);

    await Application.findByIdAndUpdate(id, {
      status: "approved",
      certificate_url: certificateUrl,
      officer_note: req.body.note || "Approved by officer"
    });

    res.json({ message: "Application approved", certificate_url: certificateUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Approval failed: " + error.message });
  }
};

exports.rejectApplication = async (req, res) => {
  try {
    const { id } = req.params;
    await Application.findByIdAndUpdate(id, {
      status: "rejected",
      officer_note: req.body.note || "Rejected by officer"
    });
    res.json({ message: "Application rejected" });
  } catch (error) {
    res.status(500).json({ error: "Rejection failed" });
  }
};