const Application = require("../models/Application");
const Document = require("../models/Document");
const Groq = require("groq-sdk");
const axios = require("axios");
const stringSimilarity = require("string-similarity");
const PDFDocument = require("pdfkit");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function urlToBase64(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = response.headers["content-type"];
    return { base64, mimeType };
  } catch (err) {
    throw new Error("Could not fetch image: " + err.message);
  }
}

async function extractBirthProofDetails(fileUrl) {
  try {
    if (fileUrl.includes(".pdf") || fileUrl.includes("raw/upload")) {
      return { error: "PDF birth proof cannot be scanned. Please upload JPG or PNG." };
    }
    const { base64, mimeType } = await urlToBase64(fileUrl);
    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: "text", text: `This is a birth proof (Hospital Discharge Summary or Municipal Birth Record). Extract details. Reply ONLY JSON:
{
  "is_birth_proof": true,
  "child_name": "Full Name",
  "dob": "DD/MM/YYYY",
  "place_of_birth": "Hospital Name and City",
  "father_name": "Full Name",
  "mother_name": "Full Name"
}
If NOT a birth proof, reply {"is_birth_proof": false}` }
        ]
      }]
    });
    const raw = completion.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return { error: "Could not read birth proof" };
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    return { error: "Could not process birth proof image: " + err.message };
  }
}

async function extractAadhaarDetails(fileUrl) {
  try {
    if (fileUrl.includes(".pdf") || fileUrl.includes("raw/upload")) {
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
          { type: "text", text: `This is an Aadhaar card. Extract details. Reply ONLY JSON:
{
  "is_aadhaar": true,
  "name": "Full Name",
  "dob": "DD/MM/YYYY",
  "aadhaar_number": "1234 5678 9012"
}
If NOT an Aadhaar card, reply {"is_aadhaar": false}` }
        ]
      }]
    });
    const raw = completion.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return { error: "Could not read Aadhaar card" };
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    return { error: "Could not process Aadhaar image: " + err.message };
  }
}

function calculateAge(dobStr, childDobStr) {
  // Parse DD/MM/YYYY
  const pDOB = dobStr.split('/');
  const cDOB = childDobStr.split('/');
  if (pDOB.length !== 3 || cDOB.length !== 3) return null;
  const pd = new Date(`${pDOB[2]}-${pDOB[1]}-${pDOB[0]}`);
  const cd = new Date(`${cDOB[2]}-${cDOB[1]}-${cDOB[0]}`);
  if (isNaN(pd) || isNaN(cd)) return null;
  let age = cd.getFullYear() - pd.getFullYear();
  const m = cd.getMonth() - pd.getMonth();
  if (m < 0 || (m === 0 && cd.getDate() < pd.getDate())) { age--; }
  return age;
}

