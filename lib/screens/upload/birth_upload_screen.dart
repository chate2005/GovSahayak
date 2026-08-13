import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants.dart';

class BirthUploadScreen extends StatefulWidget {
  final String applicationId;
  final int initialStep;
  const BirthUploadScreen({Key? key, required this.applicationId, this.initialStep = 1}) : super(key: key);

  @override
  _BirthUploadScreenState createState() => _BirthUploadScreenState();
}

class _BirthUploadScreenState extends State<BirthUploadScreen> {
  late int _currentStep; // 1: Birth Proof, 2: Aadhaar Card
  Uint8List? _documentBytes;
  String? _documentFileName;
  
  bool _isUploading = false;
  String? _statusMessage;
  bool _isSuccess = false;
  bool _isFinished = false;
  String? _certificateUrl;

  @override
  void initState() {
    super.initState();
    _currentStep = widget.initialStep;
  }

  Future<void> _pickFile() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png'],
      withData: true,
    );

    if (result != null && result.files.single.bytes != null) {
      setState(() {
        _documentBytes = result.files.single.bytes;
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
        Uri.parse("${AppConstants.baseUrl}/api/birth/upload"),
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

        setState(() {
          _isUploading = false;

          if (data["status"] == "continue") {
            _isSuccess = true;
            _statusMessage = data["message"];
            
            // Move to Step 2
            _currentStep = 2;
            _documentBytes = null;
            _documentFileName = null;
          } else if (data["status"] == "approved") {
            _isSuccess = true;
            _isFinished = true;
            _certificateUrl = data["certificate_url"];
            _statusMessage = data["message"];
          } else if (data["status"] == "sent_to_officer") {
            _isSuccess = false; 
            _isFinished = true;
            _statusMessage = data["message"] + "\n\nRisk Level: " + (data["risk_level"] ?? "HIGH");
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
    String stepTitle = _currentStep == 1 ? "Step 1: Upload Birth Proof" : "Step 2: Upload Parent Aadhaar";
    String stepSubtitle = _currentStep == 1 
      ? "Upload Hospital/Municipal Record (JPG/PNG, Max 2MB)"
      : "Upload Aadhaar card of Father/Mother (JPG/PNG, Max 2MB)";

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          "Birth Certificate Upload",
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
            Text(
              "Birth Certificate Application",
              style: const TextStyle(
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
            const SizedBox(height: 24),
            
            if (_isFinished) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _isSuccess ? Colors.green[50] : Colors.orange[50],
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: _isSuccess ? Colors.green : Colors.orange),
                ),
                child: Column(
                  children: [
                    Icon(
                      _isSuccess ? Icons.check_circle : Icons.warning_amber_rounded,
                      color: _isSuccess ? Colors.green : Colors.orange,
                      size: 40,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _statusMessage ?? "",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: _isSuccess ? Colors.green[800] : Colors.orange[800],
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              // Download button shown only when approved and cert URL exists
              if (_isSuccess && _certificateUrl != null) ...[
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
                    label: const Text(
                      "Download Birth Certificate",
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2E7D32),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.home, color: Colors.white),
                  label: const Text(
                    "Back to Home",
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1A3C6E),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ] else ...[
              Text(
                stepTitle,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF2E7D32),
                ),
              ),
              const SizedBox(height: 16),
              GestureDetector(
                onTap: _isUploading ? null : _pickFile,
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _documentBytes != null ? const Color(0xFF1A3C6E) : Colors.grey[300]!,
                      width: _documentBytes != null ? 2 : 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.upload_file, color: Color(0xFF1A3C6E), size: 28),
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
                              _documentBytes != null ? _documentFileName! : stepSubtitle,
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
              const SizedBox(height: 24),
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
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _isUploading ? null : _uploadDocument,
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
                            SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)),
                            SizedBox(width: 12),
                            Text("Processing with AI...", style: TextStyle(color: Colors.white, fontSize: 15)),
                          ],
                        )
                      : Text(
                          _currentStep == 1 ? "Upload Birth Proof" : "Upload Aadhaar & Verify",
                          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                ),
              ),
            ]
          ],
        ),
      ),
    );
  }
}
