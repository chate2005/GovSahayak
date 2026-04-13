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

exports.chat = async (req, res) => {
  try {
    const { message, user_id } = req.body;

    console.log("Chat from user_id:", user_id);

    if (!user_id) {
      return res.status(400).json({ reply: "Please login again." });
    }

    const currentFY = getFinancialYear();
    const pending = await Application.findOne({
      user_id,
      service_type: "income_certificate",
      status: {
        $in: ["waiting_for_name", "waiting_for_mobile", "waiting_for_income", "waiting_for_documents", "pending", "sent_to_officer"]
      },
      financial_year: currentFY
    });

    if (pending) {
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
      
      const responseData = {
        reply: `You already have a pending application for financial year ${currentFY}. Please upload your documents to proceed.`,
        application_id: pending._id.toString(),
        show_upload_button: true
      };
      return res.json(responseData);
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a government AI assistant.
Detect intent and return JSON only.
Intents: greeting, apply_income_certificate, check_application_status, general_query
Return: {"intent":"intent_name"}`
        },
        { role: "user", content: message }
      ]
    });

    const raw = completion.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return res.json({
        reply: "I can help you apply for an income certificate."
      });
    }

    const ai = JSON.parse(jsonMatch[0]);
    const intent = ai.intent;
    console.log("Detected intent:", intent);

    if (intent === "greeting") {
      return res.json({
        reply: "Hello! I can help you apply for an income certificate. Just say 'I want income certificate'."
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

      const responseData = {
        reply: "Please enter your Name.",
        application_id: app._id.toString(),
        show_upload_button: false
      };
      return res.json(responseData);
    }

    if (intent === "check_application_status") {
      return res.json({
        reply: "Please go to the 'My Applications' tab to check your application status and download your certificate."
      });
    }

    return res.json({
      reply: "I can help you apply for an income certificate. Just say 'I want income certificate'."
    });

  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ reply: "Server error. Please try again." });
  }
};