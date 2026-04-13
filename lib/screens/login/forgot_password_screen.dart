import 'package:flutter/material.dart';
import '../../services/auth_service.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final emailController = TextEditingController();
  final codeController = TextEditingController();
  final newPasswordController = TextEditingController();
  final confirmPasswordController = TextEditingController();

  bool loading = false;
  bool codeSent = false;
  bool codeVerified = false;
  bool obscureNew = true;
  bool obscureConfirm = true;
  String? errorMessage;
  String? successMessage;
  List<String> passwordErrors = [];

  // Step 1: Send code
  Future<void> _sendCode() async {
    final email = emailController.text.trim();

    if (email.isEmpty) {
      setState(() => errorMessage = "Please enter your email");
      return;
    }

    if (!AuthService.validateEmail(email)) {
      setState(() => errorMessage = "Invalid email format");
      return;
    }

    setState(() {
      loading = true;
      errorMessage = null;
    });

    await AuthService.forgotPassword(email);

    setState(() {
      loading = false;
      codeSent = true;
      successMessage =
          "A 6-digit reset code has been sent to $email (if registered).";
    });
  }

  // Step 2: Verify code
  Future<void> _verifyCode() async {
    if (codeController.text.trim().isEmpty) {
      setState(() => errorMessage = "Please enter the reset code");
      return;
    }

    setState(() {
      loading = true;
      errorMessage = null;
    });

    final result = await AuthService.verifyResetCode(
      emailController.text.trim(),
      codeController.text.trim(),
    );

    setState(() => loading = false);

    if (result["verified"] == true) {
      setState(() {
        codeVerified = true;
        errorMessage = null;
      });
    } else {
      setState(() =>
          errorMessage = result["message"] ?? "Invalid code");
    }
  }

  // Step 3: Reset password
  Future<void> _resetPassword() async {
    final newPassword = newPasswordController.text.trim();
    final confirmPassword = confirmPasswordController.text.trim();

    if (newPassword.isEmpty || confirmPassword.isEmpty) {
      setState(() => errorMessage = "Please fill all fields");
      return;
    }

    if (newPassword != confirmPassword) {
      setState(() => errorMessage = "Passwords do not match");
      return;
    }

    final pwErrors = AuthService.validatePassword(newPassword);
    if (pwErrors.isNotEmpty) {
      setState(() => errorMessage = pwErrors.join(", "));
      return;
    }

    setState(() {
      loading = true;
      errorMessage = null;
    });

    final result = await AuthService.resetPassword(
      emailController.text.trim(),
      codeController.text.trim(),
      newPassword,
    );

    setState(() => loading = false);

    if (result["message"] == "Password reset successfully") {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Password reset successfully! Please login."),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.pop(context);
    } else {
      setState(() =>
          errorMessage = result["message"] ?? "Reset failed");
    }
  }

  void _checkPassword(String value) {
    setState(() {
      passwordErrors = AuthService.validatePassword(value);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          "Forgot Password",
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
              "Reset Password",
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Color(0xFF1A3C6E),
              ),
            ),
            const SizedBox(height: 8),

            // Step indicator
            Row(
              children: [
                _stepCircle(1, !codeSent ? "active" :
                    !codeVerified ? "done" : "done"),
                _stepLine(!codeSent ? false : true),
                _stepCircle(2, !codeSent ? "inactive" :
                    !codeVerified ? "active" : "done"),
                _stepLine(!codeVerified ? false : true),
                _stepCircle(3, !codeVerified ? "inactive" : "active"),
              ],
            ),
            const SizedBox(height: 24),

            // ── STEP 1: Email ──
            if (!codeSent) ...[
              Text(
                "Enter your registered email to receive a reset code.",
                style: TextStyle(color: Colors.grey[600]),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(
                  labelText: "Email Address",
                  prefixIcon: const Icon(Icons.email_outlined),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
            ],

            // ── STEP 2: Enter code ──
            if (codeSent && !codeVerified) ...[
              if (successMessage != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.green[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green[300]!),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.mark_email_read,
                          color: Colors.green, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          successMessage!,
                          style: const TextStyle(color: Colors.green),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              TextField(
                controller: codeController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: InputDecoration(
                  labelText: "Enter 6-digit Reset Code",
                  prefixIcon: const Icon(Icons.lock_clock_outlined),
                  counterText: "",
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: loading ? null : _sendCode,
                child: const Text("Resend Code"),
              ),
            ],

            // ── STEP 3: New password ──
            if (codeVerified) ...[
              const Text(
                "Code verified ✅ Enter your new password.",
                style: TextStyle(
                    color: Colors.green, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: newPasswordController,
                obscureText: obscureNew,
                onChanged: _checkPassword,
                decoration: InputDecoration(
                  labelText: "New Password",
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(obscureNew
                        ? Icons.visibility_off
                        : Icons.visibility),
                    onPressed: () =>
                        setState(() => obscureNew = !obscureNew),
                  ),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),

              // Password requirements
              if (newPasswordController.text.isNotEmpty) ...[
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
                          newPasswordController.text.length >= 8),
                      _reqRow("At least one uppercase letter",
                          newPasswordController.text
                              .contains(RegExp(r'[A-Z]'))),
                      _reqRow("At least one number",
                          newPasswordController.text
                              .contains(RegExp(r'[0-9]'))),
                      _reqRow("At least one special character",
                          newPasswordController.text.contains(RegExp(
                              r'[!@#\$%^&*()_+\-=\[\]{};:"\\|,.<>\/?]'))),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 16),

              TextField(
                controller: confirmPasswordController,
                obscureText: obscureConfirm,
                decoration: InputDecoration(
                  labelText: "Confirm New Password",
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(obscureConfirm
                        ? Icons.visibility_off
                        : Icons.visibility),
                    onPressed: () => setState(
                        () => obscureConfirm = !obscureConfirm),
                  ),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
            ],

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

            // Action button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: loading
                    ? null
                    : !codeSent
                        ? _sendCode
                        : !codeVerified
                            ? _verifyCode
                            : _resetPassword,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1A3C6E),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: loading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : Text(
                        !codeSent
                            ? "Send Reset Code"
                            : !codeVerified
                                ? "Verify Code"
                                : "Reset Password",
                        style: const TextStyle(
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

  Widget _stepCircle(int step, String status) {
    Color bg = status == "active"
        ? const Color(0xFF1A3C6E)
        : status == "done"
            ? Colors.green
            : Colors.grey[300]!;
    Color textColor =
        status == "inactive" ? Colors.grey : Colors.white;

    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Center(
        child: status == "done"
            ? const Icon(Icons.check, color: Colors.white, size: 16)
            : Text(
                "$step",
                style: TextStyle(
                    color: textColor, fontWeight: FontWeight.bold),
              ),
      ),
    );
  }

  Widget _stepLine(bool done) {
    return Expanded(
      child: Container(
        height: 2,
        color: done ? Colors.green : Colors.grey[300],
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