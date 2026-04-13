const Application = require("../models/Application");
const Document = require("../models/Document");
const SalarySlip = require("../models/SalarySlip");
const Groq = require("groq-sdk");
const axios = require("axios");
const PDFDocument = require("pdfkit");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");
const mongoose = require("mongoose");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const ELIGIBILITY_THRESHOLD = 0.9 * 800000;

function getFinancialYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4) return `${year}-${year + 1}`;
  else return `${year - 1}-${year}`;
}

async function urlToBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024
    });
    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = response.headers["content-type"];
    console.log(`Image size: ${(response.data.byteLength / 1024).toFixed(1)} KB`);
    return { base64, mimeType };
  } catch (err) {
    console.error("urlToBase64 error:", err.message);
    throw new Error("Could not fetch image: " + err.message);
  }
}

function verhoeffValidate(num) {
  const d = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,2,3,4,0,6,7,8,9,5],
    [2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],
    [4,0,1,2,3,9,5,6,7,8],
    [5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],
    [7,6,5,9,8,2,1,0,4,3],
    [8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]
  ];
  const p = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,5,7,6,2,8,3,0,9,4],
    [5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],
    [9,4,5,3,1,2,6,8,7,0],
    [4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],
    [7,0,4,6,9,1,3,2,5,8]
  ];
  const digits = num.toString().split("").reverse().map(Number);
  let c = 0;
  for (let i = 0; i < digits.length; i++) {
    c = d[c][p[i % 8][digits[i]]];
  }
  return c === 0;
}

function validateAadhaarNumber(aadhaar) {
  const cleaned = aadhaar.replace(/\s/g, "");
  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, reason: "Aadhaar number must be exactly 12 digits" };
  }
  if (cleaned[0] === "0" || cleaned[0] === "1") {
    return { valid: false, reason: "Invalid Aadhaar number format" };
  }
  if (!verhoeffValidate(cleaned)) {
    return { valid: false, reason: "Aadhaar number is not valid (checksum failed)" };
  }
  return { valid: true, reason: null };
}

async function extractAadhaarDetails(fileUrl) {
  try {
    if (fileUrl.includes(".pdf") || fileUrl.includes("raw/upload")) {
      return { error: "PDF Aadhaar cannot be scanned. Please upload JPG or PNG." };
    }

    console.log("Fetching aadhaar image for Vision...");
    const { base64, mimeType } = await urlToBase64(fileUrl);
    console.log("Aadhaar image fetched, sending to Groq Vision...");

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` }
          },
          {
            type: "text",
            text: `This should be an Aadhaar card issued by UIDAI Government of India.
Extract the following details.
Reply ONLY this JSON, nothing else:
{
  "is_aadhaar": true,
  "name": "Full Name on card",
  "aadhaar_number": "1234 5678 9012",
  "dob": "DD/MM/YYYY"
}
If this is NOT an Aadhaar card, reply:
{
  "is_aadhaar": false,
  "name": null,
  "aadhaar_number": null,
  "dob": null
}
If any field not found set it to null.`
          }
        ]
      }]
    });

    const raw = completion.choices[0].message.content;
    console.log("Aadhaar Groq response:", raw);

    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return { error: "Could not read Aadhaar card" };

    return JSON.parse(jsonMatch[0]);

  } catch (err) {
    console.error("Aadhaar extraction error:", err.message);
    return { error: "Could not process Aadhaar image: " + err.message };
  }
}

async function extractSalarySlipDetails(fileUrl) {
  try {
    if (fileUrl.includes(".pdf") || fileUrl.includes("raw/upload")) {
      return { error: "PDF salary slip cannot be scanned. Please upload JPG or PNG." };
    }

    console.log("Fetching salary image for Vision...");
    const { base64, mimeType } = await urlToBase64(fileUrl);
    console.log("Salary image fetched, sending to Groq Vision...");

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` }
          },
          {
            type: "text",
            text: `This should be a salary slip or payslip document.
Extract the following details.
Reply ONLY this JSON, nothing else:
{
  "is_salary_slip": true,
  "employee_name": "Full Name",
  "employer_name": "Company Name",
  "unique_number": "slip/payroll unique ID or number",
  "month_year": "MM/YYYY",
  "monthly_salary": 25000,
  "annual_income": 300000
}
If monthly_salary is given but not annual, multiply monthly by 12 for annual.
If this is NOT a salary slip, reply:
{
  "is_salary_slip": false,
  "employee_name": null,
  "employer_name": null,
  "unique_number": null,
  "month_year": null,
  "monthly_salary": null,
  "annual_income": null
}
If any field not found set it to null.`
          }
        ]
      }]
    });

    const raw = completion.choices[0].message.content;
    console.log("Salary Groq response:", raw);

    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return { error: "Could not read salary slip" };

    return JSON.parse(jsonMatch[0]);

  } catch (err) {
    console.error("Salary extraction error:", err.message);
    return { error: "Could not process salary slip image: " + err.message };
  }
}

