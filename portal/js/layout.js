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
    { href: '#',              label: 'Track Status', id: 'track' },
    { href: '#about',         label: 'Help',         id: 'help' },
  ];
  const officerLinks = [
    { href: 'officer.html',   label: 'Officer Dashboard', id: 'officer' },
    { href: 'index.html',     label: 'Home', id: 'home' },
  ];

  const links = isOfficer ? officerLinks : citizenLinks;
  const navHtml = links.map(l =>
    `<a href="${l.href}" class="${activePage === l.id ? 'active' : ''}">${l.label}</a>`
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
  `);
}

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
              <li><a href="dashboard.html">Track Application</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-col-title">Support</div>
            <ul class="footer-links">
              <li><a href="#">FAQs</a></li>
              <li><a href="#">Required Documents</a></li>
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
