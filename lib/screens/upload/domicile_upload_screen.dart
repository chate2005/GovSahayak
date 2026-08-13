import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants.dart';

class DomicileUploadScreen extends StatefulWidget {
  final String applicationId;
  final int initialStep;
  const DomicileUploadScreen({
    Key? key,
    required this.applicationId,
    this.initialStep = 1,
  }) : super(key: key);

  @override
  _DomicileUploadScreenState createState() => _DomicileUploadScreenState();
}

class _DomicileUploadScreenState extends State<DomicileUploadScreen> {
  late int _currentStep; // 1: Aadhaar, 2: Address Proof, 3: Residency Proof
  Uint8List? _documentBytes;
  String? _documentFileName;

  bool _isUploading = false;
  String? _statusMessage;
  bool _isSuccess = false;
  bool _isFinished = false;
  bool _isDirectReject = false;
  String? _certificateUrl;
  List<String> _flags = [];

  static const Color _primary = Color(0xFF4527A0); // Deep purple for domicile
  static const Color _accent = Color(0xFF7C4DFF);

  @override
  void initState() {
    super.initState();
    _currentStep = widget.initialStep;
  }

  String get _stepTitle {
    switch (_currentStep) {
      case 1: return "Document 1 of 3: Aadhaar Card";
      case 2: return "Document 2 of 3: Address Proof";
      case 3: return "Document 3 of 3: Residency Duration Proof";
      default: return "Upload Document";
    }
  }

  String get _stepSubtitle {
    switch (_currentStep) {
      case 1: return "Upload your Aadhaar Card (front side)\nAccepted: JPG, PNG, PDF — max 5MB";
      case 2:
        return "Upload ONE of:\n• Aadhaar Card (if address updated)\n• Voter ID Card\n• Electricity / Water / Gas Bill (within 3 months)\n• Ration Card\n• Passport\n• Rent Agreement (registered)\n\nAccepted: JPG, PNG, PDF — max 5MB";
      case 3:
        return "Upload proof of long-term stay:\n• School / College Leaving Certificate\n• Old Ration Card (15+ years)\n• Property Tax Receipt\n• Old Electricity Bills\n• Bank Passbook\n• Voter ID\n\nAccepted: JPG, PNG, PDF — max 5MB";
      default: return "";
    }
  }

  String get _buttonLabel {
    switch (_currentStep) {
      case 1: return "Upload Aadhaar Card";
      case 2: return "Upload Address Proof";
      case 3: return "Upload Residency Proof & Verify";
      default: return "Upload";
    }
  }

