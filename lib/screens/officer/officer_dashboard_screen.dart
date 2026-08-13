import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants.dart';
import '../../services/auth_service.dart';
import '../login/login_screen.dart';

class OfficerDashboardScreen extends StatefulWidget {
  const OfficerDashboardScreen({Key? key}) : super(key: key);

  @override
  _OfficerDashboardScreenState createState() =>
      _OfficerDashboardScreenState();
}

class _OfficerDashboardScreenState extends State<OfficerDashboardScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List _pendingApps = [];
  List _allApps = [];
  bool _isLoading = true;
  String? _officerName;
  String? _departmentName;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadOfficerInfo();
    _loadApplications();
  }

  Future<void> _loadOfficerInfo() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _officerName = prefs.getString('user_name') ?? "Officer";
      _departmentName =
          prefs.getString('department_name') ?? "Government Department";
    });
  }

  Future<void> _loadApplications() async {
    setState(() => _isLoading = true);
    try {
      final pendingRes = await http.get(
        Uri.parse(
            "${AppConstants.baseUrl}/api/officer/applications/pending"),
      );
      final allRes = await http.get(
        Uri.parse("${AppConstants.baseUrl}/api/officer/applications/all"),
      );

      setState(() {
        _pendingApps = jsonDecode(pendingRes.body);
        _allApps = jsonDecode(allRes.body);
        _isLoading = false;
      });
    } catch (e) {
      print("Error loading applications: $e");
      setState(() => _isLoading = false);
    }
  }

  Future<void> _approveOrReject(
      String id, String action, String? note) async {
    final url = action == "approve"
        ? "${AppConstants.baseUrl}/api/officer/approve/$id"
        : "${AppConstants.baseUrl}/api/officer/reject/$id";

    await http.post(
      Uri.parse(url),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"note": note ?? "$action by officer"}),
    );

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            "Application ${action == 'approve' ? 'Approved ✅' : 'Rejected ❌'}"),
        backgroundColor:
            action == "approve" ? Colors.green : Colors.red,
      ),
    );

    _loadApplications();
  }

  void _showApplicationDetails(Map app) {
    final noteController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        builder: (_, controller) => SingleChildScrollView(
          controller: controller,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [

              // Handle bar
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              const Text(
                "Application Details",
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1A3C6E),
                ),
              ),
              const SizedBox(height: 16),

              // Status badge
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: _statusColor(app["status"] ?? "")
                      .withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                      color: _statusColor(app["status"] ?? "")),
                ),
                child: Text(
                  (app["status"] ?? "")
                      .toString()
                      .replaceAll("_", " ")
                      .toUpperCase(),
                  style: TextStyle(
                    color: _statusColor(app["status"] ?? ""),
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Application info
              _sectionTitle("Application Info"),
              _detailRow("Application ID",
                  app["_id"]?.toString() ?? "-"),
              _detailRow("Service",
                  (app["service_type"] ?? "-")
                      .toString()
                      .replaceAll("_", " ")
                      .toUpperCase()),
              _detailRow(
                  "Financial Year", app["financial_year"] ?? "-"),
              if (app["service_type"] == "income_certificate") ...[
                _detailRow(
                  "Extracted Income",
                  app["extracted_income"] != null
                      ? "₹${app["extracted_income"].toString()}"
                      : "Not extracted / Manual review needed",
                ),
                _detailRow("Aadhaar Number", app["aadhaar_number"] ?? "Not extracted"),
              ] else if (app["service_type"] == "birth_certificate") ...[
                _detailRow("Child Name", app["child_name"] ?? "-"),
                _detailRow("Date of Birth", app["dob"] ?? "-"),
                _detailRow("Place of Birth", app["place_of_birth"] ?? "-"),
                _detailRow("Father's Name", app["father_name"] ?? "-"),
                _detailRow("Mother's Name", app["mother_name"] ?? "-"),
                _detailRow("Mobile", app["bc_mobile"] ?? "-"),
                _detailRow("Detected Parent document", app["bc_parent_detected"] != null ? app["bc_parent_detected"].toString().toUpperCase() : "Unknown"),
                _detailRow("Match Confidence", app["bc_confidence_score"] != null ? "${app["bc_confidence_score"]}%" : "N/A"),
                _detailRow("Risk Level", app["bc_risk_level"] ?? "N/A"),
              ] else if (app["service_type"] == "domicile_certificate") ...[
                // ── Domicile: Applicant Section ──
                _detailRow("Full Name", app["dc_full_name"] ?? "-"),
                _detailRow("Mobile", app["dc_mobile"] ?? "-"),
                _detailRow("Aadhaar (Last 4)", app["dc_aadhaar_last4"] ?? "-"),
                _detailRow("Date of Birth", app["dc_dob"] ?? "-"),
                _detailRow("Purpose", app["dc_purpose"] ?? "-"),
                _detailRow("Assigned Officer", app["dc_assigned_officer"] ?? "District Admin"),
                if (app["dc_jurisdiction_flag"] != null)
                  _detailRow("Jurisdiction", "⚠️ UNASSIGNED — ${app["dc_jurisdiction_flag"]}"),
                const SizedBox(height: 12),

                // ── Address Verification Section ──
                _sectionTitle("Address Verification"),
                _addressCompareRow(
                  "State",
                  app["dc_state"], 
                  app["dc_aadhaar_ocr"]?["state"],
                  app["dc_state"]?.toString().toLowerCase() == app["dc_aadhaar_ocr"]?["state"]?.toString().toLowerCase(),
                ),
                _addressCompareRow(
                  "District",
                  app["dc_district"],
                  app["dc_aadhaar_ocr"]?["district"],
                  null,
                ),
                _addressCompareRow(
                  "City / Area",
                  app["dc_city"],
                  app["dc_aadhaar_ocr"]?["city"],
                  null,
                ),
                _addressCompareRow(
                  "PIN Code",
                  app["dc_pin"],
                  app["dc_aadhaar_ocr"]?["pin"],
                  app["dc_pin"] == app["dc_aadhaar_ocr"]?["pin"],
                ),
                const SizedBox(height: 12),

                // ── Duration Section ──
                _sectionTitle("Duration Section"),
                _detailRow("Declared Duration", "${app["dc_duration_years"] ?? "-"} years"),
                _detailRow("Minimum Required", "15 years"),
                _detailRow(
                  "Eligibility",
                  (app["dc_duration_years"] != null && app["dc_duration_years"] >= 15)
                      ? "✅ ELIGIBLE"
                      : "❌ INSUFFICIENT",
                ),
                if (app["dc_aadhaar_ocr"]?["dob"] != null)
                  _detailRow("DOB (from Aadhaar)", app["dc_aadhaar_ocr"]["dob"]),
                const SizedBox(height: 12),

                // ── OCR Confidence ──
                _sectionTitle("OCR Confidence"),
                _detailRow("Aadhaar OCR", "${app["dc_aadhaar_ocr"]?["ocr_confidence"] ?? "N/A"}%"),
                _detailRow("Address Proof OCR", "${app["dc_address_proof_ocr"]?["ocr_confidence"] ?? "N/A"}%"),
                _detailRow("Residency Proof OCR", "${app["dc_residency_proof_ocr"]?["ocr_confidence"] ?? "N/A"}%"),
                _detailRow("Overall Confidence", app["dc_confidence_score"] != null ? "${app["dc_confidence_score"]}%" : "N/A"),
                _detailRow("Risk Level", app["dc_risk_level"] ?? "N/A"),
              ],
              _detailRow("Officer Note", app["officer_note"] ?? "-"),
              _detailRow(
                  "Applied On",
                  app["createdAt"] != null
                      ? app["createdAt"].toString().substring(0, 10)
                      : "-"),

              const SizedBox(height: 16),

              // Flags view for Birth Certificates
              if (app["service_type"] == "birth_certificate" && app["bc_flags"] != null && (app["bc_flags"] as List).isNotEmpty) ...[
                _sectionTitle("Flagged Issues"),
                ...(app["bc_flags"] as List).map((flag) => Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.red[50],
                    border: Border.all(color: Colors.red[200]!),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.warning, color: Colors.red, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          flag.toString(),
                          style: const TextStyle(color: Colors.red, fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                )),
                const SizedBox(height: 16),
              ],

              // Flags view for Domicile Certificates
              if (app["service_type"] == "domicile_certificate" && app["dc_flags"] != null && (app["dc_flags"] as List).isNotEmpty) ...[
                _sectionTitle("Flag Summary"),
                _buildFlagSummary(app["dc_flags"] as List),
                const SizedBox(height: 16),
              ],

              // User info
              if (app["user"] != null) ...[
                _sectionTitle("Applicant Account"),
                _detailRow("Name", app["user"]["name"] ?? "-"),
                _detailRow("Email", app["user"]["email"] ?? "-"),
                _detailRow("Phone",
                    "+91 ${app["user"]["phone"] ?? "-"}"),
              ],

              const SizedBox(height: 16),

              // Documents
              _sectionTitle("Uploaded Documents"),
              if (app["documents"] != null &&
                  (app["documents"] as List).isNotEmpty)
                ...(app["documents"] as List).map((doc) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: const Icon(
                            Icons.insert_drive_file,
                            color: Color(0xFF1A3C6E)),
                        title: Text(
                          (doc["file_type"] ?? "Document")
                              .toString()
                              .replaceAll("_", " ")
                              .toUpperCase(),
                          style: const TextStyle(
                              fontWeight: FontWeight.w600),
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.open_in_new,
                              color: Color(0xFF1A3C6E)),
                          onPressed: () async {
                            final url = doc["file_url"];
                            if (url != null) {
                              final uri = Uri.parse(url);
                              if (await canLaunchUrl(uri)) {
                                await launchUrl(uri,
                                    mode: LaunchMode
                                        .externalApplication);
                              }
                            }
                          },
                        ),
                      ),
                    ))
              else
                Text("No documents found",
                    style: TextStyle(color: Colors.grey[500])),

              const SizedBox(height: 16),

              // Officer note input
              if (app["status"] == "sent_to_officer") ...[
                _sectionTitle("Add Note (Optional)"),
                TextField(
                  controller: noteController,
                  maxLines: 2,
                  decoration: InputDecoration(
                    hintText: "Add a note for this decision...",
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10)),
                    filled: true,
                    fillColor: Colors.grey[50],
                  ),
                ),
                const SizedBox(height: 16),

                // Approve / Reject buttons
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _approveOrReject(
                              app["_id"], "approve", noteController.text);
                        },
                        icon: const Icon(Icons.check,
                            color: Colors.white),
                        label: const Text("Approve",
                            style: TextStyle(color: Colors.white)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          padding: const EdgeInsets.symmetric(
                              vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _approveOrReject(
                              app["_id"], "reject", noteController.text);
                        },
                        icon: const Icon(Icons.close,
                            color: Colors.white),
                        label: const Text("Reject",
                            style: TextStyle(color: Colors.white)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          padding: const EdgeInsets.symmetric(
                              vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],

              // Download certificate if approved
              if (app["certificate_url"] != null) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      final uri =
                          Uri.parse(app["certificate_url"]);
                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri,
                            mode: LaunchMode.externalApplication);
                      }
                    },
                    icon: const Icon(Icons.download,
                        color: Colors.white),
                    label: const Text("Download Certificate",
                        style: TextStyle(color: Colors.white)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2E7D32),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: const TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 14,
          color: Color(0xFF1A3C6E),
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: TextStyle(
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w500,
                  fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                  fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case "approved": return Colors.green;
      case "rejected": return Colors.red;
      case "sent_to_officer": return Colors.orange;
      case "waiting_for_documents": return Colors.blue;
      default: return Colors.grey;
    }
  }

  // Side-by-side address comparison row for domicile dashboard
  Widget _addressCompareRow(String label, dynamic entered, dynamic ocr, bool? isMatch) {
    final matchIcon = isMatch == null
        ? Icons.help_outline
        : isMatch
            ? Icons.check_circle
            : Icons.cancel;
    final matchColor = isMatch == null
        ? Colors.grey
        : isMatch
            ? Colors.green
            : Colors.red;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(label,
                style: TextStyle(
                    color: Colors.grey[600], fontSize: 12, fontWeight: FontWeight.w500)),
          ),
          Expanded(
            child: Text(entered?.toString() ?? "-",
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Text(ocr?.toString() ?? "(not extracted)",
                style: TextStyle(fontSize: 12, color: Colors.grey[600])),
          ),
          Icon(matchIcon, color: matchColor, size: 16),
        ],
      ),
    );
  }

  // Colored flag list for domicile dashboard
  Widget _buildFlagSummary(List flags) {
    Color riskColor;
    String riskLabel;
    if (flags.isEmpty) {
      riskColor = Colors.green;
      riskLabel = "LOW RISK";
    } else if (flags.length == 1) {
      riskColor = Colors.orange;
      riskLabel = "MEDIUM RISK";
    } else {
      riskColor = Colors.red;
      riskLabel = "HIGH RISK — PRIORITY REVIEW";
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: riskColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: riskColor),
          ),
          child: Row(
            children: [
              Icon(Icons.shield, color: riskColor, size: 14),
              const SizedBox(width: 6),
              Text(riskLabel,
                  style: TextStyle(
                      color: riskColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 12)),
              const Spacer(),
              Text("${flags.length} flag(s)",
                  style: TextStyle(color: riskColor, fontSize: 11)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        ...flags.map((flag) => Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.red[50],
                border: Border.all(color: Colors.red[200]!),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded, color: Colors.red, size: 14),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(flag.toString(),
                        style: const TextStyle(
                            color: Colors.red, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            )),
      ],
    );
  }

  Widget _buildAppCard(Map app) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showApplicationDetails(app),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    (app["service_type"] ?? "")
                        .toString()
                        .replaceAll("_", " ")
                        .toUpperCase(),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: Color(0xFF1A3C6E),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _statusColor(app["status"] ?? "")
                          .withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                          color: _statusColor(app["status"] ?? "")),
                    ),
                    child: Text(
                      (app["status"] ?? "")
                          .toString()
                          .replaceAll("_", " ")
                          .toUpperCase(),
                      style: TextStyle(
                        color: _statusColor(app["status"] ?? ""),
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // Applicant name
              if (app["user"] != null)
                Row(
                  children: [
                    const Icon(Icons.person_outline,
                        size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      app["user"]["name"] ?? "-",
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500),
                    ),
                  ],
                ),

              const SizedBox(height: 4),

              // Conditional Income or Confidence
              if (app["service_type"] == "income_certificate")
                Row(
                  children: [
                    const Icon(Icons.currency_rupee,
                        size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      app["extracted_income"] != null
                          ? "Income: ₹${app["extracted_income"]}"
                          : "Income: Not extracted",
                      style: TextStyle(
                        fontSize: 13,
                        color: app["extracted_income"] != null
                            ? Colors.black87
                            : Colors.orange,
                      ),
                    ),
                  ],
                )
              else if (app["service_type"] == "birth_certificate")
                Row(
                  children: [
                    const Icon(Icons.child_care,
                        size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      app["child_name"] != null
                          ? "Child: ${app["child_name"]}"
                          : "-",
                      style: const TextStyle(
                        fontSize: 13,
                        color: Colors.black87,
                      ),
                    ),
                    if (app["bc_risk_level"] == "HIGH") ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(4)
                        ),
                        child: const Text("PRIORITY REVIEW", style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                      )
                    ]
                  ],
                )
              else if (app["service_type"] == "domicile_certificate")
                Row(
                  children: [
                    const Icon(Icons.home_work, size: 14, color: Color(0xFF4527A0)),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        app["dc_full_name"] != null
                            ? "${app["dc_full_name"]} • ${app["dc_state"] ?? ""}"
                            : "-",
                        style: const TextStyle(fontSize: 13, color: Colors.black87),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (app["dc_risk_level"] == "HIGH" || (app["dc_flags"] != null && (app["dc_flags"] as List).length >= 2)) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text("PRIORITY REVIEW",
                            style: TextStyle(
                                color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                      ),
                    ] else if (app["dc_risk_level"] == "MEDIUM" || (app["dc_flags"] != null && (app["dc_flags"] as List).length == 1)) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.orange,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text("REVIEW",
                            style: TextStyle(
                                color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                      ),
                    ]
                  ],
                ),

              const SizedBox(height: 4),

              // Financial year and date
              Row(
                children: [
                  const Icon(Icons.calendar_today,
                      size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(
                    "FY: ${app["financial_year"] ?? "-"}",
                    style: const TextStyle(
                        fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(width: 16),
                  const Icon(Icons.access_time,
                      size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(
                    app["createdAt"] != null
                        ? app["createdAt"]
                            .toString()
                            .substring(0, 10)
                        : "-",
                    style: const TextStyle(
                        fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),

              // Officer note if exists
              if (app["officer_note"] != null &&
                  app["officer_note"].toString().isNotEmpty) ...[
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.orange[50],
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline,
                          size: 14, color: Colors.orange),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          app["officer_note"],
                          style: const TextStyle(
                              fontSize: 11, color: Colors.orange),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 8),
              const Align(
                alignment: Alignment.centerRight,
                child: Text(
                  "Tap to view details →",
                  style: TextStyle(
                      fontSize: 11,
                      color: Color(0xFF1A3C6E),
                      fontStyle: FontStyle.italic),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "Officer Dashboard",
              style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 16),
            ),
            if (_departmentName != null)
              Text(
                _departmentName!,
                style: const TextStyle(
                    color: Colors.white70, fontSize: 11),
              ),
          ],
        ),
        backgroundColor: const Color(0xFF1A3C6E),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadApplications,
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () async {
              await AuthService.logout();
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(
                    builder: (_) => const LoginScreen()),
                (route) => false,
              );
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          tabs: [
            Tab(text: "Pending (${_pendingApps.length})"),
            Tab(text: "All (${_allApps.length})"),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                  color: Color(0xFF1A3C6E)))
          : TabBarView(
              controller: _tabController,
              children: [
                _pendingApps.isEmpty
                    ? const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.inbox,
                                size: 60, color: Colors.grey),
                            SizedBox(height: 12),
                            Text("No pending applications",
                                style:
                                    TextStyle(color: Colors.grey)),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadApplications,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _pendingApps.length,
                          itemBuilder: (context, index) =>
                              _buildAppCard(_pendingApps[index]),
                        ),
                      ),
                _allApps.isEmpty
                    ? const Center(
                        child: Text("No applications found",
                            style: TextStyle(color: Colors.grey)))
                    : RefreshIndicator(
                        onRefresh: _loadApplications,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _allApps.length,
                          itemBuilder: (context, index) =>
                              _buildAppCard(_allApps[index]),
                        ),
                      ),
              ],
            ),
    );
  }
}