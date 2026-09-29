'use strict';

/* ==========================================================================
   Helpers
   ========================================================================== */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ }
  },
};

const STATUSES = [
  { key: 'todo', label: 'To Do', color: 'var(--s-todo)' },
  { key: 'in_progress', label: 'In Progress', color: 'var(--s-progress)' },
  { key: 'review', label: 'In Review', color: 'var(--s-review)' },
  { key: 'done', label: 'Done', color: 'var(--s-done)' },
];
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const PRIO_COLORS = { urgent: 'var(--danger)', high: 'var(--warning)', medium: '#3b82f6', low: 'var(--s-todo)' };
const PROJECT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#64748b'];

const state = {
  token: store.get('th_token'),
  user: null,
  workspace: null,
  projects: [],
  members: [],
  board: { tasks: [], projectId: 'all', search: '', priority: '', assignee: '' },
  timer: null,
};

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  server: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// TaskHive mark: a honeycomb cell with a check. `light` variant for dark/colored backgrounds.
const logo = (size = 32, light = false) => `
  <svg class="brand-logo" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <defs><linearGradient id="hive-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
    <path d="M16 1.8 28.3 8.9v14.2L16 30.2 3.7 23.1V8.9z" fill="${light ? '#fff' : 'url(#hive-g)'}"/>
    <path d="M16 7.4 23.5 11.7v8.6L16 24.6l-7.5-4.3v-8.6z" fill="none" stroke="${light ? '#6366f1' : '#fff'}" stroke-opacity=".3" stroke-width="1.3"/>
    <path d="m11.7 16.3 3 3 5.8-6.1" fill="none" stroke="${light ? '#6366f1' : '#fff'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const avatar = (name, color, cls = '') =>
  name
    ? `<span class="avatar ${cls}" style="background:${esc(color || '#6366f1')}" title="${esc(name)}">${esc(initials(name))}</span>`
    : `<span class="avatar avatar-empty ${cls}" title="Unassigned">${icon('users', 11)}</span>`;

const parseDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
};

function dueBadge(due, status) {
  if (!due) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((parseDate(due) - today) / 86400000);
  let label;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (diff < 0) label = `${-diff}d overdue`;
  else if (diff < 7) label = `In ${diff}d`;
  else label = parseDate(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const cls = status === 'done' ? '' : diff < 0 ? 'overdue' : diff <= 2 ? 'soon' : '';
  return `<span class="due ${cls}">${icon('calendar', 13)}${label}</span>`;
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const formatBytes = (b) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};

const formatUptime = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/* ==========================================================================
   API client
   ========================================================================== */
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check that the backend container is running.');
  }
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) {
    logout();
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ==========================================================================
   UI primitives: toast, modal, confirm
   ========================================================================== */
function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check', 18)}<span>${esc(message)}</span>`;
  $('#toast-root').appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function openModal(title, bodyHtml, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    </div>`;
  const backdrop = $('.modal-backdrop', root);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  if (onMount) onMount($('.modal', root));
  setTimeout(() => $('.modal-body input, .modal-body textarea, .modal-body select', root)?.focus(), 40);
}

const closeModal = () => ($('#modal-root').innerHTML = '');

function confirmDialog(title, message, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    let result = false;
    openModal(
      title,
      `<p class="muted">${message}</p>
       <div class="form-actions" style="margin-top:22px">
         <button class="btn" data-close>Cancel</button>
         <button class="btn btn-primary" id="confirm-yes" style="background:var(--danger);border-color:var(--danger);box-shadow:none">${esc(confirmLabel)}</button>
       </div>`,
      (modal) => {
        $('#confirm-yes', modal).onclick = () => {
          result = true;
          closeModal();
        };
      }
    );
    const observer = new MutationObserver(() => {
      if (!$('#modal-root').children.length) {
        observer.disconnect();
        resolve(result);
      }
    });
    observer.observe($('#modal-root'), { childList: true });
  });
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.textContent = label || 'Please wait…';
  } else if (btn.dataset.label) {
    btn.innerHTML = btn.dataset.label;
  }
}

/* ==========================================================================
   Theme
   ========================================================================== */
const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  store.set('th_theme', next);
  const btn = $('#theme-btn');
  if (btn) btn.innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
}

/* ==========================================================================
   Auth
   ========================================================================== */
const field = (label, name, type, placeholder, extra = '') =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}" placeholder="${placeholder}" required ${extra}></label>`;

function renderAuth(mode = 'login', extraData = {}) {
  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isVerifyTemp = mode === 'verify-temp';
  const isNewPassword = mode === 'new-password';

  const emailVal = extraData.email || '';
  const tempPasswordVal = extraData.tempPassword || '';

  let title = 'Welcome back';
  let subtitle = 'Sign in to continue to your workspace.';
  let buttonText = 'Sign in';

  if (isRegister) {
    title = 'Create your workspace';
    subtitle = 'Start free — no credit card required.';
    buttonText = 'Create workspace';
  } else if (isForgot) {
    title = 'Reset your password';
    subtitle = 'Enter your account email to receive a temporary login password.';
    buttonText = 'Send temporary password';
  } else if (isVerifyTemp) {
    title = 'Enter temporary password';
    subtitle = `A temporary password has been sent to ${emailVal ? `<strong style="color:var(--text);">${esc(emailVal)}</strong>` : 'your email'}. Check your inbox and enter it below.`;
    buttonText = 'Verify temporary password';
  } else if (isNewPassword) {
    title = 'Create new password';
    subtitle = 'Set a new password for your account.';
    buttonText = 'Set new password';
  }

  const heroCol = (title, n) => `<div class="hero-col"><div class="hero-col-title">${title}</div>${'<div class="hero-card"></div>'.repeat(n)}</div>`;

  const passwordLabelHtml = isLogin
    ? `<span>Password</span><a href="#" id="auth-forgot" style="float:right;font-size:12px;color:var(--primary);text-decoration:none;">Forgot password?</a>`
    : `<span>Password</span>`;

  let fieldsHtml = '';

  if (isRegister) {
    fieldsHtml =
      field('Full name', 'name', 'text', 'Ada Lovelace', 'autocomplete="name"') +
      field('Workspace name', 'workspace', 'text', 'Acme Inc.') +
      field('Work email', 'email', 'email', 'you@company.com', 'autocomplete="email"') +
      `<label class="field">${passwordLabelHtml}<input name="password" type="password" placeholder="At least 8 characters" required autocomplete="new-password" minlength="8"></label>`;
  } else if (isLogin) {
    fieldsHtml =
      field('Work email', 'email', 'email', 'you@company.com', `autocomplete="email" value="${esc(emailVal)}"`) +
      `<label class="field">${passwordLabelHtml}<input name="password" type="password" placeholder="••••••••" required autocomplete="current-password" minlength="8"></label>`;
  } else if (isForgot) {
    fieldsHtml = field('Work email', 'email', 'email', 'you@company.com', `autocomplete="email" value="${esc(emailVal)}"`);
  } else if (isVerifyTemp) {
    fieldsHtml =
      `<input type="hidden" name="email" value="${esc(emailVal)}">` +
      field('Temporary password', 'tempPassword', 'text', 'Enter temporary password sent to your email', 'autocomplete="off" required');
  } else if (isNewPassword) {
    fieldsHtml =
      `<input type="hidden" name="email" value="${esc(emailVal)}">` +
      `<input type="hidden" name="tempPassword" value="${esc(tempPasswordVal)}">` +
      field('New password', 'newPassword', 'password', 'Enter new password', 'autocomplete="new-password" minlength="8" required') +
      field('Re-enter new password', 'confirmPassword', 'password', 'Re-enter new password', 'autocomplete="new-password" minlength="8" required');
  }

  const switchPromptHtml = isLogin
    ? `Don't have an account? <a href="#" id="auth-switch">Create a workspace</a>`
    : isRegister
    ? `Already have an account? <a href="#" id="auth-switch">Sign in</a>`
    : `<a href="#" id="auth-switch">← Back to Sign in</a>`;

  $('#app').innerHTML = `
    <div class="auth">
      <section class="auth-hero">
        <div class="brand brand-lg">${logo(42, true)}<span>TaskHive</span></div>
        <div class="hero-copy fade-in">
          <h1>Ship projects faster, together.</h1>
          <p>Plan work, track progress and keep your whole team in sync — in one fast, focused workspace.</p>
          <ul class="hero-points">
            <li>${icon('check', 16)} Kanban boards with drag &amp; drop</li>
            <li>${icon('check', 16)} Live dashboards, cached with Redis</li>
            <li>${icon('check', 16)} Multi-tenant workspaces with team roles</li>
          </ul>
          <div class="hero-preview">${heroCol('To do', 3)}${heroCol('In progress', 2)}${heroCol('Done', 3)}</div>
        </div>
        <div class="hero-foot">Nginx · Node.js · PostgreSQL · Redis — orchestrated with Docker Compose</div>
      </section>
      <section class="auth-panel">
        <form class="auth-form fade-in" id="auth-form" novalidate>
          <h2>${title}</h2>
          <p class="muted">${subtitle}</p>
          ${fieldsHtml}
          <div class="form-error" id="auth-error"></div>
          <div id="auth-success" style="margin-bottom:12px"></div>
          <button class="btn btn-primary btn-block" type="submit">${buttonText}</button>
          <p class="switch">
            ${switchPromptHtml}
          </p>
        </form>
      </section>
    </div>`;

  if ($('#auth-forgot')) {
    $('#auth-forgot').onclick = (e) => {
      e.preventDefault();
      renderAuth('forgot');
    };
  }

  $('#auth-switch').onclick = (e) => {
    e.preventDefault();
    renderAuth(isLogin ? 'register' : 'login');
  };

  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', e.target);
    const body = Object.fromEntries(new FormData(e.target));
    $('#auth-error').textContent = '';
    if ($('#auth-success')) $('#auth-success').innerHTML = '';

    if (isForgot) {
      setBusy(btn, true, 'Sending email…');
      try {
        const data = await api('/auth/forgot-password', { method: 'POST', body });
        setBusy(btn, false);
        toast('Temporary password sent to your email!');
        renderAuth('verify-temp', { email: (body.email || '').trim() });
      } catch (ex) {
        $('#auth-error').textContent = ex.message;
        setBusy(btn, false);
      }
    } else if (isVerifyTemp) {
      setBusy(btn, true, 'Verifying…');
      try {
        await api('/auth/verify-temp-password', { method: 'POST', body });
        setBusy(btn, false);
        toast('Temporary password verified!');
        renderAuth('new-password', {
          email: (body.email || '').trim(),
          tempPassword: (body.tempPassword || '').trim(),
        });
      } catch (ex) {
        $('#auth-error').textContent = ex.message;
        setBusy(btn, false);
      }
    } else if (isNewPassword) {
      if (body.newPassword !== body.confirmPassword) {
        $('#auth-error').textContent = 'New passwords do not match';
        return;
      }
      setBusy(btn, true, 'Updating password…');
      try {
        await api('/auth/reset-password', { method: 'POST', body });
        setBusy(btn, false);
        toast('Password updated successfully! Please sign in.');
        renderAuth('login', { email: (body.email || '').trim() });
      } catch (ex) {
        $('#auth-error').textContent = ex.message;
        setBusy(btn, false);
      }
    } else {
      setBusy(btn, true, isLogin ? 'Signing in…' : 'Creating workspace…');
      try {
        const data = await api(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', body });
        setSession(data);
        toast(isLogin ? `Welcome back, ${data.user.name.split(' ')[0]}!` : `Welcome to TaskHive, ${data.user.name.split(' ')[0]}!`);
      } catch (ex) {
        $('#auth-error').textContent = ex.message;
        setBusy(btn, false);
      }
    }
  };

  setTimeout(() => {
    const firstInput = Array.from($('#auth-form').querySelectorAll('input')).find((el) => el.type !== 'hidden');
    firstInput?.focus();
  }, 50);
}


function setSession(data) {
  state.token = data.token;
  store.set('th_token', data.token);
  state.user = data.user;
  state.workspace = data.workspace;
  if (!location.hash || location.hash === '#/') history.replaceState(null, '', '#/dashboard');
  startApp();
}

function logout() {
  state.token = null;
  state.user = null;
  state.workspace = null;
  store.set('th_token', null);
  clearInterval(state.timer);
  closeModal();
  history.replaceState(null, '', location.pathname);
  renderAuth();
}

/* ==========================================================================
   App shell & routing
   ========================================================================== */
const navItem = (route, label, iconName, countId) =>
  `<a class="nav-item" href="#/${route}" data-route="${route}">${icon(iconName)}<span>${label}</span>${
    countId ? `<span class="nav-count" id="${countId}"></span>` : ''
  }</a>`;

const wsLogo = (cls = '') =>
  state.workspace.logo
    ? `<img class="ws-avatar ${cls}" src="${esc(state.workspace.logo)}" alt="${esc(state.workspace.name)} logo">`
    : `<div class="ws-avatar ${cls}">${esc(initials(state.workspace.name))}</div>`;

function renderWsChip() {
  $('#ws-chip').innerHTML = `
    ${wsLogo()}
    <div style="min-width:0"><div class="ws-name">${esc(state.workspace.name)}</div>
      <div class="small muted" style="text-transform:capitalize">${esc(state.user.role)} · Workspace</div></div>`;
}

function updateNavCounts() {
  const p = $('#count-projects'), t = $('#count-team');
  if (p) p.textContent = state.projects.length;
  if (t) t.textContent = state.members.length;
}

function renderShell() {
  const u = state.user;
  $('#app').innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand">${logo()}<span>TaskHive</span></div>
        <div class="ws-chip" id="ws-chip"></div>
        <nav class="nav">
          ${navItem('dashboard', 'Dashboard', 'dashboard')}
          ${navItem('projects', 'Projects', 'folder', 'count-projects')}
          ${navItem('board', 'Board', 'board')}
          ${navItem('team', 'Team', 'users', 'count-team')}
          <div class="nav-label">Workspace</div>
          ${navItem('settings', 'Settings', 'settings')}
          ${navItem('system', 'System status', 'server')}
        </nav>
        <div class="sidebar-foot">
          ${avatar(u.name, u.avatar_color)}
          <div class="me"><div class="me-name">${esc(u.name)}</div><div class="me-email">${esc(u.email)}</div></div>
          <button class="icon-btn" id="logout-btn" title="Sign out" aria-label="Sign out">${icon('logout')}</button>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main-wrap">
        <header class="topbar">
          <button class="icon-btn mobile-only" id="menu-btn" aria-label="Open menu">${icon('menu')}</button>
          <div class="page-title" id="page-title"></div>
          <div class="topbar-actions">
            <button class="icon-btn" id="theme-btn" title="Toggle theme" aria-label="Toggle theme">${icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>
            <button class="btn btn-primary" id="new-task-btn" title="New task (N)">${icon('plus', 16)}<span class="label">New task</span></button>
          </div>
        </header>
        <main class="main" id="main"></main>
      </div>
    </div>`;
  renderWsChip();
  $('#logout-btn').onclick = () => {
    logout();
    toast('You have been signed out');
  };
  $('#theme-btn').onclick = toggleTheme;
  $('#new-task-btn').onclick = () => openTaskModal();
  $('#menu-btn').onclick = () => $('#sidebar').classList.add('open');
  $('#scrim').onclick = () => $('#sidebar').classList.remove('open');
}

function setTitle(title, subtitle = '') {
  $('#page-title').innerHTML = `<h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}`;
  document.title = `${title} · TaskHive`;
}

const main = (html) => {
  $('#main').innerHTML = `<div class="fade-in">${html}</div>`;
};

const ROUTES = {
  dashboard: viewDashboard,
  projects: viewProjects,
  board: viewBoard,
  team: viewTeam,
  settings: viewSettings,
  system: viewSystem,
};

// Incremented on every navigation so slow responses for old views are discarded.
let routeSeq = 0;

async function route({ silent = false } = {}) {
  if (!state.user) return;
  const seq = ++routeSeq;
  clearInterval(state.timer);
  const [name, param] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  const view = ROUTES[name] || viewDashboard;
  $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === (ROUTES[name] ? name : 'dashboard')));
  $('#sidebar')?.classList.remove('open');
  if (!silent) $('#main').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    await view(param, seq);
  } catch (e) {
    if (seq !== routeSeq || !state.user) return;
    main(`<div class="card empty"><div class="empty-icon">${icon('alert', 26)}</div><h3>Something went wrong</h3>
      <p>${esc(e.message)}</p><button class="btn" onclick="route()">${icon('refresh', 16)} Try again</button></div>`);
  }
}
const stale = (seq) => seq !== routeSeq;

async function loadRefs() {
  const [p, t] = await Promise.all([api('/projects'), api('/team')]);
  state.projects = p.projects;
  state.members = t.members;
  updateNavCounts();
}

async function startApp() {
  renderShell();
  try {
    await loadRefs();
  } catch (e) {
    if (!state.user) return;
    toast(e.message, 'error');
  }
  route();
}

async function boot() {
  if (!state.token) return renderAuth();
  try {
    const me = await api('/auth/me');
    state.user = me.user;
    state.workspace = me.workspace;
    startApp();
  } catch (e) {
    if (!state.token) return; // 401 already redirected to login
    $('#app').innerHTML = `<div class="boot"><div class="empty"><div class="empty-icon">${icon('alert', 26)}</div>
      <h3>Can't connect to TaskHive</h3><p>${esc(e.message)}</p>
      <button class="btn btn-primary" onclick="boot()">${icon('refresh', 16)} Retry</button></div></div>`;
  }
}

window.addEventListener('hashchange', () => route());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (!typing && state.user && !$('#modal-root').children.length && (e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    openTaskModal();
  }
});

/* ==========================================================================
   Dashboard
   ========================================================================== */
const statCard = (label, value, sub, iconName, color, soft) => `
  <div class="card stat">
    <div class="stat-top"><span class="stat-label">${label}</span>
      <span class="stat-icon" style="color:${color};background:${soft}">${icon(iconName, 18)}</span></div>
    <div class="stat-value">${value}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;

const emptyInline = (text) => `<div class="muted small" style="padding:18px 0;text-align:center">${text}</div>`;

async function viewDashboard(_, seq) {
  setTitle('Dashboard', `${greeting()}, ${state.user.name.split(' ')[0]} — here's what's happening in ${state.workspace.name}.`);
  const d = await api('/dashboard');
  if (stale(seq)) return;
  const s = d.stats;

  const total = Object.values(d.by_status).reduce((a, b) => a + b, 0);
  let acc = 0;
  const segments = STATUSES.map((st) => {
    const from = acc;
    acc += total ? (d.by_status[st.key] / total) * 360 : 0;
    return `${st.color} ${from}deg ${acc}deg`;
  });
  const donutBg = total ? `conic-gradient(${segments.join(', ')})` : 'var(--surface-3)';
  const maxPrio = Math.max(1, ...Object.values(d.by_priority));

  main(`
    <div class="grid stats">
      ${statCard('Total tasks', s.tasks, `${s.projects} projects · ${s.members} members`, 'board', 'var(--primary)', 'var(--primary-soft)')}
      ${statCard('In progress', s.in_progress, 'Actively being worked on', 'zap', '#0ea5e9', 'rgba(14,165,233,.13)')}
      ${statCard('Completed', s.done, `${s.completion_rate}% of all tasks · ${s.done_week} this week`, 'check', 'var(--success)', 'var(--success-soft)')}
      ${statCard('Overdue', s.overdue, s.overdue ? 'Needs attention' : 'Everything on schedule', 'alert', 'var(--danger)', 'var(--danger-soft)')}
    </div>

    <div class="grid two section-gap">
      <div class="card">
        <div class="card-head"><h3>Tasks by status</h3><a href="#/board" class="small">Open board →</a></div>
        <div class="card-body">
          <div class="donut-wrap">
            <div class="donut" style="background:${donutBg}">
              <div class="donut-center"><strong>${s.completion_rate}%</strong><span>complete</span></div>
            </div>
            <div class="legend">
              ${STATUSES.map((st) => `<div class="legend-row"><span class="dot" style="background:${st.color}"></span>${st.label}<b>${d.by_status[st.key]}</b></div>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Open tasks by priority</h3></div>
        <div class="card-body"><div class="bars">
          ${PRIORITIES.map((p) => `
            <div class="bar-row"><span class="prio prio-${p}">${p}</span>
              <div class="progress"><span style="width:${(d.by_priority[p] / maxPrio) * 100}%;background:${PRIO_COLORS[p]}"></span></div>
              <b>${d.by_priority[p]}</b></div>`).join('')}
        </div></div>
      </div>
    </div>

    <div class="grid two-even section-gap">
      <div class="card">
        <div class="card-head"><h3>Project progress</h3><a href="#/projects" class="small">All projects →</a></div>
        <div class="card-body"><div class="list">
          ${d.projects.length ? d.projects.map((p) => {
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            return `<a class="list-item" href="#/board/${p.id}" style="color:inherit;text-decoration:none">
              <span class="dot" style="background:${esc(p.color)};width:10px;height:10px"></span>
              <div class="list-main"><div class="list-title">${esc(p.name)}</div>
                <div class="progress" style="margin-top:6px;height:6px"><span style="width:${pct}%;background:${esc(p.color)}"></span></div></div>
              <span class="small muted" style="width:70px;text-align:right">${p.done}/${p.total} · ${pct}%</span></a>`;
          }).join('') : emptyInline('No projects yet.')}
        </div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Upcoming deadlines</h3></div>
        <div class="card-body"><div class="list">
          ${d.upcoming.length ? d.upcoming.map((t) => `
            <div class="list-item">
              ${avatar(t.assignee_name, t.assignee_color)}
              <div class="list-main"><div class="list-title">${esc(t.title)}</div>
                <div class="list-sub"><span class="dot" style="background:${esc(t.project_color)}"></span>${esc(t.project_name)}</div></div>
              <span class="prio prio-${t.priority}">${t.priority}</span>
              ${dueBadge(t.due_date, t.status)}
            </div>`).join('') : emptyInline('No upcoming deadlines. Nice!')}
        </div></div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-head"><h3>Recent activity</h3></div>
      <div class="card-body">
        ${d.activity.length ? d.activity.map((a) => `
          <div class="feed-item">${avatar(a.user_name, a.avatar_color)}
            <div><div class="feed-text"><b>${esc(a.user_name || 'Someone')}</b> ${esc(a.action)}</div>
            <div class="feed-time">${timeAgo(a.created_at)}</div></div></div>`).join('') : emptyInline('No activity yet.')}
      </div>
    </div>

    <div class="cache-note">${icon(d.cached ? 'zap' : 'database', 14)}
      ${d.cached ? 'Served from Redis cache' : 'Freshly computed from PostgreSQL (now cached in Redis)'} · generated ${timeAgo(d.generated_at)}</div>
  `);
}

/* ==========================================================================
   Projects
   ========================================================================== */
async function viewProjects(_, seq) {
  setTitle('Projects', 'Organize work into focused projects.');
  const { projects } = await api('/projects');
  if (stale(seq)) return;
  state.projects = projects;
  updateNavCounts();

  main(`
    <div class="toolbar">
      <div class="search">${icon('search', 16)}<input class="input" id="project-search" placeholder="Search projects…"></div>
      <div class="grow"></div>
      <button class="btn btn-primary" id="new-project">${icon('plus', 16)} New project</button>
    </div>
    <div id="project-grid"></div>`);

  const renderGrid = (q = '') => {
    const list = state.projects.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q));
    $('#project-grid').innerHTML = list.length
      ? `<div class="grid projects">${list.map(projectCard).join('')}</div>`
      : `<div class="card empty"><div class="empty-icon">${icon('folder', 26)}</div>
          <h3>${q ? 'No matching projects' : 'No projects yet'}</h3>
          <p>${q ? 'Try a different search term.' : 'Create your first project to start organizing tasks.'}</p>
          ${q ? '' : `<button class="btn btn-primary" onclick="openProjectModal()">${icon('plus', 16)} New project</button>`}</div>`;
  };
  renderGrid();

  $('#project-search').oninput = (e) => renderGrid(e.target.value.trim().toLowerCase());
  $('#new-project').onclick = () => openProjectModal();
  $('#project-grid').onclick = async (e) => {
    const card = e.target.closest('.project-card');
    if (!card) return;
    const project = state.projects.find((p) => p.id === Number(card.dataset.id));
    if (e.target.closest('[data-edit]')) return openProjectModal(project);
    if (e.target.closest('[data-delete]')) {
      const ok = await confirmDialog(
        'Delete project?',
        `<b>${esc(project.name)}</b> and all ${project.total_tasks} of its tasks will be permanently deleted.`,
        'Delete project'
      );
      if (!ok) return;
      try {
        await api(`/projects/${project.id}`, { method: 'DELETE' });
        toast('Project deleted');
        route({ silent: true });
      } catch (ex) {
        toast(ex.message, 'error');
      }
      return;
    }
    location.hash = `#/board/${project.id}`;
  };
}

function projectCard(p) {
  const pct = p.total_tasks ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
  return `
    <div class="card project-card" data-id="${p.id}">
      <div class="project-top">
        <div class="project-icon" style="background:${esc(p.color)}">${esc(initials(p.name))}</div>
        <div style="min-width:0">
          <div class="project-name">${esc(p.name)}</div>
          <div class="small muted">by ${esc(p.created_by_name || 'a former member')} · ${timeAgo(p.created_at)}</div>
        </div>
        <div class="project-actions">
          <button class="icon-btn" data-edit title="Edit project">${icon('edit', 16)}</button>
          <button class="icon-btn danger" data-delete title="Delete project">${icon('trash', 16)}</button>
        </div>
      </div>
      <div class="project-desc">${esc(p.description) || '<span style="opacity:.7">No description</span>'}</div>
      <div>
        <div class="project-meta"><span>${p.done_tasks} of ${p.total_tasks} tasks done</span><b>${pct}%</b></div>
        <div class="progress" style="margin-top:6px"><span style="width:${pct}%;background:${esc(p.color)}"></span></div>
      </div>
      <div class="project-meta">
        ${p.overdue_tasks ? `<span class="badge badge-danger">${p.overdue_tasks} overdue</span>` : '<span class="badge badge-success">On track</span>'}
        <span style="display:inline-flex;align-items:center;gap:4px">Open board ${icon('arrow', 14)}</span>
      </div>
    </div>`;
}

function openProjectModal(project) {
  const isEdit = !!project;
  let color = project?.color || PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
  openModal(
    isEdit ? 'Edit project' : 'New project',
    `<form id="project-form">
       <label class="field"><span>Project name</span><input name="name" required maxlength="80" placeholder="e.g. Website redesign" value="${esc(project?.name || '')}"></label>
       <label class="field"><span>Description</span><textarea name="description" maxlength="400" placeholder="What is this project about?">${esc(project?.description || '')}</textarea></label>
       <div class="field"><span>Color</span><div class="color-picker">
         ${PROJECT_COLORS.map((c) => `<button type="button" class="color-swatch ${c === color ? 'selected' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
       </div></div>
       <div class="form-error" id="project-error"></div>
       <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button>
         <button class="btn btn-primary" type="submit">${isEdit ? 'Save changes' : 'Create project'}</button></div>
     </form>`,
    (modal) => {
      $('.color-picker', modal).onclick = (e) => {
        const sw = e.target.closest('[data-color]');
        if (!sw) return;
        color = sw.dataset.color;
        $$('.color-swatch', modal).forEach((s) => s.classList.toggle('selected', s === sw));
      };
      $('#project-form', modal).onsubmit = async (e) => {
        e.preventDefault();
        const btn = $('button[type=submit]', e.target);
        const body = { ...Object.fromEntries(new FormData(e.target)), color };
        setBusy(btn, true, 'Saving…');
        try {
          const { project: saved } = isEdit
            ? await api(`/projects/${project.id}`, { method: 'PATCH', body })
            : await api('/projects', { method: 'POST', body });
          closeModal();
          toast(isEdit ? 'Project updated' : 'Project created');
          await loadRefs();
          if (!isEdit) location.hash = `#/board/${saved.id}`;
          else route({ silent: true });
        } catch (ex) {
          $('#project-error').textContent = ex.message;
          setBusy(btn, false);
        }
      };
    }
  );
}

