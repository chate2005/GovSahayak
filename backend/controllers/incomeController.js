const Tesseract = require("tesseract.js");
const Application = require("../models/Application");
const Document = require("../models/Document");
const SalarySlip = require("../models/SalarySlip");
const Groq = require("groq-sdk");
const axios = require("axios");
const PDFDocument = require("pdfkit");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");
const mongoose = require("mongoose");

// ─── RAG + LLM Architecture Integration ─────────────────────────────────────
const { verifyIncomeApplication, CONFIDENCE_AUTO_APPROVE } = require("../services/llmVerificationAgent");

// ─── Document Authenticity Service (5-Layer Anti-Fraud Engine) ──────────────
const {
  verifyIncomeSalarySlipAuthenticity,
  verifyAadhaarDocumentAuthenticity
} = require("../services/documentAuthenticityService");

// ─── Salary Truth Verification (EPFO + IT Dept Cross-Reference) ────────────
const { crossCheckSalaryWithEPFO } = require("../services/mockEPFOPortal");
const { crossCheckSalaryWithITDept, calculateExpectedTDS } = require("../services/mockIncomeTaxPortal");

const { groq, createChatCompletion } = require("../services/aiHelper");
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
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
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

function normalizeText(text) {
  if (!text) return "";
  return text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
}

function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  let matches = 0;
  for (const w1 of words1) {
    if (w1.length > 2 && words2.some(w2 => w2.includes(w1) || w1.includes(w2))) matches++;
  }
  return matches / Math.max(words1.length, words2.length);
}

function validateNameMatch(enteredName, ocrName) {
  const sim = calculateSimilarity(enteredName, ocrName);
  if (sim < 0.6) {
    return { valid: false, reason: `Name mismatch: Entered '${enteredName}' vs Document '${ocrName}' (similarity: ${Math.round(sim * 100)}%)` };
  }
  return { valid: true, reason: null };
}