async function generateBirthCertificate(app) {
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
          public_id: `birth_certificate_${app._id}`,
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
      .text("Birth Certificate", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(1);
    doc.fontSize(13).font("Helvetica-Bold").text("CERTIFICATE OF BIRTH");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica").text("This is to certify that:");
    doc.moveDown(0.5);
    
    doc.fontSize(12).font("Helvetica-Bold").text("Child's Name: ", { continued: true })
      .font("Helvetica").text(app.child_name || "-");
    doc.fontSize(12).font("Helvetica-Bold").text("Date of Birth: ", { continued: true })
      .font("Helvetica").text(app.dob || "-");
    doc.fontSize(12).font("Helvetica-Bold").text("Place of Birth: ", { continued: true })
      .font("Helvetica").text(app.place_of_birth || "-");
    
    doc.moveDown(0.5);
    doc.fontSize(12).font("Helvetica-Bold").text("Father's Name: ", { continued: true })
      .font("Helvetica").text(app.father_name || "-");
    doc.fontSize(12).font("Helvetica-Bold").text("Mother's Name: ", { continued: true })
      .font("Helvetica").text(app.mother_name || "-");
      
    doc.moveDown(0.5);
    doc.fontSize(12).font("Helvetica-Bold").text("Application ID: ", { continued: true })
      .font("Helvetica").text(app._id.toString());
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

exports.uploadDocument = async (req, res) => {
  try {
    const { application_id } = req.body;
    let app = await Application.findById(application_id);
    if (!app) return res.status(404).json({ status: "error", message: "Application not found" });

    if (!req.files || !req.files.document) {
      return res.status(400).json({ status: "error", message: "Document file is required." });
    }

    const file = Array.isArray(req.files.document) ? req.files.document[0] : req.files.document;
    const fileUrl = file.path;

    // Save document
    await Document.create({
      application_id: app._id,
      user_id: app.user_id,
      file_url: fileUrl,
      file_type: app.status === "bc_waiting_for_documents" ? "birth_proof" : "parent_aadhaar",
      cloudinary_id: file.filename
    });

    if (app.status === "bc_waiting_for_documents") {
      // Step 1: Birth Proof
      const proofDetails = await extractBirthProofDetails(fileUrl);
      if (proofDetails.error || !proofDetails.is_birth_proof) {
        app.bc_flags.push("INVALID_DOCUMENT (Birth Proof)");
        app.status = "sent_to_officer";
        app.bc_risk_level = "HIGH";
        await app.save();
        return res.json({ status: "sent_to_officer", message: "Invalid Birth Proof document uploaded. Sent for manual review." });
      }

      app.bc_birth_proof_ocr = proofDetails;
      app.status = "bc_waiting_for_parent_aadhaar";
      await app.save();
      
      return res.json({ 
        status: "continue", 
        message: "Birth Proof accepted. Please upload Father's or Mother's Aadhaar Card.",
        show_birth_upload_aadhaar: true 
      });

    } else if (app.status === "bc_waiting_for_parent_aadhaar") {
      // Step 2: Aadhaar Card & Global Rules Validation
      const aadhaarDetails = await extractAadhaarDetails(fileUrl);
      if (aadhaarDetails.error || !aadhaarDetails.is_aadhaar) {
        app.bc_flags.push("INVALID_DOCUMENT (Aadhaar)");
        app.status = "sent_to_officer";
        app.bc_risk_level = "HIGH";
        await app.save();
        return res.json({ status: "sent_to_officer", message: "Invalid Aadhaar document uploaded. Sent for manual review." });
      }

      app.bc_aadhaar_ocr = aadhaarDetails;
      app.status = "documents_uploaded";
      
      // RUN VALIDATION ENGINE
      let flags = [];
      const ocrProof = app.bc_birth_proof_ocr || {};
      
      // Auto-detect parent
      const aadhaarName = aadhaarDetails.name || "";
      const fatherEntry = app.father_name || "";
      const motherEntry = app.mother_name || "";
      
      const fatherSim = stringSimilarity.compareTwoStrings(aadhaarName.toLowerCase(), fatherEntry.toLowerCase());
      const motherSim = stringSimilarity.compareTwoStrings(aadhaarName.toLowerCase(), motherEntry.toLowerCase());
      
      if (fatherSim >= 0.80) {
        app.bc_parent_detected = "father";
      } else if (motherSim >= 0.80) {
        app.bc_parent_detected = "mother";
      } else {
        flags.push("UNKNOWN_PARENT_DOCUMENT");
      }

      // Rule 1: DOB
      const cDOB = new Date(app.dob.split('/').reverse().join('-'));
      if (cDOB > new Date()) flags.push("DOB_MISMATCH (Future Date)");
      if (!ocrProof.dob) {
        flags.push("LOW_CONFIDENCE_OCR (Birth Proof DOB)");
      } else {
        if (ocrProof.dob.replace(/[\/\-]/g, '') !== app.dob.replace(/[\/\-]/g, '')) {
            flags.push("DOB_MISMATCH");
        }
      }

      // Rule 2: Child Name Validation
      if (ocrProof.child_name && app.child_name) {
          if (stringSimilarity.compareTwoStrings(ocrProof.child_name.toLowerCase(), app.child_name.toLowerCase()) < 0.80) {
             flags.push("NAME_MISMATCH");
          }
      } else {
          flags.push("LOW_CONFIDENCE_OCR (Birth Proof Name)");
      }

      // Rule 3: Parent Matching (from Aadhaar)
      if (app.bc_parent_detected === "father") {
         if (ocrProof.father_name && stringSimilarity.compareTwoStrings(aadhaarName.toLowerCase(), ocrProof.father_name.toLowerCase()) < 0.80) {
            flags.push("PARENT_IDENTITY_MISMATCH");
         }
      } else if (app.bc_parent_detected === "mother") {
         if (ocrProof.mother_name && stringSimilarity.compareTwoStrings(aadhaarName.toLowerCase(), ocrProof.mother_name.toLowerCase()) < 0.80) {
            flags.push("PARENT_IDENTITY_MISMATCH");
         }
      }

      // Rule 4: Parent Age Validation
      if (aadhaarDetails.dob && app.dob) {
          const age = calculateAge(aadhaarDetails.dob, app.dob);
          if (age !== null && age < 18) {
              flags.push("INVALID_PARENT_AGE");
          }
      }

      // Rule 5: Place Matching
      if (ocrProof.place_of_birth && app.place_of_birth) {
         if (stringSimilarity.compareTwoStrings(ocrProof.place_of_birth.toLowerCase(), app.place_of_birth.toLowerCase()) < 0.70) {
            flags.push("PLACE_MISMATCH");
         }
      }

      // Rule 6: Late Registration Check (only flag if registration is more than 1 year late)
      const ageDiffTime = new Date().getTime() - cDOB.getTime();
      const ageDays = Math.floor(ageDiffTime / (1000 * 3600 * 24));
      if (ageDays > 365) {
          flags.push("LATE_REGISTRATION");
      }

      // Duplicate Check (Same name, dob, father)
      const existing = await Application.findOne({
          service_type: "birth_certificate",
          status: "approved",
          child_name: app.child_name,
          dob: app.dob,
          father_name: app.father_name
      });
      if (existing) {
          flags.push("DUPLICATE_ENTRY");
      }

      // Scoring
      let confidence = 100 - (flags.length * 15);
      if (confidence < 0) confidence = 0;
      app.bc_confidence_score = confidence;
      
      let riskLevel = "LOW";
      if (flags.length === 1) riskLevel = "MEDIUM";
      if (flags.length >= 2 || flags.includes("DUPLICATE_ENTRY")) riskLevel = "HIGH";
      
      if (app.bc_flags) app.bc_flags = [...app.bc_flags, ...flags];
      else app.bc_flags = flags;
      app.bc_risk_level = riskLevel;

      if (flags.length > 0) {
          app.status = "sent_to_officer";
          await app.save();
          return res.json({ 
              status: "sent_to_officer", 
              message: flags.includes("DUPLICATE_ENTRY") ? "A birth certificate already exists for this record. Sent to officer." : "Application sent to officer dashboard for manual review.",
              flags: flags,
              risk_level: riskLevel
          });
      }

      // Passed all checks!
      const certUrl = await generateBirthCertificate(app);
      app.certificate_url = certUrl;
      app.status = "approved";
      await app.save();
      return res.json({ 
          status: "approved", 
          message: "Congratulations! Your Birth Certificate is approved.",
          certificate_url: certUrl
      });
    }

  } catch (error) {
    console.error("Birth upload error: ", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};