/* ==========================================================================
   Kanban board
   ========================================================================== */
function filteredTasks() {
  const { tasks, search, priority, assignee } = state.board;
  const q = search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q)) return false;
    if (priority && t.priority !== priority) return false;
    if (assignee === 'me' && t.assignee_id !== state.user.id) return false;
    if (assignee === 'none' && t.assignee_id) return false;
    if (assignee && !['me', 'none'].includes(assignee) && t.assignee_id !== Number(assignee)) return false;
    return true;
  });
}

function taskCard(t) {
  return `
    <div class="task-card ${t.status === 'done' ? 'done' : ''}" draggable="true" data-id="${t.id}">
      ${state.board.projectId === 'all' ? `<div class="task-project"><span class="dot" style="background:${esc(t.project_color)}"></span>${esc(t.project_name)}</div>` : ''}
      <div class="task-title">${esc(t.title)}</div>
      ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ''}
      <div class="task-foot">
        <span class="prio prio-${t.priority}">${t.priority}</span>
        ${dueBadge(t.due_date, t.status)}
        ${avatar(t.assignee_name, t.assignee_color, 'avatar-sm')}
      </div>
    </div>`;
}

function renderBoardCards() {
  const tasks = filteredTasks();
  $$('#board .column').forEach((col) => {
    const list = tasks.filter((t) => t.status === col.dataset.status);
    $('[data-count]', col).textContent = list.length;
    $('.cards', col).innerHTML = list.length
      ? list.map(taskCard).join('')
      : '<div class="small muted" style="text-align:center;padding:16px 0">Drop tasks here</div>';
  });
}