async function generateCertificate(app, userName, aadhaarNumber) {
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
          public_id: `certificate_${app._id}`,
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

    doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();
    doc.fontSize(22).font("Helvetica-Bold")
      .text("GOVERNMENT OF INDIA", { align: "center" });
    doc.fontSize(16).font("Helvetica")
      .text("Income Certificate", { align: "center" });
    doc.moveDown(0.5);
   doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
doc.moveDown(0.5);
    doc.moveDown(1);
    doc.fontSize(13).font("Helvetica-Bold").text("CERTIFICATE OF INCOME");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica").text("This is to certify that:");
    doc.moveDown(0.5);
    doc.fontSize(12).font("Helvetica-Bold").text("Name: ", { continued: true })
      .font("Helvetica").text(userName || "Applicant");
    doc.fontSize(12).font("Helvetica-Bold").text("Application ID: ", { continued: true })
      .font("Helvetica").text(app._id.toString());
    if (aadhaarNumber) {
      doc.fontSize(12).font("Helvetica-Bold").text("Aadhaar No: ", { continued: true })
        .font("Helvetica").text(aadhaarNumber);
    }
    doc.fontSize(12).font("Helvetica-Bold").text("Annual Income: ", { continued: true })
      .font("Helvetica").text(`Rs. ${app.extracted_income?.toLocaleString("en-IN") || "N/A"}`);
    doc.fontSize(12).font("Helvetica-Bold").text("Financial Year: ", { continued: true })
      .font("Helvetica").text(app.financial_year || getFinancialYear());
    doc.fontSize(12).font("Helvetica-Bold").text("Status: ", { continued: true })
      .font("Helvetica").text("APPROVED");
    doc.fontSize(12).font("Helvetica-Bold").text("Issue Date: ", { continued: true })
      .font("Helvetica").text(new Date().toLocaleDateString("en-IN"));
    doc.moveDown(1);
    doc.fontSize(11).font("Helvetica")
      .text("This certificate is issued based on the documents submitted and verified by the system.", { align: "justify" });
    doc.moveDown(2);
    doc.fontSize(12).font("Helvetica-Bold")
      .text("Authorized Signatory", { align: "right" });
    doc.fontSize(11).font("Helvetica")
      .text("Senate Bot — Government Services", { align: "right" });
    doc.moveDown(1);
    doc.fontSize(9).font("Helvetica").fillColor("grey")
      .text(`Certificate generated on ${new Date().toISOString()}`, { align: "center" });
    doc.end();
  });
}

