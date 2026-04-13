import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/constants.dart';

class ChatService {

  static Future<Map<String, dynamic>> sendMessage(String message) async {
    try {
      // Get real logged-in user ID
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getString('user_id');

      print("Sending message with user_id: $userId");

      if (userId == null) {
        return {"reply": "Please login again."};
      }

      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/chat"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "message": message,
          "user_id": userId      // ← real user ID from SharedPreferences
        }),
      ).timeout(const Duration(seconds: 30));

      print("Chat response: ${response.body}");

      return jsonDecode(response.body);

    } catch (e) {
      print("Chat Error: $e");
      return {"reply": "Network error. Please try again."};
    }
  }
}