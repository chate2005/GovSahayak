const Groq = require("groq-sdk");
const Application = require("../models/Application");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function getFinancialYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4) return `${year}-${year + 1}`;
  else return `${year - 1}-${year}`;
}

// ─────────────────────────────────────────────────────────────
// Valid Indian states + UTs for state validation
// ─────────────────────────────────────────────────────────────
const INDIAN_STATES = [
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh",
  "goa", "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka",
  "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram",
  "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu",
  "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal",
  // Union Territories
  "andaman and nicobar islands", "chandigarh", "dadra and nagar haveli and daman and diu",
  "delhi", "jammu and kashmir", "ladakh", "lakshadweep", "puducherry"
];

function isValidIndianState(input) {
  const norm = input.toLowerCase().trim();
  return INDIAN_STATES.some(s => s === norm || s.includes(norm) || norm.includes(s.split(" ")[0]));
}

// ─────────────────────────────────────────────────────────────
// Number-word → integer parser (English / Hindi / Marathi)
// ─────────────────────────────────────────────────────────────
const NUMBER_WORDS = {
  // English
  "zero":0,"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,
  "ten":10,"eleven":11,"twelve":12,"thirteen":13,"fourteen":14,"fifteen":15,"sixteen":16,
  "seventeen":17,"eighteen":18,"nineteen":19,"twenty":20,"twenty one":21,"twenty two":22,
  "twenty three":23,"twenty four":24,"twenty five":25,"twenty six":26,"twenty seven":27,
  "twenty eight":28,"twenty nine":29,"thirty":30,"forty":40,"fifty":50,"sixty":60,
  "seventy":70,"eighty":80,"ninety":90,"hundred":100,
  // Hindi
  "एक":1,"दो":2,"तीन":3,"चार":4,"पांच":5,"छह":6,"सात":7,"आठ":8,"नौ":9,"दस":10,
  "ग्यारह":11,"बारह":12,"तेरह":13,"चौदह":14,"पंद्रह":15,"सोलह":16,"सत्रह":17,
  "अठारह":18,"उन्नीस":19,"बीस":20,"पचीस":25,"तीस":30,"चालीस":40,"पचास":50,
  "साठ":60,"सत्तर":70,"अस्सी":80,"नब्बे":90,
  // Marathi
  "एक":1,"दोन":2,"तीन":3,"चार":4,"पाच":5,"सहा":6,"सात":7,"आठ":8,"नऊ":9,"दहा":10,
  "अकरा":11,"बारा":12,"तेरा":13,"चौदा":14,"पंधरा":15,"सोळा":16,"सतरा":17,
  "अठरा":18,"एकोणीस":19,"वीस":20,"पंचवीस":25,"तीस":30,"चाळीस":40,"पन्नास":50,
  "साठ":60,"सत्तर":70,"ऐंशी":80,"नव्वद":90,
};

function parseNumberInput(text) {
  if (!text) return null;
  const trimmed = text.trim();
  // Pure digits
  const digitMatch = trimmed.match(/^\d+/);
  if (digitMatch) return parseInt(digitMatch[0], 10);
  // Word match (try longest first)
  const lower = trimmed.toLowerCase();
  // Remove "years"/"साल"/"वर्षे" etc
  const cleaned = lower.replace(/(years?|साल|वर्षे|वर्षों|वर्ष)/g, "").trim();
  if (NUMBER_WORDS[cleaned] !== undefined) return NUMBER_WORDS[cleaned];
  // Fallback: extract any digit sequence
  const embedded = trimmed.match(/\d+/);
  if (embedded) return parseInt(embedded[0], 10);
  return null;
}

// ─────────────────────────────────────────────────────────────
// Purpose options
// ─────────────────────────────────────────────────────────────
const PURPOSES = [
  "College / University Admission",
  "Government Job Application",
  "Scholarship Application",
  "Property / Land Registration",
  "Other Government Purpose",
];

function parsePurpose(text) {
  if (!text) return null;
  const t = text.trim();
  // Numeric selection
  const num = parseInt(t, 10);
  if (!isNaN(num) && num >= 1 && num <= 5) return PURPOSES[num - 1];
  // Keyword matching
  if (/college|university|admission|महाविद्यालय|कॉलेज|विश्वविद्यालय/i.test(t)) return PURPOSES[0];
  if (/government job|sarkari|naukri|job application|सरकारी नौकरी/i.test(t)) return PURPOSES[1];
  if (/scholarship|छात्रवृत्ति|शिष्यवृत्ती/i.test(t)) return PURPOSES[2];
  if (/property|land|registration|जमीन|संपत्ति/i.test(t)) return PURPOSES[3];
  if (/other|अन्य|इतर/i.test(t)) return PURPOSES[4];
  return null;
}