exports.uploadDocuments = async (req, res) => {
  console.log("=== UPLOAD REQUEST RECEIVED ===");

  try {
    const { application_id } = req.body;

    console.log("Application ID:", application_id);
    console.log("Files:", req.files ? Object.keys(req.files) : "none");

    if (!application_id) {
      return res.status(400).json({ error: "Application ID missing" });
    }

    if (!req.files || !req.files["aadhaar"] || !req.files["income_proof"]) {
      return res.status(400).json({ error: "Both Aadhaar and Income Proof required" });
    }

    const app = await Application.findById(application_id);
    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    const aadhaarUrl = req.files["aadhaar"][0].path;
    const incomeUrl = req.files["income_proof"][0].path;

    console.log("Aadhaar URL:", aadhaarUrl);
    console.log("Income URL:", incomeUrl);

    await Document.create({ application_id, file_type: "aadhaar", file_url: aadhaarUrl });
    await Document.create({ application_id, file_type: "income_proof", file_url: incomeUrl });

    // ── STEP 1: Extract and validate Aadhaar ──
    console.log("Extracting Aadhaar details...");
    const aadhaarDetails = await extractAadhaarDetails(aadhaarUrl);
    console.log("Aadhaar details:", JSON.stringify(aadhaarDetails));

    if (aadhaarDetails.error) {
      app.status = "rejected";
      app.officer_note = aadhaarDetails.error.toString();
      await app.save();
      return res.status(400).json({
        error: aadhaarDetails.error.toString(),
        status: "rejected"
      });
    }

    if (!aadhaarDetails.is_aadhaar) {
      app.status = "rejected";
      app.officer_note = "Uploaded document is not an Aadhaar card";
      await app.save();
      return res.status(400).json({
        error: "The uploaded document does not appear to be an Aadhaar card. Please upload a valid Aadhaar card.",
        status: "rejected"
      });
    }

    if (!aadhaarDetails.name) {
      app.status = "rejected";
      app.officer_note = "Could not extract name from Aadhaar";
      await app.save();
      return res.status(400).json({
        error: "Could not extract name from Aadhaar card. Please upload a clearer image.",
        status: "rejected"
      });
    }

    if (!aadhaarDetails.aadhaar_number) {
      app.status = "rejected";
      app.officer_note = "Could not extract Aadhaar number";
      await app.save();
      return res.status(400).json({
        error: "Could not extract Aadhaar number. Please upload a clearer image.",
        status: "rejected"
      });
    }

    const aadhaarValidation = validateAadhaarNumber(aadhaarDetails.aadhaar_number);
    if (!aadhaarValidation.valid) {
      app.status = "rejected";
      app.officer_note = `Invalid Aadhaar: ${aadhaarValidation.reason}`;
      await app.save();
      return res.status(400).json({
        error: `Invalid Aadhaar number: ${aadhaarValidation.reason}`,
        status: "rejected"
      });
    }

    const cleanAadhaar = aadhaarDetails.aadhaar_number.replace(/\s/g, "");
    console.log("Valid Aadhaar:", cleanAadhaar, "Name:", aadhaarDetails.name);

    // ── STEP 2: Check Aadhaar duplicate ──
    const currentFY = app.financial_year || getFinancialYear();

    const existingByAadhaar = await Application.findOne({
      aadhaar_number: cleanAadhaar,
      service_type: "income_certificate",
      status: "approved",
      financial_year: currentFY,
      _id: { $ne: new mongoose.Types.ObjectId(application_id) }
    });

    console.log("Existing aadhaar duplicate:", existingByAadhaar ? existingByAadhaar._id : "none");

    if (existingByAadhaar) {
      app.status = "rejected";
      app.aadhaar_number = cleanAadhaar;
      app.officer_note = `Duplicate: Aadhaar ${cleanAadhaar} already has approved certificate for ${currentFY}`;
      await app.save();

      return res.json({
        message: `An income certificate for Aadhaar ${cleanAadhaar} already exists for financial year ${currentFY}.`,
        status: "duplicate",
        certificate_url: existingByAadhaar.certificate_url,
        existing_application_id: existingByAadhaar._id.toString()
      });
    }

    app.aadhaar_number = cleanAadhaar;

    // ── STEP 3: Extract and validate Salary Slip ──
    console.log("Extracting salary slip details...");
    const salaryDetails = await extractSalarySlipDetails(incomeUrl);
    console.log("Salary details:", JSON.stringify(salaryDetails));

    if (salaryDetails.error) {
      app.status = "sent_to_officer";
      app.eligibility_checked = true;
      app.officer_note = salaryDetails.error.toString();
      await app.save();
      return res.json({
        message: "Could not read salary slip. Sent to officer for review.",
        status: "sent_to_officer"
      });
    }

    if (!salaryDetails.is_salary_slip) {
      app.status = "rejected";
      app.officer_note = "Uploaded document is not a salary slip";
      await app.save();
      return res.status(400).json({
        error: "The uploaded document does not appear to be a salary slip. Please upload a valid salary slip.",
        status: "rejected"
      });
    }

    const missingFields = [];
    if (!salaryDetails.employee_name) missingFields.push("employee name");
    if (!salaryDetails.employer_name) missingFields.push("employer/company name");
    if (!salaryDetails.month_year) missingFields.push("month and year");
    if (!salaryDetails.monthly_salary && !salaryDetails.annual_income)
      missingFields.push("salary amount");

    if (missingFields.length > 0) {
      app.status = "sent_to_officer";
      app.eligibility_checked = true;
      app.officer_note = `Salary slip missing: ${missingFields.join(", ")}`;
      await app.save();
      return res.json({
        message: `Salary slip is missing required fields: ${missingFields.join(", ")}. Sent to officer for review.`,
        status: "sent_to_officer"
      });
    }

    // ── STEP 4: Check salary slip unique number duplicate ──
    if (salaryDetails.unique_number) {
      const existingSlip = await SalarySlip.findOne({
        unique_number: salaryDetails.unique_number
      });

      console.log("Existing salary slip:", existingSlip ? existingSlip._id : "none");

      if (existingSlip) {
        app.status = "rejected";
        app.officer_note = `Duplicate salary slip: unique number ${salaryDetails.unique_number} already used`;
        await app.save();

        return res.status(400).json({
          error: `This salary slip (ID: ${salaryDetails.unique_number}) has already been used for a previous application. Please use a different salary slip.`,
          status: "rejected"
        });
      }

      await SalarySlip.create({
        unique_number: salaryDetails.unique_number,
        employee_name: salaryDetails.employee_name,
        application_id
      });
    }

    // ── STEP 5: Calculate income and decide ──
    const annualIncome = salaryDetails.annual_income ||
      (salaryDetails.monthly_salary ? salaryDetails.monthly_salary * 12 : null);

    console.log("Annual income:", annualIncome);

    app.eligibility_checked = true;

    if (annualIncome !== null) {
      app.extracted_income = annualIncome;
    }

    if (annualIncome === null) {
      app.status = "sent_to_officer";
      app.auto_decision = "sent_to_officer";
      app.officer_note = "Could not extract income amount. Manual review needed.";
      await app.save();

      return res.json({
        message: "Could not verify income automatically. Sent to officer for review.",
        status: "sent_to_officer",
        extracted_income: null
      });
    }

    const enteredStr = app.entered_income || "";
    const enteredMatch = enteredStr.match(/\d+/g);
    const enteredIncomeNumber = enteredMatch ? Number(enteredMatch.join("")) : null;

    let isIncomeMatched = false;
    if (enteredIncomeNumber !== null && annualIncome !== null) {
      if (enteredIncomeNumber >= 0.95 * annualIncome && enteredIncomeNumber <= 1.05 * annualIncome) {
        isIncomeMatched = true;
      }
    }

    if (!isIncomeMatched) {
      app.status = "sent_to_officer";
      app.auto_decision = "sent_to_officer";
      app.officer_note = `Income mismatch: User entered ${enteredIncomeNumber}, document shows ${annualIncome}. Range expected: ${Math.floor(0.95 * annualIncome)} to ${Math.floor(1.05 * annualIncome)}.`;
      await app.save();

      return res.json({
        message: "Your entered income does not match the uploaded document accurately enough. Sent to officer for manual review.",
        status: "sent_to_officer",
        extracted_income: annualIncome
      });
    }

    if (annualIncome < ELIGIBILITY_THRESHOLD) {
      app.status = "approved";
      app.auto_decision = "approved";

      const User = require("../models/User");
      const user = await User.findById(app.user_id);

      // Always use Aadhaar name for certificate
      const userName = aadhaarDetails.name || (user ? user.name : "Applicant");

      console.log("Generating certificate for:", userName);
      const certificateUrl = await generateCertificate(app, userName, cleanAadhaar);
      app.certificate_url = certificateUrl;

      await app.save();
      console.log("Certificate URL:", certificateUrl);

      return res.json({
        message: "Your income certificate is APPROVED!",
        status: "approved",
        extracted_income: annualIncome,
        aadhaar_name: aadhaarDetails.name,
        employee_name: salaryDetails.employee_name,
        certificate_url: certificateUrl
      });

    } else {
      app.status = "sent_to_officer";
      app.auto_decision = "sent_to_officer";
      app.officer_note = `Income Rs.${annualIncome} exceeds eligibility threshold of Rs.${ELIGIBILITY_THRESHOLD}. Manual review required.`;
      await app.save();

      console.log("Saved to officer with income:", app.extracted_income);

      return res.json({
        message: "Your income exceeds the eligibility threshold. Sent to officer for manual review.",
        status: "sent_to_officer",
        extracted_income: annualIncome
      });
    }

  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    const errorMessage = error?.message || error?.toString() || "Unknown error";
    res.status(500).json({ error: "Upload failed: " + errorMessage });
  }
};