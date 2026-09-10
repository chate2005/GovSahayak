/**
 * chatbot.js — RAG-powered Q&A Chatbot Widget
 * Sends questions to /api/chat/rag-query and displays
 * policy-grounded answers with zero hallucination.
 */

(function () {
  const SUGGESTED_QUESTIONS = [
    "How to track application?",
    "Documents for farmer?",
    "Income limit for EWS?",
    "Documents for domicile?",
    "Birth cert after 21 days?",
    "Processing time?",
  ];

  let isOpen = false;
  let isSending = false;

  function init() {
    const launcherHTML = `
      <button id="chatbot-launcher" title="Ask GovSahayak Assistant" aria-label="Open chatbot">
        <div class="chatbot-pulse"></div>
        <span class="launcher-icon">💬</span>
      </button>`;

    const windowHTML = `
      <div id="chatbot-window" role="dialog" aria-label="GovSahayak Assistant">
        <div class="chatbot-header">
          <div class="chatbot-avatar">🤖</div>
          <div class="chatbot-header-info">
            <div class="chatbot-name">GovSahayak Assistant</div>
            <div class="chatbot-status">Online · Government E-Services Assistant</div>
          </div>
          <div class="chatbot-header-actions">
            <button class="chatbot-header-btn" id="chatbot-clear-btn" title="Clear chat">🗑️</button>
            <button class="chatbot-header-btn" id="chatbot-close-btn" title="Close">✕</button>
          </div>
        </div>

        <div class="chatbot-suggested" id="chatbot-suggested">
          ${SUGGESTED_QUESTIONS.map(q => `<button class="suggested-btn" data-q="${q}">${q}</button>`).join('')}
        </div>

        <div class="chatbot-messages" id="chatbot-messages">
          <div class="chatbot-welcome">
            <div class="chatbot-welcome-icon">🏛️</div>
            <div class="chatbot-welcome-title">Namaste! How can I help you?</div>
            <div class="chatbot-welcome-desc">
              Ask me anything about certificate eligibility, required documents, tracking your applications, or government procedures.
            </div>
          </div>
        </div>

        <div class="chatbot-input-area">
          <div class="chatbot-input-row">
            <textarea
              id="chatbot-input"
              placeholder="Ask about tracking, eligibility, documents, procedures…"
              rows="1"
              autocomplete="off"
            ></textarea>
            <button class="chatbot-send-btn" id="chatbot-send-btn" title="Send">➤</button>
          </div>
          <div class="chatbot-footer-note">
            🔒 Official Government E-Services Assistance
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', launcherHTML + windowHTML);
    attachEvents();
  }

  function attachEvents() {
    const launcher  = document.getElementById('chatbot-launcher');
    const win       = document.getElementById('chatbot-window');
    const closeBtn  = document.getElementById('chatbot-close-btn');
    const clearBtn  = document.getElementById('chatbot-clear-btn');
    const input     = document.getElementById('chatbot-input');
    const sendBtn   = document.getElementById('chatbot-send-btn');
    const suggested = document.getElementById('chatbot-suggested');

    launcher.addEventListener('click', toggleWindow);
    closeBtn.addEventListener('click', closeWindow);
    clearBtn.addEventListener('click', clearMessages);

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });

    // Suggested quick questions
    suggested.addEventListener('click', (e) => {
      const btn = e.target.closest('.suggested-btn');
      if (btn) {
        input.value = btn.dataset.q;
        sendMessage();
      }
    });
  }

  function toggleWindow() {
    isOpen ? closeWindow() : openWindow();
  }

  function openWindow() {
    isOpen = true;
    const win = document.getElementById('chatbot-window');
    const launcher = document.getElementById('chatbot-launcher');
    win.classList.add('open');
    win.style.display = 'flex';
    launcher.classList.add('open');
    launcher.querySelector('.launcher-icon').textContent = '✕';
    document.getElementById('chatbot-input').focus();
  }

  function closeWindow() {
    isOpen = false;
    const win = document.getElementById('chatbot-window');
    const launcher = document.getElementById('chatbot-launcher');
    win.classList.remove('open');
    win.style.display = 'none';
    launcher.classList.remove('open');
    launcher.querySelector('.launcher-icon').textContent = '💬';
  }

  window.openChatbot = openWindow;
  window.toggleChatbot = toggleWindow;
  function clearMessages() {
    const msgs = document.getElementById('chatbot-messages');
    msgs.innerHTML = `
      <div class="chatbot-welcome">
        <div class="chatbot-welcome-icon">🏛️</div>
        <div class="chatbot-welcome-title">Chat cleared. How can I help you?</div>
        <div class="chatbot-welcome-desc">Ask me about eligibility, documents, or procedures.</div>
      </div>`;
  }

  async function sendMessage() {
    if (isSending) return;
    const input = document.getElementById('chatbot-input');
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    input.style.height = 'auto';

    appendUserBubble(question);
    const typingId = appendTypingIndicator();
    isSending = true;
    document.getElementById('chatbot-send-btn').disabled = true;

    try {
      const data = await window.API.Chat.query(question);
      removeTypingIndicator(typingId);
      appendBotBubble(data.answer || data.reply, data.citations || []);
    } catch (err) {
      removeTypingIndicator(typingId);
      appendBotBubble(
        'I apologise — I could not retrieve an answer at this moment. Please try again or contact the helpdesk.',
        [], true
      );
      console.error('Chatbot error:', err.message);
    } finally {
      isSending = false;
      document.getElementById('chatbot-send-btn').disabled = false;
      document.getElementById('chatbot-input').focus();
    }
  }

  function appendUserBubble(text) {
    const msgs = document.getElementById('chatbot-messages');
    const row = document.createElement('div');
    row.className = 'msg-row user-row';
    row.innerHTML = `
      <div class="msg-avatar">👤</div>
      <div class="msg-content">
        <div class="msg-bubble">${escapeHtml(text)}</div>
        <span class="msg-time">${nowTime()}</span>
      </div>`;
    msgs.appendChild(row);
    scrollToBottom();
  }

  function appendBotBubble(text, citations = [], isError = false) {
    const msgs = document.getElementById('chatbot-messages');
    const row = document.createElement('div');
    row.className = 'msg-row bot-row';

    const citationsHtml = citations.length
      ? `<div class="msg-citations">${citations.map(c =>
          `<span class="citation-tag">${c.section || c.domain || 'Policy'}</span>`
        ).join('')}</div>`
      : '';

    row.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-content">
        <div class="msg-bubble${isError ? ' error-bubble' : ''}">${formatBotText(text)}${citationsHtml}</div>
        <span class="msg-time">${nowTime()}</span>
      </div>`;
    msgs.appendChild(row);
    scrollToBottom();
  }

  function appendTypingIndicator() {
    const msgs = document.getElementById('chatbot-messages');
    const id = 'typing-' + Date.now();
    const row = document.createElement('div');
    row.className = 'msg-row bot-row typing-indicator';
    row.id = id;
    row.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>`;
    msgs.appendChild(row);
    scrollToBottom();
    return id;
  }

  function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function scrollToBottom() {
    const msgs = document.getElementById('chatbot-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function nowTime() {
    return new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function formatBotText(text) {
    if (!text) return 'No response.';
    // Convert markdown-lite to HTML
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/\n{2,}/g, '</p><p style="margin-top:6px">')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>').replace(/$/, '</p>');
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
