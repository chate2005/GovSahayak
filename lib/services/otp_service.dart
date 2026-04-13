import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants.dart';

class OTPService {

  // Send OTP to email
  static Future<Map<String, dynamic>> sendOTP(String email) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/otp/send"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"email": email}),   // ← email not phone
      ).timeout(const Duration(seconds: 30));

      print("Send OTP response: ${response.body}");
      return jsonDecode(response.body);

    } catch (e) {
      print("Send OTP error: $e");
      return {"message": "Network error. Please try again."};
    }
  }

  // Verify OTP with email
  static Future<Map<String, dynamic>> verifyOTP(
      String email, String otp) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/otp/verify"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"email": email, "otp": otp}),  // ← email not phone
      ).timeout(const Duration(seconds: 30));

      print("Verify OTP response: ${response.body}");
      return jsonDecode(response.body);

    } catch (e) {
      print("Verify OTP error: $e");
      return {"message": "Network error. Please try again."};
    }
  }
}