async function viewBoard(param, seq) {
  const projectId = param && param !== 'all' ? Number(param) : 'all';
  const project = state.projects.find((p) => p.id === projectId);
  setTitle(project ? project.name : 'Board', project ? project.description || 'Project board' : 'All tasks across every project');

  if (!state.projects.length) {
    return main(`<div class="card empty"><div class="empty-icon">${icon('board', 26)}</div><h3>No projects yet</h3>
      <p>Boards live inside projects. Create one to get started.</p>
      <button class="btn btn-primary" onclick="openProjectModal()">${icon('plus', 16)} New project</button></div>`);
  }

  const { tasks } = await api(`/tasks?project_id=${project ? projectId : 'all'}`);
  if (stale(seq)) return;
  state.board.tasks = tasks;
  state.board.projectId = project ? projectId : 'all';
  const b = state.board;

  main(`
    <div class="toolbar">
      <select class="input" id="board-project" aria-label="Project">
        <option value="all">All projects</option>
        ${state.projects.map((p) => `<option value="${p.id}" ${p.id === b.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <div class="search">${icon('search', 16)}<input class="input" id="board-search" placeholder="Search tasks…" value="${esc(b.search)}"></div>
      <select class="input" id="board-priority" aria-label="Priority">
        <option value="">Any priority</option>
        ${PRIORITIES.map((p) => `<option value="${p}" ${b.priority === p ? 'selected' : ''}>${cap(p)}</option>`).join('')}
      </select>
      <select class="input" id="board-assignee" aria-label="Assignee">
        <option value="">Anyone</option>
        <option value="me" ${b.assignee === 'me' ? 'selected' : ''}>Assigned to me</option>
        <option value="none" ${b.assignee === 'none' ? 'selected' : ''}>Unassigned</option>
        ${state.members.map((m) => `<option value="${m.id}" ${b.assignee === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
      <div class="grow"></div>
      <span class="small muted">${tasks.length} task${tasks.length === 1 ? '' : 's'} · drag cards between columns</span>
    </div>
    <div class="board" id="board">
      ${STATUSES.map((s) => `
        <div class="column" data-status="${s.key}">
          <div class="column-head"><span class="dot" style="background:${s.color}"></span>${s.label}
            <span class="column-count" data-count>0</span>
            <button class="icon-btn" data-add="${s.key}" title="Add task to ${s.label}">${icon('plus', 16)}</button></div>
          <div class="cards"></div>
          <button class="add-card" data-add="${s.key}">${icon('plus', 14)} Add task</button>
        </div>`).join('')}
    </div>`);

  renderBoardCards();

  $('#board-project').onchange = (e) => (location.hash = `#/board/${e.target.value}`);
  $('#board-search').oninput = (e) => {
    b.search = e.target.value;
    renderBoardCards();
  };
  $('#board-priority').onchange = (e) => {
    b.priority = e.target.value;
    renderBoardCards();
  };
  $('#board-assignee').onchange = (e) => {
    b.assignee = e.target.value;
    renderBoardCards();
  };

  const board = $('#board');
  board.onclick = (e) => {
    const add = e.target.closest('[data-add]');
    if (add) return openTaskModal({ status: add.dataset.add });
    const card = e.target.closest('.task-card');
    if (card) openTaskModal(b.tasks.find((t) => t.id === Number(card.dataset.id)));
  };
  board.ondragstart = (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  board.ondragend = (e) => {
    e.target.closest('.task-card')?.classList.remove('dragging');
    $$('.column', board).forEach((c) => c.classList.remove('drag-over'));
  };
  board.ondragover = (e) => {
    const col = e.target.closest('.column');
    if (!col) return;
    e.preventDefault();
    $$('.column', board).forEach((c) => c.classList.toggle('drag-over', c === col));
  };
  board.ondrop = async (e) => {
    const col = e.target.closest('.column');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('drag-over');
    const task = b.tasks.find((t) => t.id === Number(e.dataTransfer.getData('text/plain')));
    if (!task || task.status === col.dataset.status) return;

    const previous = task.status;
    task.status = col.dataset.status; // optimistic update
    renderBoardCards();
    try {
      const { task: updated } = await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.status } });
      Object.assign(task, updated);
      renderBoardCards();
      if (updated.status === 'done') toast(`Completed "${updated.title}"`);
    } catch (ex) {
      task.status = previous;
      renderBoardCards();
      toast(ex.message, 'error');
    }
  };
}

function openTaskModal(task = {}) {
  if (!state.projects.length) {
    toast('Create a project first', 'error');
    location.hash = '#/projects';
    return;
  }
  const isEdit = !!task.id;
  const onBoard = location.hash.startsWith('#/board');
  const projectId = task.project_id || (onBoard && state.board.projectId !== 'all' ? state.board.projectId : state.projects[0].id);
  const assigneeId = isEdit ? task.assignee_id : state.user.id;
  const opt = (value, label, selected) => `<option value="${value}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;

  openModal(
    isEdit ? 'Edit task' : 'New task',
    `<form id="task-form">
       <label class="field"><span>Title</span><input name="title" required maxlength="200" placeholder="What needs to be done?" value="${esc(task.title || '')}"></label>
       <label class="field"><span>Description</span><textarea name="description" maxlength="2000" placeholder="Add more detail…">${esc(task.description || '')}</textarea></label>
       <div class="row">
         <label class="field"><span>Project</span><select name="project_id">${state.projects.map((p) => opt(p.id, p.name, p.id === projectId)).join('')}</select></label>
         <label class="field"><span>Assignee</span><select name="assignee_id">${opt('', 'Unassigned', !assigneeId)}${state.members.map((m) => opt(m.id, m.name, m.id === assigneeId)).join('')}</select></label>
       </div>
       <div class="row">
         <label class="field"><span>Status</span><select name="status">${STATUSES.map((s) => opt(s.key, s.label, s.key === (task.status || 'todo'))).join('')}</select></label>
         <label class="field"><span>Priority</span><select name="priority">${PRIORITIES.map((p) => opt(p, cap(p), p === (task.priority || 'medium'))).join('')}</select></label>
       </div>
       <label class="field"><span>Due date</span><input type="date" name="due_date" value="${esc(task.due_date || '')}"></label>
       <div class="form-error" id="task-error"></div>
       <div class="form-actions">
         ${isEdit ? `<button type="button" class="btn btn-danger" id="delete-task">${icon('trash', 16)} Delete</button>` : ''}
         <span class="spacer"></span>
         <button type="button" class="btn" data-close>Cancel</button>
         <button class="btn btn-primary" type="submit">${isEdit ? 'Save changes' : 'Create task'}</button>
       </div>
     </form>`,
    (modal) => {
      $('#task-form', modal).onsubmit = async (e) => {
        e.preventDefault();
        const btn = $('button[type=submit]', e.target);
        const body = Object.fromEntries(new FormData(e.target));
        body.assignee_id = body.assignee_id || null;
        body.due_date = body.due_date || null;
        setBusy(btn, true, 'Saving…');
        try {
          if (isEdit) await api(`/tasks/${task.id}`, { method: 'PATCH', body });
          else await api('/tasks', { method: 'POST', body });
          closeModal();
          toast(isEdit ? 'Task updated' : 'Task created');
          route({ silent: true });
        } catch (ex) {
          $('#task-error').textContent = ex.message;
          setBusy(btn, false);
        }
      };
      const del = $('#delete-task', modal);
      if (del) {
        del.onclick = async () => {
          const ok = await confirmDialog('Delete task?', `<b>${esc(task.title)}</b> will be permanently deleted.`, 'Delete task');
          if (!ok) return;
          try {
            await api(`/tasks/${task.id}`, { method: 'DELETE' });
            toast('Task deleted');
            route({ silent: true });
          } catch (ex) {
            toast(ex.message, 'error');
          }
        };
      }
    }
  );
}

/* ==========================================================================
   Team
   ========================================================================== */
async function viewTeam(_, seq) {
  setTitle('Team', 'Manage who has access to this workspace.');
  const { members } = await api('/team');
  if (stale(seq)) return;
  state.members = members;
  updateNavCounts();

  const canManage = ['owner', 'admin'].includes(state.user.role);
  const roleBadge = (r) => `<span class="badge ${r === 'owner' ? 'badge-primary' : r === 'admin' ? 'badge-warning' : ''}">${r}</span>`;

  main(`
    <div class="toolbar">
      <div><b>${members.length}</b> <span class="muted">member${members.length === 1 ? '' : 's'}</span></div>
      <div class="grow"></div>
      ${canManage ? `<button class="btn btn-primary" id="add-member">${icon('plus', 16)} Add member</button>` : ''}
    </div>
    <div class="card"><div class="table-wrap">
      <table class="table">
        <thead><tr><th>Member</th><th>Role</th><th class="hide-sm">Open tasks</th><th class="hide-sm">Completed</th><th class="hide-sm">Joined</th><th></th></tr></thead>
        <tbody>
          ${members.map((m) => `
            <tr>
              <td><div class="person">${avatar(m.name, m.avatar_color, 'avatar-lg')}
                <div><div class="person-name">${esc(m.name)}${m.id === state.user.id ? ' <span class="muted small">(you)</span>' : ''}</div>
                <div class="small muted">${esc(m.email)}</div></div></div></td>
              <td>${roleBadge(m.role)}</td>
              <td class="hide-sm">${m.open_tasks}</td>
              <td class="hide-sm">${m.done_tasks}</td>
              <td class="hide-sm muted">${new Date(m.created_at).toLocaleDateString()}</td>
              <td style="text-align:right">${state.user.role === 'owner' && m.role !== 'owner'
                ? `<button class="icon-btn danger" data-remove="${m.id}" title="Remove member">${icon('trash', 16)}</button>` : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div></div>`);

  $('#add-member')?.addEventListener('click', openMemberModal);
  $('#main .table').onclick = async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const m = members.find((x) => x.id === Number(btn.dataset.remove));
    const ok = await confirmDialog('Remove member?', `<b>${esc(m.name)}</b> will lose access. Their tasks will become unassigned.`, 'Remove');
    if (!ok) return;
    try {
      await api(`/team/${m.id}`, { method: 'DELETE' });
      toast(`${m.name} was removed`);
      route({ silent: true });
    } catch (ex) {
      toast(ex.message, 'error');
    }
  };
}

function openMemberModal() {
  openModal(
    'Add team member',
    `<form id="member-form">
       <div class="row">
         <label class="field"><span>Full name</span><input name="name" required placeholder="Grace Hopper"></label>
         <label class="field"><span>Role</span><select name="role">
           <option value="member">Member</option>
           ${state.user.role === 'owner' ? '<option value="admin">Admin</option>' : ''}
         </select></label>
       </div>
       <label class="field"><span>Email</span><input name="email" type="email" required placeholder="grace@company.com"></label>
       <label class="field"><span>Password <span class="muted" style="font-weight:400">(optional — leave blank to generate one)</span></span>
         <input name="password" type="password" minlength="8" placeholder="At least 8 characters" autocomplete="new-password"></label>
       <div class="form-error" id="member-error"></div>
       <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button>
         <button class="btn btn-primary" type="submit">Add member</button></div>
     </form>`,
    (modal) => {
      $('#member-form', modal).onsubmit = async (e) => {
        e.preventDefault();
        const btn = $('button[type=submit]', e.target);
        const body = Object.fromEntries(new FormData(e.target));
        if (!body.password) delete body.password;
        setBusy(btn, true, 'Adding…');
        try {
          const { member, temp_password } = await api('/team', { method: 'POST', body });
          toast(`${member.name} joined the team`);
          await loadRefs();
          route({ silent: true });
          if (temp_password) {
            openModal(
              'Share these credentials',
              `<p class="muted" style="margin-bottom:14px">${esc(member.name)} can sign in with <b>${esc(member.email)}</b> and this temporary password:</p>
               <div class="secret"><span id="temp-pw">${esc(temp_password)}</span>
                 <button class="btn btn-sm" id="copy-pw">${icon('copy', 14)} Copy</button></div>
               <p class="small muted" style="margin-top:12px">For security, this password won't be shown again.</p>
               <div class="form-actions" style="margin-top:18px"><button class="btn btn-primary" data-close>Done</button></div>`,
              (m) => {
                $('#copy-pw', m).onclick = () =>
                  navigator.clipboard?.writeText(temp_password).then(() => toast('Password copied'), () => toast('Copy failed', 'error'));
              }
            );
          } else closeModal();
        } catch (ex) {
          $('#member-error').textContent = ex.message;
          setBusy(btn, false);
        }
      };
    }
  );
}

/* ==========================================================================
   Settings
   ========================================================================== */
const canEditWorkspace = () => ['owner', 'admin'].includes(state.user.role);

// Scales an image to fit inside a size×size square (transparent padding keeps logos uncropped).
function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      canvas.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      let data = canvas.toDataURL('image/webp', 0.9);
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/png');
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image file'));
    };
    img.src = url;
  });
}

