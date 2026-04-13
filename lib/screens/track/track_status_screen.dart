import 'package:flutter/material.dart';
import '../../core/app_colors.dart';

class TrackStatusScreen extends StatefulWidget {
  const TrackStatusScreen({super.key});

  @override
  State<TrackStatusScreen> createState() => _TrackStatusScreenState();
}

class _TrackStatusScreenState extends State<TrackStatusScreen> {
  final _controller = TextEditingController();
  bool _tracked = false;

  final List<Map<String, dynamic>> _steps = [
    {
      'title': 'Application Submitted',
      'desc': 'Your application has been submitted successfully.',
      'date': '15 Jan 2024, 10:30 AM',
      'done': true,
    },
    {
      'title': 'Document Verification',
      'desc': 'Documents are being verified by the department.',
      'date': '17 Jan 2024, 2:00 PM',
      'done': true,
    },
    {
      'title': 'Under Review',
      'desc': 'Application is under review by the officer.',
      'date': '19 Jan 2024',
      'done': true,
    },
    {
      'title': 'Approved',
      'desc': 'Application approved. Certificate will be issued shortly.',
      'date': 'Pending',
      'done': false,
    },
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Track Status')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _controller,
              decoration: const InputDecoration(
                hintText: 'Enter Application ID',
              ),
            ),
            const SizedBox(height: 10),
            ElevatedButton(
              onPressed: () {
                if (_controller.text.isNotEmpty) {
                  setState(() => _tracked = true);
                }
              },
              child: const Text('Track Application'),
            ),
            if (_tracked)
              Expanded(
                child: ListView.builder(
                  itemCount: _steps.length,
                  itemBuilder: (context, i) {
                    final step = _steps[i];
                    return ListTile(
                      leading: Icon(
                        step['done']
                            ? Icons.check_circle
                            : Icons.radio_button_unchecked,
                        color: step['done'] ? AppColors.success : Colors.grey,
                      ),
                      title: Text(step['title']),
                      subtitle: Text(step['desc']),
                      trailing: Text(step['date']),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}
