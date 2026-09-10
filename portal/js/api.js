/**
 * api.js — Central API client for GovSahayak Portal
 * All backend calls go through this module.
 */

// ── Backend API Configuration ──────────────────────────
// Priority:
// 1. window.API_BASE_URL (if set)
// 2. localStorage 'gov_api_base' (runtime custom URL override)
// 3. Local development fallback (localhost:5001)
// 4. Production backend URL
const DEFAULT_LOCAL_API = 'http://localhost:5001/api';
// REPLACE THIS with your deployed Render / Koyeb backend URL:
const PRODUCTION_API = window.PROD_API_URL || 'https://govsahayak-backend.onrender.com/api';

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '' ||
  window.location.protocol === 'file:'
);

const API_BASE = window.API_BASE_URL ||
  localStorage.getItem('gov_api_base') ||
  (isLocalhost ? DEFAULT_LOCAL_API : PRODUCTION_API);

function getToken() {
  return localStorage.getItem('gov_token') || '';
}

function getUserId() {
  return localStorage.getItem('gov_user_id') || '';
}

function getRole() {
  return localStorage.getItem('gov_role') || 'user';
}

async function request(method, path, body = null, isFormData = false) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

// ── Auth ──────────────────────────────────────────────
const Auth = {
  register: (payload) => request('POST', '/auth/register', payload),
  login:    (payload) => request('POST', '/auth/login',    payload),
  loginOfficer: (payload) => request('POST', '/auth/login-officer', payload),
};

// ── OTP ───────────────────────────────────────────────
const OTP = {
  send:   (payload) => request('POST', '/otp/send',   payload),
  verify: (payload) => request('POST', '/otp/verify', payload),
};

// ── Applications ──────────────────────────────────────
const Applications = {
  getByUser: (userId) => request('GET', `/applications/user/${userId}`),
  track:     (id)     => request('GET', `/applications/track/${id}`),
};

// ── Income Certificate ────────────────────────────────
const Income = {
  upload: (formData) => request('POST', '/income/upload', formData, true),
};

// ── Birth Certificate ─────────────────────────────────
const Birth = {
  upload: (formData) => request('POST', '/birth/upload', formData, true),
};

// ── Domicile Certificate ──────────────────────────────
const Domicile = {
  upload: (formData, step) => {
    const fd = formData;
    return request('POST', `/domicile/upload`, fd, true);
  },
};

// ── Officer ────────────────────────────────────────────
const Officer = {
  getPending:   ()   => request('GET', '/officer/applications/pending'),
  getAll:       ()   => request('GET', '/officer/applications/all'),
  getDocs:      (id) => request('GET', `/officer/applications/${id}/documents`),
  approve:      (id, note) => request('POST', `/officer/approve/${id}`, { note }),
  reject:       (id, note) => request('POST', `/officer/reject/${id}`,  { note }),
};

// ── Chatbot (Policy & Portal Assistant) ─────────────────
const Chat = {
  query: (question) => request('POST', '/chat/rag-query', {
    question,
    user_id: getUserId() || null,
    user_name: localStorage.getItem('gov_name') || null
  }),
};

// ── Utility ───────────────────────────────────────────
function saveAuth(data) {
  localStorage.setItem('gov_token',   data.token);
  localStorage.setItem('gov_user_id', data.user?._id || data._id || '');
  localStorage.setItem('gov_name',    data.user?.name || data.name || '');
  localStorage.setItem('gov_email',   data.user?.email || data.email || '');
  localStorage.setItem('gov_role',    data.user?.role || data.role || 'user');
}

function clearAuth() {
  ['gov_token','gov_user_id','gov_name','gov_email','gov_role'].forEach(k => localStorage.removeItem(k));
}

function requireAuth(redirectTo = 'login.html') {
  if (!getToken()) { window.location.href = redirectTo; return false; }
  return true;
}

function requireOfficer(redirectTo = 'login.html') {
  if (!getToken() || getRole() !== 'officer') { window.location.href = redirectTo; return false; }
  return true;
}

// ── Toast Notifications ───────────────────────────────
function showToast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ── Format Status ─────────────────────────────────────
function formatStatus(status) {
  const map = {
    waiting_for_name: 'Filling Form',
    pending: 'Pending Review',
    sent_to_officer: 'Under Review',
    documents_uploaded: 'Documents Submitted',
    approved: 'Approved',
    rejected: 'Rejected',
    auto_approved: 'Auto-Approved',
  };
  return map[status] || status?.replace(/_/g,' ') || '—';
}

function statusBadgeClass(status) {
  if (['approved','auto_approved'].includes(status)) return 'badge-approved';
  if (['rejected'].includes(status)) return 'badge-rejected';
  if (['sent_to_officer','documents_uploaded'].includes(status)) return 'badge-review';
  return 'badge-pending';
}

function formatServiceType(t) {
  return { income_certificate:'Income Certificate', birth_certificate:'Birth Certificate', domicile_certificate:'Domicile Certificate' }[t] || t;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

// expose globally
window.API = { Auth, OTP, Applications, Income, Birth, Domicile, Officer, Chat, API_BASE };
window.govUtils = {
  saveAuth,
  clearAuth,
  requireAuth,
  requireOfficer,
  showToast,
  formatStatus,
  statusBadgeClass,
  formatServiceType,
  formatDate,
  getToken,
  getUserId,
  getRole,
  setBackendUrl: (url) => {
    localStorage.setItem('gov_api_base', url);
    window.location.reload();
  }
};