  Future<void> _pickFile() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
      withData: true,
    );
    if (result != null && result.files.single.bytes != null) {
      final bytes = result.files.single.bytes!;
      if (bytes.lengthInBytes > 5 * 1024 * 1024) {
        setState(() {
          _statusMessage = "File size exceeds 5 MB. Please upload a smaller file.";
          _isSuccess = false;
        });
        return;
      }
      setState(() {
        _documentBytes = bytes;
        _documentFileName = result.files.single.name;
        _statusMessage = null;
      });
    }
  }

  Future<void> _uploadDocument() async {
    if (_documentBytes == null) {
      setState(() {
        _statusMessage = "Please select a document first.";
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
        Uri.parse("${AppConstants.baseUrl}/api/domicile/upload"),
      );
      request.fields["application_id"] = widget.applicationId;
      request.files.add(http.MultipartFile.fromBytes(
        "document", _documentBytes!,
        filename: _documentFileName ?? "document.jpg",
      ));

      var streamedResponse = await request.send();
      var response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final status = data["status"] as String? ?? "";

        setState(() {
          _isUploading = false;

          if (status == "continue") {
            _isSuccess = true;
            _statusMessage = data["message"];
            _currentStep = (data["next_step"] as int?) ?? (_currentStep + 1);
            _documentBytes = null;
            _documentFileName = null;
          } else if (status == "approved") {
            _isSuccess = true;
            _isFinished = true;
            _certificateUrl = data["certificate_url"];
            _statusMessage = data["message"];
          } else if (status == "sent_to_officer") {
            _isSuccess = false;
            _isFinished = true;
            final flags = data["flags"] as List? ?? [];
            _flags = flags.map((f) => f.toString()).toList();
            _statusMessage = data["message"] ??
                "Application sent for manual review. Expected time: 3-5 working days.";
          } else if (status == "rejected") {
            _isSuccess = false;
            _isFinished = true;
            _isDirectReject = data["direct_reject"] == true;
            _statusMessage = data["message"] ?? "Application rejected.";
          } else if (status == "retry") {
            _isSuccess = false;
            _statusMessage = data["message"] ?? "Please try again with a clearer document.";
            _documentBytes = null;
            _documentFileName = null;
          } else {
            _isSuccess = false;
            _statusMessage = data["message"] ?? "Upload failed. Please try again.";
          }
        });
      } else {
        setState(() {
          _isUploading = false;
          _isSuccess = false;
          _statusMessage = "Upload failed (${response.statusCode}). Please try again.";
        });
      }
    } catch (e) {
      setState(() {
        _isUploading = false;
        _isSuccess = false;
        _statusMessage = "Error: ${e.toString()}";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F0FF),
      appBar: AppBar(
        title: const Text(
          "Domicile Certificate",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: _primary,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Text(
              "Domicile Certificate Application",
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: _primary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "Application ID: ${widget.applicationId}",
              style: TextStyle(color: Colors.grey[600], fontSize: 12),
            ),
            const SizedBox(height: 16),

            // Progress indicator
            if (!_isFinished) _buildProgressBar(),

            const SizedBox(height: 24),

            if (_isFinished)
              _buildFinishedPanel()
            else
              _buildUploadPanel(),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressBar() {
    return Row(
      children: List.generate(3, (i) {
        final stepNum = i + 1;
        final isActive = stepNum == _currentStep;
        final isDone = stepNum < _currentStep;
        return Expanded(
          child: Row(
            children: [
              Expanded(
                child: Container(
                  height: 6,
                  decoration: BoxDecoration(
                    color: isDone
                        ? Colors.green
                        : isActive
                            ? _accent
                            : Colors.grey[300],
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              CircleAvatar(
                radius: 14,
                backgroundColor: isDone
                    ? Colors.green
                    : isActive
                        ? _accent
                        : Colors.grey[300],
                child: isDone
                    ? const Icon(Icons.check, size: 14, color: Colors.white)
                    : Text(
                        "$stepNum",
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: isActive ? Colors.white : Colors.grey[600],
                        ),
                      ),
              ),
              const SizedBox(width: 4),
            ],
          ),
        );
      }),
    );
  }

  Widget _buildUploadPanel() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Step title
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _primary.withOpacity(0.08),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: _accent.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              Icon(Icons.upload_file, color: _primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _stepTitle,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: _primary,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Accepted docs hint
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.grey[200]!),
          ),
          child: Text(
            _stepSubtitle,
            style: TextStyle(fontSize: 12, color: Colors.grey[700], height: 1.5),
          ),
        ),
        const SizedBox(height: 16),

        // File picker
        GestureDetector(
          onTap: _isUploading ? null : _pickFile,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _documentBytes != null ? _accent : Colors.grey[300]!,
                width: _documentBytes != null ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.insert_drive_file,
                    color: _documentBytes != null ? _accent : Colors.grey, size: 28),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _documentBytes != null ? "Document Selected" : "Tap to Select Document",
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _documentBytes != null
                            ? _documentFileName!
                            : "JPG, PNG, PDF — max 5MB",
                        style: TextStyle(
                          color: _documentBytes != null ? Colors.green[700] : Colors.grey[500],
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  _documentBytes != null ? Icons.check_circle : Icons.add_circle_outline,
                  color: _documentBytes != null ? Colors.green : Colors.grey[400],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Status message
        if (_statusMessage != null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _isSuccess ? Colors.green[50] : Colors.red[50],
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _isSuccess ? Colors.green : Colors.red),
            ),
            child: Text(
              _statusMessage!,
              style: TextStyle(
                color: _isSuccess ? Colors.green[800] : Colors.red[800],
                fontSize: 13,
              ),
            ),
          ),

        const SizedBox(height: 24),

        // Upload button
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: _isUploading ? null : _uploadDocument,
            style: ElevatedButton.styleFrom(
              backgroundColor: _primary,
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
                              color: Colors.white, strokeWidth: 2)),
                      SizedBox(width: 12),
                      Text("Verifying with AI...",
                          style: TextStyle(color: Colors.white, fontSize: 15)),
                    ],
                  )
                : Text(
                    _buttonLabel,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildFinishedPanel() {
    if (_isSuccess && _certificateUrl != null) {
      // Auto-approved
      return Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.green[50]!, Colors.green[100]!],
              ),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.green),
            ),
            child: Column(
              children: [
                const Icon(Icons.verified, color: Colors.green, size: 56),
                const SizedBox(height: 12),
                const Text(
                  "🎉 Certificate Generated!",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Colors.green,
                      fontSize: 20,
                      fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  _statusMessage ?? "",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.green[800], fontSize: 14),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () async {
                final uri = Uri.parse(_certificateUrl!);
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text("Could not open certificate")),
                  );
                }
              },
              icon: const Icon(Icons.download, color: Colors.white),
              label: const Text("Download Domicile Certificate",
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2E7D32),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _backButton(),
        ],
      );
    }

    if (_isDirectReject) {
      // Direct rejection
      return Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.red[50],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.red),
            ),
            child: Column(
              children: [
                const Icon(Icons.cancel, color: Colors.red, size: 56),
                const SizedBox(height: 12),
                const Text(
                  "Application Rejected",
                  style: TextStyle(
                      color: Colors.red, fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  _statusMessage ?? "",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.red[800], fontSize: 14),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _backButton(),
        ],
      );
    }

    // Sent to officer
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.orange[50],
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.orange),
          ),
          child: Column(
            children: [
              const Icon(Icons.pending_actions, color: Colors.orange, size: 56),
              const SizedBox(height: 12),
              const Text(
                "Sent for Officer Review",
                style: TextStyle(
                    color: Colors.orange, fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                _statusMessage ?? "",
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.orange[800], fontSize: 14),
              ),
            ],
          ),
        ),
        if (_flags.isNotEmpty) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red[50],
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.red[200]!),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Issues Detected:",
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: Colors.red, fontSize: 13)),
                const SizedBox(height: 8),
                ..._flags.map((f) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          const Icon(Icons.warning_amber_rounded,
                              color: Colors.red, size: 14),
                          const SizedBox(width: 6),
                          Expanded(
                              child: Text(f,
                                  style: const TextStyle(
                                      fontSize: 12, color: Colors.red))),
                        ],
                      ),
                    )),
              ],
            ),
          ),
        ],
        const SizedBox(height: 20),
        _backButton(),
      ],
    );
  }

  Widget _backButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () => Navigator.pop(context),
        icon: const Icon(Icons.home, color: Colors.white),
        label: const Text("Back to Home",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        style: ElevatedButton.styleFrom(
          backgroundColor: _primary,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}