async function saveWorkspace(body, message) {
  const { workspace } = await api('/workspace', { method: 'PATCH', body });
  state.workspace = workspace;
  renderWsChip();
  toast(message);
}

function renderWorkspacePanel(editing) {
  const ws = state.workspace;
  const editBtn = $('#ws-edit');
  if (editBtn) editBtn.classList.toggle('hidden', editing);

  if (!editing) {
    $('#ws-panel').innerHTML = `
      <dl class="kv kv-left">
        <dt>Name</dt><dd>${esc(ws.name)}</dd>
        <dt>Workspace ID</dt><dd class="mono">#${ws.id}</dd>
        <dt>Created</dt><dd>${new Date(ws.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd>
        <dt>Your role</dt><dd style="text-transform:capitalize">${esc(state.user.role)}</dd>
      </dl>
      ${canEditWorkspace() ? '' : '<p class="small muted" style="margin-top:14px">Only owners and admins can edit workspace details.</p>'}`;
    return;
  }

  $('#ws-panel').innerHTML = `
    <form id="ws-form">
      <label class="field"><span>Workspace name</span><input name="name" required maxlength="80" value="${esc(ws.name)}"></label>
      <div class="form-error" id="ws-error"></div>
      <div class="form-actions">
        <button type="button" class="btn" id="ws-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">Save changes</button>
      </div>
    </form>`;
  const input = $('#ws-form input');
  input.focus();
  input.select();
  $('#ws-cancel').onclick = () => renderWorkspacePanel(false);
  $('#ws-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', e.target);
    setBusy(btn, true, 'Saving…');
    try {
      await saveWorkspace({ name: input.value }, 'Workspace updated');
      renderWorkspacePanel(false);
      renderLogoPanel();
    } catch (ex) {
      $('#ws-error').textContent = ex.message;
      setBusy(btn, false);
    }
  };
}