// ─────────────────────────────────────────────────────────────
// Jurisdiction lookup (mirrors domicileController)
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
// Name validation helper
// ─────────────────────────────────────────────────────────────
function isValidFullName(name) {
  if (!name || name.trim().length < 3) return false;
  // Must have at least two words
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return false;
  // No digits or special characters (allow letters, spaces, dots, hyphens)
  if (/[0-9@#$%^&*()+=\[\]{}|\\/<>!?]/.test(name)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// Main chat handler
// ─────────────────────────────────────────────────────────────
exports.chat = async (req, res) => {
  try {
    const { message, user_id } = req.body;

    console.log("Chat from user_id:", user_id);

    if (!user_id) {
      return res.status(400).json({ reply: "Please login again." });
    }

    const currentFY = getFinancialYear();

    // ── Find any pending application for this user ──────────
    const pending = await Application.findOne({
      user_id,
      $or: [
        {
          service_type: "income_certificate",
          status: { $in: ["waiting_for_name", "waiting_for_mobile", "waiting_for_income", "waiting_for_documents", "pending", "sent_to_officer"] },
          financial_year: currentFY
        },
        {
          service_type: "birth_certificate",
          status: { $in: ["bc_waiting_for_child_name", "bc_waiting_for_dob", "bc_waiting_for_place", "bc_waiting_for_father", "bc_waiting_for_mother", "bc_waiting_for_mobile", "bc_waiting_for_documents", "bc_waiting_for_parent_aadhaar", "pending", "sent_to_officer"] },
          financial_year: currentFY
        },
        {
          service_type: "domicile_certificate",
          status: {
            $in: [
              "dc_waiting_for_name", "dc_waiting_for_mobile",
              "dc_waiting_for_address_house", "dc_waiting_for_address_street",
              "dc_waiting_for_address_city", "dc_waiting_for_address_district",
              "dc_waiting_for_address_state", "dc_waiting_for_address_pin",
              "dc_waiting_for_duration", "dc_waiting_for_purpose",
              "dc_waiting_for_aadhaar", "dc_waiting_for_address_proof",
              "dc_waiting_for_residency_proof", "pending", "sent_to_officer"
            ]
          }
        },
      ]
    });

    // ── Resume existing pending app ─────────────────────────
    if (pending) {

      // ── Mid-flow escape hatch: detect restart / certificate-switch ──
      const lc = message.toLowerCase().trim();

      const wantsRestart = /\b(restart|start over|start again|start process again|cancel|reset|begin again|new application|different certificate|wrong certificate|sorry i want|i want to start|no i want|i meant|change to|switch to)\b/i.test(lc);

      const switchToIncome    = /\b(income certificate|income cert|income)\b/i.test(lc) && !/birth|domicile/i.test(lc);
      const switchToBirth     = /\b(birth certificate|birth cert|birth)\b/i.test(lc) && !/income|domicile/i.test(lc);
      const switchToDomicile  = /\b(domicile|residence certificate|residency certificate|domicile certificate)\b/i.test(lc);

      const isSwitch = switchToIncome || switchToBirth || switchToDomicile;

      if (wantsRestart || isSwitch) {
        // Cancel the current pending application
        await Application.deleteOne({ _id: pending._id });

        if (switchToIncome || (wantsRestart && !isSwitch && pending.service_type === "income_certificate")) {
          const app = await Application.create({
            user_id,
            service_type: "income_certificate",
            status: "waiting_for_name",
            financial_year: currentFY
          });
          return res.json({
            reply: "No problem! Let's start fresh with your Income Certificate application.\n\nPlease enter your Full Name.",
            application_id: app._id.toString()
          });
        }

        if (switchToBirth || (wantsRestart && !isSwitch && pending.service_type === "birth_certificate")) {
          const app = await Application.create({
            user_id,
            service_type: "birth_certificate",
            status: "bc_waiting_for_child_name",
            financial_year: currentFY
          });
          return res.json({
            reply: "No problem! Let's start fresh with your Birth Certificate application.\n\nPlease enter the full name of the child.",
            application_id: app._id.toString()
          });
        }

        if (switchToDomicile || (wantsRestart && !isSwitch && pending.service_type === "domicile_certificate")) {
          const app = await Application.create({
            user_id,
            service_type: "domicile_certificate",
            status: "dc_waiting_for_name",
            financial_year: currentFY
          });
          return res.json({
            reply: "No problem! Let's start fresh with your Domicile Certificate application.\n\n👤 Please enter your Full Name as on Aadhaar.\n💡 Speak your full name as on Aadhaar",
            application_id: app._id.toString()
          });
        }

        // Generic restart — just prompt them to choose
        return res.json({
          reply: "Application cancelled. Which certificate would you like to apply for?\n\n1. Income Certificate\n2. Birth Certificate\n3. Domicile Certificate"
        });
      }
      // ── End mid-flow escape hatch ───────────────────────────

      // ── Income Certificate flow (unchanged) ──────────────
      if (pending.status === "waiting_for_name") {
        pending.name_from_chat = message;
        pending.status = "waiting_for_mobile";
        await pending.save();
        return res.json({ reply: "Thank you. Please enter your Mobile Number." });
      }
      if (pending.status === "waiting_for_mobile") {
        pending.mobile_from_chat = message;
        pending.status = "waiting_for_income";
        await pending.save();
        return res.json({ reply: "Thank you. Please enter your annual Income." });
      }
      if (pending.status === "waiting_for_income") {
        pending.entered_income = message;
        pending.status = "waiting_for_documents";
        await pending.save();
        return res.json({
          reply: "I'll help you get your income certificate. Please upload your Aadhaar card and income proof.",
          application_id: pending._id.toString(),
          show_upload_button: true
        });
      }

      // ── Birth Certificate flow (unchanged) ───────────────
      if (pending.status === "bc_waiting_for_child_name") {
        if (!message || message.trim().length < 2) return res.json({ reply: "Please enter a valid Full Name of the child." });
        pending.child_name = message.trim();
        pending.status = "bc_waiting_for_dob";
        await pending.save();
        return res.json({ reply: "Thank you. What is the Date of Birth? (e.g. DD/MM/YYYY)" });
      }
      if (pending.status === "bc_waiting_for_dob") {
        const parsedDate = new Date(message.replace(/(\d{2})[-/](\d{2})[-/](\d{4})/, "$2/$1/$3"));
        const noVal = parsedDate.toString() === "Invalid Date" ? new Date(message) : parsedDate;
        if (noVal.toString() === "Invalid Date" || noVal > new Date() || noVal.getFullYear() < new Date().getFullYear() - 100) {
          return res.json({ reply: "Invalid Date. Please provide a valid realistic Date of Birth (not in the future)." });
        }
        pending.dob = message.trim();
        pending.status = "bc_waiting_for_place";
        await pending.save();
        return res.json({ reply: "Thank you. Please enter the Place of Birth (hospital name + city)." });
      }
      if (pending.status === "bc_waiting_for_place") {
        if (!message || message.trim().length < 2) return res.json({ reply: "Please enter a valid Place of Birth." });
        pending.place_of_birth = message.trim();
        pending.status = "bc_waiting_for_father";
        await pending.save();
        return res.json({ reply: "Thank you. Please enter the Father's Full Name." });
      }
      if (pending.status === "bc_waiting_for_father") {
        if (!message || message.trim().length < 2) return res.json({ reply: "Please enter a valid Father's Full Name." });
        pending.father_name = message.trim();
        pending.status = "bc_waiting_for_mother";
        await pending.save();
        return res.json({ reply: "Thank you. Please enter the Mother's Full Name." });
      }
      if (pending.status === "bc_waiting_for_mother") {
        if (!message || message.trim().length < 2) return res.json({ reply: "Please enter a valid Mother's Full Name." });
        pending.mother_name = message.trim();
        pending.status = "bc_waiting_for_mobile";
        await pending.save();
        return res.json({ reply: "Thank you. Finally, please enter your Mobile Number." });
      }
      if (pending.status === "bc_waiting_for_mobile") {
        const mobMatches = message.match(/\d/g);
        if (!mobMatches || mobMatches.length !== 10) return res.json({ reply: "Mobile number must be exactly 10 digits. Please try again." });
        pending.bc_mobile = message.trim();
        pending.status = "bc_waiting_for_documents";
        await pending.save();
        return res.json({
          reply: "Information saved. Please upload the Birth Proof (e.g. Hospital Discharge Summary, Municipal Birth Record).",
          application_id: pending._id.toString(),
          show_birth_upload_proof: true
        });
      }

      if (pending.service_type === "birth_certificate") {
        if (["pending", "sent_to_officer"].includes(pending.status)) {
          return res.json({ reply: "Your application is currently pending officer review. You can check its status in the My Applications tab." });
        }
        return res.json({
          reply: `You already have a pending application for financial year ${currentFY}. Please upload your documents to proceed.`,
          application_id: pending._id.toString(),
          show_birth_upload_proof: true,
          birth_upload_step: pending.status === "bc_waiting_for_parent_aadhaar" ? 2 : 1
        });
      }

      // ── Domicile Certificate flow ─────────────────────────

      // Step 2, Field 1: Full Name
      if (pending.status === "dc_waiting_for_name") {
        if (!isValidFullName(message)) {
          return res.json({ reply: "❗ Please enter your full name (first + last name) as on Aadhaar. No numbers or special characters.\n💡 Speak your full name as on Aadhaar" });
        }
        pending.dc_full_name = message.trim();
        pending.status = "dc_waiting_for_mobile";
        await pending.save();
        return res.json({ reply: "Thank you, " + message.trim().split(" ")[0] + ".\n\nPlease enter your 10-digit mobile number.\n💡 Say each digit clearly" });
      }

      // Step 2, Field 2: Mobile
      if (pending.status === "dc_waiting_for_mobile") {
        const digits = message.replace(/\D/g, "");
        if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
          return res.json({ reply: "❗ Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9. Please try again.\n💡 Say each digit clearly" });
        }
        pending.dc_mobile = digits;
        pending.status = "dc_waiting_for_address_house";
        await pending.save();
        return res.json({ reply: "Got it! Now let's capture your complete current address step by step.\n\n📍 Step 1/6: Please enter your House / Flat Number\n💡 Speak each part of your address clearly" });
      }

      // Step 2, Field 3 (address parts)
      if (pending.status === "dc_waiting_for_address_house") {
        if (!message || message.trim().length < 1) return res.json({ reply: "❗ House / Flat number is required. Please enter it.\n💡 Speak each part of your address clearly" });
        pending.dc_house_no = message.trim();
        pending.status = "dc_waiting_for_address_street";
        await pending.save();
        return res.json({ reply: "📍 Step 2/6: Please enter your Street / Area Name\n💡 Speak each part of your address clearly" });
      }
      if (pending.status === "dc_waiting_for_address_street") {
        if (!message || message.trim().length < 2) return res.json({ reply: "❗ Street / Area name is required. Please enter it.\n💡 Speak each part of your address clearly" });
        pending.dc_street = message.trim();
        pending.status = "dc_waiting_for_address_city";
        await pending.save();
        return res.json({ reply: "📍 Step 3/6: Please enter your City / Village\n💡 Speak each part of your address clearly" });
      }
      if (pending.status === "dc_waiting_for_address_city") {
        if (!message || message.trim().length < 2) return res.json({ reply: "❗ City / Village name is required. Please enter it.\n💡 Speak each part of your address clearly" });
        pending.dc_city = message.trim();
        pending.status = "dc_waiting_for_address_district";
        await pending.save();
        return res.json({ reply: "📍 Step 4/6: Please enter your District\n💡 Speak each part of your address clearly" });
      }
      if (pending.status === "dc_waiting_for_address_district") {
        if (!message || message.trim().length < 2) return res.json({ reply: "❗ District is required. Please enter it.\n💡 Speak each part of your address clearly" });
        pending.dc_district = message.trim();
        pending.status = "dc_waiting_for_address_state";
        await pending.save();
        return res.json({ reply: "📍 Step 5/6: Please enter your State (e.g. Maharashtra, Gujarat, Delhi)\n💡 Speak each part of your address clearly" });
      }
      if (pending.status === "dc_waiting_for_address_state") {
        if (!message || message.trim().length < 2) return res.json({ reply: "❗ State is required. Please enter it.\n💡 Speak each part of your address clearly" });
        if (!isValidIndianState(message)) {
          return res.json({ reply: "❗ Please enter a valid Indian state or union territory name (e.g. Maharashtra, Gujarat, Delhi, Tamil Nadu).\n💡 Speak each part of your address clearly" });
        }
        pending.dc_state = message.trim();
        pending.status = "dc_waiting_for_address_pin";
        await pending.save();
        return res.json({ reply: "📍 Step 6/6: Please enter your 6-digit PIN Code\n💡 Speak each part of your address clearly" });
      }
      if (pending.status === "dc_waiting_for_address_pin") {
        const pinDigits = message.replace(/\D/g, "");
        if (pinDigits.length !== 6) {
          return res.json({ reply: "❗ PIN code must be exactly 6 digits. Please try again.\n💡 Speak each part of your address clearly" });
        }
        pending.dc_pin = pinDigits;

        // Jurisdiction lookup (silent)
        const jurisdiction = lookupJurisdiction(pinDigits);
        if (jurisdiction) {
          pending.dc_assigned_officer = jurisdiction.officer;
        } else {
          pending.dc_jurisdiction_flag = "UNASSIGNED_JURISDICTION";
          pending.dc_assigned_officer = "District Admin";
        }

        pending.status = "dc_waiting_for_duration";
        await pending.save();
        return res.json({
          reply: "Address saved ✅\n\n⏱️ How many years have you been living at this address continuously?\n\n💡 Say the number of years.\nExample: fifteen years / पंद्रह साल / पंधरा वर्षे"
        });
      }

      // Step 2, Field 4: Duration of stay
      if (pending.status === "dc_waiting_for_duration") {
        const years = parseNumberInput(message);
        if (years === null || isNaN(years) || years <= 0) {
          return res.json({ reply: "❗ Please enter a valid number of years (e.g. 15 or \"fifteen\").\n💡 Say the number of years. Example: fifteen years / पंद्रह साल / पंधरा वर्षे" });
        }
        if (years > 100) {
          return res.json({ reply: "❗ The number of years seems unrealistic. Please enter a valid number (1–100).\n💡 Say the number of years. Example: fifteen years / पंद्रह साल / पंधरा वर्षे" });
        }
        pending.dc_duration_years = years;
        pending.status = "dc_waiting_for_purpose";
        await pending.save();
        return res.json({
          reply: `Got it — ${years} year(s) at this address.\n\n📄 What is the purpose of this Domicile Certificate?\n\n1. College / University Admission\n2. Government Job Application\n3. Scholarship Application\n4. Property / Land Registration\n5. Other Government Purpose\n\nPlease reply with the number (1–5) or describe your purpose.`
        });
      }

      // Step 2, Field 5: Purpose
      if (pending.status === "dc_waiting_for_purpose") {
        const purpose = parsePurpose(message);
        if (!purpose) {
          return res.json({
            reply: "❗ Please select a purpose by entering 1–5:\n\n1. College / University Admission\n2. Government Job Application\n3. Scholarship Application\n4. Property / Land Registration\n5. Other Government Purpose"
          });
        }
        pending.dc_purpose = purpose;
        pending.status = "dc_waiting_for_aadhaar";
        await pending.save();
        return res.json({
          reply: `Purpose recorded: ${purpose}\n\n✅ All information collected!\n\nNow I need three documents from you. I will ask for them one by one.\n\n📎 Document 1 of 3: Please upload your Aadhaar Card (front side).\nAccepted: JPG, PNG, PDF — max 5MB`,
          application_id: pending._id.toString(),
          show_domicile_upload: true,
          domicile_upload_step: 1
        });
      }

      // Domicile upload steps — user texts while in document waiting states
      if (["dc_waiting_for_aadhaar", "dc_waiting_for_address_proof", "dc_waiting_for_residency_proof"].includes(pending.status)) {
        const stepMap = {
          "dc_waiting_for_aadhaar": "Document 1 of 3: Aadhaar Card",
          "dc_waiting_for_address_proof": "Document 2 of 3: Address Proof",
          "dc_waiting_for_residency_proof": "Document 3 of 3: Residency Duration Proof",
        };
        const stepNum = { "dc_waiting_for_aadhaar": 1, "dc_waiting_for_address_proof": 2, "dc_waiting_for_residency_proof": 3 };
        return res.json({
          reply: `Please upload ${stepMap[pending.status]} using the upload button below.`,
          application_id: pending._id.toString(),
          show_domicile_upload: true,
          domicile_upload_step: stepNum[pending.status]
        });
      }

      if (pending.service_type === "domicile_certificate" && ["pending", "sent_to_officer"].includes(pending.status)) {
        return res.json({ reply: "Your Domicile Certificate application is under review by the officer. You can check its status in the My Applications tab." });
      }

      // Fallback for income certificate
      if (pending.service_type === "income_certificate") {
        const responseData = {
          reply: `You already have a pending application for financial year ${currentFY}. Please upload your documents to proceed.`,
          application_id: pending._id.toString(),
          show_upload_button: true
        };
        return res.json(responseData);
      }
    }

    // ── No pending app — detect intent ─────────────────────
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a government AI assistant.
Detect intent and return JSON only.
Intents: greeting, apply_income_certificate, apply_birth_certificate, apply_domicile_certificate, check_application_status, general_query

Domicile certificate triggers include: "domicile certificate", "residence certificate", "domicile chahiye", "rahivasi dakhala", "adhiwas praman patra", "अधिवास प्रमाणपत्र", "रहिवासी दाखला", "apply domicile", "domicile apply"

Return: {"intent":"intent_name"}`
        },
        { role: "user", content: message }
      ]
    });

    const raw = completion.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return res.json({ reply: "I can help you apply for an Income Certificate, Birth Certificate, or Domicile Certificate. Please tell me which one you need." });
    }

    const ai = JSON.parse(jsonMatch[0]);
    const intent = ai.intent;
    console.log("Detected intent:", intent);

    if (intent === "greeting") {
      return res.json({
        reply: "Hello! I am SenateBot. I can help you apply for an Income Certificate, Birth Certificate, or Domicile Certificate. Please tell me which certificate you need."
      });
    }

    if (intent === "apply_income_certificate") {
      const approved = await Application.findOne({
        user_id,
        service_type: "income_certificate",
        status: "approved",
        financial_year: currentFY
      });
      if (approved) {
        return res.json({
          reply: `You already have an approved income certificate for financial year ${currentFY}. You can download it from My Applications tab.`,
          application_id: approved._id.toString(),
          certificate_url: approved.certificate_url || null,
          already_approved: true
        });
      }
      const app = await Application.create({
        user_id,
        service_type: "income_certificate",
        status: "waiting_for_name",
        financial_year: currentFY
      });
      return res.json({
        reply: "Please enter your Name.",
        application_id: app._id.toString(),
        show_upload_button: false
      });
    }

    if (intent === "apply_birth_certificate") {
      const approved = await Application.findOne({
        user_id,
        service_type: "birth_certificate",
        status: "approved",
        financial_year: currentFY
      });
      if (approved) {
        return res.json({
          reply: "You already have an approved Birth Certificate. You can download it from My Applications tab.",
          application_id: approved._id.toString(),
          certificate_url: approved.certificate_url || null,
          already_approved: true
        });
      }
      const app = await Application.create({
        user_id,
        service_type: "birth_certificate",
        status: "bc_waiting_for_child_name",
        financial_year: currentFY
      });
      return res.json({
        reply: "I can help you with the birth certificate application. First, please enter the full name of the child.",
        application_id: app._id.toString(),
        show_upload_button: false
      });
    }

    // ── Domicile Certificate intent ─────────────────────────
    if (intent === "apply_domicile_certificate") {
      const approved = await Application.findOne({
        user_id,
        service_type: "domicile_certificate",
        status: "approved"
      });
      if (approved) {
        return res.json({
          reply: "You already have an approved Domicile Certificate. You can download it from My Applications tab.",
          application_id: approved._id.toString(),
          certificate_url: approved.certificate_url || null,
          already_approved: true
        });
      }
      const app = await Application.create({
        user_id,
        service_type: "domicile_certificate",
        status: "dc_waiting_for_name",
        financial_year: currentFY
      });
      return res.json({
        reply: "I will help you apply for a Domicile Certificate. Let me collect some details.\nYou can type or use the microphone to speak your answers.\n\n👤 Please enter your Full Name as on Aadhaar.\n💡 Speak your full name as on Aadhaar",
        application_id: app._id.toString(),
        show_upload_button: false
      });
    }

    if (intent === "check_application_status") {
      return res.json({
        reply: "Please go to the 'My Applications' tab to check your application status and download your certificate."
      });
    }

    return res.json({
      reply: "I can help you apply for an Income Certificate, Birth Certificate, or Domicile Certificate. Just let me know which one you need."
    });

  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ reply: "Server error. Please try again." });
  }
};