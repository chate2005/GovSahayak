/**
 * layout.js — Shared header, nav, and footer injector
 */

function renderHeader(activePage) {
  const token = localStorage.getItem('gov_token');
  const name  = localStorage.getItem('gov_name') || '';
  const role  = localStorage.getItem('gov_role')  || 'user';
  const isOfficer = role === 'officer';

  // Nav links
  const citizenLinks = [
    { href: 'index.html',     label: 'Home',         id: 'home' },
    { href: 'apply.html',     label: 'Apply',        id: 'apply' },
    { href: 'dashboard.html', label: 'My Applications', id: 'dashboard' },
    { href: 'javascript:void(0)', label: 'Track Status', id: 'track', onclick: 'window.openTrackModal()' },
    { href: 'javascript:void(0)', label: 'Help',         id: 'help',  onclick: 'window.openHelpAction()' },
  ];
  const officerLinks = [
    { href: 'officer.html',   label: 'Officer Dashboard', id: 'officer' },
    { href: 'index.html',     label: 'Home', id: 'home' },
  ];

  const links = isOfficer ? officerLinks : citizenLinks;
  const navHtml = links.map(l =>
    `<a href="${l.href}" ${l.onclick ? `onclick="${l.onclick}"` : ''} class="${activePage === l.id ? 'active' : ''}">${l.label}</a>`
  ).join('');

  const authHtml = token
    ? `<span class="nav-user-info">👤 ${name || 'User'}</span>
       <a href="#" onclick="window.govUtils.clearAuth();window.location.href='login.html'">Logout</a>`
    : `<a href="login.html" style="color:white;font-weight:600;margin-left:8px">Login / Register</a>`;

  document.body.insertAdjacentHTML('afterbegin', `
    <div class="gov-top-banner">
      <span>🇮🇳 भारत सरकार | Government of India</span>
      <div class="top-banner-links">
        <a href="#">Skip to Content</a>
        <a href="#">Screen Reader</a>
        <a href="#">A- A A+</a>
        <a href="#">हिंदी</a>
      </div>
    </div>
    <header class="gov-header">
      <div class="gov-header-inner">
        <a href="index.html" class="gov-logo-block">
          <img src="assets/emblem.svg" alt="Government Emblem" class="gov-emblem"/>
          <div class="gov-title-block">
            <div class="site-hindi">गवसहायक ई-प्रमाण पत्र सेवा</div>
            <div class="site-title">GovSahayak</div>
            <div class="site-subtitle">e-Certificate Portal · Ministry of Revenue & Administration</div>
          </div>
        </a>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <div style="text-align:right;color:rgba(255,255,255,0.7);font-size:11px;">
            <div>Helpline: <strong style="color:white">1800-XXX-XXXX</strong></div>
            <div>Mon–Sat, 9AM–6PM</div>
          </div>
        </div>
      </div>
    </header>
    <nav class="gov-nav">
      <div class="gov-nav-inner">
        ${navHtml}
        <div class="gov-nav-spacer"></div>
        ${authHtml}
      </div>
    </nav>

    <!-- Track Status Modal -->
    <div id="track-modal-overlay" class="modal-overlay" style="display:none;" onclick="if(event.target===this)window.closeTrackModal()">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:22px;">🔍</span>
            <div>
              <div class="modal-title">Track Application Status</div>
              <div style="font-size:12px;color:var(--gov-grey-500);font-weight:normal;">Live government certificate tracking</div>
            </div>
          </div>
          <button class="modal-close" onclick="window.closeTrackModal()" aria-label="Close">✕</button>
        </div>
        <div class="modal-body" style="padding:20px;">
          <p style="font-size:13px;color:var(--gov-grey-600);margin-bottom:14px;line-height:1.5;">
            Enter your <strong>Application Reference ID</strong> to check the real-time status of your certificate request.
          </p>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <input type="text" id="track-modal-input" placeholder="e.g. 68f0... or Application ID"
              style="flex:1;padding:10px 14px;border:1.5px solid var(--gov-grey-300);border-radius:8px;font-size:14px;outline:none;"
              onkeydown="if(event.key==='Enter')window.executeTrackStatus()" />
            <button class="btn btn-primary" id="track-modal-btn" onclick="window.executeTrackStatus()" style="padding:10px 20px;font-weight:600;">
              Track
            </button>
          </div>

          <div id="track-modal-result" style="display:none;"></div>

          <div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--gov-grey-200);display:flex;justify-content:space-between;align-items:center;font-size:13px;">
            <span style="color:var(--gov-grey-600);">Have an account?</span>
            <a href="dashboard.html" style="font-weight:600;color:var(--gov-navy);text-decoration:none;">
              View All My Applications →
            </a>
          </div>
        </div>
      </div>
    </div>
  `);
}

// ── Global Tracking & Help Handlers ────────────────────────
window.openTrackModal = function() {
  const modal = document.getElementById('track-modal-overlay');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
    const inp = document.getElementById('track-modal-input');
    if (inp) {
      inp.value = '';
      inp.focus();
    }
    const res = document.getElementById('track-modal-result');
    if (res) res.style.display = 'none';
  }
};

window.closeTrackModal = function() {
  const modal = document.getElementById('track-modal-overlay');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
};

