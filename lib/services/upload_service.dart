import 'dart:io';
import 'package:http/http.dart' as http;

class UploadService {

  static const String baseUrl =
      "http://localhost:5001/api/income/upload";

  static Future<bool> uploadDocuments(
      String applicationId,
      File aadhaar,
      File salary) async {

    try {

      var request = http.MultipartRequest(
        "POST",
        Uri.parse(baseUrl),
      );

      request.fields["application_id"] = applicationId;

      request.files.add(
        await http.MultipartFile.fromPath(
          "aadhaar",
          aadhaar.path,
        ),
      );

      request.files.add(
        await http.MultipartFile.fromPath(
          "salary",
          salary.path,
        ),
      );

      var response = await request.send();

      print("UPLOAD STATUS: ${response.statusCode}");

      return response.statusCode == 200;

    } catch (e) {

      print("Upload error: $e");

      return false;

    }

  }

}