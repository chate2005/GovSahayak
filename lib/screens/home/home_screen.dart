import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/chat_message.dart';
import '../../services/chat_service.dart';
import '../profile/profile_screen.dart';
import '../upload/upload_screen.dart';
import '../upload/birth_upload_screen.dart';
import '../upload/domicile_upload_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  List<ChatMessage> _messages = [
    ChatMessage(
      text: "Hello! I am SenateBot. I can help you apply for an Income Certificate, Birth Certificate, or Domicile Certificate. Please tell me which certificate you need.",
      isUser: false,
    )
  ]; 

  bool _isTyping = false;
  String? _pendingApplicationId;
  bool _showUploadButton = false;
  bool _showBirthUploadButton = false;
  bool _showDomicileUploadButton = false;
  int _birthUploadStep = 1;
  int _domicileUploadStep = 1;
  bool _showDownloadButton = false;
  String? _certificateUrl;

  void _sendMessage() async {
    if (_textController.text.trim().isEmpty) return;

    String userText = _textController.text;
    _textController.clear();

    setState(() {
      _messages.add(ChatMessage(text: userText, isUser: true));
      _isTyping = true;
      _showUploadButton = false;
      _showBirthUploadButton = false;
      _showDomicileUploadButton = false;
      _showDownloadButton = false;
      _certificateUrl = null;
    });

    _scrollToBottom();

    final response = await ChatService.sendMessage(userText);
    String botReply = response["reply"] ?? "Something went wrong";

    setState(() {
      _messages.add(ChatMessage(text: botReply, isUser: false));
      _isTyping = false;

      // Show upload button
      if (response["show_upload_button"] == true) {
        _pendingApplicationId = response["application_id"]?.toString();
        _showUploadButton = true;
        _showBirthUploadButton = false;
        _showDownloadButton = false;
      }

      // Show birth upload button
      if (response["show_birth_upload_proof"] == true) {
        _pendingApplicationId = response["application_id"]?.toString();
        _birthUploadStep = response["birth_upload_step"] ?? 1;
        _showUploadButton = false;
        _showBirthUploadButton = true;
        _showDomicileUploadButton = false;
        _showDownloadButton = false;
      }

      // Show domicile upload button
      if (response["show_domicile_upload"] == true) {
        _pendingApplicationId = response["application_id"]?.toString();
        _domicileUploadStep = response["domicile_upload_step"] ?? 1;
        _showUploadButton = false;
        _showBirthUploadButton = false;
        _showDomicileUploadButton = true;
        _showDownloadButton = false;
      }

      // Show download button if already approved
      if (response["already_approved"] == true &&
          response["certificate_url"] != null) {
        _certificateUrl = response["certificate_url"];
        _showDownloadButton = true;
        _showUploadButton = false;
      }

      // Also catch certificate_url in any response
      if (response["certificate_url"] != null && _certificateUrl == null) {
        _certificateUrl = response["certificate_url"];
      }
    });

    _scrollToBottom();
  }

  void _goToUpload() {
    if (_pendingApplicationId == null) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) =>
            UploadScreen(applicationId: _pendingApplicationId!),
      ),
    ).then((_) {
      setState(() {
        _showUploadButton = false;
        _pendingApplicationId = null;
      });
    });
  }

  void _goToBirthUpload() {
    if (_pendingApplicationId == null) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) =>
            BirthUploadScreen(applicationId: _pendingApplicationId!, initialStep: _birthUploadStep),
      ),
    ).then((_) {
      setState(() {
        _showBirthUploadButton = false;
        _pendingApplicationId = null;
      });
    });
  }

  void _goToDomicileUpload() {
    if (_pendingApplicationId == null) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => DomicileUploadScreen(
          applicationId: _pendingApplicationId!,
          initialStep: _domicileUploadStep,
        ),
      ),
    ).then((_) {
      setState(() {
        _showDomicileUploadButton = false;
        _pendingApplicationId = null;
      });
    });
  }

  Future<void> _downloadCertificate() async {
    if (_certificateUrl == null) return;
    final uri = Uri.parse(_certificateUrl!);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Could not open certificate")),
      );
    }
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _clearChat() {
    setState(() {
      _messages = [
        ChatMessage(
          text: "Chat cleared. I can help you apply for an Income Certificate, Birth Certificate, or Domicile Certificate. Please tell me which certificate you need.",
          isUser: false,
        )
      ];
      _showUploadButton = false;
      _showBirthUploadButton = false;
      _showDomicileUploadButton = false;
      _showDownloadButton = false;
      _pendingApplicationId = null;
      _certificateUrl = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          "Senate Bot",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1A3C6E),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.person, color: Colors.white),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (context) => const ProfileScreen()),
            ),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: Colors.white),
            onSelected: (value) {
              if (value == 'clear') _clearChat();
            },
            itemBuilder: (BuildContext context) => const [
              PopupMenuItem(value: 'clear', child: Text('Clear Chat')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [

          // ── Chat messages ──
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                return _buildMessageBubble(_messages[index]);
              },
            ),
          ),

          // ── Typing indicator ──
          if (_isTyping)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  const SizedBox(
                    width: 15,
                    height: 15,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Color(0xFF1A3C6E),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    "Senate Bot is typing...",
                    style: TextStyle(
                        color: Colors.grey[600],
                        fontStyle: FontStyle.italic),
                  ),
                ],
              ),
            ),

          // ── Upload Documents button ──
          if (_showUploadButton)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _goToUpload,
                  icon: const Icon(Icons.upload_file, color: Colors.white),
                  label: const Text(
                    "Upload Documents",
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2E7D32),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ),
            
          // ── Birth Certificate Upload button ──
          if (_showBirthUploadButton)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _goToBirthUpload,
                  icon: const Icon(Icons.child_care, color: Colors.white),
                  label: const Text(
                    "Upload Birth Proof",
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1976D2),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ),

          // ── Domicile Certificate Upload button ──
          if (_showDomicileUploadButton)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _goToDomicileUpload,
                  icon: const Icon(Icons.home_work, color: Colors.white),
                  label: const Text(
                    "Upload Domicile Documents",
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF4527A0),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ),

          // ── Download Certificate button ──
          if (_showDownloadButton && _certificateUrl != null)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _downloadCertificate,
                  icon: const Icon(Icons.download, color: Colors.white),
                  label: const Text(
                    "Download Your Certificate",
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2E7D32),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ),

          // ── Message input ──
          _buildMessageInput(),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(ChatMessage message) {
    bool isUser = message.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        decoration: BoxDecoration(
          color: isUser ? const Color(0xFF1A3C6E) : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20),
            topRight: const Radius.circular(20),
            bottomLeft: Radius.circular(isUser ? 20 : 0),
            bottomRight: Radius.circular(isUser ? 0 : 20),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 4,
              offset: const Offset(0, 2),
            )
          ],
        ),
        child: Text(
          message.text,
          style: TextStyle(
            color: isUser ? Colors.white : Colors.black87,
            fontSize: 15,
          ),
        ),
      ),
    );
  }

  Widget _buildMessageInput() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, -2),
          )
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _textController,
              decoration: InputDecoration(
                hintText: "Type a message...",
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(25),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Colors.grey[100],
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 20, vertical: 10),
              ),
              onSubmitted: (_) => _sendMessage(),
            ),
          ),
          const SizedBox(width: 8),
          CircleAvatar(
            backgroundColor: const Color(0xFF1A3C6E),
            child: IconButton(
              icon: const Icon(Icons.send, color: Colors.white),
              onPressed: _sendMessage,
            ),
          ),
        ],
      ),
    );
  }
}