function renderLogoPanel() {
  const hasLogo = !!state.workspace.logo;
  $('#logo-panel').innerHTML = `
    <div class="logo-uploader">
      ${wsLogo('ws-avatar-xl')}
      <div class="logo-copy">
        <div class="person-name">${hasLogo ? 'Company logo' : 'No logo yet'}</div>
        <p class="small muted">Shown in the sidebar for everyone in the workspace. PNG, JPG or WebP up to 5 MB, resized to 256×256.</p>
        ${canEditWorkspace() ? `
          <div class="logo-actions">
            <label class="btn btn-primary btn-sm">${icon('upload', 14)} ${hasLogo ? 'Replace' : 'Upload'} logo
              <input type="file" id="logo-input" accept="image/png,image/jpeg,image/webp" hidden></label>
            ${hasLogo ? `<button class="btn btn-sm btn-danger" id="logo-remove">${icon('trash', 14)} Remove</button>` : ''}
          </div>` : '<p class="small muted">Only owners and admins can change the logo.</p>'}
      </div>
    </div>`;

  $('#logo-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Please choose a PNG, JPG or WebP image', 'error');
    if (file.size > 5 * 1024 * 1024) return toast('Image must be smaller than 5 MB', 'error');
    try {
      await saveWorkspace({ logo: await resizeImage(file) }, 'Company logo updated');
      renderLogoPanel();
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
  $('#logo-remove')?.addEventListener('click', async () => {
    try {
      await saveWorkspace({ logo: null }, 'Company logo removed');
      renderLogoPanel();
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
}

function viewSettings() {
  setTitle('Settings', 'Manage your workspace and profile.');
  main(`
    <div class="grid two-even">
      <div class="card">
        <div class="card-head"><h3>Workspace details</h3>
          ${canEditWorkspace() ? `<button class="btn btn-sm" id="ws-edit">${icon('edit', 14)} Edit</button>` : ''}</div>
        <div class="card-body" id="ws-panel"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Company logo</h3></div>
        <div class="card-body" id="logo-panel"></div>
      </div>
    </div>
    <div class="card section-gap">
      <div class="card-head"><h3>Your profile</h3></div>
      <div class="card-body">
        <div class="person" style="margin-bottom:18px">${avatar(state.user.name, state.user.avatar_color, 'avatar-lg')}
          <div><div class="person-name">${esc(state.user.name)}</div><div class="small muted">${esc(state.user.email)}</div></div></div>
        <dl class="kv kv-left">
          <dt>Role</dt><dd style="text-transform:capitalize">${esc(state.user.role)}</dd>
          <dt>Member since</dt><dd>${new Date(state.user.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd>
          <dt>Appearance</dt><dd><button class="btn btn-sm" id="settings-theme">${icon(currentTheme() === 'dark' ? 'sun' : 'moon', 14)} ${currentTheme() === 'dark' ? 'Light' : 'Dark'} mode</button></dd>
        </dl>
      </div>
    </div>
    <div class="card section-gap">
      <div class="card-head"><h3>Change password</h3></div>
      <div class="card-body">
        <form id="change-pw-form" style="max-width:380px">
          <label class="field"><span>Current password</span><input name="currentPassword" type="password" placeholder="Enter current password" required minlength="1"></label>
          <label class="field"><span>New password</span><input name="newPassword" type="password" placeholder="At least 8 characters" required minlength="8"></label>
          <label class="field"><span>Confirm new password</span><input name="confirmPassword" type="password" placeholder="Re-enter new password" required minlength="8"></label>
          <div class="form-error" id="pw-error"></div>
          <div id="pw-success" style="margin-bottom:12px"></div>
          <button class="btn btn-primary" type="submit">Update password</button>
        </form>
      </div>
    </div>`);

  renderWorkspacePanel(false);
  renderLogoPanel();
  $('#ws-edit')?.addEventListener('click', () => renderWorkspacePanel(true));
  $('#settings-theme').onclick = () => {
    toggleTheme();
    viewSettings();
  };

  $('#change-pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = Object.fromEntries(new FormData(form));
    const errEl = $('#pw-error');
    const sucEl = $('#pw-success');
    errEl.textContent = '';
    sucEl.innerHTML = '';

    if (body.newPassword !== body.confirmPassword) {
      errEl.textContent = 'New passwords do not match';
      return;
    }

    const btn = $('button[type=submit]', form);
    setBusy(btn, true, 'Updating…');
    try {
      const data = await api('/auth/change-password', {
        method: 'PUT',
        body: { currentPassword: body.currentPassword, newPassword: body.newPassword },
      });
      sucEl.innerHTML = `<div style="padding:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;color:var(--text);font-size:13px;">✅ ${esc(data.message)}</div>`;
      form.reset();
      toast('Password changed successfully!');
    } catch (ex) {
      errEl.textContent = ex.message;
    }
    setBusy(btn, false);
  };
}

/* ==========================================================================
   System status — shows the containers, networks and volumes behind the app
   ========================================================================== */
const statusPill = (up) =>
  `<span class="status-pill ${up ? 'status-up' : 'status-down'}"><span class="dot"></span>${up ? 'Operational' : 'Down'}</span>`;

const serviceCard = (name, image, iconName, up, rows) => `
  <div class="card service">
    <div class="service-head">
      <div class="service-icon">${icon(iconName, 20)}</div>
      <div><div class="service-name">${name}</div><div class="service-image">${image}</div></div>
      ${statusPill(up)}
    </div>
    <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
  </div>`;

// Network diagram: host → frontend_net → (backend on both networks) → backend_net (internal).
function topologySvg(svc) {
  const node = (x, y, w, h, title, lines, up, highlight) => `
    <g class="tn${highlight ? ' hl' : ''}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>
      ${up === undefined ? '' : `<circle cx="${x + w - 16}" cy="${y + 18}" r="5" class="${up ? 'ok' : 'bad'}"/>`}
      <text class="tn-title" x="${x + 14}" y="${y + (lines.length ? 25 : h / 2 + 5)}">${title}</text>
      ${lines.map((l, i) => `<text class="tn-sub" x="${x + 14}" y="${y + 46 + i * 17}">${esc(l)}</text>`).join('')}
    </g>`;
  const edge = (d, lx, ly, text) =>
    `<path class="te" d="${d}" marker-end="url(#topo-arrow)"/><text class="te-label" x="${lx}" y="${ly}">${text}</text>`;
  const blocked = (d, cx, cy, lx, ly, text) => `
    <path class="tb" d="${d}"/>
    <g class="tx"><circle cx="${cx}" cy="${cy}" r="9"/><path d="M${cx - 3.5},${cy - 3.5}L${cx + 3.5},${cy + 3.5}M${cx + 3.5},${cy - 3.5}L${cx - 3.5},${cy + 3.5}"/></g>
    <text class="te-label te-bad" x="${lx}" y="${ly}">${text}</text>`;

  return `
  <svg class="topo-svg" viewBox="0 0 960 420" role="img" aria-label="Network topology of the TaskHive containers">
    <defs>
      <marker id="topo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path class="te-head" d="M0,0 L10,5 L0,10 z"/>
      </marker>
    </defs>

    <!-- zones -->
    <rect class="tz tz-host" x="12" y="130" width="164" height="170" rx="16"/>
    <text class="tz-label" x="28" y="154">HOST MACHINE</text>
    <rect class="tz tz-front" x="200" y="80" width="430" height="300" rx="16"/>
    <text class="tz-label tz-label-front" x="218" y="106">FRONTEND_NET · BRIDGE</text>
    <rect class="tz tz-back" x="478" y="110" width="468" height="300" rx="16"/>
    <text class="tz-label tz-label-back" x="930" y="398" text-anchor="end">BACKEND_NET · INTERNAL</text>

    <!-- allowed traffic -->
    ${edge('M156,222 L248,222', 202, 212, ':8080')}
    ${edge('M400,222 L492,222', 446, 212, '/api')}
    ${edge('M618,210 L768,192', 693, 191, ':5432')}
    ${edge('M618,234 L768,330', 693, 274, ':6379')}

    <!-- blocked traffic -->
    ${blocked('M325,180 C325,120 640,120 768,168', 498, 134, 498, 160, 'blocked')}
    ${blocked('M850,150 L850,58', 850, 110, 900, 90, 'no egress')}

    <!-- containers -->
    ${node(770, 12, 160, 46, 'Internet', [])}
    ${node(32, 184, 124, 76, 'Browser', ['localhost:8080'])}
    ${node(250, 180, 150, 84, 'frontend', ['nginx · :80', 'published 8080'], true)}
    ${node(494, 180, 124, 84, 'backend', ['node · :5000', 'vol app_logs'], svc.api === 'up', true)}
    ${node(770, 150, 160, 84, 'db', ['postgres · :5432', 'vol pg_data'], svc.database === 'up')}
    ${node(770, 290, 160, 84, 'redis', ['redis · :6379', 'vol redis_data'], svc.cache === 'up')}
  </svg>`;
}

async function viewSystem(_, seq) {
  setTitle('System status', 'Live health of every container in the Docker Compose stack.');
  const t0 = performance.now();
  const [health, sys] = await Promise.all([
    fetch('/api/health').then((r) => r.json()).catch(() => null),
    api('/system').catch(() => null),
  ]);
  const latency = Math.round(performance.now() - t0);
  if (stale(seq)) return;

  const svc = health?.services || {};
  const na = '<span class="muted">n/a</span>';
  const ips = sys?.api.interfaces.map((i) => `<span class="mono">${esc(i.name)} ${esc(i.address)}</span>`).join('<br>') || na;

  main(`
    <div class="toolbar">
      <span class="badge ${health?.status === 'ok' ? 'badge-success' : 'badge-danger'}">${health?.status === 'ok' ? 'All systems operational' : 'Degraded'}</span>
      <span class="small muted">Checked ${new Date().toLocaleTimeString()} · auto-refreshes every 15s</span>
      <div class="grow"></div>
      <button class="btn" id="refresh-system">${icon('refresh', 16)} Refresh</button>
    </div>

    <div class="grid services">
      ${serviceCard('Frontend', 'nginx:1.27-alpine', 'globe', true, [
        ['Role', 'Static SPA + reverse proxy'],
        ['Published port', `${esc(location.port || (location.protocol === 'https:' ? '443' : '80'))} → 80`],
        ['Networks', '<span class="mono">frontend_net</span>'],
        ['API round-trip', `${latency} ms`],
      ])}
      ${serviceCard('API', 'taskhive-backend · node:22-alpine', 'cpu', svc.api === 'up', [
        ['Container', sys ? `<span class="mono">${esc(sys.api.hostname)}</span>` : na],
        ['Runtime', sys ? esc(sys.api.node) : na],
        ['Uptime', sys ? formatUptime(sys.api.uptime_seconds) : na],
        ['Memory', sys ? `${sys.api.memory_mb} MB` : na],
        ['Interfaces', ips],
        ['Access log', sys ? `${formatBytes(sys.logs.access_log_bytes)} <span class="muted">(app_logs)</span>` : na],
      ])}
      ${serviceCard('PostgreSQL', 'postgres:16-alpine', 'database', svc.database === 'up', [
        ['Host', sys ? `<span class="mono">${esc(sys.database.host)}:5432</span>` : na],
        ['Version', sys ? esc(sys.database.version.split(' ')[0]) : na],
        ['Database size', sys ? esc(sys.database.size) : na],
        ['Your rows', sys ? `${sys.database.rows.projects} projects · ${sys.database.rows.tasks} tasks` : na],
        ['Volume', '<span class="mono">pg_data</span>'],
      ])}
      ${serviceCard('Redis', 'redis:7-alpine', 'zap', svc.cache === 'up', [
        ['Version', sys?.cache ? esc(sys.cache.version) : na],
        ['Memory', sys?.cache ? esc(sys.cache.used_memory) : na],
        ['Keys', sys?.cache ? sys.cache.keys : na],
        ['Persistence', sys?.cache ? (sys.cache.aof_enabled ? 'AOF enabled' : 'RDB only') : na],
        ['Volume', '<span class="mono">redis_data</span>'],
      ])}
    </div>

    <div class="card section-gap">
      <div class="card-head"><h3>Network topology</h3><span class="small muted">2 bridge networks · 3 named volumes</span></div>
      <div class="card-body">
        <div class="topo-wrap">${topologySvg(svc)}</div>
        <div class="topo-legend">
          <span><i class="lg lg-front"></i>frontend_net: public side, reachable from the host via port 8080 only</span>
          <span><i class="lg lg-back"></i>backend_net: <span class="mono">internal: true</span>, no internet and not reachable from nginx</span>
          <span><i class="lg lg-edge"></i>Allowed traffic</span>
          <span><i class="lg lg-blocked"></i>Blocked by network isolation</span>
          <span><i class="lg lg-hl"></i>backend is attached to both networks${sys ? ` (${sys.api.interfaces.map((i) => esc(i.address)).join(' / ')})` : ''}</span>
        </div>
      </div>
    </div>`);

  $('#refresh-system').onclick = () => route({ silent: true });
  state.timer = setInterval(() => route({ silent: true }), 15000);
}

/* ==========================================================================
   Start
   ========================================================================== */
boot();