async function extractAadhaarDetails(fileUrl) {
  try {
    if (fileUrl.includes(".pdf") || fileUrl.includes("raw/upload")) {
      return { error: "PDF Aadhaar cannot be scanned. Please upload JPG or PNG." };
    }

    console.log("Running Tesseract OCR on Aadhaar image...");
    const { data: { text } } = await Tesseract.recognize(fileUrl, 'eng');
    console.log("Aadhaar OCR text extracted, sending to Groq...");

    const completion = await createChatCompletion({
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "You are an Indian Aadhaar card OCR data extractor. Extract structured fields from raw OCR text. Reply ONLY valid JSON."
        },
        {
          role: "user",
          content: `Raw OCR Text:
"${text}"

Extract details and reply ONLY this JSON:
{
  "is_aadhaar": true,
  "name": "Full Name on card",
  "aadhaar_number": "1234 5678 9012",
  "dob": "DD/MM/YYYY"
}
If NOT Aadhaar, reply: {"is_aadhaar": false, "name": null, "aadhaar_number": null, "dob": null}`
        }
      ]
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

async function extractIncomeProofDetails(fileUrl, employmentType, declaredIncome) {
  try {
    if (fileUrl.includes(".pdf") || fileUrl.includes("raw/upload")) {
      return { error: "PDF document cannot be scanned. Please upload JPG or PNG." };
    }

    console.log(`Running Tesseract OCR on Income Proof (Category: ${employmentType || 'generic'})...`);
    const { data: { text } } = await Tesseract.recognize(fileUrl, 'eng');
    console.log("Income proof OCR extracted text:\n", text);

    const isFarmer = employmentType === "agricultural" || /सातबारा|७\/१२|गावनमुना|गट|खातेदार|क्षेत्र|पिक|तहसील|तलाठी|satbara|7\/12|land|farmer|kisan|agriculture/i.test(text);
    const isBusiness = employmentType === "self_employed" || /itr|income tax return|form 26as|pan|gstin|turnover|proprietor|p&l|gross total income/i.test(text);
    const isGovt = employmentType === "government" || /ddo|gpf|nps|govt|government|treasury|zp|zilla|ministry/i.test(text);

    const completion = await createChatCompletion({
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are an expert Indian Government Income Document Data Extractor.
You analyze documents including:
1. 7/12 Land Extracts (सातबारा उतारा / 8A / Talathi Report) for Farmers / Agricultural Income
2. Income Tax Returns (ITR-V / Form 26AS / GST Returns) for Business / Self-Employed
3. Salary Slips / Form 16 for Salaried and Government Employees
4. Talathi / Tahsildar Income Affidavits (स्वयंघोषणापत्र) for Informal / Daily Wage workers

CATEGORY SPECIFIC EXTRACTION RULES:
- If 7/12 Land Extract (Farmer):
  * is_salary_slip = true
  * is_income_proof = true
  * doc_type = "7/12 Satbara Extract"
  * employee_name = Name of Khatedar / Land owner / Farmer
  * employer_name = Village Name, Taluka, District and Gat/Survey No. (e.g. "Gat No 142, Baramati, Pune")
  * monthly_salary = estimated monthly income from land, or declared / 12
  * annual_income = estimated annual agricultural income from crops/land, or declared
- If ITR / Form 26AS (Business / Self-Employed):
  * is_salary_slip = true
  * is_income_proof = true
  * doc_type = "ITR-V / Tax Return"
  * employee_name = Taxpayer Full Name
  * employer_name = Business / Firm Name or "Self-Employed"
  * annual_income = Gross Total Income (GTI)
  * monthly_salary = annual_income / 12
  * pan = 10-character PAN
- If Salary Slip / Form 16 (Salaried / Govt):
  * is_salary_slip = true
  * is_income_proof = true
  * doc_type = "Salary Slip"
  * employee_name = Employee Name
  * employer_name = Company or Government Office Name (from top header)
  * gross_salary / monthly_salary / annual_income / pf_deduction / uan / gstin

Reply ONLY valid JSON in this structure:
{
  "is_salary_slip": true,
  "is_income_proof": true,
  "doc_type": "7/12 Satbara Extract | Salary Slip | Form 16 | ITR-V | Income Affidavit",
  "employee_name": "Full Name",
  "employer_name": "Company / Land Location & Gat No / Business Name",
  "unique_number": "slip ID / Gat No / ITR Ack No / null",
  "month_year": "MM/YYYY or Year",
  "monthly_salary": 25000,
  "annual_income": 300000,
  "basic_salary": 15000,
  "gross_salary": 25000,
  "net_salary": 23000,
  "pf_deduction": null,
  "tds_deduction": null,
  "professional_tax": null,
  "gstin": null,
  "pan": null,
  "epf_code": null,
  "uan": null
}`
        },
        {
          role: "user",
          content: `Declared Category: "${employmentType || 'generic'}"\nDeclared Income: ${declaredIncome || 'N/A'}\nRaw OCR Text:\n"${text}"`
        }
      ]
    });

    const raw = completion.choices[0].message.content;
    console.log("Income proof Groq response:", raw);

    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return { error: "Could not read income document" };

    const parsed = JSON.parse(jsonMatch[0]);

    // Fallbacks
    if (!parsed.employer_name || parsed.employer_name === "null" || parsed.employer_name.trim().length < 3) {
      if (isFarmer) {
        parsed.employer_name = "Agricultural Land (Maharashtra Land Records)";
      } else if (isBusiness) {
        parsed.employer_name = "Self-Employed / Business Enterprise";
      } else {
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        for (const line of lines.slice(0, 8)) {
          if (/tata|infosys|wipro|tech|solutions|services|pvt|ltd|limited|technologies|enterprises|industries|corporation/i.test(line)) {
            parsed.employer_name = line.replace(/[^\w\s&.-]/g, "").trim();
            break;
          }
        }
      }
    }

    if (!parsed.month_year) {
      parsed.month_year = getFinancialYear();
    }

    if (!parsed.annual_income && parsed.monthly_salary) {
      parsed.annual_income = parsed.monthly_salary * 12;
    } else if (!parsed.annual_income && declaredIncome) {
      parsed.annual_income = Number(declaredIncome);
      parsed.monthly_salary = Math.round(parsed.annual_income / 12);
    }

    return parsed;

  } catch (err) {
    console.error("Income proof extraction error:", err.message);
    return { error: "Could not process income document image: " + err.message };
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
    let { application_id, user_id, name, mobile, declared_income, employment_type, employer_name, purpose, financial_year, aadhaar_number, applying_for, beneficiary_relationship } = req.body;

    console.log("Application ID:", application_id, "| Employment Type:", employment_type, "| Applying For:", applying_for);
    console.log("Files:", req.files ? Object.keys(req.files) : "none");

    if (!req.files || !req.files["aadhaar"] || !req.files["income_proof"]) {
      return res.status(400).json({ error: "Both Aadhaar and Income Proof documents are required" });
    }

    let app = null;
    if (application_id) {
      app = await Application.findById(application_id);
    }

    const currentFY = financial_year || getFinancialYear();

    if (!app && user_id) {
      app = await Application.create({
        user_id,
        service_type: "income_certificate",
        status: "documents_uploaded",
        name_from_chat: name || "Applicant",
        mobile_from_chat: mobile || "",
        entered_income: declared_income ? declared_income.toString() : "",
        aadhaar_number: aadhaar_number || "",
        financial_year: currentFY,
        applying_for: applying_for || "self",
        beneficiary_relationship: beneficiary_relationship || (applying_for === "other" ? "Other" : "Self"),
        beneficiary_name: name || "Applicant"
      });
      application_id = app._id.toString();
    } else if (app) {
      if (applying_for) app.applying_for = applying_for;
      if (beneficiary_relationship) app.beneficiary_relationship = beneficiary_relationship;
      if (name) {
        app.beneficiary_name = name;
        app.name_from_chat = name;
      }
      if (mobile) app.mobile_from_chat = mobile;
      if (aadhaar_number) app.aadhaar_number = aadhaar_number;
    }

    if (!app) {
      return res.status(400).json({ error: "Application ID or user_id required" });
    }

    const aadhaarUrl = req.files["aadhaar"][0].path;
    const incomeUrl = req.files["income_proof"][0].path;

    console.log("Aadhaar URL:", aadhaarUrl);
    console.log("Income URL:", incomeUrl);

    await Document.create({ application_id: app._id.toString(), file_type: "aadhaar", file_url: aadhaarUrl });
    await Document.create({ application_id: app._id.toString(), file_type: "income_proof", file_url: incomeUrl });

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
    const existingByAadhaar = await Application.findOne({
      aadhaar_number: cleanAadhaar,
      service_type: "income_certificate",
      status: "approved",
      financial_year: currentFY,
      _id: { $ne: app._id }
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

    // ── STEP 3: Extract and validate Income Proof (7/12, ITR, Salary Slip, Affidavit) ──
    const activeCategory = employment_type || app.employment_type || "salaried";
    const declaredAmt = declared_income || app.entered_income || null;

    console.log(`Extracting income proof details for category: ${activeCategory}...`);
    const salaryDetails = await extractIncomeProofDetails(incomeUrl, activeCategory, declaredAmt);
    console.log("Income proof details:", JSON.stringify(salaryDetails));

    if (salaryDetails.error) {
      app.status = "sent_to_officer";
      app.eligibility_checked = true;
      app.officer_note = salaryDetails.error.toString();
      await app.save();
      return res.json({
        message: "Could not read income document automatically. Sent to officer for review.",
        status: "sent_to_officer"
      });
    }

    if (!salaryDetails.is_income_proof && !salaryDetails.is_salary_slip) {
      app.status = "rejected";
      app.officer_note = "Uploaded document is not a recognized income proof (Salary Slip / 7-12 Extract / ITR)";
      await app.save();
      return res.status(400).json({
        error: "The uploaded document does not appear to be a valid income proof (e.g. Salary Slip, 7/12 Extract, or ITR). Please upload a valid document.",
        status: "rejected"
      });
    }

    if (!salaryDetails.employee_name || salaryDetails.employee_name === salaryDetails.employer_name || salaryDetails.employee_name.includes("Not explicitly")) {
      salaryDetails.employee_name = aadhaarDetails.name;
    }

    const isFarmerDoc = activeCategory === "agricultural" || salaryDetails.doc_type?.includes("7/12") || salaryDetails.doc_type?.includes("Satbara");
    if (!salaryDetails.employer_name) {
      salaryDetails.employer_name = isFarmerDoc ? "Agricultural Land Holding (7/12)" : (activeCategory === "self_employed" ? "Self-Employed" : "Employer");
    }

    if (!salaryDetails.monthly_salary && !salaryDetails.annual_income && declaredAmt) {
      salaryDetails.annual_income = Number(declaredAmt);
      salaryDetails.monthly_salary = Math.round(salaryDetails.annual_income / 12);
    }

    // ── STEP 4: Check salary slip unique number duplicate ──
    if (salaryDetails.unique_number) {
      const existingSlip = await SalarySlip.findOne({
        unique_number: salaryDetails.unique_number,
        application_id: { $ne: application_id }
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
    // Prioritize Gross Annual Income (Gross × 12) per Government Revenue / EWS norms
    const grossMonthly = salaryDetails.gross_salary || salaryDetails.monthly_salary || null;
    const grossAnnual = grossMonthly ? grossMonthly * 12 : null;
    const netAnnual = salaryDetails.net_salary ? salaryDetails.net_salary * 12 : null;
    const docAnnual = salaryDetails.annual_income || grossAnnual || netAnnual;

    let annualIncome = grossAnnual || docAnnual;
    console.log("Calculated Annual income:", annualIncome, "| Gross Annual:", grossAnnual, "| Net Annual:", netAnnual);

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

    // ── Flexible Gross vs Net Matching ──
    // Citizens may enter either their Gross Annual Income (₹3,00,000) or Net Take-Home (₹2,76,000)
    let isIncomeMatched = false;
    if (enteredIncomeNumber !== null) {
      const isMatchGross = grossAnnual && (enteredIncomeNumber >= 0.90 * grossAnnual && enteredIncomeNumber <= 1.10 * grossAnnual);
      const isMatchNet = netAnnual && (enteredIncomeNumber >= 0.90 * netAnnual && enteredIncomeNumber <= 1.10 * netAnnual);
      const isMatchDoc = docAnnual && (enteredIncomeNumber >= 0.90 * docAnnual && enteredIncomeNumber <= 1.10 * docAnnual);

      if (isMatchGross || isMatchNet || isMatchDoc) {
        isIncomeMatched = true;
        // Standardize annualIncome to Gross for official EWS evaluation
        annualIncome = grossAnnual || docAnnual;
      }
    }

    if (!isIncomeMatched) {
      app.status = "sent_to_officer";
      app.auto_decision = "sent_to_officer";
      app.officer_note = `Income mismatch: Entered ₹${enteredIncomeNumber}, but document shows Gross: ₹${grossAnnual} / Net: ₹${netAnnual}`;
      await app.save();

      return res.json({
        message: "Your entered income does not match the uploaded document accurately enough. Sent to officer for manual review.",
        status: "sent_to_officer",
        extracted_income: annualIncome
      });
    }

    if (annualIncome < ELIGIBILITY_THRESHOLD) {
      // ── 🆕 STEP 5A: Document Authenticity Check (5-Layer Anti-Fraud) ─────
      console.log("[Income] Running document authenticity verification...");
      let authenticityReport = null;
      try {
        authenticityReport = await verifyIncomeSalarySlipAuthenticity(
          {
            ...salaryDetails,
            annual_income: annualIncome
          },
          app.dc_city || app.city || ""  // For cost-of-living check
        );

        // Save authenticity report to DB
        app.document_authenticity_report = authenticityReport;

        console.log("[Income] Authenticity score:", authenticityReport.authenticity_score,
          "| Risk:", authenticityReport.overall_risk,
          "| Flags:", authenticityReport.all_flags.length);

        // ── HIGH RISK: Likely fraudulent document → Hard stop ──────────────
        if (authenticityReport.overall_risk === "HIGH" ||
          authenticityReport.recommendation === "REJECT_LIKELY_FRAUDULENT_DOCUMENT") {

          app.status = "rejected";
          app.auto_decision = "rejected";
          app.officer_note = `Document authenticity failed (Score: ${authenticityReport.authenticity_score}/100). Flags: ${authenticityReport.all_flags.join(", ")}`;
          await app.save();

          return res.json({
            status: "rejected",
            message: "❌ Your income proof could not be verified as authentic.\n\n" +
              "Issues found:\n" +
              authenticityReport.all_flags.slice(0, 3).map(f => `• ${f}`).join("\n") +
              "\n\nPlease upload a genuine, unedited salary slip or Income Tax Return.",
            authenticity_score: authenticityReport.authenticity_score,
            flags: authenticityReport.all_flags
          });
        }

        // ── MEDIUM RISK: Suspicious but not conclusive → Officer Review ─────
        if (authenticityReport.overall_risk === "MEDIUM") {
          app.status = "sent_to_officer";
          app.auto_decision = "sent_to_officer";
          app.officer_note = `Document authenticity flagged (Score: ${authenticityReport.authenticity_score}/100). Manual doc verification required. Flags: ${authenticityReport.all_flags.join(", ")}`;
          await app.save();

          return res.json({
            status: "sent_to_officer",
            message: "📋 Your income document has been sent to an officer for manual verification.\n\n" +
              "Reason: Our system detected potential issues that need human review.\n" +
              "Expected time: 3-5 working days.",
            authenticity_score: authenticityReport.authenticity_score,
            flags: authenticityReport.all_flags
          });
        }

        // ── LOW RISK: Document passes authenticity → Proceed to eligibility ─
        console.log("[Income] Document authenticity PASSED. Proceeding to RAG+LLM eligibility check.");

      } catch (authErr) {
        // Authenticity check failure is non-fatal — log and continue
        console.error("[Income] Authenticity check error (non-fatal):", authErr.message);
        authenticityReport = null;
      }

      // ── 🆕 STEP 5B: Salary Truth Verification (EPFO + IT Dept) ────────────
      // Cross-reference salary against GOVERNMENT-IMMUTABLE records.
      // These cannot be altered by the applicant — any mismatch = tampering.
      console.log("[Income] Running Salary Truth Verification (EPFO + IT Dept)...");

      try {
        const epfoResult = crossCheckSalaryWithEPFO(
          salaryDetails.basic_salary,        // Basic salary claimed on slip
          salaryDetails.monthly_salary,      // Total monthly claimed on slip
          salaryDetails.uan || app.uan,      // Employee UAN
          salaryDetails.epf_code,            // Employer EPF code from slip
          salaryDetails.employee_name || aadhaarDetails.name // Employee Name
        );

        const itResult = crossCheckSalaryWithITDept(
          {
            pan: salaryDetails.pan || aadhaarDetails.pan,
            employer_tan: salaryDetails.employer_tan || salaryDetails.tan,
            employer_name: salaryDetails.employer_name,
            annual_income: annualIncome,
            monthly_tds_on_slip: salaryDetails.tds_deduction
          },
          app.financial_year || `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`
        );

        // Save salary truth reports to DB
        app.epfo_cross_check = epfoResult;
        app.it_dept_cross_check = itResult;

        const epfoTampering = epfoResult.cross_check_possible && epfoResult.tampering_detected;
        const itTampering = itResult.tampering_detected;
        const criticalFlags = [
          ...(epfoResult.flags || []).filter(f => f.severity === "CRITICAL"),
          ...(itResult.flags || []).filter(f => f.severity === "CRITICAL")
        ];
        const highFlags = [
          ...(epfoResult.flags || []).filter(f => f.severity === "HIGH"),
          ...(itResult.flags || []).filter(f => f.severity === "HIGH")
        ];

        console.log("[Income] EPFO tampering:", epfoTampering, "| IT tampering:", itTampering,
          "| Critical flags:", criticalFlags.length);

        // ── CRITICAL: Multiple govt sources confirm mismatch → Hard Reject ──
        if (criticalFlags.length >= 1 || (epfoTampering && itTampering)) {
          app.status = "rejected";
          app.auto_decision = "rejected";
          const topFlag = criticalFlags[0] || highFlags[0];
          app.officer_note = `Salary Truth Verification FAILED: ${topFlag?.implication || "Multiple government records contradict the submitted salary slip."}`;
          await app.save();

          return res.json({
            status: "rejected",
            message: "❌ Your income proof has been rejected.\n\n" +
              "Our system cross-referenced your salary slip against government records:\n\n" +
              criticalFlags.concat(highFlags).slice(0, 2).map(f =>
                `• ${f.flag}: ${f.implication}`
              ).join("\n\n") +
              "\n\nPlease ensure you submit a genuine, unedited salary slip or use Income Tax Return as proof.",
            fraud_indicators: criticalFlags.length,
            sources_checked: ["EPFO Unified Portal", "Form 26AS (TRACES)", "ITR e-Filing Portal"]
          });
        }

        // ── 🔒 MANDATORY GOVERNMENT REQUIREMENT 1: Employer GSTIN in Database ──
        const gstinResult = authenticityReport?.verification_layers?.gstin;
        const hasValidGSTIN = salaryDetails.gstin && gstinResult?.valid;

        if (!hasValidGSTIN) {
          app.status = "sent_to_officer";
          app.auto_decision = "sent_to_officer";
          const gstinReason = !salaryDetails.gstin
            ? "Mandatory Employer GSTIN number was not found on salary slip."
            : `Employer GSTIN validation failed: ${gstinResult?.reason || "Invalid format / checksum"}.`;
          app.officer_note = `${gstinReason} AI auto-approval blocked — sent for manual revenue officer inspection.`;
          await app.save();

          return res.json({
            status: "sent_to_officer",
            message: `📋 Your application has been sent for manual officer review.\n\nReason: ${gstinReason}\n\nGovernment rules mandate that the employer's GSTIN must be verified in the GST portal before automated approval. A Revenue Officer will manually inspect your application.`,
            mandatory_check_failed: "EMPLOYER_GSTIN_REQUIRED",
            authenticity_report: authenticityReport
          });
        }

        // ── 🔒 MANDATORY GOVERNMENT REQUIREMENT 2: Person Name in EPFO & 12% PF Calculation ──
        const hasValidEPFO = epfoResult && epfoResult.epfo_found && epfoResult.name_verified_in_epfo !== false && !epfoResult.tampering_detected;

        if (!hasValidEPFO) {
          app.status = "sent_to_officer";
          app.auto_decision = "sent_to_officer";
          const epfoReason = !epfoResult?.epfo_found
            ? "Employee UAN / EPFO record was not found in the EPFO government portal."
            : !epfoResult?.name_verified_in_epfo
              ? `EPFO member name mismatch: UAN is registered to '${epfoResult?.member_name}' instead of applicant.`
              : `PF contribution mismatch: Calculated salary from 12% PF (${epfoResult?.epfo_verified_basic}) contradicts claimed salary.`;
          app.officer_note = `${epfoReason} AI auto-approval blocked — sent for manual revenue officer salary verification.`;
          await app.save();

          return res.json({
            status: "sent_to_officer",
            message: `📋 Your application has been sent for manual officer review.\n\nReason: ${epfoReason}\n\nGovernment rules mandate that employee name and active PF contribution records must be verified on the EPFO portal before automated approval. A Revenue Officer will manually inspect your salary proof.`,
            mandatory_check_failed: "EPFO_PERSON_VERIFICATION_REQUIRED",
            epfo_report: epfoResult
          });
        }

        console.log("[Income] BOTH Mandatory GSTIN & EPFO Government Checks PASSED — proceeding to RAG+LLM.");

      } catch (truthErr) {
        console.error("[Income] Salary truth check error (non-fatal):", truthErr.message);
      }

      // ── Invoke RAG + LLM Verification Agent before auto-approving ────────

      let auditReport = null;
      try {
        auditReport = await verifyIncomeApplication(app, {
          aadhaar: aadhaarDetails,
          salarySlip: salaryDetails,
          annualIncome,
          incomeMatched: isIncomeMatched,
          flags: []
        });

        // Persist LLM audit report and RAG fields
        app.llm_audit_report = auditReport;
        app.rag_citations = auditReport.rag_citations || [];
        app.uidai_verified = auditReport.uidai_verified || false;
      } catch (llmErr) {
        console.error("[Income] LLM agent error (non-fatal):", llmErr.message);
        auditReport = null;
      }

      // If LLM says reject, escalate to officer review (don't auto-reject income)
      if (auditReport?.decision === "REJECT" || auditReport?.decision === "OFFICER_REVIEW") {
        app.status = "sent_to_officer";
        app.auto_decision = "sent_to_officer";
        app.officer_note = auditReport.officer_guidance || auditReport.reasoning || "LLM agent flagged this application for review.";
        await app.save();
        return res.json({
          message: "Your application has been sent to officer for additional review.",
          status: "sent_to_officer",
          extracted_income: annualIncome,
          rag_verified: true,
          uidai_verified: app.uidai_verified,
          legal_citations: auditReport?.legal_citations || []
        });
      }

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
        certificate_url: certificateUrl,
        rag_verified: !!auditReport,
        uidai_verified: app.uidai_verified,
        llm_confidence: auditReport?.confidence
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