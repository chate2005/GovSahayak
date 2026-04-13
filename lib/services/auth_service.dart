import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../core/constants.dart';

class AuthService {

  static List<String> validatePassword(String password) {
    final errors = <String>[];
    if (password.length < 8) errors.add("At least 8 characters");
    if (!password.contains(RegExp(r'[A-Z]')))
      errors.add("At least one uppercase letter");
    if (!password.contains(RegExp(r'[0-9]')))
      errors.add("At least one number");
    if (!password.contains(
        RegExp(r'[!@#\$%^&*()_+\-=\[\]{};:"\\|,.<>\/?]')))
      errors.add("At least one special character");
    return errors;
  }

  static bool validateEmail(String email) {
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
  }

  // USER REGISTER
  static Future<Map<String, dynamic>> register(
      String name, String email, String password, String phone) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/auth/register"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "name": name,
          "email": email,
          "password": password,
          "phone": phone
        }),
      ).timeout(const Duration(seconds: 30));

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data["token"] != null) {
        await _saveUserData(data);
        return {"success": true};
      }

      return {
        "success": false,
        "message": data["message"] ?? "Registration failed"
      };
    } catch (e) {
      return {"success": false, "message": "Network error. Please try again."};
    }
  }

  // OFFICER REGISTER
  static Future<Map<String, dynamic>> registerOfficer(
      String name,
      String email,
      String password,
      String phone,
      String departmentId) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/auth/register-officer"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "name": name,
          "email": email,
          "password": password,
          "phone": phone,
          "department_id": departmentId
        }),
      ).timeout(const Duration(seconds: 30));

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data["token"] != null) {
        await _saveUserData(data);
        return {"success": true};
      }

      return {
        "success": false,
        "message": data["message"] ?? "Registration failed"
      };
    } catch (e) {
      return {"success": false, "message": "Network error. Please try again."};
    }
  }

  // USER LOGIN
  static Future<Map<String, dynamic>> login(
      String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/auth/login"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"email": email, "password": password}),
      ).timeout(const Duration(seconds: 30));

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data["token"] != null) {
        await _saveUserData(data);
        return {"success": true, "role": data["user"]["role"]};
      }

      return {
        "success": false,
        "message": data["message"] ?? "Login failed"
      };
    } catch (e) {
      return {"success": false, "message": "Network error. Please try again."};
    }
  }

  // OFFICER LOGIN
  static Future<Map<String, dynamic>> loginOfficer(
      String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/auth/login-officer"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"email": email, "password": password}),
      ).timeout(const Duration(seconds: 30));

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data["token"] != null) {
        await _saveUserData(data);
        return {"success": true};
      }

      return {
        "success": false,
        "message": data["message"] ?? "Login failed"
      };
    } catch (e) {
      return {"success": false, "message": "Network error. Please try again."};
    }
  }

  // Save user data to SharedPreferences
  static Future<void> _saveUserData(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_id', data["user"]["_id"]);
    await prefs.setString('user_name', data["user"]["name"]);
    await prefs.setString('user_email', data["user"]["email"]);
    await prefs.setString('user_phone', data["user"]["phone"] ?? "");
    await prefs.setString('user_role', data["user"]["role"] ?? "user");
    await prefs.setString('token', data["token"]);
    if (data["user"]["department_name"] != null) {
      await prefs.setString(
          'department_name', data["user"]["department_name"]);
      await prefs.setString(
          'department_id', data["user"]["department_id"]);
    }
  }

  static Future<Map<String, dynamic>> forgotPassword(String email) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/auth/forgot-password"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"email": email}),
      ).timeout(const Duration(seconds: 30));
      return jsonDecode(response.body);
    } catch (e) {
      return {"message": "Network error. Please try again."};
    }
  }

  static Future<Map<String, dynamic>> verifyResetCode(
      String email, String code) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/auth/verify-reset-code"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"email": email, "code": code}),
      ).timeout(const Duration(seconds: 30));
      return jsonDecode(response.body);
    } catch (e) {
      return {"message": "Network error. Please try again."};
    }
  }

  static Future<Map<String, dynamic>> resetPassword(
      String email, String code, String newPassword) async {
    try {
      final response = await http.post(
        Uri.parse("${AppConstants.baseUrl}/api/auth/reset-password"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "email": email,
          "code": code,
          "newPassword": newPassword
        }),
      ).timeout(const Duration(seconds: 30));
      return jsonDecode(response.body);
    } catch (e) {
      return {"message": "Network error. Please try again."};
    }
  }

  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }

  static Future<String?> getUserId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('user_id');
  }

  static Future<String?> getUserRole() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('user_role');
  }

  static Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('user_id') != null;
  }
}