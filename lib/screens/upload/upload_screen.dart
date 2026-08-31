import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants.dart';

class UploadScreen extends StatefulWidget {
  final String applicationId;
  const UploadScreen({Key? key, required this.applicationId}) : super(key: key);

  @override
  _UploadScreenState createState() => _UploadScreenState();
}

class _UploadScreenState extends State<UploadScreen> {
  Uint8List? _aadhaarBytes;
  String? _aadhaarFileName;
  Uint8List? _incomeProofBytes;
  String? _incomeProofFileName;
  bool _isUploading = false;
  String? _statusMessage;
  bool _isSuccess = false;
  String? _resultStatus;
  String? _certificateUrl;
  int? _extractedIncome;

  Future<void> _pickFile(String type) async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
      withData: true,
    );

    if (result != null && result.files.single.bytes != null) {
      setState(() {
        if (type == 'aadhaar') {
          _aadhaarBytes = result.files.single.bytes;
          _aadhaarFileName = result.files.single.name;
        } else {
          _incomeProofBytes = result.files.single.bytes;
          _incomeProofFileName = result.files.single.name;
        }
      });
    }
  }

  Future<void> _uploadDocuments() async {
    if (_aadhaarBytes == null || _incomeProofBytes == null) {
      setState(() {
        _statusMessage = "Please select both documents before uploading.";
        _isSuccess = false;
      });
      return;
    }

    setState(() {
      _isUploading = true;
      _statusMessage = null;
    });

    try {
      var request = http.MultipartRequest(
        "POST",
        Uri.parse("${AppConstants.baseUrl}/api/income/upload"),
      );

      request.fields["application_id"] = widget.applicationId;

      request.files.add(http.MultipartFile.fromBytes(
        "aadhaar", _aadhaarBytes!,
        filename: _aadhaarFileName ?? "aadhaar.jpg",
      ));

      request.files.add(http.MultipartFile.fromBytes(
        "income_proof", _incomeProofBytes!,
        filename: _incomeProofFileName ?? "income_proof.jpg",
      ));

      var streamedResponse = await request.send();
      var response = await http.Response.fromStream(streamedResponse);

      print("Response status: ${response.statusCode}");
      print("Response body: ${response.body}");

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);

        setState(() {
          _isUploading = false;
          _resultStatus = data["status"];
          _certificateUrl = data["certificate_url"];
          _extractedIncome = data["extracted_income"] != null
              ? (data["extracted_income"] as num).toInt()
              : null;

          if (_resultStatus == "approved") {
            _isSuccess = true;
            _statusMessage =
                "✅ Congratulations! Your income certificate is APPROVED!\n\nExtracted Annual Income: ₹${_extractedIncome?.toString() ?? 'N/A'}";

          } else if (_resultStatus == "duplicate") {
            _isSuccess = false;
            _statusMessage =
                "⚠️ An income certificate for this Aadhaar number already exists for this financial year. You cannot apply again.\n\nYou can download your existing certificate below.";

          } else if (_resultStatus == "sent_to_officer") {
            _isSuccess = true;
            _statusMessage =
                "📋 Your application has been sent to an officer for manual review. You will be notified once reviewed.";

          } else {
            _isSuccess = true;
            _statusMessage = "Documents submitted successfully!";
          }
        });

      } else {
        setState(() {
          _isUploading = false;
          _isSuccess = false;
          _statusMessage =
              "Upload failed (${response.statusCode}). Please try again.";
        });
      }
    } catch (e) {
      print("Upload error: $e");
      setState(() {
        _isUploading = false;
        _isSuccess = false;
        _statusMessage = "Error: ${e.toString()}";
      });
    }
  }

  Future<void> _downloadCertificate() async {
    if (_certificateUrl == null) return;
    final uri = Uri.parse(_certificateUrl!);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Could not open certificate")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          "Upload Documents",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1A3C6E),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            const Text(
              "Income Certificate Application",
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFF1A3C6E),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "Application ID: ${widget.applicationId}",
              style: TextStyle(color: Colors.grey[600], fontSize: 12),
            ),
            const SizedBox(height: 8),

            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue[200]!),
              ),
              child: const Text(
                "ℹ️ GovSahayak AI is verifying your eligibility and uploaded documents in real-time according to official government standards.",
                style: TextStyle(fontSize: 12, color: Colors.blue),
              ),
            ),
            const SizedBox(height: 24),

            _buildUploadTile(
              label: "Aadhaar Card",
              subtitle: "Upload your Aadhaar card (PDF/JPG/PNG)",
              fileName: _aadhaarFileName,
              isSelected: _aadhaarBytes != null,
              onTap: () => _pickFile('aadhaar'),
              icon: Icons.credit_card,
            ),
            const SizedBox(height: 16),

            _buildUploadTile(
              label: "Income / Salary Proof",
              subtitle: "Salary slip or income document (PDF/JPG/PNG)",
              fileName: _incomeProofFileName,
              isSelected: _incomeProofBytes != null,
              onTap: () => _pickFile('income_proof'),
              icon: Icons.description,
            ),
            const SizedBox(height: 24),

            // ── Result message ──
            if (_statusMessage != null)
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: _isSuccess ? Colors.green[50] : Colors.orange[50],
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: _isSuccess ? Colors.green : Colors.orange,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _statusMessage!,
                      style: TextStyle(
                        color: _isSuccess
                            ? Colors.green[800]
                            : Colors.orange[800],
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),

                    const SizedBox(height: 12),

                    // Official Notice Disclaimer
                    if (_resultStatus == "approved") ...[
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.green[100]?.withOpacity(0.6),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.green[300]!),
                        ),
                        child: const Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.verified_user, size: 18, color: Color(0xFF2E7D32)),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                "Official Notice: This certificate has been issued under the standard government verification framework based on authentic documents and e-KYC credentials submitted by you.",
                                style: TextStyle(fontSize: 11, color: Color(0xFF1B5E20), height: 1.35),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Download approved certificate
                    if (_resultStatus == "approved" &&
                        _certificateUrl != null)
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _downloadCertificate,
                          icon: const Icon(Icons.download,
                              color: Colors.white),
                          label: const Text(
                            "Download Income Certificate",
                            style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2E7D32),
                            padding:
                                const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                      ),

                    // Download existing certificate for duplicate
                    if (_resultStatus == "duplicate" &&
                        _certificateUrl != null)
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _downloadCertificate,
                          icon: const Icon(Icons.download,
                              color: Colors.white),
                          label: const Text(
                            "Download Existing Certificate",
                            style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.orange[700],
                            padding:
                                const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                      ),

                    const SizedBox(height: 8),

                    // Back to home button
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.home,
                            color: Color(0xFF1A3C6E)),
                        label: const Text(
                          "Back to Home",
                          style:
                              TextStyle(color: Color(0xFF1A3C6E)),
                        ),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(
                              color: Color(0xFF1A3C6E)),
                          padding:
                              const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            const Spacer(),

            // Submit button — hide after result
            if (_resultStatus == null)
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _isUploading ? null : _uploadDocuments,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1A3C6E),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _isUploading
                      ? const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            ),
                            SizedBox(width: 12),
                            Text(
                              "Scanning & Uploading...",
                              style: TextStyle(
                                  color: Colors.white, fontSize: 15),
                            ),
                          ],
                        )
                      : const Text(
                          "Submit Documents",
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildUploadTile({
    required String label,
    required String subtitle,
    required String? fileName,
    required bool isSelected,
    required VoidCallback onTap,
    required IconData icon,
  }) {
    return GestureDetector(
      onTap: _resultStatus != null ? null : onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF1A3C6E)
                : Colors.grey[300]!,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFF1A3C6E), size: 28),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    isSelected ? fileName! : subtitle,
                    style: TextStyle(
                      color: isSelected
                          ? Colors.green[700]
                          : Colors.grey[500],
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              isSelected ? Icons.check_circle : Icons.upload_file,
              color: isSelected ? Colors.green : Colors.grey[400],
            ),
          ],
        ),
      ),
    );
  }
}