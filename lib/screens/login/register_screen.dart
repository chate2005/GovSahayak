import 'package:flutter/material.dart';
import '../../services/auth_service.dart';
import '../../services/otp_service.dart';
import '../main/main_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final nameController = TextEditingController();
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  final phoneController = TextEditingController();
  final otpController = TextEditingController();

  bool loading = false;
  bool otpSent = false;
  bool otpVerified = false;
  bool sendingOTP = false;
  bool verifyingOTP = false;
  bool obscurePassword = true;
  String? errorMessage;

  void _checkPassword(String value) => setState(() {});

  // Send OTP to EMAIL
  Future<void> _sendOTP() async {
    if (emailController.text.trim().isEmpty) {
      setState(() => errorMessage = "Please enter your email first");
      return;
    }

    if (!AuthService.validateEmail(emailController.text.trim())) {
      setState(() => errorMessage = "Invalid email format");
      return;
    }

    setState(() {
      sendingOTP = true;
      errorMessage = null;
    });

    final result = await OTPService.sendOTP(emailController.text.trim());
    setState(() => sendingOTP = false);

    if (result["message"] == "OTP sent successfully") {
      setState(() => otpSent = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("OTP sent to ${emailController.text}"),
          backgroundColor: Colors.green,
        ),
      );
    } else {
      setState(() =>
          errorMessage = result["message"] ?? "Failed to send OTP");
    }
  }

  // Verify OTP
  Future<void> _verifyOTP() async {
    if (otpController.text.trim().isEmpty) {
      setState(() => errorMessage = "Please enter the OTP");
      return;
    }

    setState(() {
      verifyingOTP = true;
      errorMessage = null;
    });

    final result = await OTPService.verifyOTP(
      emailController.text.trim(),
      otpController.text.trim(),
    );

    setState(() => verifyingOTP = false);

    if (result["verified"] == true) {
      setState(() => otpVerified = true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Email verified successfully ✅"),
          backgroundColor: Colors.green,
        ),
      );
    } else {
      setState(() =>
          errorMessage = result["message"] ?? "Invalid OTP");
    }
  }

  // Register
  Future<void> _register() async {
    setState(() => errorMessage = null);

    if (nameController.text.trim().isEmpty ||
        emailController.text.trim().isEmpty ||
        passwordController.text.trim().isEmpty ||
        phoneController.text.trim().isEmpty) {
      setState(() => errorMessage = "All fields are required");
      return;
    }

    if (nameController.text.trim().length < 2) {
      setState(() => errorMessage = "Name must be at least 2 characters");
      return;
    }

    if (!AuthService.validateEmail(emailController.text.trim())) {
      setState(() => errorMessage = "Invalid email format");
      return;
    }

    final pwErrors =
        AuthService.validatePassword(passwordController.text);
    if (pwErrors.isNotEmpty) {
      setState(() => errorMessage = pwErrors.join(", "));
      return;
    }

    if (phoneController.text.trim().length != 10) {
      setState(() => errorMessage = "Enter a valid 10 digit phone number");
      return;
    }

    if (!otpVerified) {
      setState(() => errorMessage = "Please verify your email first");
      return;
    }

    setState(() => loading = true);

    final result = await AuthService.register(
      nameController.text.trim(),
      emailController.text.trim(),
      passwordController.text.trim(),
      phoneController.text.trim(),
    );

    setState(() => loading = false);

    if (result["success"] == true) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const MainScreen()),
      );
    } else {
      setState(() =>
          errorMessage = result["message"] ?? "Registration failed");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          "Register",
          style: TextStyle(
              color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1A3C6E),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            const SizedBox(height: 10),
            const Text(
              "Create Account",
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                color: Color(0xFF1A3C6E),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "Register to access government services",
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 28),

            // Name
            TextField(
              controller: nameController,
              decoration: InputDecoration(
                labelText: "Full Name",
                prefixIcon: const Icon(Icons.person_outline),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
            const SizedBox(height: 16),

            // Email + Send OTP button
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: emailController,
                    keyboardType: TextInputType.emailAddress,
                    enabled: !otpVerified,
                    decoration: InputDecoration(
                      labelText: "Email Address",
                      prefixIcon: const Icon(Icons.email_outlined),
                      suffixIcon: otpVerified
                          ? const Icon(Icons.verified,
                              color: Colors.green)
                          : null,
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      fillColor: otpVerified
                          ? Colors.green[50]
                          : Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                if (!otpVerified)
                  SizedBox(
                    height: 56,
                    child: ElevatedButton(
                      onPressed: sendingOTP ? null : _sendOTP,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1A3C6E),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: sendingOTP
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : Text(
                              otpSent ? "Resend" : "Send OTP",
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),

            // OTP input box
            if (otpSent && !otpVerified) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.blue[200]!),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "OTP sent to ${emailController.text}",
                      style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1A3C6E)),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      "Check your email inbox (and spam folder)",
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: otpController,
                            keyboardType: TextInputType.number,
                            maxLength: 6,
                            decoration: InputDecoration(
                              labelText: "Enter 6-digit OTP",
                              prefixIcon: const Icon(
                                  Icons.lock_clock_outlined),
                              counterText: "",
                              border: OutlineInputBorder(
                                  borderRadius:
                                      BorderRadius.circular(12)),
                              filled: true,
                              fillColor: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          height: 56,
                          child: ElevatedButton(
                            onPressed:
                                verifyingOTP ? null : _verifyOTP,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.green,
                              shape: RoundedRectangleBorder(
                                borderRadius:
                                    BorderRadius.circular(12),
                              ),
                            ),
                            child: verifyingOTP
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Text(
                                    "Verify",
                                    style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Verified badge
            if (otpVerified)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green[50],
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.green),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.verified, color: Colors.green),
                    SizedBox(width: 8),
                    Text(
                      "Email verified successfully!",
                      style: TextStyle(
                          color: Colors.green,
                          fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),

            const SizedBox(height: 16),

            // Password with live validation
            TextField(
              controller: passwordController,
              obscureText: obscurePassword,
              onChanged: _checkPassword,
              decoration: InputDecoration(
                labelText: "Password",
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  icon: Icon(obscurePassword
                      ? Icons.visibility_off
                      : Icons.visibility),
                  onPressed: () => setState(
                      () => obscurePassword = !obscurePassword),
                ),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: Colors.white,
              ),
            ),

            // Password requirements live checklist
            if (passwordController.text.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.grey[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: Column(
                  children: [
                    _reqRow("At least 8 characters",
                        passwordController.text.length >= 8),
                    _reqRow("At least one uppercase letter",
                        passwordController.text
                            .contains(RegExp(r'[A-Z]'))),
                    _reqRow("At least one number",
                        passwordController.text
                            .contains(RegExp(r'[0-9]'))),
                    _reqRow(
                        "At least one special character",
                        passwordController.text.contains(RegExp(
                            r'[!@#\$%^&*()_+\-=\[\]{};:"\\|,.<>\/?]'))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),

            // Phone number
            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              maxLength: 10,
              decoration: InputDecoration(
                labelText: "Mobile Number",
                prefixIcon: const Icon(Icons.phone_outlined),
                prefixText: "+91 ",
                counterText: "",
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: Colors.white,
              ),
            ),

            // Error message
            if (errorMessage != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red[300]!),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline,
                        color: Colors.red, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        errorMessage!,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 28),

            // Register button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: loading ? null : _register,
                style: ElevatedButton.styleFrom(
                  backgroundColor: otpVerified
                      ? const Color(0xFF1A3C6E)
                      : Colors.grey,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: loading
                    ? const CircularProgressIndicator(
                        color: Colors.white)
                    : const Text(
                        "Create Account",
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
              ),
            ),

            const SizedBox(height: 20),

            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text("Already have an account? ",
                    style: TextStyle(color: Colors.grey[600])),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text(
                    "Login",
                    style: TextStyle(
                      color: Color(0xFF1A3C6E),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _reqRow(String text, bool met) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(
            met ? Icons.check_circle : Icons.cancel,
            color: met ? Colors.green : Colors.red,
            size: 14,
          ),
          const SizedBox(width: 6),
          Text(
            text,
            style: TextStyle(
              fontSize: 11,
              color: met ? Colors.green : Colors.red,
            ),
          ),
        ],
      ),
    );
  }
}