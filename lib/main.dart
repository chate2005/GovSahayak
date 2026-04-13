import 'package:flutter/material.dart';
import 'screens/login/login_screen.dart';
import 'screens/upload/upload_screen.dart';
import 'screens/login/register_screen.dart';
import 'screens/officer/officer_dashboard_screen.dart';
import 'screens/officer/officer_login_screen.dart';
import 'screens/officer/officer_register_screen.dart';

void main() {
  runApp(const SenateBotApp());
}

class SenateBotApp extends StatelessWidget {
  const SenateBotApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Senate Bot',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1A3C6E),
          brightness: Brightness.light,
        ).copyWith(
          primary: const Color(0xFF1A3C6E),
          secondary: const Color(0xFF2E7D32),
          surface: Colors.white,
          onPrimary: Colors.white,
        ),
        scaffoldBackgroundColor: const Color(0xFFF5F7FA),
        fontFamily: 'Roboto',
      ),
      routes: {
        "/register": (context) => const RegisterScreen(),
        "/officer-login": (context) => const OfficerLoginScreen(),
        "/officer-register": (context) => const OfficerRegisterScreen(),
        "/officer-dashboard": (context) => const OfficerDashboardScreen(),
        "/upload": (context) {
          final applicationId =
              ModalRoute.of(context)!.settings.arguments as String;
          return UploadScreen(applicationId: applicationId);
        },
      },
      home: const LoginScreen(),
    );
  }
}