window.executeTrackStatus = async function() {
  const input = document.getElementById('track-modal-input');
  const resultDiv = document.getElementById('track-modal-result');
  const btn = document.getElementById('track-modal-btn');
  if (!input || !resultDiv) return;

  const appId = input.value.trim();
  if (!appId) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="color:#c53030;padding:10px 12px;background:#fff5f5;border-radius:6px;border:1px solid #feb2b2;font-size:13px;">⚠️ Please enter an Application Reference ID.</div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Searching...';
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div style="text-align:center;padding:16px;color:var(--gov-grey-600);font-size:13px;">⏳ Searching government application database...</div>';

  try {
    const base = (window.API_BASE || 'https://web-production-f9d9c.up.railway.app/api').replace(/\/$/, '');
    const res = await fetch(`${base}/applications/track/${appId}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      resultDiv.innerHTML = `
        <div style="background:#fffaf0;border:1px solid #feebc8;color:#c05621;padding:14px;border-radius:8px;font-size:13px;">
          <strong>❌ Application Not Found</strong><br/>
          <span style="font-size:12px;color:var(--gov-grey-600);margin-top:4px;display:block;">
            No record found matching reference ID: <code>${appId}</code>. Please double-check your ID.
          </span>
        </div>`;
      return;
    }

    const isApproved = (data.status || '').toLowerCase() === 'approved';
    const isRejected = (data.status || '').toLowerCase() === 'rejected';
    const badgeColor = isApproved ? '#22543d' : isRejected ? '#742a2a' : '#7b341e';
    const badgeBg = isApproved ? '#c6f6d5' : isRejected ? '#fed7d7' : '#feebc8';
    const statusText = (data.status || 'PENDING REVIEW').toUpperCase();

    resultDiv.innerHTML = `
      <div style="background:#f7fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-weight:700;color:var(--gov-navy);font-size:14px;text-transform:capitalize;">
            📜 ${(data.service_type || 'Certificate').replace(/_/g, ' ')}
          </span>
          <span style="background:${badgeBg};color:${badgeColor};padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.5px;">
            ${statusText}
          </span>
        </div>
        <div style="font-size:12px;color:var(--gov-grey-700);margin-bottom:6px;">
          <strong>Application ID:</strong> <code>${data.id}</code>
        </div>
        <div style="font-size:12px;color:var(--gov-grey-600);margin-bottom:6px;">
          <strong>Submitted Date:</strong> ${data.created_at ? new Date(data.created_at).toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}) : 'Recent'}
        </div>
        ${data.financial_year ? `<div style="font-size:12px;color:var(--gov-grey-600);margin-bottom:6px;"><strong>Financial Year:</strong> ${data.financial_year}</div>` : ''}
        ${isApproved && data.certificate_url ? `
          <div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e0;">
            <a href="${data.certificate_url}" target="_blank" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;font-size:13px;text-decoration:none;">
              📥 Download Digitally Signed Certificate
            </a>
          </div>
        ` : ''}
      </div>`;
  } catch (err) {
    resultDiv.innerHTML = `<div style="color:#c53030;font-size:13px;padding:8px;">⚠️ Unable to reach server. Please check your network or try again.</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Track';
  }
};

window.openHelpAction = function() {
  if (typeof window.openChatbot === 'function') {
    window.openChatbot();
    return;
  }
  const launcher = document.getElementById('chatbot-launcher');
  if (launcher) {
    launcher.click();
    return;
  }
  const aboutSec = document.getElementById('about');
  if (aboutSec) {
    aboutSec.scrollIntoView({ behavior: 'smooth' });
  } else {
    window.location.href = 'index.html#about';
  }
};

function renderFooter() {
  document.body.insertAdjacentHTML('beforeend', `
    <footer class="gov-footer">
      <div class="gov-footer-inner">
        <div class="gov-footer-grid">
          <div>
            <div class="footer-brand-title">🏛️ GovSahayak</div>
            <div class="footer-brand-desc">
              Official digital e-Governance platform for certificate issuance and citizen services.
              Built for Indian public administration — Income, Domicile &amp; Birth Certificates.
            </div>
            <div class="digital-india-badge">🇮🇳 Digital India Initiative</div>
          </div>
          <div>
            <div class="footer-col-title">Services</div>
            <ul class="footer-links">
              <li><a href="apply.html?type=income">Income Certificate</a></li>
              <li><a href="apply.html?type=birth">Birth Certificate</a></li>
              <li><a href="apply.html?type=domicile">Domicile Certificate</a></li>
              <li><a href="javascript:void(0)" onclick="window.openTrackModal()">Track Application</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">Support</div>
            <ul class="footer-links">
              <li><a href="javascript:void(0)" onclick="window.openHelpAction()">FAQs &amp; Help Assistant</a></li>
              <li><a href="javascript:void(0)" onclick="window.openHelpAction()">Required Documents Guide</a></li>
              <li><a href="#">Contact Us</a></li>
              <li><a href="#">Grievance Portal</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">Legal</div>
            <ul class="footer-links">
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Use</a></li>
              <li><a href="#">Copyright Policy</a></li>
              <li><a href="#">Accessibility</a></li>
            </ul>
          </div>
        </div>
        <div class="gov-footer-bottom">
          <span>© ${new Date().getFullYear()} GovSahayak. All rights reserved. Government of India.</span>
          <span>Last Updated: ${new Date().toLocaleDateString('en-IN')}</span>
        </div>
      </div>
    </footer>
    <div id="toast-container"></div>
  `);
}
