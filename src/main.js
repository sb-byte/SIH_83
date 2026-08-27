import L from 'leaflet';
window.L = L;
import 'leaflet.heat';
import * as turf from '@turf/turf';
import React from 'react';
import ReactDOM from 'react-dom/client';
import UnityEOC from './UnityEOC.jsx';
import { sound } from './audio.js';
import { openRegistrationForm, startAutoSync, filterRemovedVolunteers, removeVolunteer } from './volunteerSync.js';
import {
  USERS_DB,
  ROLE_PERMISSIONS,
  getAuthSession,
  clearAuthSession,
  authenticateUser,
  isViewAuthorized,
  isActionAuthorized,
  filterDataByJurisdiction,
  getAuditTrail,
  logAuthAudit,
  // server-backed additions
  loadDirectory,
  restoreSession,
  refreshAuditTrail,
  allowedChannelIds,
  findCredential,
  fetchDemoTotp,
  apiFetch
} from './auth.js';
import {
  liveIncidentData,
  citizenSosQueue,
  chronoIncidents,
  fleetAssets,
  shelters,
  radioChannels,
  volunteerSquads,
  icsCommandTree,
  icsTasksList,
  exerciseScenario,
  rumorDebunking,
  damageAssessments,
  mutualAidRequests,
  volunteerPool,
  cycloneDanaInundationGeoJSON,
  assamFloodsGeoJSON,
  chamoliGlofGeoJSON,
  wayanadLandslideGeoJSON
} from './data.js';

// Global Application State
const state = {
  mode: 'LIVE',
  view: 'command',
  theme: 'light',
  scenario: 'dana',
  incidents: [...chronoIncidents],
  sosList: [...citizenSosQueue],
  assets: [...fleetAssets],
  sheltersData: [...shelters],
  tasksData: [...icsTasksList],
  rumorsData: [...rumorDebunking],
  damageData: [...damageAssessments],
  volunteerSquads: [...volunteerSquads],
  mutualAidData: [...mutualAidRequests],
  volunteerPoolData: filterRemovedVolunteers([...volunteerPool]),
  activeVolunteerFilter: 'ALL',
  activityLog: [],
  correctiveActions: [
    { def: "Staging area delay for Sector 9 backup fuel tanker.", action: "Pre-position auxiliary diesel tanker directly at Bhadrak Transit Depot.", lead: "Logistics / Civil Supplies", status: "IN PROGRESS" },
    { def: "Air Ops Branch Director vacancy flagged during initial surge.", action: "Automate roster escalation protocol with IAF liaison desk.", lead: "Operations Section", status: "COMPLETED" },
    { def: "Shelter Kendrapara reached 95% critical capacity without overflow routing.", action: "Deploy automated geo-routing trigger to Expo Hall when shelter exceeds 90%.", lead: "Planning & GIS Unit", status: "COMPLETED" }
  ],
  icsTree: JSON.parse(JSON.stringify(icsCommandTree)),
  activeFilter: 'ALL',
  incidentSearchQuery: '',
  activeAssetFilter: 'ALL',
  assetSearchQuery: '',
  simSpeed: 1,
  simPlaying: false,
  simTimeSec: exerciseScenario.currentTimeSec,
  simInterval: null,
  map: null,
  mapInitialized: false,
  dropPinMode: false,
  radarLayers: [],
  evacPolygon: null,
  assetMarkers: [],
  shelterMarkers: [],
  incidentMarkers: [],
  sosMarkers: [],
  customMarkers: [],
  selectedRoleForAssign: null
};

// Safe DOM retrieval
const getEl = (id) => document.getElementById(id);

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =========================================================================
// FLEET & SACHET ALERT ACTIVITY LOG (feeds AAR Reports section 6)
// =========================================================================
// Every register/adjust/approve/assign/remove/transmit action on the
// Fleet & Sachet Alert tab calls logActivity() so it shows up in the
// AAR's chronological log automatically — no manual bookkeeping needed
// when new features get added later.
function logActivity(category, message) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
  state.activityLog.unshift({ time: timeStr, category, message });
  renderActivityLog();

  try {
    apiFetch('POST', '/audit-log', {
      action: category,
      target_entity: message,
      status: 'SUCCESS'
    });
  } catch (e) {}
}

function renderActivityLog() {
  const tbody = getEl('activity-log-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.activityLog.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="mono text-xs text-muted">No activity logged yet this session — actions on the Fleet & Sachet Alert tab will appear here automatically.</td></tr>`;
    return;
  }

  state.activityLog.forEach(entry => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="mono text-xs text-muted">${entry.time}</td>
      <td><span class="badge badge-navy">${entry.category}</span></td>
      <td>${entry.message}</td>
    `;
    tbody.appendChild(row);
  });
}

// Toast Notifier
function showToast(message, type = 'info') {
  const container = getEl('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'alert' ? 'bg-alert' : ''}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// =========================================================================
// APPLICATION INITIALIZATION & API HYDRATION
// =========================================================================
async function hydrateStateFromAPI() {
  const session = getAuthSession();
  if (!session || !session.token) return;

  try {
    const [
      incRes, sosRes, sheltersRes, dzRes, tasksRes, assetsRes, rumorsRes,
      dmgRes, volPoolRes, volSquadsRes, radioRes, auditRes, hazardRes
    ] = await Promise.all([
      apiFetch('GET', '/incidents'),
      apiFetch('GET', '/sos'),
      apiFetch('GET', '/shelters'),
      apiFetch('GET', '/danger-zones'),
      apiFetch('GET', '/tasks'),
      apiFetch('GET', '/resources'),
      apiFetch('GET', '/rumors'),
      apiFetch('GET', '/damage-assessments'),
      apiFetch('GET', '/volunteer-pool'),
      apiFetch('GET', '/volunteer-squads'),
      apiFetch('GET', '/radio-channels'),
      apiFetch('GET', '/audit-log'),
      apiFetch('GET', '/hazard-overlays')
    ]);

    if (incRes.ok && Array.isArray(incRes.body) && incRes.body.length > 0) state.incidents = incRes.body;
    if (sosRes.ok && Array.isArray(sosRes.body) && sosRes.body.length > 0) state.sosList = sosRes.body;
    if (sheltersRes.ok && Array.isArray(sheltersRes.body) && sheltersRes.body.length > 0) state.sheltersData = sheltersRes.body;
    if (dzRes.ok && Array.isArray(dzRes.body) && dzRes.body.length > 0) state.dangerZones = dzRes.body;
    if (tasksRes.ok && Array.isArray(tasksRes.body) && tasksRes.body.length > 0) state.tasksData = tasksRes.body;
    if (assetsRes.ok && Array.isArray(assetsRes.body) && assetsRes.body.length > 0) state.assets = assetsRes.body;
    if (rumorsRes.ok && Array.isArray(rumorsRes.body) && rumorsRes.body.length > 0) state.rumorsData = rumorsRes.body;
    if (dmgRes.ok && Array.isArray(dmgRes.body) && dmgRes.body.length > 0) state.damageData = dmgRes.body;
    if (volPoolRes.ok && Array.isArray(volPoolRes.body) && volPoolRes.body.length > 0) state.volunteerPoolData = volPoolRes.body;
    if (volSquadsRes.ok && Array.isArray(volSquadsRes.body) && volSquadsRes.body.length > 0) state.volunteerSquads = volSquadsRes.body;
    if (radioRes.ok && Array.isArray(radioRes.body) && radioRes.body.length > 0) state.radioChannels = radioRes.body;
    if (auditRes.ok && Array.isArray(auditRes.body) && auditRes.body.length > 0) {
      state.activityLog = auditRes.body.map(item => ({
        time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString('en-IN', { hour12: false }) + ' IST' : 'N/A',
        category: item.action || 'AUDIT',
        message: `[${item.role || 'USER'}] ${item.action} on ${item.target_entity || 'SYSTEM'} (${item.status})`
      }));
    }
    if (hazardRes.ok && Array.isArray(hazardRes.body) && hazardRes.body.length > 0) state.hazardOverlays = hazardRes.body;
  } catch (err) {
    console.warn("API Hydration notice:", err);
  }
}

function renderAllComponents() {
  renderIncidents();
  renderShelters();
  renderAssets();
  renderIcsRoster();
  renderIcsTasks();
  renderRumors();
  renderDamageTable();
  renderCorrectiveActions();
  renderAarMutualAidSummary();
  renderActivityLog();
  renderVolunteerSquads();
  renderShelterMatrix();
  renderMutualAid();
  renderVolunteerPool();
  renderInjects();
  renderTrainees();
  renderKanban();
  if (state.mapInitialized) {
    renderMapMarkers();
  }
}

function initWebSocketSync() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  try {
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg || !msg.payload) return;
        const { type, payload } = msg;

        if (type === 'shelter_created' || type === 'shelter_updated') {
          const idx = state.sheltersData.findIndex(s => s.id === payload.id);
          if (idx >= 0) state.sheltersData[idx] = { ...state.sheltersData[idx], ...payload };
          else state.sheltersData.unshift(payload);
          renderShelters();
          renderShelterMatrix();
        } else if (type === 'danger_zone_declared') {
          if (!state.dangerZones) state.dangerZones = [];
          state.dangerZones.unshift(payload);
        } else if (type === 'danger_zone_resolved') {
          if (state.dangerZones) {
            state.dangerZones = state.dangerZones.filter(dz => dz.id !== payload.id);
          }
        } else if (type === 'incident_created') {
          state.incidents.unshift(payload);
          renderIncidents();
        } else if (type === 'task_updated' || type === 'task_created') {
          const idx = state.tasksData.findIndex(t => t.id === payload.id);
          if (idx >= 0) state.tasksData[idx] = { ...state.tasksData[idx], ...payload };
          else state.tasksData.unshift(payload);
          renderIcsTasks();
          renderKanban();
        }
      } catch (e) {}
    };
    ws.onclose = () => {
      setTimeout(initWebSocketSync, 5000);
    };
  } catch (e) {}
}

function mountReactComponents() {
  const root1 = document.getElementById('react-unity-eoc-v3-root');
  if (root1 && !root1.dataset.mounted) {
    root1.dataset.mounted = 'true';
    ReactDOM.createRoot(root1).render(React.createElement(UnityEOC));
  }
  const root2 = document.getElementById('react-sim-dependency-root');
  if (root2 && !root2.dataset.mounted) {
    root2.dataset.mounted = 'true';
    ReactDOM.createRoot(root2).render(React.createElement(UnityEOC));
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  mountReactComponents();

  await loadDirectory();
  await restoreSession();
  await hydrateStateFromAPI();
  initWebSocketSync();

  initAuthSystem();
  initNavigation();
  initModeSwitcher();
  initScenarioSwitcher();
  initTheme();
  applyRolePermissions();
  renderIncidents();
  renderShelters();
  renderAssets();
  renderIcsRoster();
  renderIcsTasks();
  renderRumors();
  renderDamageTable();
  renderCorrectiveActions();
  renderAarMutualAidSummary();
  renderActivityLog();
  renderVolunteerSquads();
  renderShelterMatrix();
  renderMutualAid();
  renderVolunteerPool();
  renderInjects();
  renderTrainees();
  renderKanban();
  initEscalationPanel();
  initVolunteerStation();
  initFieldHub();
  initTaskAndResourceModals();
  initIapForms();
  initSimulationEngine();
  initDependencySimulator();
  initDroneFeeds();
  initRadioConsole();
  initModals();
  initAssignSquadModal();
  initVolunteerRegistrationModal();
  initSachetAlerting();
  initTelemetryTicker();
  initGISMap();
});

// Clock Display (IST)
function initClock() {
  const clockEl = getEl('clock-display');
  function update() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('en-IN', { hour12: false }) + ' IST';
  }
  update();
  setInterval(update, 1000);
}

// =========================================================================
// ROLE-BASED ACCESS CONTROL (RBAC) & AUTHENTICATION CONTROLLER
// =========================================================================

function initAuthSystem() {
  const loginForm = getEl('auth-login-form');
  const inputId = getEl('auth-input-id');
  const inputPassword = getEl('auth-input-password');
  const inputOtp = getEl('auth-input-otp');
  const box2FA = getEl('auth-2fa-container');
  const btnFillDemoOtp = getEl('btn-fill-demo-otp');
  const errorBox = getEl('auth-error-box');

  // Math Security Captcha Challenge Generator
  function generateCaptcha() {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 1;
    state.captchaAnswer = a + b;
    const display = getEl('captcha-display-text');
    if (display) display.innerText = `${a} + ${b} = ?`;
    const input = getEl('captcha-input-val');
    if (input) input.value = String(state.captchaAnswer);
  }

  generateCaptcha();
  const btnRefreshCaptcha = getEl('btn-refresh-captcha');
  if (btnRefreshCaptcha) btnRefreshCaptcha.addEventListener('click', generateCaptcha);

  // Dynamic 2FA Reveal on Credential Input
  if (inputId && box2FA) {
    const check2FA = async () => {
      const user = findCredential(inputId.value);
      box2FA.style.display = user && user.requires2FA ? 'block' : 'none';
      if (user && user.requires2FA && inputOtp && !inputOtp.value) {
        const code = await fetchDemoTotp(user.credentialId);
        if (code) inputOtp.value = code;
      }
    };
    inputId.addEventListener('input', check2FA);
    inputId.addEventListener('change', check2FA);
    setTimeout(check2FA, 200); // Run on initial load
  }

  // Auto-Fill Demo OTP Helper
  if (btnFillDemoOtp && inputId && inputOtp) {
    btnFillDemoOtp.addEventListener('click', async () => {
      sound.playClick();
      const code = await fetchDemoTotp(inputId.value.trim());
      if (code) {
        inputOtp.value = code;
        showToast(`Demo 2FA code fetched: ${code} (rotates in <30s)`);
      } else {
        showToast('Demo code unavailable — run `npm run totp <credential>` in the server terminal.', 'alert');
      }
    });
  }

  // Refresh Audit Trail Button
  const btnRefreshAudit = getEl('btn-refresh-audit');
  if (btnRefreshAudit) {
    btnRefreshAudit.addEventListener('click', async () => {
      sound.playClick();
      await refreshAuditTrail();
      renderAuthAuditTable();
      showToast('Audit trail refreshed from server');
    });
  }

  // Form Submit Handler with Tier Redirection
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      sound.playClick();
      if (errorBox) errorBox.classList.add('hidden');

      // Captcha verification check (tolerant of pre-filled demo value)
      const captchaInput = getEl('captcha-input-val');
      if (captchaInput && state.captchaAnswer !== undefined) {
        const ans = parseInt(captchaInput.value.trim(), 10);
        if (ans !== state.captchaAnswer) {
          sound.playCriticalAlert();
          if (errorBox) {
            errorBox.innerText = 'Security captcha answer incorrect. Please retry.';
            errorBox.classList.remove('hidden');
          }
          showToast('Security captcha incorrect', 'alert');
          generateCaptcha();
          return;
        }
      }

      const credId = inputId ? inputId.value.trim() : '';
      const pwd = inputPassword ? inputPassword.value : '';
      const otp = inputOtp ? inputOtp.value.trim() : '';

      const submitBtn = getEl('btn-auth-submit');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'AUTHENTICATING…'; }

      // Server-side verification: scrypt password + rotating TOTP + signed JWT.
      const res = await authenticateUser(credId, pwd, otp);

      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'प्रवेश करें / AUTHENTICATE & ENTER EOC COMMAND →'; }

      if (!res.success) {
        sound.playCriticalAlert();
        if (res.requires2FA && box2FA) {
          box2FA.style.display = 'block';
          if (inputOtp) inputOtp.focus();
        }
        if (errorBox) {
          errorBox.innerText = res.error || 'Authentication failed.';
          errorBox.classList.remove('hidden');
        }
        showToast(res.error || 'Authentication failed', 'alert');
        renderAuthAuditTable();
        return;
      }

      // Successful login — dynamic role redirection & operational hub activation
      sound.playSuccess();
      if (inputPassword) inputPassword.value = '';
      if (inputOtp) inputOtp.value = '';
      applyRolePermissions();
      await hydrateStateFromAPI();
      await refreshAuditTrail();
      renderAuthAuditTable();
      renderAllComponents();

      // Determine dedicated destination & configure tier focus
      const tierLevel = res.session.tierLevel || (res.session.tier === 'T1' ? 1 : res.session.tier === 'T2' ? 2 : res.session.tier === 'T3' ? 3 : res.session.tier === 'T4' ? 4 : 5);
      const perms = ROLE_PERMISSIONS[res.session.role];
      let targetView = 'command';

      if (tierLevel === 1) {
        targetView = 'command';
        showToast(`Welcome, ${res.session.name} — National Command Activated (Full IAP Sign-off & Gazette Authority)`);
      } else if (tierLevel === 2) {
        targetView = 'command';
        if (state.map) {
          if (res.session.region === 'West Bengal') {
            setTimeout(() => state.map.flyTo([22.57, 88.36], 9), 200);
          } else {
            setTimeout(() => state.map.flyTo([20.65, 86.85], 9), 200);
          }
        }
        showToast(`Welcome, ${res.session.name} — State Strategic TOC (${res.session.region}) Activated`);
      } else if (tierLevel === 3) {
        targetView = 'command';
        if (state.map) {
          setTimeout(() => state.map.flyTo([20.79, 86.96], 10), 200);
        }
        showToast(`Welcome, ${res.session.name} — District Coordination Hub (${res.session.site}) Activated`);
      } else if (tierLevel === 4) {
        targetView = 'field';
        showToast(`Welcome, ${res.session.name} — Tactical Field Hub Active (Direct Assignment & Rapid Report-Up)`);
      } else if (tierLevel === 5) {
        targetView = 'landing';
        showToast(`Welcome, ${res.session.name} — Aapda Mitra Volunteer Station (Radio Net CH-05 Active)`);
      }

      switchView(targetView);
    });
  }

  // Header Pill & Role Switcher Modal
  const headerPill = getEl('auth-header-pill');
  const roleModal = getEl('modal-role-switcher');
  const closeSwitcherModal = getEl('close-switcher-modal');
  const closeSwitcherBtn = getEl('close-switcher-btn');
  const btnLockSession = getEl('btn-lock-session');
  const headerLogoutBtn = getEl('header-logout-btn');

  const openSwitcher = () => {
    sound.playClick();
    if (roleModal) {
      roleModal.classList.remove('hidden');
      renderDemoProfiles('modal-profiles-container');
    }
  };

  const closeSwitcher = () => {
    sound.playClick();
    if (roleModal) roleModal.classList.add('hidden');
  };

  if (headerPill) headerPill.addEventListener('click', openSwitcher);
  if (closeSwitcherModal) closeSwitcherModal.addEventListener('click', closeSwitcher);
  if (closeSwitcherBtn) closeSwitcherBtn.addEventListener('click', closeSwitcher);

  const handleLogout = async () => {
    sound.playClick();
    await clearAuthSession();
    if (roleModal) roleModal.classList.add('hidden');
    applyRolePermissions();
    renderAuthAuditTable();
    switchView('login');
    showToast('Session Terminated & Terminal Locked');
  };

  if (btnLockSession) btnLockSession.addEventListener('click', handleLogout);
  if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', handleLogout);

  // Discreet Demo Roster Drawer Controls
  const demoDrawer = getEl('drawer-demo-roster');
  const btnOpenDrawerCallout = getEl('btn-open-demo-drawer-callout');
  const floatingDemoBtn = getEl('floating-demo-roster-btn');
  const closeDemoDrawerBtn = getEl('close-demo-drawer-btn');
  const closeDemoDrawerFooter = getEl('btn-close-demo-drawer-footer');

  const openDemoDrawer = () => {
    sound.playClick();
    if (demoDrawer) {
      demoDrawer.classList.remove('hidden');
      renderDemoProfiles('auth-demo-profiles-container');
    }
  };

  const closeDemoDrawer = () => {
    sound.playClick();
    if (demoDrawer) demoDrawer.classList.add('hidden');
  };

  if (btnOpenDrawerCallout) btnOpenDrawerCallout.addEventListener('click', openDemoDrawer);
  if (floatingDemoBtn) floatingDemoBtn.addEventListener('click', openDemoDrawer);
  if (closeDemoDrawerBtn) closeDemoDrawerBtn.addEventListener('click', closeDemoDrawer);
  if (closeDemoDrawerFooter) closeDemoDrawerFooter.addEventListener('click', closeDemoDrawer);

  // Accessibility Font Sizing & Language Controls
  const btnFontDec = getEl('btn-font-dec');
  const btnFontReset = getEl('btn-font-reset');
  const btnFontInc = getEl('btn-font-inc');
  const btnLangToggle = getEl('btn-lang-toggle');

  if (btnFontDec) {
    btnFontDec.addEventListener('click', () => {
      document.body.classList.remove('font-scale-lg');
      document.body.classList.add('font-scale-sm');
      [btnFontDec, btnFontReset, btnFontInc].forEach(b => b && b.classList.remove('active'));
      btnFontDec.classList.add('active');
    });
  }
  if (btnFontReset) {
    btnFontReset.addEventListener('click', () => {
      document.body.classList.remove('font-scale-sm', 'font-scale-lg');
      [btnFontDec, btnFontReset, btnFontInc].forEach(b => b && b.classList.remove('active'));
      btnFontReset.classList.add('active');
    });
  }
  if (btnFontInc) {
    btnFontInc.addEventListener('click', () => {
      document.body.classList.remove('font-scale-sm');
      document.body.classList.add('font-scale-lg');
      [btnFontDec, btnFontReset, btnFontInc].forEach(b => b && b.classList.remove('active'));
      btnFontInc.classList.add('active');
    });
  }
  if (btnLangToggle) {
    btnLangToggle.addEventListener('click', () => {
      sound.playClick();
      showToast('Interface language display: English / हिन्दी');
    });
  }

  // Jump to Tier Hub Button on Clearance HUD
  const btnJumpTierHub = getEl('btn-jump-tier-hub');
  if (btnJumpTierHub) {
    btnJumpTierHub.addEventListener('click', () => {
      sound.playClick();
      const s = getAuthSession();
      if (!s) return;
      const target = s.tierLevel === 5 ? 'landing' : (s.tierLevel === 4 ? 'field' : 'command');
      switchView(target);
    });
  }

  // Render Initial Demo Profiles & Audit Table
  renderDemoProfiles('auth-demo-profiles-container');
  renderAuthAuditTable();
}

function renderDemoProfiles(containerId) {
  const container = getEl(containerId);
  if (!container) return;
  const session = getAuthSession();
  const currentId = session ? session.credentialId : '';

  container.innerHTML = USERS_DB.map(u => {
    const isCur = u.credentialId === currentId;
    const badgeClass = u.tierLevel === 1 ? 'tier1-badge' :
      u.tierLevel === 2 ? 'tier2-badge' :
        u.tierLevel === 3 ? 'tier3-badge' :
          u.tierLevel === 4 ? 'tier4-badge' : 'tier5-badge';

    return `
      <div class="demo-profile-card ${isCur ? 'active-profile' : ''}" data-credential="${u.credentialId}">
        <div class="demo-profile-left">
          <div class="demo-avatar">${u.avatar}</div>
          <div>
            <div class="demo-profile-name">${u.name}</div>
            <div class="demo-profile-meta font-bold">
              <span class="tier-pill-badge ${badgeClass}">${u.tierName.split('•')[0].trim()}</span>
              <span class="mono text-xs text-muted">ID: ${u.credentialId}</span>
              ${u.requires2FA ? '<span class="badge badge-alert" style="font-size:0.6rem;">2FA</span>' : ''}
            </div>
            <div class="demo-profile-jurisdiction">${u.jurisdictionLabel}</div>
          </div>
        </div>
        <button class="btn btn-xs ${isCur ? 'btn-navy' : 'btn-outline'} font-bold">
          ${isCur ? 'ACTIVE' : 'SELECT →'}
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.demo-profile-card').forEach(card => {
    card.addEventListener('click', () => {
      const cred = card.dataset.credential;
      const targetUser = findCredential(cred);
      if (targetUser) {
        prefillCredential(targetUser);
      }
    });
  });
}

function renderAuthAuditTable() {
  const tbody = getEl('auth-audit-table-body');
  const countEl = getEl('audit-session-count');
  if (!tbody) return;

  const trail = getAuditTrail();
  if (countEl) countEl.innerText = trail.length;

  if (trail.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="mono text-xs text-muted" style="text-align: center; padding: 24px;">No security sessions logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = trail.map(entry => {
    const roleTier = entry.role || 'T1';
    const badgeClass = roleTier === 'T1' ? 'tier1-badge' :
      roleTier === 'T2' ? 'tier2-badge' :
        roleTier === 'T3' ? 'tier3-badge' :
          roleTier === 'T4' ? 'tier4-badge' : 'tier5-badge';

    const isSuccess = entry.status === 'AUTHORIZED' || entry.status === 'SUCCESS' || entry.status === 'ONLINE';
    const isWarn = entry.status === '2FA CHALLENGE' || entry.status === 'TERMINATED';
    const chipClass = isSuccess ? 'status-chip online' : (isWarn ? 'status-chip warning' : 'status-chip text-alert');

    return `
      <tr>
        <td class="mono text-xs text-muted">${entry.timestamp || new Date().toLocaleTimeString()}</td>
        <td class="mono font-bold">${entry.credentialId || 'N/A'}</td>
        <td><span class="tier-pill-badge ${badgeClass}">${roleTier}</span></td>
        <td class="text-xs" style="color: var(--text-muted);">${entry.jurisdiction || 'National Command'}</td>
        <td><strong style="color: var(--text-main); font-size: 0.78rem;">${entry.event || entry.action || 'Session Access'}</strong></td>
        <td style="text-align: right;"><span class="${chipClass}">${entry.status || 'OK'}</span></td>
      </tr>
    `;
  }).join('');
}

/**
 * Tier cards are a convenience for demos: they fill in the credential ID and
 * send you to the gateway.
 */
async function prefillCredential(user) {
  sound.playClick();
  const roleModal = getEl('modal-role-switcher');
  if (roleModal) roleModal.classList.add('hidden');

  const demoDrawer = getEl('drawer-demo-roster');
  if (demoDrawer) demoDrawer.classList.add('hidden');

  switchView('login');

  const inputId = getEl('auth-input-id');
  const inputPassword = getEl('auth-input-password');
  const inputOtp = getEl('auth-input-otp');
  const box2FA = getEl('auth-2fa-container');
  const errorBox = getEl('auth-error-box');

  if (errorBox) errorBox.classList.add('hidden');

  if (inputId) {
    inputId.value = user.credentialId;
  }
  if (inputPassword) {
    inputPassword.value = 'Unity@2026';
  }
  if (box2FA) {
    box2FA.style.display = user.requires2FA ? 'block' : 'none';
  }

  if (user.requires2FA && inputOtp) {
    const code = await fetchDemoTotp(user.credentialId);
    if (code) {
      inputOtp.value = code;
    }
  } else if (inputOtp) {
    inputOtp.value = '';
  }

  renderDemoProfiles('auth-demo-profiles-container');
  showToast(`${user.credentialId} (${user.name}) credentials loaded.`);
}

// =========================================================================
// ROLE-BASED ACCESS CONTROL (RBAC) & PERMISSIONS ENFORCER
// =========================================================================

/** No valid session: hide operational tabs, show gateway only, and lock UI. */
function lockTerminal() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.style.display = tab.dataset.view === 'login' ? 'flex' : 'none';
  });
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === 'view-login');
  });
  state.view = 'login';

  const nameEl = getEl('header-user-name');
  const tierChipEl = getEl('header-tier-chip');
  const jurEl = getEl('header-jurisdiction');
  const avatarEl = getEl('header-user-avatar');
  if (avatarEl) avatarEl.innerText = '🏛️';
  if (nameEl) nameEl.innerText = 'OFFICIAL GATEWAY';
  if (tierChipEl) { tierChipEl.className = 'tier-pill-badge'; tierChipEl.innerText = 'NIC PARICHAY'; }
  if (jurEl) jurEl.innerText = 'Awaiting agency credential';

  const logoutBtn = getEl('header-logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  const alertBtn = getEl('quick-alert-btn');
  if (alertBtn) alertBtn.style.display = 'none';

  const hud = getEl('tier-clearance-hud');
  if (hud) hud.classList.add('hidden');

  const auditPanel = getEl('auth-session-audit-panel');
  if (auditPanel) auditPanel.style.display = 'none';

  renderDemoProfiles('auth-demo-profiles-container');
  renderAuthAuditTable();
}

function applyRolePermissions() {
  const session = getAuthSession();

  // FAIL CLOSED. If no session exists, only gateway is shown.
  if (!session) {
    lockTerminal();
    return;
  }

  const perms = ROLE_PERMISSIONS[session.role];
  if (!perms) {
    lockTerminal();
    return;
  }

  // 1. Update Header User Profile Pill & Actions
  const avatarEl = getEl('header-user-avatar');
  const nameEl = getEl('header-user-name');
  const tierChipEl = getEl('header-tier-chip');
  const jurEl = getEl('header-jurisdiction');

  if (avatarEl) avatarEl.innerText = session.avatar;
  if (nameEl) nameEl.innerText = session.name;
  if (tierChipEl) {
    tierChipEl.className = `tier-pill-badge ${perms.badgeClass}`;
    tierChipEl.innerText = session.tierLevel === 1 ? 'T1 • AUTHORITY' :
      session.tierLevel === 2 ? 'T2 • STRATEGIST' :
        session.tierLevel === 3 ? 'T3 • COORDINATOR' :
          session.tierLevel === 4 ? 'T4 • TACTICAL' : 'T5 • VOLUNTEER';
  }
  if (jurEl) jurEl.innerText = session.jurisdictionLabel;

  const logoutBtn = getEl('header-logout-btn');
  if (logoutBtn) logoutBtn.style.display = '';

  // 2. Update and Show Tier Clearance HUD
  const hud = getEl('tier-clearance-hud');
  const badgeEl = getEl('hud-clearance-badge');
  const scopeEl = getEl('hud-clearance-scope');
  const rightsEl = getEl('hud-clearance-rights');

  if (hud) {
    hud.classList.remove('hidden');
    if (session.tierLevel === 1) {
      if (badgeEl) badgeEl.innerText = 'T1 • NATIONAL COMMAND AUTHORITY (NDMA)';
      if (scopeEl) scopeEl.innerHTML = 'Jurisdiction: <strong>National (28 States & 8 UTs)</strong>';
      if (rightsEl) rightsEl.innerHTML = 'Capabilities: <strong>Digital IAP Sign-off, Gazette Declarations, All Operational Views Cleared</strong>';
    } else if (session.tierLevel === 2) {
      if (badgeEl) badgeEl.innerText = `T2 • STATE STRATEGIC COMMAND (${session.region || 'Regional'})`;
      if (scopeEl) scopeEl.innerHTML = `Jurisdiction: <strong>${session.region} State EOC</strong>`;
      if (rightsEl) rightsEl.innerHTML = 'Capabilities: <strong>Asset Registration, Mutual Aid Compacts, Live SACHET Broadcast</strong>';
    } else if (session.tierLevel === 3) {
      if (badgeEl) badgeEl.innerText = `T3 • DISTRICT COORDINATION HUB (${session.site || 'District'})`;
      if (scopeEl) scopeEl.innerHTML = `Jurisdiction: <strong>${session.site} District Hub</strong>`;
      if (rightsEl) rightsEl.innerHTML = 'Capabilities: <strong>Shelter Capacity Ops, Squad Deployment, Equipment Requests</strong>';
    } else if (session.tierLevel === 4) {
      if (badgeEl) badgeEl.innerText = `T4 • TACTICAL STRIKE TEAM (${session.team || session.site || 'Field'})`;
      if (scopeEl) scopeEl.innerHTML = `Jurisdiction: <strong>${session.team || session.site} Strike Scope</strong>`;
      if (rightsEl) rightsEl.innerHTML = 'Capabilities: <strong>Tactical Tasks, Field Incident & Damage Reporting, Direct T2 Escalation</strong>';
    } else {
      if (badgeEl) badgeEl.innerText = 'T5 • AAPDA MITRA COMMUNITY VOLUNTEER';
      if (scopeEl) scopeEl.innerHTML = `Jurisdiction: <strong>${session.site || 'Local'} Sector</strong>`;
      if (rightsEl) rightsEl.innerHTML = 'Capabilities: <strong>Volunteer Portal, Tactical Radio Net CH-05, Ground SOS</strong>';
    }
  }

  // 3. Gate Nav Tab Visibility (Hide login tab when signed in, show only authorized views)
  document.querySelectorAll('.nav-tab').forEach(tab => {
    const view = tab.dataset.view;
    if (view === 'login') {
      tab.style.display = 'none'; // NEVER show login tab in navbar when authenticated
      return;
    }
    const allowed = perms.allowedViews.includes(view);
    tab.style.display = allowed ? 'flex' : 'none';
  });

  // Seamless transition to tier default view if currently on login or unauthorized view
  if (state.view === 'login' || !perms.allowedViews.includes(state.view)) {
    const target = perms.defaultView || 'command';
    switchView(target);
  }

  // 4. Gate Action Buttons across Views (STRICTLY HIDE UNAUTHORIZED CONTROLS)
  const setControlVisible = (id, isAllowed) => {
    const el = getEl(id);
    if (!el) return;
    if (isAllowed) {
      el.style.display = '';
      el.removeAttribute('hidden');
      el.classList.remove('action-restricted', 'hidden-by-role');
      el.disabled = false;
    } else {
      el.style.display = 'none';
      el.setAttribute('hidden', '');
      el.classList.add('action-restricted', 'hidden-by-role');
      el.disabled = true;
    }
  };

  // CAP-SACHET Transmission buttons (Tier 1/2 only in LIVE mode)
  const canSachet = isActionAuthorized('transmit_sachet', state.mode);
  setControlVisible('transmit-sachet-btn', canSachet);
  setControlVisible('quick-alert-btn', canSachet);

  // IAP Digital Sign-off (Tier 1 Authority only)
  const canSign = isActionAuthorized('sign_iap', state.mode);
  setControlVisible('sign-iap-btn', canSign);

  // Asset Registration (Tier 2 only)
  const canAddAsset = isActionAuthorized('add_asset', state.mode);
  setControlVisible('add-asset-btn', canAddAsset);

  // Resource Request (Tier 3 Coordinator only)
  const canRequestAsset = isActionAuthorized('request_asset', state.mode);
  setControlVisible('request-asset-btn', canRequestAsset);

  // Mutual Aid Agreement (Tier 2 only)
  const canMutualAid = isActionAuthorized('add_mutual_aid', state.mode);
  setControlVisible('add-mutual-aid-btn', canMutualAid);

  // Shelter Registration (Tier 2/3 only)
  const canAddShelter = isActionAuthorized('add_shelter', state.mode);
  setControlVisible('add-shelter-btn', canAddShelter);

  // Volunteer Pool Management (Tier 2/3 only)
  const canAddVolunteer = isActionAuthorized('add_volunteer', state.mode);
  setControlVisible('add-volunteer-btn', canAddVolunteer);
  setControlVisible('btn-open-vol-register-modal', canAddVolunteer);

  // Task Creation (T2 and T3 coordinators)
  const canCreateTask = session && ['T2', 'T3'].includes(session.tier);
  setControlVisible('create-task-btn', canCreateTask);

  // Landing Page Adaptation: T5 Volunteer Station vs Higher-tier Command Hub
  const volStation = getEl('landing-volunteer-station');
  const cmdBanner = getEl('landing-command-banner');
  if (volStation && cmdBanner) {
    if (session.tierLevel === 5) {
      volStation.style.display = 'block';
      cmdBanner.style.display = 'none';
    } else {
      volStation.style.display = 'none';
      cmdBanner.style.display = 'block';
    }
  }

  // Incident Logging (T1-T4, hidden for T5)
  const canAddInc = isActionAuthorized('add_incident', state.mode);
  setControlVisible('add-incident-btn', canAddInc);

  // Damage Assessment (T1-T4, hidden for T5)
  const canAddDamage = isActionAuthorized('add_damage', state.mode);
  setControlVisible('add-damage-btn', canAddDamage);

  // Map Tactical Hotspot Pin (T1-T4)
  const canDropPin = isActionAuthorized('drop_pin', state.mode);
  setControlVisible('drop-pin-tool-btn', canDropPin);

  // Corrective Action builder in AAR (Tier 1/2 only)
  const canCap = isActionAuthorized('add_cap', state.mode);
  setControlVisible('add-cap-btn', canCap);

  // Rumor debunker (Tier 1/2 only)
  const canRumor = isActionAuthorized('add_rumor', state.mode);
  setControlVisible('add-rumor-btn', canRumor);

  // Manual Inject in Simulation (Tier 1/2 only)
  const canInject = isActionAuthorized('manual_inject', state.mode);
  setControlVisible('fire-manual-inject-btn', canInject);

  // Filter Radio Channels
  const chanSelect = getEl('radio-channel-select');
  if (chanSelect) {
    const cleared = allowedChannelIds();
    const allowedChannels = cleared.length
      ? radioChannels.filter(c => cleared.includes(c.id))
      : [];
    chanSelect.innerHTML = allowedChannels.map(c => `<option value="${c.id}">${c.name} (${c.freq})</option>`).join('');
  }

  // 5. Security Audit Trail Isolation (Strictly T1 & T2 clearance only)
  const auditPanel = getEl('auth-session-audit-panel');
  if (auditPanel) {
    auditPanel.style.display = (session && [1, 2].includes(session.tierLevel)) ? 'block' : 'none';
  }

  // 6. Re-render Scoped Data Views
  renderIncidents();
  renderAssets();
  renderShelterMatrix();
  renderMutualAid();
  renderDamageTable();
  renderVolunteerPool();
  renderKanban();
  initVolunteerStation();
  initFieldHub();
  renderEscalationInbox();
}

// =========================================================================
// NAVIGATION VIEW CONTROLLER
// =========================================================================
function initNavigation() {
  document.querySelectorAll('.launch-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetView = e.currentTarget.dataset.view;
      switchView(targetView);
    });
  });

  const brandBtn = getEl('nav-brand-btn');
  if (brandBtn) {
    brandBtn.addEventListener('click', () => {
      const s = getAuthSession();
      if (!s) {
        switchView('login');
      } else if (s.tierLevel === 5) {
        switchView('landing');
      } else if (s.tierLevel === 4) {
        switchView('field');
      } else {
        switchView('command');
      }
    });
  }

  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      switchView(view);
    });
  });

  const audioBtn = getEl('audio-toggle-btn');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      sound.enabled = !sound.enabled;
      audioBtn.innerText = sound.enabled ? 'AUDIO ON' : 'MUTED';
      showToast(sound.enabled ? 'Tactical Audio: ENABLED' : 'Tactical Audio: MUTED');
    });
  }

  const chanSelect = getEl('radio-channel-select');
  if (chanSelect) {
    chanSelect.addEventListener('change', () => {
    });
  }
}

function switchView(viewName) {
  // Permission Guard Check
  if (!isViewAuthorized(viewName)) {
    sound.playCriticalAlert();
    showToast('Access Denied: Your security tier does not have clearance for this view.', 'alert');
    return;
  }

  sound.playClick();
  state.view = viewName;

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === viewName);
  });

  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });

  if (viewName === 'login') {
    renderDemoProfiles('auth-demo-profiles-container');
    renderAuthAuditTable();
  }

  if (viewName === 'ics') {
    renderKanban();
  }

  if (viewName === 'escalation') {
    renderEscalationInbox();
  }

  if (viewName === 'landing') {
    initVolunteerStation();
  }

  if (viewName === 'field') {
    initFieldHub();
  }

  if (viewName === 'command') {
    if (!state.mapInitialized) {
      setTimeout(() => initGISMap(), 100);
    } else if (state.map) {
      setTimeout(() => state.map.invalidateSize(), 150);
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================================
// SCENARIO SWITCHER (INDIA DISASTER PROFILES)
// =========================================================================
function initScenarioSwitcher() {
  const scenarioBtns = document.querySelectorAll('.scenario-btn');
  scenarioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sound.playClick();
      scenarioBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scenarioKey = btn.dataset.scenario;
      loadScenario(scenarioKey);
    });
  });
}

function loadScenario(key) {
  state.scenario = key;
  const headerCrumb = getEl('header-incident-title');
  const actLvl = document.querySelector('#activation-pill .activation-lvl');

  if (key === 'dana') {
    if (headerCrumb) headerCrumb.innerText = 'CYCLONE DANA (BAY OF BENGAL) • T+05:18';
    if (actLvl) actLvl.innerText = 'CRISIS: CYCLONE DANA';
    if (state.map) state.map.flyTo([20.65, 86.85], 9);
    showToast('SCENARIO LOADED: Cyclone Dana (Odisha Coast)', 'alert');
  } else if (key === 'assam') {
    if (headerCrumb) headerCrumb.innerText = 'ASSAM FLOODS • WAVE 3';
    if (actLvl) actLvl.innerText = 'CRISIS: ASSAM FLOODS';
    if (state.map) state.map.flyTo([26.2006, 92.9376], 8);
    showToast('SCENARIO LOADED: Assam Brahmaputra Floods');
  } else if (key === 'chamoli') {
    if (headerCrumb) headerCrumb.innerText = 'CHAMOLI GLOF • SURGE RESPONSE';
    if (actLvl) actLvl.innerText = 'CRISIS: CHAMOLI GLOF';
    if (state.map) state.map.flyTo([30.5556, 79.5667], 10);
    showToast('SCENARIO LOADED: Chamoli GLOF Glacial Burst', 'alert');
  } else if (key === 'wayanad') {
    if (headerCrumb) headerCrumb.innerText = 'WAYANAD LANDSLIDE • SAR ACTIVE';
    if (actLvl) actLvl.innerText = 'CRISIS: WAYANAD LANDSLIDE';
    if (state.map) state.map.flyTo([11.5200, 76.1300], 11);
    showToast('SCENARIO LOADED: Wayanad Landslide Rescue');
  }

  if (typeof renderScenarioRiskPolygons === 'function') {
    renderScenarioRiskPolygons(key);
  }
  if (typeof updateHeatmapLayer === 'function') {
    updateHeatmapLayer();
  }
}

// =========================================================================
// DUAL MODE SWITCHER (LIVE VS EXERCISE)
// =========================================================================
function initModeSwitcher() {
  const liveBtn = getEl('mode-live-btn');
  const exerciseBtn = getEl('mode-exercise-btn');
  const quickAlertBtn = getEl('quick-alert-btn');

  if (liveBtn) liveBtn.addEventListener('click', () => setMode('LIVE'));
  if (exerciseBtn) exerciseBtn.addEventListener('click', () => setMode('EXERCISE'));

  if (quickAlertBtn) {
    quickAlertBtn.addEventListener('click', () => {
      switchView('logistics');
      sound.playCriticalAlert();
      showToast('CAP-SACHET EMERGENCY ALERT CONSOLE ARMED', 'alert');
    });
  }
}

function setMode(newMode) {
  if (state.mode === newMode) return;
  state.mode = newMode;
  sound.playModeToggle();
  applyRolePermissions();

  const isLive = newMode === 'LIVE';
  const liveBtn = getEl('mode-live-btn');
  const exerciseBtn = getEl('mode-exercise-btn');
  const hazardBanner = getEl('exercise-hazard-banner');
  const sachetGuard = getEl('sachet-mode-guard');

  if (liveBtn) liveBtn.classList.toggle('active', isLive);
  if (exerciseBtn) exerciseBtn.classList.toggle('active', !isLive);
  if (hazardBanner) hazardBanner.classList.toggle('hidden', isLive);

  if (sachetGuard) {
    if (isLive) {
      sachetGuard.className = 'sachet-guard-pill live-guard';
      sachetGuard.innerText = 'LIVE DISPATCH ARMED — Transmits instant Cell Broadcast to mobile towers in target geometry!';
      showToast('MODE SWITCHED: LIVE CRISIS (ARMED)', 'alert');
    } else {
      sachetGuard.className = 'sachet-guard-pill exercise-guard';
      sachetGuard.innerText = 'EXERCISE SANDBOX ACTIVE — All outgoing alerts are isolated to simulator terminals only.';
      showToast('MODE SWITCHED: EXERCISE SIMULATION (SANDBOX)');
    }
  }
}

// Theme Switcher
function initTheme() {
  const themeBtn = getEl('theme-toggle-btn');
  if (!themeBtn) return;

  themeBtn.addEventListener('click', () => {
    sound.playClick();
    const isDark = document.documentElement.classList.toggle('dark');
    state.theme = isDark ? 'dark' : 'light';
    showToast(`Theme: ${isDark ? 'TACTICAL DARK' : 'TACTICAL LIGHT'}`);
  });
}

// =========================================================================
// INCIDENT & CITIZEN SOS FEED
// =========================================================================
function renderIncidents() {
  const container = getEl('incident-feed-list');
  if (!container) return;
  container.innerHTML = '';

  const search = state.incidentSearchQuery.toLowerCase();

  // TODO: SERVER-SIDE ENFORCEMENT REQUIRED — Scoping should be enforced in API query responses
  const scopedSos = filterDataByJurisdiction(state.sosList, 'jurisdiction', 'region');
  const scopedIncidents = filterDataByJurisdiction(state.incidents, 'jurisdiction', 'region');

  // If SOS filter is selected, show SOS Queue
  if (state.activeFilter === 'SOS') {
    scopedSos.forEach((sos, idx) => {
      const card = document.createElement('div');
      card.className = 'incident-card sos-card';
      card.innerHTML = `
        <div class="inc-top-line">
          <span class="badge badge-alert">[${sos.urgency}] ${sos.time}</span>
          <span class="mono text-xs text-alert font-bold">${sos.id}</span>
        </div>
        <div class="inc-title">${sos.name}</div>
        <div class="inc-desc">"${sos.msg}"</div>
        <div class="inc-bottom">
          <span>${sos.location}</span>
          <span class="mono font-bold text-saffron">UNIT: ${sos.assignedUnit}</span>
        </div>
        <div class="sos-actions-row">
          <button class="btn btn-xs btn-saffron dispatch-boat-btn" data-idx="${idx}">DISPATCH BOAT</button>
          <button class="btn btn-xs btn-outline resolve-sos-btn" data-idx="${idx}">RESOLVE</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        sound.playClick();
        if (state.map && sos.lat && sos.lng) {
          state.map.flyTo([sos.lat, sos.lng], 13, { animate: true, duration: 1 });
          if (sos._marker) {
            setTimeout(() => sos._marker.openPopup(), 600);
          }
          showToast(`Centered on SOS: ${sos.name}`);
        }
      });

      container.appendChild(card);
    });

    // Attach SOS action button listeners
    document.querySelectorAll('.dispatch-boat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.playClick();
        const idx = parseInt(e.target.dataset.idx, 10);
        scopedSos[idx].assignedUnit = "NDRF IRB-101 (Dispatched)";
        scopedSos[idx].status = "IN PROGRESS";
        renderIncidents();
        showToast(`Rescue boat assigned to ${scopedSos[idx].name}`);
      });
    });

    document.querySelectorAll('.resolve-sos-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.playClick();
        const idx = parseInt(e.target.dataset.idx, 10);
        showToast(`SOS [${scopedSos[idx].id}] resolved & evac confirmed!`);
        const itemIdx = state.sosList.findIndex(s => s.id === scopedSos[idx].id);
        if (itemIdx >= 0) state.sosList.splice(itemIdx, 1);
        renderIncidents();
      });
    });

    return;
  }

  // Standard Incident Stream
  const filtered = scopedIncidents.filter(inc => {
    const matchesFilter = (state.activeFilter === 'ALL') ||
      (state.activeFilter === 'CRITICAL' && inc.severity === 'CRITICAL') ||
      (inc.section === state.activeFilter);
    const matchesSearch = inc.title.toLowerCase().includes(search) ||
      inc.details.toLowerCase().includes(search) ||
      inc.location.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });

  filtered.forEach(inc => {
    const card = document.createElement('div');
    card.className = 'incident-card';

    let sevBadge = 'badge-navy';
    if (inc.severity === 'CRITICAL') sevBadge = 'badge-alert';
    if (inc.severity === 'HIGH') sevBadge = 'badge-gold';
    if (inc.severity === 'MEDIUM') sevBadge = 'badge-gold';

    card.innerHTML = `
      <div class="inc-top-line">
        <span class="badge ${sevBadge}">[${inc.severity}] ${inc.time}</span>
        <span class="badge badge-navy text-xs">${inc.section}</span>
      </div>
      <div class="inc-title">${inc.title}</div>
      <div class="inc-desc">${inc.details}</div>
      <div class="inc-bottom">
        <span>${inc.location}</span>
        <span class="text-emerald font-bold">${inc.status}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      sound.playClick();
      if (state.map && inc.lat && inc.lng) {
        state.map.flyTo([inc.lat, inc.lng], 12, { animate: true, duration: 1 });
        if (inc._marker) {
          setTimeout(() => inc._marker.openPopup(), 600);
        }
        showToast(`Map Centered on: ${inc.title}`);
      }
    });

    container.appendChild(card);
  });
}

// Incident Search & Filters
const incSearchInput = getEl('incident-search-input');
if (incSearchInput) {
  incSearchInput.addEventListener('input', (e) => {
    state.incidentSearchQuery = e.target.value;
    renderIncidents();
  });
}

document.querySelectorAll('.filter-strip .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    sound.playClick();
    document.querySelectorAll('.filter-strip .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeFilter = chip.dataset.filter;
    renderIncidents();
  });
});

// =========================================================================
// SHELTERS & ASSETS
// =========================================================================
function renderShelters() {
  const container = getEl('shelter-list');
  if (!container) return;
  container.innerHTML = '';

  state.sheltersData.forEach((s, idx) => {
    const pct = Math.round((s.occupied / s.capacity) * 100);
    const isCritical = pct >= 90;

    const item = document.createElement('div');
    item.className = 'shelter-entry';
    item.innerHTML = `
      <div class="shelter-entry-top">
        <span>${s.name.replace('MCS ', '')}</span>
        <div class="shelter-adjust-btns">
          <button class="btn-adj minus-btn" data-idx="${idx}">-10</button>
          <button class="btn-adj plus-btn" data-idx="${idx}">+10</button>
          <span class="mono ${isCritical ? 'text-alert' : 'text-saffron'} font-bold ml-1">${s.occupied}/${s.capacity} (${pct}%)</span>
        </div>
      </div>
      <div class="shelter-meter">
        <div class="shelter-fill-bar ${isCritical ? 'critical' : ''}" style="width: ${pct}%;"></div>
      </div>
      <div class="inc-bottom" style="margin-top: 2px;">
        <span>${s.medical}</span>
        <span>${s.foodRations}</span>
      </div>
    `;
    container.appendChild(item);
  });

  document.querySelectorAll('.minus-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.playClick();
      const idx = parseInt(e.target.dataset.idx, 10);
      state.sheltersData[idx].occupied = Math.max(0, state.sheltersData[idx].occupied - 10);
      renderShelters();
    });
  });

  document.querySelectorAll('.plus-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.playClick();
      const idx = parseInt(e.target.dataset.idx, 10);
      state.sheltersData[idx].occupied = Math.min(state.sheltersData[idx].capacity, state.sheltersData[idx].occupied + 10);
      renderShelters();
    });
  });
}

function renderAssets() {
  const tbody = getEl('asset-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = state.assetSearchQuery.toLowerCase();
  // TODO: SERVER-SIDE ENFORCEMENT REQUIRED — Scoping should be enforced in API query responses
  const scopedAssets = filterDataByJurisdiction(state.assets, 'jurisdiction', 'region');
  const filtered = scopedAssets.filter(a => {
    const matchesFilter = (state.activeAssetFilter === 'ALL') || (a.type === state.activeAssetFilter);
    const matchesSearch = a.name.toLowerCase().includes(search) ||
      a.id.toLowerCase().includes(search) ||
      a.loc.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });

  filtered.forEach(asset => {
    const row = document.createElement('tr');

    let statusClass = 'badge-emerald';
    if (asset.status === 'DEPLOYED' || asset.status === 'AIRBORNE') statusClass = 'badge-saffron bg-saffron text-white';
    if (asset.status === 'OUT_OF_SERVICE') statusClass = 'badge-alert';

    const session = getAuthSession();
    const isT2 = session && session.tier === 'T2';
    const isT3 = session && session.tier === 'T3';

    let actionCellHtml = '';
    if (isT2) {
      actionCellHtml = `
        <button class="btn btn-xs btn-outline cycle-status-btn" data-id="${asset.id}">
          CYCLE
        </button>
        <button class="btn btn-xs btn-outline tag-loc-btn" data-id="${asset.id}">
          TAG LOC
        </button>
      `;
    } else if (isT3) {
      actionCellHtml = `
        <button class="btn btn-xs btn-outline tag-loc-btn" data-id="${asset.id}">
          TAG LOC
        </button>
      `;
    } else {
      actionCellHtml = `<span class="mono text-xs text-muted">MONITORED</span>`;
    }

    row.innerHTML = `
      <td><strong>${asset.name}</strong><br><span class="mono text-xs text-muted">${asset.id}</span></td>
      <td>${asset.type}</td>
      <td>${asset.unit}</td>
      <td><span class="badge ${statusClass}">${asset.status}</span></td>
      <td>${asset.loc}</td>
      <td class="asset-action-cell">
        ${actionCellHtml}
      </td>
    `;
    tbody.appendChild(row);
  });

  document.querySelectorAll('.cycle-status-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const assetId = e.currentTarget.dataset.id;
      const asset = state.assets.find(a => a.id === assetId);
      if (asset) {
        if (asset.status === 'AVAILABLE') asset.status = 'DEPLOYED';
        else if (asset.status === 'DEPLOYED') asset.status = 'OUT_OF_SERVICE';
        else asset.status = 'AVAILABLE';
        renderAssets();
        showToast(`Asset [${asset.id}] status changed: ${asset.status}`);
        logActivity('ASSET', `${asset.name} (${asset.id}) status → ${asset.status}`);
      }
    });
  });

  document.querySelectorAll('.tag-loc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const assetId = e.currentTarget.dataset.id;
      const asset = state.assets.find(a => a.id === assetId);
      if (asset) {
        const newLoc = prompt(`Update staging / deployment location for ${asset.id}:`, asset.loc);
        if (newLoc && newLoc.trim()) {
          asset.loc = newLoc.trim();
          renderAssets();
          showToast(`Location tagged: ${asset.id} → ${asset.loc}`);
          logActivity('ASSET', `${asset.name} (${asset.id}) location tagged → ${asset.loc}`);
        }
      }
    });
  });
}

const assetSearchInput = getEl('asset-search-input');
if (assetSearchInput) {
  assetSearchInput.addEventListener('input', (e) => {
    state.assetSearchQuery = e.target.value;
    renderAssets();
  });
}

document.querySelectorAll('.asset-filter-bar .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    sound.playClick();
    document.querySelectorAll('.asset-filter-bar .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeAssetFilter = chip.dataset.assetFilter;
    renderAssets();
  });
});

function renderAarMutualAidSummary() {
  const tbody = getEl('aar-mutual-aid-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.mutualAidData.forEach(req => {
    let statusClass = 'badge-gold';
    if (req.status === 'APPROVED' || req.status === 'SCHEDULED') statusClass = 'badge-emerald';
    if (req.status === 'DENIED') statusClass = 'badge-alert';
    if (req.status === 'PENDING') statusClass = 'badge-navy';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${req.agency}</strong><br><span class="mono text-xs text-muted">${req.id} • ${req.requestedAt}</span></td>
      <td>${req.resource} <span class="mono text-xs text-muted">×${req.qty}</span></td>
      <td><span class="badge ${req.priority === 'CRITICAL' ? 'badge-alert' : 'badge-gold'}">${req.priority}</span></td>
      <td><span class="badge ${statusClass}">${req.status}</span></td>
      <td class="mono text-xs">${req.approvedBy || '—'}</td>
    `;
    tbody.appendChild(row);
  });
}

// =========================================================================
// SHELTER CAPACITY MATRIX (Full Logistics View)
// =========================================================================
function renderShelterMatrix() {
  const tbody = getEl('shelter-matrix-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // TODO: SERVER-SIDE ENFORCEMENT REQUIRED — Scoping should be enforced in API query responses
  const scopedShelters = filterDataByJurisdiction(state.sheltersData, 'jurisdiction', 'region');

  scopedShelters.forEach((s, idx) => {
    const pct = Math.round((s.occupied / s.capacity) * 100);
    let statusClass = 'badge-emerald';
    if (pct >= 90) statusClass = 'badge-alert';
    else if (pct >= 70) statusClass = 'badge-gold';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${s.name}</strong><br><span class="mono text-xs text-muted">${s.id}</span></td>
      <td class="mono">${s.occupied}/${s.capacity} <span class="text-muted text-xs">(${pct}%)</span></td>
      <td><span class="badge ${statusClass}">${pct >= 90 ? 'CRITICAL' : pct >= 70 ? 'NEAR FULL' : 'AVAILABLE'}</span></td>
      <td>${s.medical}</td>
      <td>${s.foodRations}</td>
      <td class="asset-action-cell">
        <input type="number" class="field-input shelter-occupancy-input mono text-xs"
               data-idx="${idx}" value="${s.occupied}" min="0" max="${s.capacity}" />
        <button class="btn btn-xs btn-saffron shelter-matrix-set" data-idx="${idx}">SET</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  const commitOccupancy = (idx, rawValue) => {
    const s = scopedShelters[idx];
    let val = parseInt(rawValue, 10);

    if (Number.isNaN(val)) {
      showToast('Enter a valid number');
      renderShelterMatrix();
      return;
    }
    val = Math.max(0, Math.min(s.capacity, val)); // clamp to [0, capacity]

    if (val !== parseInt(rawValue, 10)) {
      showToast(`Clamped to valid range: 0–${s.capacity}`);
    }

    s.occupied = val;
    renderShelterMatrix();
    renderShelters();
    logActivity('SHELTER', `Occupancy set: ${s.name} → ${s.occupied}/${s.capacity}`);
  };

  document.querySelectorAll('.shelter-matrix-set').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      const input = document.querySelector(`.shelter-occupancy-input[data-idx="${idx}"]`);
      commitOccupancy(idx, input.value);
    });
  });

  document.querySelectorAll('.shelter-occupancy-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        commitOccupancy(idx, e.currentTarget.value);
      }
    });
  });
}

// Register Shelter Modal
const addShelterBtn = getEl('add-shelter-btn');
const shelterModal = getEl('modal-shelter');
const closeShelterModal = () => shelterModal && shelterModal.classList.add('hidden');

if (addShelterBtn && shelterModal) {
  addShelterBtn.addEventListener('click', () => {
    sound.playClick();
    shelterModal.classList.remove('hidden');
  });
}

const closeShelterBtn = getEl('close-shelter-modal');
const cancelShelterBtn = getEl('cancel-shelter-btn');
if (closeShelterBtn) closeShelterBtn.addEventListener('click', closeShelterModal);
if (cancelShelterBtn) cancelShelterBtn.addEventListener('click', closeShelterModal);

const saveShelterBtn = getEl('save-shelter-btn');
if (saveShelterBtn) {
  saveShelterBtn.addEventListener('click', () => {
    const name = getEl('new-shelter-name')?.value.trim();
    const capacity = parseInt(getEl('new-shelter-capacity')?.value, 10);
    const region = getEl('new-shelter-region')?.value || 'Odisha';
    const lat = parseFloat(getEl('new-shelter-lat')?.value) || 20.7885;
    const lng = parseFloat(getEl('new-shelter-lng')?.value) || 86.9580;
    const medical = getEl('new-shelter-medical')?.value.trim() || 'Doctor On-Duty';
    const foodRations = getEl('new-shelter-food')?.value.trim() || '72h Stored';

    if (!name) { showToast('Shelter name is required'); return; }
    if (!capacity || capacity <= 0) { showToast('Enter a valid capacity'); return; }

    const newShelter = {
      id: `MCS-${String(state.sheltersData.length + 1).padStart(2, '0')}`,
      name,
      capacity,
      occupied: 0,
      status: 'AVAILABLE',
      region,
      lat,
      lng,
      medical,
      foodRations
    };

    state.sheltersData.push(newShelter);

    if (typeof addShelterToGIS === 'function') {
      addShelterToGIS(newShelter);
    }

    sound.playClick();
    renderShelterMatrix();
    renderShelters();
    closeShelterModal();

    if (state.map) {
      state.map.flyTo([lat, lng], 13, { duration: 1.2 });
      if (newShelter._marker) {
        setTimeout(() => newShelter._marker.openPopup(), 1300);
      }
    }

    getEl('new-shelter-name').value = '';
    getEl('new-shelter-capacity').value = '';
    getEl('new-shelter-medical').value = '';
    getEl('new-shelter-food').value = '';
    showToast(`Shelter registered on GIS Map: ${name}`);
    logActivity('SHELTER', `New shelter registered: ${name} (capacity ${capacity}) at [${lat}, ${lng}]`);
  });
}

// =========================================================================
// MUTUAL AID REQUEST LOG
// =========================================================================
function renderMutualAid() {
  const tbody = getEl('mutual-aid-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // TODO: SERVER-SIDE ENFORCEMENT REQUIRED — Scoping should be enforced in API query responses
  const scopedMutualAid = filterDataByJurisdiction(state.mutualAidData, 'jurisdiction', 'region');

  scopedMutualAid.forEach((req, idx) => {
    let statusClass = 'badge-gold';
    if (req.status === 'APPROVED' || req.status === 'SCHEDULED') statusClass = 'badge-emerald';
    if (req.status === 'DENIED') statusClass = 'badge-alert';
    if (req.status === 'PENDING') statusClass = 'badge-navy';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${req.agency}</strong><br><span class="mono text-xs text-muted">${req.id} • ${req.requestedAt}</span></td>
      <td>${req.resource} <span class="mono text-xs text-muted">×${req.qty}</span></td>
      <td><span class="badge ${req.priority === 'CRITICAL' ? 'badge-alert' : 'badge-gold'}">${req.priority}</span></td>
      <td><span class="badge ${statusClass}">${req.status}</span>${req.approvedBy ? `<br><span class="mono text-xs text-muted">by ${req.approvedBy}</span>` : ''}</td>
      <td class="asset-action-cell">
        ${req.status === 'PENDING' ? `
          <button class="btn btn-xs btn-outline mutual-aid-approve" data-idx="${idx}">APPROVE</button>
          <button class="btn btn-xs btn-outline mutual-aid-deny" data-idx="${idx}">DENY</button>
        ` : `<span class="mono text-xs text-muted">—</span>`}
      </td>
    `;
    tbody.appendChild(row);
  });

  document.querySelectorAll('.mutual-aid-approve').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!isActionAuthorized('approve_mutual_aid')) {
        sound.playCriticalAlert();
        showToast('Unauthorized: Only Tier 1 Authority and Tier 2 Strategist can approve mutual aid requests.', 'alert');
        return;
      }

      sound.playClick();
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      const req = scopedMutualAid[idx];
      const session = getAuthSession();
      req.status = 'APPROVED';
      req.approvedBy = session ? session.name : 'State EOC Duty Officer';
      renderMutualAid();
      renderAarMutualAidSummary();
      showToast(`Mutual aid request approved: ${req.resource} → ${req.agency}`);
      logActivity('MUTUAL AID', `Approved: ${req.resource} ×${req.qty} → ${req.agency}`);
    });
  });

  document.querySelectorAll('.mutual-aid-deny').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!isActionAuthorized('approve_mutual_aid')) {
        sound.playCriticalAlert();
        showToast('Unauthorized: Only Tier 1 Authority and Tier 2 Strategist can deny mutual aid requests.', 'alert');
        return;
      }

      sound.playClick();
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      const req = scopedMutualAid[idx];
      const session = getAuthSession();
      req.status = 'DENIED';
      req.approvedBy = session ? session.name : 'State EOC Duty Officer';
      renderMutualAid();
      renderAarMutualAidSummary();
      showToast(`Mutual aid request denied: ${req.resource} → ${req.agency}`);
      logActivity('MUTUAL AID', `Denied: ${req.resource} ×${req.qty} → ${req.agency}`);
    });
  });
}

// Register Mutual Aid Request Modal
const addMutualAidBtn = getEl('add-mutual-aid-btn');
const mutualAidModal = getEl('modal-mutual-aid');
const closeMutualAidModal = () => mutualAidModal && mutualAidModal.classList.add('hidden');

if (addMutualAidBtn && mutualAidModal) {
  addMutualAidBtn.addEventListener('click', () => {
    sound.playClick();
    mutualAidModal.classList.remove('hidden');
  });
}

const closeMutualAidBtn = getEl('close-mutual-aid-modal');
const cancelMutualAidBtn = getEl('cancel-mutual-aid-btn');
if (closeMutualAidBtn) closeMutualAidBtn.addEventListener('click', closeMutualAidModal);
if (cancelMutualAidBtn) cancelMutualAidBtn.addEventListener('click', closeMutualAidModal);

const saveMutualAidBtn = getEl('save-mutual-aid-btn');
if (saveMutualAidBtn) {
  saveMutualAidBtn.addEventListener('click', () => {
    const agency = getEl('new-mutual-aid-agency')?.value.trim();
    const resource = getEl('new-mutual-aid-resource')?.value.trim();
    const qty = parseInt(getEl('new-mutual-aid-qty')?.value, 10) || 1;
    const priority = getEl('new-mutual-aid-priority')?.value || 'HIGH';

    if (!agency) { showToast('Requesting agency is required'); return; }
    if (!resource) { showToast('Resource requested is required'); return; }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';

    state.mutualAidData.unshift({
      id: `MA-${String(state.mutualAidData.length + 1).padStart(2, '0')}`,
      agency,
      resource,
      qty,
      priority,
      status: 'PENDING',
      requestedAt: timeStr,
      approvedBy: null
    });

    sound.playClick();
    renderMutualAid();
    renderAarMutualAidSummary();
    closeMutualAidModal();
    getEl('new-mutual-aid-agency').value = '';
    getEl('new-mutual-aid-resource').value = '';
    getEl('new-mutual-aid-qty').value = '';
    showToast(`Mutual aid request logged: ${agency}`);
    logActivity('MUTUAL AID', `New request logged: ${resource} ×${qty} from ${agency} (${priority})`);
  });
}

// =========================================================================
// VOLUNTEER POOL (Registered vs. Awaiting Assignment)
// =========================================================================
function renderVolunteerPool() {
  const container = getEl('volunteer-pool-list');
  if (!container) return;
  container.innerHTML = '';

  // TODO: SERVER-SIDE ENFORCEMENT REQUIRED — Scoping should be enforced in API query responses
  const scopedVolunteers = filterDataByJurisdiction(state.volunteerPoolData, 'jurisdiction', 'region');

  const registered = scopedVolunteers.filter(v => v.status === 'REGISTERED').length;
  const awaiting = scopedVolunteers.filter(v => v.status === 'AWAITING_ASSIGNMENT').length;
  const assigned = scopedVolunteers.filter(v => v.status === 'ASSIGNED').length;

  const regEl = getEl('vol-count-registered');
  const awaitEl = getEl('vol-count-awaiting');
  const assignEl = getEl('vol-count-assigned');
  if (regEl) regEl.innerText = registered;
  if (awaitEl) awaitEl.innerText = awaiting;
  if (assignEl) assignEl.innerText = assigned;

  const filtered = scopedVolunteers.filter(v =>
    state.activeVolunteerFilter === 'ALL' || v.status === state.activeVolunteerFilter
  );

  const session = getAuthSession();
  const isT1 = session && session.tier === 'T1';
  const canManageVol = session && ['T2', 'T3'].includes(session.tier);

  filtered.forEach(v => {
    let statusClass = 'badge-navy';
    if (v.status === 'ASSIGNED') statusClass = 'badge-emerald';
    if (v.status === 'AWAITING_ASSIGNMENT') statusClass = 'badge-gold';

    let actionBtnsHtml = '';
    if (canManageVol) {
      actionBtnsHtml = `
        <div style="display:flex; gap:0.4rem;">
          ${v.status !== 'ASSIGNED' ? `<button class="btn btn-xs btn-outline assign-volunteer-btn mt-1" data-id="${v.id}">ASSIGN TO SQUAD</button>` : ''}
          <button class="btn btn-xs btn-outline remove-volunteer-btn mt-1" data-id="${v.id}" title="Remove volunteer">REMOVE</button>
        </div>
      `;
    } else if (isT1) {
      actionBtnsHtml = `<div class="mt-1"><span class="badge badge-navy text-xs" style="font-size:0.65rem;">OVERSIGHT READ-ONLY</span></div>`;
    }

    const item = document.createElement('div');
    item.className = 'aid-chip';
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${v.name}</strong>
        <span class="badge ${statusClass} text-xs">${v.status.replace('_', ' ')}</span>
      </div>
      <div style="color:var(--text-muted); font-size:0.65rem;">${v.location} | Skill: ${v.skill}${v.squad ? ` | Squad: ${v.squad}` : ''}</div>
      ${actionBtnsHtml}
    `;
    container.appendChild(item);
  });

  document.querySelectorAll('.assign-volunteer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const volId = e.currentTarget.dataset.id;
      openAssignSquadModal(volId);
    });
  });

  document.querySelectorAll('.remove-volunteer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const volId = e.currentTarget.dataset.id;
      const vol = state.volunteerPoolData.find(v => v.id === volId);
      if (!vol) return;

      const isFormSynced = volId.startsWith('AM-VOL-GF-');
      const confirmMsg = isFormSynced
        ? `Remove ${vol.name} from this browser's view?\n\nTheir row is still in the Google Sheet, so on another device or browser they'll still show up. To remove them everywhere, delete their row in the response Sheet — that's the permanent fix.`
        : `Remove ${vol.name} from the volunteer pool? This can't be undone from here.`;
      if (!confirm(confirmMsg)) return;

      removeVolunteer(state, volId);
      renderVolunteerPool();

      if (isFormSynced) {
        showToast(`${vol.name} hidden here — delete their Sheet row to remove them everywhere`, 'alert');
      } else {
        showToast(`${vol.name} removed from the pool`);
      }
      logActivity('VOLUNTEER', `Removed from pool: ${vol.name}`);
    });
  });
}

// =========================================================================
// ASSIGN VOLUNTEER TO SQUAD MODAL
// =========================================================================
function openAssignSquadModal(volId) {
  const vol = state.volunteerPoolData.find(v => v.id === volId);
  if (!vol) return;

  const modal = getEl('modal-assign-squad');
  const nameField = getEl('assign-squad-volunteer-name');
  const squadSelect = getEl('assign-squad-select');
  if (!modal || !nameField || !squadSelect) return;

  nameField.value = vol.name;

  // Populate with the real, currently-existing squads — no free text entry.
  squadSelect.innerHTML = state.volunteerSquads
    .map(sq => `<option value="${sq.name}">${sq.name} (${sq.members} vol. — ${sq.skills})</option>`)
    .join('');

  // Pre-select the volunteer's current squad if they already have one.
  if (vol.squad) squadSelect.value = vol.squad;

  modal.dataset.volId = volId;
  modal.classList.remove('hidden');
}

function initAssignSquadModal() {
  const modal = getEl('modal-assign-squad');
  const closeBtn = getEl('close-assign-squad-modal');
  const cancelBtn = getEl('cancel-assign-squad-btn');
  const confirmBtn = getEl('confirm-assign-squad-btn');
  if (!modal) return;

  const close = () => modal.classList.add('hidden');
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (cancelBtn) cancelBtn.addEventListener('click', close);

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      sound.playClick();
      const volId = modal.dataset.volId;
      const squadSelect = getEl('assign-squad-select');
      const vol = state.volunteerPoolData.find(v => v.id === volId);
      if (vol && squadSelect && squadSelect.value) {
        vol.status = 'ASSIGNED';
        vol.squad = squadSelect.value;
        renderVolunteerPool();
        showToast(`${vol.name} assigned to ${squadSelect.value}`);
        logActivity('VOLUNTEER', `${vol.name} assigned to ${squadSelect.value}`);
      }
      close();
    });
  }
}

function initVolunteerRegistrationModal() {
  const modal = getEl('modal-volunteer-register');
  const closeBtn = getEl('close-vol-reg-modal');
  const cancelBtn = getEl('cancel-vol-reg-btn');
  const submitBtn = getEl('submit-vol-reg-btn');
  const openGFormBtn = getEl('btn-open-external-gform');

  const openModal = () => {
    sound.playClick();
    if (modal) modal.classList.remove('hidden');
  };

  const closeModal = () => {
    if (modal) modal.classList.add('hidden');
  };

  // In-app "enroll directly" modal — only reachable from the T2/T3-gated
  // Volunteer Pool panel (btn-open-vol-register-modal), never pre-login and
  // never from the T5 dashboard. A logged-in T5 volunteer is already
  // registered; a not-yet-registered person has no session to enroll from.
  getEl('btn-open-vol-register-modal')?.addEventListener('click', openModal);

  // Pre-login "I'm new here" entry point sends people to the public Google
  // Form, not this in-app modal — there's no session yet to attach an
  // internal enrollment to. Only the prominent banner CTA triggers this now
  // (the small link that used to sit in the tier list has been removed).
  getEl('btn-login-reg-vol')?.addEventListener('click', () => {
    sound.playClick();
    openRegistrationForm();
  });

  // Close handlers
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // Google Form external trigger (inside the modal, as an alternative)
  if (openGFormBtn) {
    openGFormBtn.addEventListener('click', () => {
      sound.playClick();
      openRegistrationForm();
    });
  }

  // Form submission handler
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      sound.playClick();

      // Fail closed: only T2/T3 may enroll a volunteer directly in-app,
      // mirroring ACTIONS.add_volunteer in server/src/config/nav.js.
      if (!isActionAuthorized('add_volunteer', state.mode)) {
        showToast('You are not authorized to enroll volunteers directly.', 'alert');
        closeModal();
        return;
      }

      const name = getEl('new-vol-name')?.value?.trim();
      const phone = getEl('new-vol-phone')?.value?.trim();
      const skill = getEl('new-vol-skill')?.value;
      const loc = getEl('new-vol-loc')?.value?.trim();
      const region = getEl('new-vol-region')?.value || 'Odisha';

      if (!name) {
        showToast('Please enter the volunteer\'s full name', 'alert');
        return;
      }
      if (!phone) {
        showToast('Please enter a contact phone number', 'alert');
        return;
      }
      if (!loc) {
        showToast('Please enter the assigned location / district', 'alert');
        return;
      }

      const newVol = {
        id: `AM-VOL-${Date.now().toString().slice(-6)}`,
        name,
        phone,
        skill: skill || 'General Support',
        location: loc,
        region,
        site: `${loc}`,
        status: 'REGISTERED',
        squad: null
      };

      state.volunteerPoolData.unshift(newVol);
      renderVolunteerPool();
      showToast(`Volunteer registered: ${newVol.name} (${newVol.skill})`);
      logActivity('VOLUNTEER', `New volunteer enrolled: ${newVol.name} [${newVol.skill}]`);

      // Reset fields
      if (getEl('new-vol-name')) getEl('new-vol-name').value = '';
      if (getEl('new-vol-phone')) getEl('new-vol-phone').value = '';
      if (getEl('new-vol-loc')) getEl('new-vol-loc').value = '';

      closeModal();
    });
  }
}

document.querySelectorAll('.volunteer-pool-filter-bar .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    sound.playClick();
    document.querySelectorAll('.volunteer-pool-filter-bar .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeVolunteerFilter = chip.dataset.volFilter;
    renderVolunteerPool();
  });
});

const addVolunteerBtn = getEl('add-volunteer-btn');
if (addVolunteerBtn) {
  addVolunteerBtn.addEventListener('click', () => {
    sound.playClick();
    openRegistrationForm();
  });
}

// Auto-sync volunteer registrations from the Google Form's response Sheet.
startAutoSync(state, (addedCount) => {
  if (addedCount > 0) {
    renderVolunteerPool();
    showToast(`${addedCount} new volunteer${addedCount > 1 ? 's' : ''} synced from registration form`);
    logActivity('VOLUNTEER', `${addedCount} new volunteer${addedCount > 1 ? 's' : ''} synced from Google Form registration`);
  }
});

// =========================================================================
// TACTICAL RADIO CONSOLE & PTT
// =========================================================================
function initRadioConsole() {
  const chanSelect = getEl('radio-channel-select');
  const activeSpeakerEl = getEl('radio-active-speaker');
  const pttBtn = getEl('ptt-broadcast-btn');
  const signalBadge = getEl('radio-signal-badge');

  if (chanSelect) {
    chanSelect.addEventListener('change', (e) => {
      sound.playClick();
      const chan = radioChannels.find(c => c.id === e.target.value);
      if (chan) {
        if (activeSpeakerEl) activeSpeakerEl.innerText = chan.activeSpeaker;
        if (signalBadge) signalBadge.innerText = `SIGNAL: ${chan.signal} (${chan.freq})`;
        showToast(`Radio tuned to: ${chan.name}`);
      }
    });
  }

  if (pttBtn) {
    pttBtn.addEventListener('mousedown', () => {
      sound.playRadioPtt();
      pttBtn.classList.add('btn-saffron');
      pttBtn.innerText = 'TRANSMITTING (LIVE ON AIR)...';
    });

    const releasePtt = () => {
      pttBtn.classList.remove('btn-saffron');
      pttBtn.innerText = 'PUSH TO TALK (PTT)';
    };

    pttBtn.addEventListener('mouseup', releasePtt);
    pttBtn.addEventListener('mouseleave', releasePtt);
  }
}

// Volunteer Squads
function renderVolunteerSquads() {
  const container = getEl('volunteer-squads-container');
  if (!container) return;
  container.innerHTML = '';

  state.volunteerSquads.forEach(v => {
    const chip = document.createElement('div');
    chip.className = 'aid-chip';
    chip.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${v.name}</strong> (${v.members} Vol.)
        <span class="badge badge-emerald text-xs">READY</span>
      </div>
      <div style="color:var(--text-muted); font-size:0.65rem;">Skills: ${v.skills} | Lead: ${v.lead}</div>
    `;
    container.appendChild(chip);
  });
}

// =========================================================================
// ICS ROSTER & TASKS
// =========================================================================
function renderIcsRoster() {
  const container = getEl('ics-roster-container');
  if (!container) return;
  container.innerHTML = '';

  const t = state.icsTree;
  let vacancyCount = 0;

  const icCard = document.createElement('div');
  icCard.className = 'tree-card ic-card';
  icCard.innerHTML = `
    <div class="tree-role">INCIDENT COMMANDER (IC)</div>
    <div class="tree-name">${t.incidentCommander.name}</div>
    <div class="tree-agency">${t.incidentCommander.agency} | Phone: ${t.incidentCommander.phone}</div>
  `;
  container.appendChild(icCard);

  const staffRow = document.createElement('div');
  staffRow.className = 'command-staff-row';
  staffRow.innerHTML = `
    <div class="tree-card">
      <div class="tree-role">SAFETY OFFICER</div>
      <div class="tree-name-sm">${t.safetyOfficer.name}</div>
      <div class="tree-agency-sm">${t.safetyOfficer.agency}</div>
    </div>
    <div class="tree-card">
      <div class="tree-role">PUBLIC INFO (PIO)</div>
      <div class="tree-name-sm">${t.pio.name}</div>
      <div class="tree-agency-sm">${t.pio.agency}</div>
    </div>
    <div class="tree-card">
      <div class="tree-role">LIAISON OFFICER</div>
      <div class="tree-name-sm">${t.liaisonOfficer.name}</div>
      <div class="tree-agency-sm">${t.liaisonOfficer.agency}</div>
    </div>
  `;
  container.appendChild(staffRow);

  const secGrid = document.createElement('div');
  secGrid.className = 'general-sections-grid';

  t.sections.forEach(sec => {
    const secBox = document.createElement('div');
    secBox.className = 'gen-section-box';

    let branchesHtml = '';
    sec.branches.forEach(b => {
      if (!b.assigned) {
        vacancyCount++;
        branchesHtml += `<div class="vacant-line assign-branch-btn" data-sec="${sec.name}" data-branch="${b.name}">[VACANT] ${b.name}: ${b.lead} (CLICK TO ASSIGN)</div>`;
      } else {
        branchesHtml += `<div>• <strong>${b.name}:</strong> ${b.lead}</div>`;
      }
    });

    secBox.innerHTML = `
      <div class="gen-sec-head bg-navy text-white">
        <span>${sec.name}</span>
        <span class="mono text-xs">${sec.tasksCompleted}/${sec.tasksCount} DONE</span>
      </div>
      <div class="gen-sec-body">
        <div class="font-bold text-xs">${sec.chief} (${sec.agency})</div>
        <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
          ${branchesHtml}
        </div>
      </div>
    `;
    secGrid.appendChild(secBox);
  });

  container.appendChild(secGrid);

  const badge = getEl('vacancy-count-badge');
  if (badge) {
    if (vacancyCount > 0) {
      badge.className = 'badge badge-alert';
      badge.innerText = `${vacancyCount} UNASSIGNED ROLES`;
    } else {
      badge.className = 'badge badge-emerald';
      badge.innerText = `ALL ROLES APPOINTED`;
    }
  }

  document.querySelectorAll('.assign-branch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const secName = e.target.dataset.sec;
      const branchName = e.target.dataset.branch;
      openAssignOfficerModal(secName, branchName);
    });
  });
}

function openAssignOfficerModal(secName, branchName) {
  state.selectedRoleForAssign = { secName, branchName };
  const modal = getEl('modal-assign-officer');
  const roleTitleInput = getEl('assign-role-title');
  if (roleTitleInput) roleTitleInput.value = `${secName} → ${branchName}`;
  if (modal) modal.classList.remove('hidden');
}

function renderIcsTasks() {
  renderKanban();
}

// =========================================================================
// T3 KANBAN TASK BOARD & ASSIGNMENT CONTROLLER
// =========================================================================
export function renderKanban() {
  const colOpen = getEl('kanban-open');
  const colProgress = getEl('kanban-in_progress');
  const colCompleted = getEl('kanban-completed');
  if (!colOpen || !colProgress || !colCompleted) return;

  colOpen.innerHTML = '';
  colProgress.innerHTML = '';
  colCompleted.innerHTML = '';

  const scopedTasks = filterDataByJurisdiction(state.tasksData, 'site', 'region');
  const completedCount = scopedTasks.filter(t => t.completed || t.status === 'completed').length;
  const totalCount = scopedTasks.length || 1;
  const pct = Math.round((completedCount / totalCount) * 100);

  const progressTxt = getEl('task-progress-txt');
  const progressBar = getEl('task-progress-bar');
  if (progressTxt) progressTxt.innerText = `SECTION TASKS COMPLETION (${completedCount}/${scopedTasks.length} COMPLETED - ${pct}%)`;
  if (progressBar) progressBar.style.width = `${pct}%`;

  scopedTasks.forEach(task => {
    const isDone = task.completed || task.status === 'completed';
    const isProgress = !isDone && (task.status === 'in_progress' || (task.progress && task.progress > 0));
    const targetCol = isDone ? colCompleted : (isProgress ? colProgress : colOpen);

    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.setAttribute('draggable', 'true');
    card.dataset.taskId = task.id;

    const currentStatus = isDone ? 'completed' : (isProgress ? 'in_progress' : 'open');
    const badgeClass = task.section === 'Operations' ? 'badge-alert' :
      task.section === 'Logistics' ? 'badge-navy' :
        task.section === 'Planning' ? 'badge-gold' : 'badge-emerald';

    const session = getAuthSession();
    const isT1 = session && session.tier === 'T1';
    const canAssign = session && ['T2', 'T3'].includes(session.tier);

    let actionsHtml = '';
    if (canAssign) {
      actionsHtml = `
        <div class="kanban-card-actions">
          <div>
            ${currentStatus !== 'open' ? `<button class="kanban-move-btn" data-action="to-open" data-task-id="${task.id}" title="Move to Open">< Open</button>` : ''}
            ${currentStatus !== 'in_progress' ? `<button class="kanban-move-btn" data-action="to-progress" data-task-id="${task.id}" title="Move to In Progress">ACTIVE Active</button>` : ''}
            ${currentStatus !== 'completed' ? `<button class="kanban-move-btn" data-action="to-complete" data-task-id="${task.id}" title="Mark Complete">DONE Done ></button>` : ''}
          </div>
          <button class="kanban-move-btn btn-assign-task" data-task-id="${task.id}" data-task-title="${(task.task || task.title).replace(/"/g, '&quot;')}" style="color: #0284c7;">Assign OFFICER</button>
        </div>
      `;
    } else if (isT1) {
      actionsHtml = `
        <div class="kanban-card-actions" style="justify-content: flex-end;">
          <span class="mono text-xs text-muted" style="font-size: 0.65rem;">National Rollup (Read-Only)</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="kanban-card-id">${task.id}</span>
        <span class="badge ${badgeClass}" style="font-size: 0.65rem;">${task.section || 'General'}</span>
      </div>
      <div class="kanban-card-title">${task.task || task.title}</div>
      <div class="kanban-card-meta">
        <span>👤 ${task.assignee || task.assigned_to || 'Unassigned'}</span>
        ${task.due ? `<span>⏰ ${task.due}</span>` : ''}
      </div>
      ${actionsHtml}
    `;

    targetCol.appendChild(card);
  });

  // Attach move button handlers
  document.querySelectorAll('.kanban-move-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const taskId = e.currentTarget.dataset.taskId;
      const action = e.currentTarget.dataset.action;
      const task = state.tasksData.find(t => t.id === taskId);
      if (!task) return;

      sound.playClick();
      if (action === 'to-open') {
        task.status = 'open';
        task.completed = false;
        task.progress = 0;
      } else if (action === 'to-progress') {
        task.status = 'in_progress';
        task.completed = false;
        task.progress = 50;
      } else if (action === 'to-complete') {
        task.status = 'completed';
        task.completed = true;
        task.progress = 100;
      }

      try {
        await apiFetch('PATCH', `/tasks/${taskId}`, { status: task.status, progress: task.progress });
      } catch { /* demo fallback */ }

      renderKanban();
      initFieldHub();
      initVolunteerStation();
      showToast(`Task ${taskId} status updated to: ${task.status.toUpperCase()}`);
    });
  });

  // Attach assign button handlers
  document.querySelectorAll('.btn-assign-task').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = e.currentTarget.dataset.taskId;
      const taskTitle = e.currentTarget.dataset.taskTitle;
      openAssignTaskModal(taskId, taskTitle);
    });
  });
}

function openAssignTaskModal(taskId, taskTitle) {
  const modal = getEl('modal-assign-task');
  const idInput = getEl('assign-task-id');
  const titleDisplay = getEl('assign-task-title-display');
  const select = getEl('assign-task-recipient-select');
  if (!modal || !select) return;

  if (idInput) idInput.value = taskId;
  if (titleDisplay) titleDisplay.innerText = `${taskId}: ${taskTitle}`;

  // Populate recipient list from volunteer squads + pool
  select.innerHTML = `
    <optgroup label="Frontline Strike Teams (T4)">
      <option value="NDRF 03 Bn Team Bravo">NDRF 03 Bn Team Bravo (Water Rescue)</option>
      <option value="SDRF Route 16 Lead">SDRF Route 16 Lead (Chainsaw / Debris)</option>
      <option value="Coast Guard Drone Alpha">Coast Guard Drone Alpha (Recon)</option>
    </optgroup>
    <optgroup label="Aapda Mitra Volunteer Squads (T5)">
      ${state.volunteerSquads.map(sq => `<option value="${sq.name}">${sq.name} (${sq.deployedAt || sq.site})</option>`).join('')}
    </optgroup>
    <optgroup label="Registered Volunteers (T5)">
      ${state.volunteerPoolData.map(v => `<option value="${v.name} (${v.skill})">${v.name} — ${v.skill} (${v.location || v.site})</option>`).join('')}
    </optgroup>
  `;

  sound.playClick();
  modal.classList.remove('hidden');
}

// Modals for Shelter, Danger Zone, Asset, Task, Assign, Resource Request, Mutual Aid, Rumor
export function initTaskAndResourceModals() {
  // 1. REGISTER SHELTER MODAL
  const openShelterBtn1 = getEl('add-shelter-gis-btn');
  const openShelterBtn2 = getEl('add-shelter-btn');
  const modalShelter = getEl('modal-shelter');
  const closeShelterBtn = getEl('close-shelter-modal');
  const cancelShelterBtn = getEl('cancel-shelter-btn');
  const saveShelterBtn = getEl('save-shelter-btn');

  const openShelterModal = () => {
    sound.playClick();
    if (modalShelter) modalShelter.classList.remove('hidden');
  };
  const closeShelterModal = () => {
    if (modalShelter) modalShelter.classList.add('hidden');
  };

  if (openShelterBtn1) openShelterBtn1.addEventListener('click', openShelterModal);
  if (openShelterBtn2) openShelterBtn2.addEventListener('click', openShelterModal);
  if (closeShelterBtn) closeShelterBtn.addEventListener('click', closeShelterModal);
  if (cancelShelterBtn) cancelShelterBtn.addEventListener('click', closeShelterModal);

  if (saveShelterBtn) {
    saveShelterBtn.addEventListener('click', async () => {
      sound.playClick();
      const name = getEl('new-shelter-name')?.value?.trim();
      const capacity = parseInt(getEl('new-shelter-capacity')?.value || '100', 10);
      const region = getEl('new-shelter-region')?.value || 'Odisha';
      const lat = parseFloat(getEl('new-shelter-lat')?.value || '20.7885');
      const lng = parseFloat(getEl('new-shelter-lng')?.value || '86.9580');
      const medical = getEl('new-shelter-medical')?.value?.trim() || 'Doctor On-Duty';
      const food_rations = getEl('new-shelter-food')?.value?.trim() || '72h Stored';

      if (!name) {
        showToast('Please enter shelter name', 'alert');
        return;
      }

      const payload = {
        name,
        capacity,
        occupied: 0,
        status: 'OPEN / OPERATIONAL',
        region,
        site: 'Bhadrak / Dhamra',
        lat,
        lng,
        medical,
        food_rations
      };

      try {
        const res = await apiFetch('POST', '/shelters', payload);
        const newShelter = (res.ok && res.body) ? res.body : { id: `SHL-${Date.now().toString().slice(-4)}`, ...payload };
        state.sheltersData.unshift(newShelter);
        renderShelters();
        renderShelterMatrix();
        if (state.mapInitialized) renderMapMarkers();
        showToast(`Shelter registered: ${name}`);
        logActivity('SHELTER', `Registered multi-purpose shelter: ${name} (Cap: ${capacity})`);
      } catch (err) {
        showToast('Error registering shelter', 'alert');
      }

      closeShelterModal();
    });
  }

  // 2. DECLARE DANGER ZONE MODAL
  const openDangerBtn1 = getEl('draw-danger-zone-btn');
  const openDangerBtn2 = getEl('add-danger-btn');
  const modalDanger = getEl('modal-danger-zone');
  const closeDangerBtn = getEl('close-danger-modal');
  const cancelDangerBtn = getEl('cancel-danger-modal-btn');
  const saveDangerBtn = getEl('save-danger-zone-btn');

  const openDangerModal = () => {
    sound.playClick();
    if (modalDanger) modalDanger.classList.remove('hidden');
  };
  const closeDangerModal = () => {
    if (modalDanger) modalDanger.classList.add('hidden');
  };

  if (openDangerBtn1) openDangerBtn1.addEventListener('click', openDangerModal);
  if (openDangerBtn2) openDangerBtn2.addEventListener('click', openDangerModal);
  if (closeDangerBtn) closeDangerBtn.addEventListener('click', closeDangerModal);
  if (cancelDangerBtn) cancelDangerBtn.addEventListener('click', closeDangerModal);

  if (saveDangerBtn) {
    saveDangerBtn.addEventListener('click', async () => {
      sound.playCriticalAlert();
      const title = getEl('new-danger-title')?.value?.trim() || 'IMPACT RED ZONE';
      const severity = getEl('new-danger-severity')?.value || 'CRITICAL';
      const radius_km = parseFloat(getEl('new-danger-radius')?.value || '5.0');
      const lat = parseFloat(getEl('new-danger-lat')?.value || '20.78');
      const lng = parseFloat(getEl('new-danger-lng')?.value || '86.95');
      const directive = getEl('new-danger-directive')?.value?.trim() || 'Mandatory Evacuation Enforced';

      const payload = {
        title,
        severity,
        directive,
        lat,
        lng,
        radius_km,
        region: 'Odisha',
        site: 'Bhadrak / Dhamra'
      };

      try {
        const res = await apiFetch('POST', '/danger-zones', payload);
        const newZone = (res.ok && res.body) ? res.body : { id: `DZ-${Date.now().toString().slice(-4)}`, ...payload };
        if (!state.dangerZones) state.dangerZones = [];
        state.dangerZones.unshift(newZone);
        if (state.mapInitialized) renderMapMarkers();
        showToast(`🚨 Danger Zone Declared: ${title}`, 'alert');
        logActivity('DANGER_ZONE', `Declared impact zone: ${title} (Radius: ${radius_km}km)`);
      } catch (err) {
        showToast('Error declaring danger zone', 'alert');
      }

      closeDangerModal();
    });
  }

  // 3. DEPLOY ASSET MODAL
  const openAssetBtn = getEl('add-asset-btn');
  const modalAsset = getEl('modal-asset');
  const closeAssetBtn = getEl('close-asset-modal');
  const cancelAssetBtn = getEl('cancel-asset-btn');
  const saveAssetBtn = getEl('save-asset-btn');

  const openAssetModal = () => {
    sound.playClick();
    if (modalAsset) modalAsset.classList.remove('hidden');
  };
  const closeAssetModal = () => {
    if (modalAsset) modalAsset.classList.add('hidden');
  };

  if (openAssetBtn) openAssetBtn.addEventListener('click', openAssetModal);
  if (closeAssetBtn) closeAssetBtn.addEventListener('click', closeAssetModal);
  if (cancelAssetBtn) cancelAssetBtn.addEventListener('click', closeAssetModal);

  if (saveAssetBtn) {
    saveAssetBtn.addEventListener('click', async () => {
      sound.playClick();
      const name = getEl('new-asset-name')?.value?.trim();
      const type = getEl('new-asset-type')?.value || 'Water Rescue';
      const unit = getEl('new-asset-unit')?.value?.trim() || 'NDRF 03 Bn';
      const loc = getEl('new-asset-loc')?.value?.trim() || 'Staging Base';

      if (!name) {
        showToast('Please enter asset name', 'alert');
        return;
      }

      const payload = {
        name,
        type,
        unit,
        status: 'AVAILABLE',
        loc,
        crew: 4,
        region: 'Odisha',
        site: 'Bhadrak / Dhamra',
        lat: 20.79,
        lng: 86.96
      };

      try {
        const res = await apiFetch('POST', '/resources', payload);
        const newAsset = (res.ok && res.body) ? res.body : { id: `ASSET-${Date.now().toString().slice(-4)}`, ...payload };
        state.assets.unshift(newAsset);
        renderAssets();
        if (state.mapInitialized) renderMapMarkers();
        showToast(`Fleet asset deployed: ${name}`);
        logActivity('FLEET', `Deployed fleet asset: ${name} [${unit}]`);
      } catch (err) {
        showToast('Error deploying asset', 'alert');
      }

      closeAssetModal();
    });
  }

  // 4. CREATE TASK MODAL
  const createBtn = getEl('create-task-btn');
  const openTaskBtn2 = getEl('add-task-btn');
  const createModal = getEl('modal-create-task');
  const closeCreateBtn = getEl('close-create-task-modal');
  const cancelCreateBtn = getEl('cancel-create-task-btn');
  const saveCreateBtn = getEl('save-create-task-btn');

  const closeCreate = () => createModal && createModal.classList.add('hidden');
  if (createBtn && createModal) {
    createBtn.addEventListener('click', () => {
      sound.playClick();
      createModal.classList.remove('hidden');
    });
  }
  if (openTaskBtn2 && createModal) {
    openTaskBtn2.addEventListener('click', () => {
      sound.playClick();
      createModal.classList.remove('hidden');
    });
  }
  if (closeCreateBtn) closeCreateBtn.addEventListener('click', closeCreate);
  if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', closeCreate);

  if (saveCreateBtn) {
    saveCreateBtn.addEventListener('click', async () => {
      const title = getEl('new-task-title')?.value.trim();
      const section = getEl('new-task-section')?.value || 'Operations';
      const status = getEl('new-task-status')?.value || 'open';
      const assignee = getEl('new-task-assignee')?.value || 'Unassigned';

      if (!title) {
        showToast('Task title is required', 'alert');
        return;
      }

      const session = getAuthSession();
      const newTask = {
        id: `TSK-${String(state.tasksData.length + 1).padStart(2, '0')}`,
        section,
        task: title,
        title,
        assignee,
        assigned_to: assignee,
        due: 'Next Period',
        completed: status === 'completed',
        status,
        progress: status === 'completed' ? 100 : (status === 'in_progress' ? 50 : 0),
        region: session ? session.region : 'Odisha',
        site: session ? session.site : 'Bhadrak / Dhamra'
      };

      try {
        const res = await apiFetch('POST', '/tasks', { title, section, status, assigned_to: assignee });
        if (res.ok && res.body) {
          state.tasksData.unshift(res.body);
        } else {
          state.tasksData.unshift(newTask);
        }
      } catch {
        state.tasksData.unshift(newTask);
      }

      sound.playSuccess();
      renderIcsTasks();
      renderKanban();
      closeCreate();
      if (getEl('new-task-title')) getEl('new-task-title').value = '';
      showToast(`Task created & added to board: ${title}`);
      logActivity('TASK', `New Task created: ${title} → Assigned to ${assignee}`);
    });
  }

  // 5. ASSIGN TASK MODAL
  const assignModal = getEl('modal-assign-task');
  const closeAssignBtn = getEl('close-assign-task-modal');
  const cancelAssignBtn = getEl('cancel-assign-task-btn');
  const saveAssignBtn = getEl('save-assign-task-btn');

  const closeAssign = () => assignModal && assignModal.classList.add('hidden');
  if (closeAssignBtn) closeAssignBtn.addEventListener('click', closeAssign);
  if (cancelAssignBtn) cancelAssignBtn.addEventListener('click', closeAssign);

  if (saveAssignBtn) {
    saveAssignBtn.addEventListener('click', async () => {
      const taskId = getEl('assign-task-id')?.value;
      const recipient = getEl('assign-task-recipient-select')?.value;
      const task = state.tasksData.find(t => t.id === taskId);
      if (!task) return;

      task.assignee = recipient;
      task.assigned_to = recipient;

      try {
        await apiFetch('PATCH', `/tasks/${taskId}`, { assigned_to: recipient });
      } catch { /* demo fallback */ }

      sound.playSuccess();
      renderKanban();
      initFieldHub();
      initVolunteerStation();
      closeAssign();
      showToast(`Task ${taskId} assigned to ${recipient}`);
      logActivity('ASSIGNMENT', `Task ${taskId} assigned to ${recipient}`);
    });
  }

  // 6. RESOURCE REQUEST MODAL (T3 COORDINATOR)
  const reqAssetBtn = getEl('request-asset-btn');
  const reqAssetModal = getEl('modal-request-asset');
  const closeReqAssetBtn = getEl('close-request-asset-modal');
  const cancelReqAssetBtn = getEl('cancel-request-asset-btn');
  const saveReqAssetBtn = getEl('save-request-asset-btn');

  const closeReqAsset = () => reqAssetModal && reqAssetModal.classList.add('hidden');
  if (reqAssetBtn && reqAssetModal) {
    reqAssetBtn.addEventListener('click', () => {
      sound.playClick();
      reqAssetModal.classList.remove('hidden');
    });
  }
  if (closeReqAssetBtn) closeReqAssetBtn.addEventListener('click', closeReqAsset);
  if (cancelReqAssetBtn) cancelReqAssetBtn.addEventListener('click', closeReqAsset);

  if (saveReqAssetBtn) {
    saveReqAssetBtn.addEventListener('click', async () => {
      const type = getEl('req-asset-type')?.value;
      const qty = parseInt(getEl('req-asset-qty')?.value, 10) || 1;
      const priority = getEl('req-asset-priority')?.value || 'HIGH';
      const reason = getEl('req-asset-reason')?.value.trim() || `Urgent equipment request for ${qty}x ${type}`;

      try {
        const res = await apiFetch('POST', '/resource-requests', {
          type,
          label: `${qty}x ${type}`,
          reason: `[${priority}] ${reason}`
        });

        if (res.ok) {
          showToast(`Resource Request Dispatched to State EOC (T2) — ID: ${res.body.data ? res.body.data.id : 'ESC-NEW'}`);
        } else {
          showToast(`Resource Request Logged & Routed to State EOC`);
        }
      } catch {
        showToast(`Resource Request Logged & Routed to State EOC`);
      }

      sound.playSuccess();
      closeReqAsset();
      if (getEl('req-asset-reason')) getEl('req-asset-reason').value = '';
      logActivity('RESOURCE REQUEST', `Coordinator requested ${qty}x ${type} (${priority}): ${reason}`);
      renderEscalationInbox();
    });
  }

  // 7. MUTUAL AID MODAL
  const openMutualBtn = getEl('add-mutual-aid-btn');
  const modalMutual = getEl('modal-mutual-aid');
  const closeMutualBtn = getEl('close-mutual-aid-modal');
  const cancelMutualBtn = getEl('cancel-mutual-aid-btn');
  const saveMutualBtn = getEl('save-mutual-aid-btn');

  const openMutualModal = () => {
    sound.playClick();
    if (modalMutual) modalMutual.classList.remove('hidden');
  };
  const closeMutualModal = () => {
    if (modalMutual) modalMutual.classList.add('hidden');
  };

  if (openMutualBtn) openMutualBtn.addEventListener('click', openMutualModal);
  if (closeMutualBtn) closeMutualBtn.addEventListener('click', closeMutualModal);
  if (cancelMutualBtn) cancelMutualBtn.addEventListener('click', closeMutualModal);

  if (saveMutualBtn) {
    saveMutualBtn.addEventListener('click', async () => {
      sound.playClick();
      const agency = getEl('new-mutual-aid-agency')?.value?.trim();
      const resource = getEl('new-mutual-aid-resource')?.value?.trim();
      const qty = parseInt(getEl('new-mutual-aid-qty')?.value || '1', 10);
      const priority = getEl('new-mutual-aid-priority')?.value || 'HIGH';

      if (!agency || !resource) {
        showToast('Please fill in agency and resource details', 'alert');
        return;
      }

      const payload = {
        agency,
        resource,
        qty,
        priority,
        status: 'PENDING',
        requested_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST'
      };

      try {
        const res = await apiFetch('POST', '/mutual-aid', payload);
        const newReq = (res.ok && res.body) ? res.body : { id: `MA-${Date.now().toString().slice(-4)}`, ...payload };
        state.mutualAidData.unshift(newReq);
        renderMutualAid();
        renderAarMutualAidSummary();
        showToast(`Mutual Aid Request Logged: ${agency}`);
        logActivity('MUTUAL_AID', `Mutual aid request: ${resource} x${qty} for ${agency}`);
      } catch (err) {
        showToast('Error logging mutual aid request', 'alert');
      }

      closeMutualModal();
    });
  }
}

// =========================================================================
// T5 VOLUNTEER STATION WORKFLOW
// =========================================================================
let isVolunteerCheckedIn = false;

export function initVolunteerStation() {
  const session = getAuthSession();
  if (!session || session.tierLevel !== 5) return;

  const siteInfo = getEl('vol-site-info');
  const radioInfo = getEl('vol-radio-info');
  const taskCard = getEl('vol-task-card');
  const taskBadge = getEl('vol-task-status-badge');
  const checkinBtn = getEl('vol-checkin-btn');
  const checkinBadge = getEl('vol-checkin-status-badge');

  if (siteInfo) siteInfo.innerText = `${session.jurisdictionLabel || session.site || 'Local Sector'} • Sector Response Unit`;
  if (radioInfo) radioInfo.innerHTML = `Assigned Channel: <strong>CH-05 (Aapda Mitra Net - 148.550 MHz)</strong>`;

  // Find assigned task
  const myTask = state.tasksData.find(t => 
    t.assignee?.includes('Aapda Mitra') || 
    t.assignee?.includes(session.name) ||
    t.site === session.site
  ) || state.tasksData[0];

  if (taskCard && myTask) {
    taskCard.innerHTML = `
      <div style="font-weight: 700; font-size: 0.95rem; color: var(--navy-primary); margin-bottom: 4px;">${myTask.task || myTask.title}</div>
      <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 12px;">
        <span>Sector: <strong>${myTask.section}</strong></span>
        <span>Due: <strong>${myTask.due || 'ASAP'}</strong></span>
      </div>
    `;
    if (taskBadge) {
      taskBadge.className = myTask.completed ? 'badge badge-emerald' : 'badge badge-gold';
      taskBadge.innerText = myTask.completed ? 'COMPLETED' : 'ACTIVE DUTY';
    }
  }

  // Check-In / Check-Out Toggle
  if (checkinBtn) {
    checkinBtn.onclick = async () => {
      sound.playClick();
      isVolunteerCheckedIn = !isVolunteerCheckedIn;

      if (isVolunteerCheckedIn) {
        checkinBtn.className = 'btn btn-outline font-bold';
        checkinBtn.innerText = 'CHECK OUT — STAND DOWN';
        if (checkinBadge) {
          checkinBadge.className = 'status-chip online';
          checkinBadge.innerText = '● CHECKED IN / ON AIR';
        }
        showToast(`Volunteer ${session.name} checked in at ${session.site || 'station'}`);
        try {
          await apiFetch('POST', '/incidents', {
            title: `Aapda Mitra Check-In: ${session.name} ON AIR`,
            severity: 'low',
            body: `Volunteer checked in on CH-05 at ${session.site || 'station'}`
          });
        } catch { /* demo fallback */ }
      } else {
        checkinBtn.className = 'btn btn-emerald font-bold';
        checkinBtn.innerText = 'CHECK IN — GO ACTIVE';
        if (checkinBadge) {
          checkinBadge.className = 'status-chip';
          checkinBadge.innerText = '● CHECKED OUT';
        }
        showToast('Checked out of volunteer station');
      }
    };
  }

  // 3 Status Buttons
  document.querySelectorAll('.vol-status-btn').forEach(btn => {
    btn.onclick = async (e) => {
      const vstatus = e.currentTarget.dataset.vstatus;
      sound.playClick();

      if (vstatus === 'ACTIVE') {
        showToast(`Status updated: ACTIVE ON DUTY`);
        try {
          await apiFetch('POST', '/incidents', {
            title: `Volunteer Status Update: ${session.name} is ACTIVE`,
            severity: 'low'
          });
        } catch { /* fallback */ }
      } else if (vstatus === 'STANDBY') {
        showToast(`Status updated: STANDBY AT SHELTER`);
      } else if (vstatus === 'NEED SUPPORT') {
        sound.playCriticalAlert();
        showToast(`URGENT: Field Support Escalated to District Coordinator (T3)`, 'alert');
        try {
          await apiFetch('POST', '/escalations', {
            kind: 'backup_request',
            reason: `Aapda Mitra Volunteer ${session.name} requested immediate ground support at ${session.site || 'assigned sector'}`
          });
          renderEscalationInbox();
        } catch { /* fallback */ }
      }
    };
  });
}

// =========================================================================
// T4 FIELD HUB WORKFLOW & RAPID REPORT-UP
// =========================================================================
export function initFieldHub() {
  const session = getAuthSession();
  if (!session || session.tierLevel !== 4) return;

  const subTitle = getEl('field-hub-subtitle');
  const teamBadge = getEl('field-hub-team-badge');
  const siteInfo = getEl('field-site-info');
  const radioInfo = getEl('field-radio-info');
  const taskCard = getEl('field-task-card');
  const taskBadge = getEl('field-task-status-badge');
  const taskMainTitle = getEl('field-task-main-title');
  const taskDivision = getEl('field-task-division');
  const taskTarget = getEl('field-task-target');

  if (subTitle) subTitle.innerText = `${session.team || 'NDRF Strike Team Alpha'} • Tactical Field Operations`;
  if (teamBadge) teamBadge.innerText = `T4 • 🚤 ${session.team || 'STRIKE TEAM'}`;
  if (siteInfo) siteInfo.innerText = session.site || 'Bhadrak / Dhamra Port';
  if (radioInfo) radioInfo.innerText = 'CH-02 (Tactical Ops Net • 154.280 MHz) / CH-04';

  // Find T4 current assignment
  const activeTask = state.tasksData.find(t => 
    !t.completed && (t.assignee?.includes('NDRF') || t.assignee?.includes('SDRF') || t.site === session.site)
  ) || state.tasksData[0];

  if (activeTask) {
    if (taskMainTitle) taskMainTitle.innerText = activeTask.task || activeTask.title;
    if (taskDivision) taskDivision.innerText = activeTask.section || 'Operations';
    if (taskTarget) taskTarget.innerText = activeTask.due || 'Operational Period 2';
    if (taskBadge) {
      taskBadge.className = activeTask.completed ? 'badge badge-emerald' : 'badge badge-gold';
      taskBadge.innerText = activeTask.completed ? 'COMPLETED' : 'IN PROGRESS';
    }
  }

  // 3 Tactical Big Action Buttons
  const btnComplete = getEl('field-btn-complete');
  const btnBackup = getEl('field-btn-backup');
  const btnHazard = getEl('field-btn-hazard');

  if (btnComplete) {
    btnComplete.onclick = async () => {
      sound.playSuccess();
      if (activeTask) {
        activeTask.completed = true;
        activeTask.status = 'completed';
        activeTask.progress = 100;
        try {
          await apiFetch('PATCH', `/tasks/${activeTask.id}`, { status: 'completed', progress: 100 });
        } catch { /* fallback */ }
      }
      renderKanban();
      initFieldHub();
      showToast('✅ Assignment Marked COMPLETE & Reported Up to Command', 'success');
      logActivity('STRIKE TEAM', `Task marked complete by frontline team: ${activeTask ? (activeTask.task || activeTask.title) : 'Active Mission'}`);
    };
  }

  if (btnBackup) {
    btnBackup.onclick = async () => {
      sound.playCriticalAlert();
      try {
        const res = await apiFetch('POST', '/escalations', {
          kind: 'backup_request',
          reason: `Frontline Strike Team (${session.name}, ${session.team || session.site}) requests immediate tactical backup.`
        });
        if (res.ok) {
          showToast('URGENT: Backup Request Escalated directly to Tier 2 State EOC!', 'alert');
        } else {
          showToast('Backup Request Dispatched to State EOC', 'alert');
        }
      } catch {
        showToast('Backup Request Dispatched to State EOC', 'alert');
      }
      logActivity('ESCALATION', `T4 Strike Team (${session.name}) requested immediate field backup.`);
      renderEscalationInbox();
    };
  }

  if (btnHazard) {
    btnHazard.onclick = async () => {
      sound.playCriticalAlert();
      const hazardTitle = `CRITICAL HAZARD: Road breach / surge obstruction at ${session.site || 'operational sector'}`;
      try {
        await apiFetch('POST', '/incidents', {
          title: hazardTitle,
          severity: 'critical',
          body: `Reported by Frontline Lead ${session.name} (${session.team || session.site})`
        });
      } catch { /* fallback */ }

      state.incidents.unshift({
        id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST',
        section: 'OPS',
        severity: 'CRITICAL',
        title: hazardTitle,
        details: `Reported via T4 Rapid Report-up by ${session.name}. Immediate triage required.`
      });

      renderIncidents();
      showToast('⚠️ Critical Hazard Alert Broadcast to Incident Stream!', 'alert');
      logActivity('HAZARD', `Frontline team flagged critical hazard at ${session.site || 'sector'}`);
    };
  }
}

// =========================================================================
// ESCALATION WORKFLOW CONTROLLER
// =========================================================================
export const initEscalationPanel = initEscalationWorkflow;
export function initEscalationWorkflow() {
  const submitBtn = getEl('esc-submit-btn');
  const refreshBtn = getEl('esc-refresh-btn');

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const kind = getEl('esc-kind-select')?.value || 'general';
      const reason = getEl('esc-reason-input')?.value.trim();
      const feedback = getEl('esc-submit-feedback');

      if (!reason) {
        showToast('Please provide situation details and justification for escalation.', 'alert');
        return;
      }

      const session = getAuthSession();
      sound.playClick();

      try {
        const res = await apiFetch('POST', '/escalations', { kind, reason });
        if (res.ok) {
          sound.playSuccess();
          if (getEl('esc-reason-input')) getEl('esc-reason-input').value = '';
          showToast(`Escalation request dispatched upward (${res.body.data?.routed_to_tier || 'Higher Command'})`);
          logActivity('ESCALATION', `New escalation submitted by ${session?.name || 'Officer'}: ${reason}`);
          if (feedback) {
            feedback.style.display = 'block';
            feedback.className = 'text-xs font-bold text-emerald';
            feedback.innerText = '✓ Escalation successfully transmitted to higher command.';
            setTimeout(() => { feedback.style.display = 'none'; }, 4000);
          }
          renderEscalationInbox();
        } else {
          showToast(res.body.message || 'Error submitting escalation', 'alert');
        }
      } catch (err) {
        showToast('Error submitting escalation request.', 'alert');
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      sound.playClick();
      renderEscalationInbox();
      showToast('Escalation queue refreshed.');
    });
  }
}

export async function renderEscalationInbox() {
  const container = getEl('esc-inbox-list');
  const inboxTitle = getEl('esc-inbox-title');
  const layoutGrid = getEl('escalation-layout-grid');
  const submitPanel = getEl('escalation-submit-panel');
  if (!container) return;

  const session = getAuthSession();
  if (!session) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2rem 0;">Sign in to view escalations.</p>`;
    return;
  }

  // Layout adjustment: Tier 1 has full-width approval desk; T2-T5 have submit panel
  if (submitPanel) {
    submitPanel.style.display = session.tier === 'T1' ? 'none' : 'block';
  }
  if (layoutGrid) {
    layoutGrid.className = session.tier === 'T1' ? 'escalation-layout-grid full-width' : 'escalation-layout-grid';
  }

  if (inboxTitle) {
    if (session.tier === 'T1') inboxTitle.innerText = '📥 Actionable Escalation Inbox (Approval Authority)';
    else if (session.tier === 'T2') inboxTitle.innerText = '📥 Actionable Escalation Inbox (Approval Authority)';
    else if (session.tier === 'T3') inboxTitle.innerText = '📥 District Triage Inbox (Forward to T2)';
    else inboxTitle.innerText = '📤 My Submitted Escalations';
  }

  try {
    const res = await apiFetch('GET', '/escalations');
    const rows = (res.ok && Array.isArray(res.body.data)) ? res.body.data : [];

    // Calculate Summary Stats
    const pendingCount = rows.filter(r => r.status === 'pending').length;
    const approvedCount = rows.filter(r => r.status === 'approved').length;
    const deniedCount = rows.filter(r => r.status === 'denied').length;

    const countPendingEl = getEl('esc-count-pending');
    const countApprovedEl = getEl('esc-count-approved');
    const countDeniedEl = getEl('esc-count-denied');

    if (countPendingEl) countPendingEl.innerText = `${pendingCount} PENDING`;
    if (countApprovedEl) countApprovedEl.innerText = `${approvedCount} APPROVED`;
    if (countDeniedEl) countDeniedEl.innerText = `${deniedCount} DENIED`;

    if (rows.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2.5rem 0;">No active escalation requests in your queue.</p>`;
      return;
    }

    container.innerHTML = rows.map(r => {
      const statusClass = r.status === 'approved' ? 'status-approved' : (r.status === 'denied' ? 'status-denied' : 'status-pending');
      const badgeClass = r.status === 'approved' ? 'badge-emerald' : (r.status === 'denied' ? 'badge-alert' : 'badge-gold');
      const canAction = ['T1', 'T2'].includes(session.tier) && r.status === 'pending';
      const canForward = session.tier === 'T3' && r.status === 'pending' && r.routed_to_tier === 'T3';

      const kindLabel = {
        'resource': 'RESOURCE SURGE',
        'backup_request': 'TACTICAL BACKUP',
        'authority': 'AUTHORITY / LEGAL',
        'general': 'GENERAL SITUATION'
      }[r.kind] || (r.kind ? r.kind.toUpperCase() : 'GENERAL');

      return `
        <div class="escalation-card ${statusClass}" data-esc-id="${r.id}">
          <div class="esc-card-top-strip">
            <div class="esc-card-ids">
              <span class="mono font-bold text-xs" style="color: var(--text-navy); font-size: 0.85rem;">#${r.id}</span>
              <span class="tier-pill-badge" style="font-size: 0.65rem;">Origin: ${r.origin_role}</span>
              <span class="esc-routing-flow">→ Routed to: <strong>Tier ${r.routed_to_tier}</strong></span>
            </div>
            <span class="badge ${badgeClass}">${r.status.toUpperCase()}</span>
          </div>

          <div class="esc-reason-title">
            <span class="esc-tag-pill badge-outline" style="margin-right: 4px; font-size: 0.68rem;">${kindLabel}</span>
            ${r.reason}
          </div>

          <div class="esc-meta-info">
            <span>Location: <strong>${r.region || '—'} · ${r.site || '—'}</strong></span>
            <span>•</span>
            <span>Timestamp: <strong>${r.created_at ? new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Recent'}</strong></span>
          </div>

          ${r.triage_note ? `
            <div class="esc-triage-callout">
              <em>Triage Note: ${r.triage_note}</em>
            </div>
          ` : ''}

          ${canAction ? `
            <div class="esc-actions-row">
              <button class="btn btn-xs btn-emerald font-bold esc-approve-btn" data-esc-id="${r.id}">
                ✓ APPROVE &amp; AUTHORIZE DISPATCH
              </button>
              <button class="btn btn-xs btn-alert font-bold esc-deny-btn" data-esc-id="${r.id}">
                ✕ DENY REQUEST
              </button>
            </div>
          ` : ''}

          ${canForward ? `
            <div class="esc-actions-row">
              <button class="btn btn-xs btn-navy font-bold esc-forward-btn" data-esc-id="${r.id}">
                FORWARD TO STATE EOC (T2) →
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Attach approve/deny handlers
    container.querySelectorAll('.esc-approve-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.escId;
        sound.playClick();
        const res2 = await apiFetch('POST', `/escalations/${id}/approve`);
        if (res2.ok) {
          showToast(`Escalation request #${id} APPROVED`);
          logActivity('ESCALATION', `Approved escalation #${id}`);
        } else {
          showToast(res2.body.message || 'Error actioning escalation', 'alert');
        }
        renderEscalationInbox();
      });
    });

    container.querySelectorAll('.esc-deny-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.escId;
        sound.playClick();
        const res2 = await apiFetch('POST', `/escalations/${id}/deny`);
        if (res2.ok) {
          showToast(`Escalation request #${id} DENIED`);
          logActivity('ESCALATION', `Denied escalation #${id}`);
        } else {
          showToast(res2.body.message || 'Error actioning escalation', 'alert');
        }
        renderEscalationInbox();
      });
    });

    // Attach forward handler (T3)
    container.querySelectorAll('.esc-forward-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.escId;
        const note = prompt('Enter triage notes to attach for State EOC (Tier 2):', 'Verified on ground by District Hub. Forwarding for immediate state-level resource release.');
        if (note === null) return;
        sound.playClick();
        const res2 = await apiFetch('POST', `/escalations/${id}/forward`, { note });
        if (res2.ok) {
          showToast(`Escalation #${id} triaged & forwarded to State EOC (T2)`);
          logActivity('ESCALATION', `T3 Coordinator forwarded escalation #${id} to T2`);
        } else {
          showToast(res2.body.message || 'Error forwarding escalation', 'alert');
        }
        renderEscalationInbox();
      });
    });

  } catch {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 24px 0;">No active escalation requests in your queue.</p>`;
  }
}

// =========================================================================
// CAP-SACHET ALERT STUDIO
// =========================================================================
function initSachetAlerting() {
  const transmitBtn = getEl('transmit-sachet-btn');
  const msgBody = getEl('sachet-msg-body');
  const eventSelect = getEl('sachet-event');
  const broadcastText = getEl('live-broadcast-text');
  const previewBtn = getEl('preview-alert-btn');
  const phoneModal = getEl('modal-phone-preview');
  const closePhoneBtn = getEl('close-phone-modal');

  document.querySelectorAll('.alert-lang-tabs .lang-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      sound.playClick();
      document.querySelectorAll('.alert-lang-tabs .lang-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const lang = tab.dataset.lang;
      if (lang === 'en') {
        msgBody.value = "EMERGENCY ALERT [NDMA / SDMA]: Severe Cyclone DANA landfall imminent. Move immediately to nearest Multipurpose Cyclone Shelter. Do not approach shoreline. Call 1070 for rescue help.";
      } else if (lang === 'od') {
        msgBody.value = "ଜରୁରୀକାଳୀନ ସତର୍କତା [NDMA / OSDMA]: ଭୟଙ୍କର ବାତ୍ୟା ଦାନା ଉପକୂଳ ଛୁଇଁବାକୁ ଯାଉଛି। ତୁରନ୍ତ ନିକଟସ୍ଥ ବାତ୍ୟା ଆଶ୍ରୟସ୍ଥଳକୁ ଯାଆନ୍ତୁ। ସମୁଦ୍ର କୂଳକୁ ଯାଆନ୍ତୁ ନାହିଁ। ସାହାଯ୍ୟ ପାଇଁ 1070 ରେ କଲ୍ କରନ୍ତୁ।";
      } else if (lang === 'hi') {
        msgBody.value = "आपातकालीन चेतावनी [NDMA]: भीषण चक्रवात दाना का प्रभाव निकट है। तुरंत नजदीकी बहुउद्देश्यीय चक्रवात आश्रय में जाएं। समुद्र तट की ओर न जाएं। सहायता हेतु 1070 पर कॉल करें।";
      }
    });
  });

  if (previewBtn && phoneModal) {
    previewBtn.addEventListener('click', () => {
      sound.playBroadcastSiren();
      const phoneTitle = getEl('phone-alert-title');
      const phoneBody = getEl('phone-alert-body');
      if (phoneTitle && eventSelect) phoneTitle.innerText = eventSelect.value.toUpperCase();
      if (phoneBody && msgBody) phoneBody.innerText = msgBody.value;
      phoneModal.classList.remove('hidden');
    });
  }

  if (closePhoneBtn && phoneModal) {
    closePhoneBtn.addEventListener('click', () => {
      phoneModal.classList.add('hidden');
    });
  }

  if (transmitBtn) {
    transmitBtn.addEventListener('click', () => {
      sound.playBroadcastSiren();
      const eventType = eventSelect ? eventSelect.value : 'Cyclone Warning';
      const msg = msgBody ? msgBody.value : 'Immediate evacuation required.';
      const isLive = state.mode === 'LIVE';

      if (isLive) {
        if (broadcastText) {
          broadcastText.innerText = `[LIVE WEA/CAP BROADCAST]: ${msg}`;
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
        state.incidents.unshift({
          id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
          time: timeStr,
          section: 'COMMS',
          severity: 'CRITICAL',
          title: `CAP-SACHET Alert Broadcast Transmitted (${eventType})`,
          details: msg,
          location: 'Geo-Targeted Coastal Telco Towers',
          status: 'BROADCAST ACTIVE'
        });
        renderIncidents();

        showToast(`CAP-SACHET ALERT BROADCAST SENT TO 1.84M SUBSCRIBERS (${eventType})`, 'alert');
        logActivity('SACHET ALERT', `LIVE broadcast transmitted: ${eventType} — "${msg.slice(0, 70)}${msg.length > 70 ? '…' : ''}"`);
      } else {
        showToast(`[EXERCISE SANDBOX]: Alert queued to simulation terminals only.`);
        logActivity('SACHET ALERT', `Exercise-mode alert queued (sandbox only): ${eventType}`);
      }
    });
  }
}

// Rumor Control
function renderRumors() {
  const container = getEl('rumor-list-container');
  if (!container) return;
  container.innerHTML = '';

  state.rumorsData.forEach(r => {
    const item = document.createElement('div');
    item.className = 'rumor-item';
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="font-bold text-xs text-alert">CLAIM: "${r.claim}"</span>
        <span class="badge ${r.status === 'DEBUNKED' ? 'badge-emerald' : 'badge-gold'}">${r.status}</span>
      </div>
      <div style="margin-top: 2px; color: var(--text-muted); font-size: 0.7rem;">
        <strong>CLARIFICATION:</strong> ${r.clarification}
      </div>
      <div class="mono text-xs text-muted" style="margin-top: 2px;">Verified by: ${r.verifiedBy} | ${r.timestamp}</div>
    `;
    container.appendChild(item);
  });
}

// Clarify Rumor Modal — previously "+ CLARIFY RUMOR" had no handler at all
const addRumorBtn = getEl('add-rumor-btn');
const rumorModal = getEl('modal-rumor');
const closeRumorModal = () => rumorModal && rumorModal.classList.add('hidden');

if (addRumorBtn && rumorModal) {
  addRumorBtn.addEventListener('click', () => {
    sound.playClick();
    rumorModal.classList.remove('hidden');
  });
}

const saveRumorBtn = getEl('save-rumor-btn');
if (saveRumorBtn) {
  saveRumorBtn.addEventListener('click', async () => {
    const claim = getEl('new-rumor-claim')?.value.trim();
    const clarification = getEl('new-rumor-clarification')?.value.trim();
    const verifiedBy = getEl('new-rumor-verifier')?.value.trim() || 'EOC Duty Officer';

    if (!claim) { showToast('Enter the claim being circulated'); return; }
    if (!clarification) { showToast('Enter the official clarification'); return; }

    const payload = {
      rumor: claim,
      verdict: 'FALSE / DEBUNKED',
      fact: clarification,
      source: verifiedBy,
      region: 'Odisha',
      site: 'Bhadrak / Dhamra'
    };

    try {
      const res = await apiFetch('POST', '/rumors', payload);
      const newRumor = (res.ok && res.body) ? res.body : { id: `RUMOR-${Date.now().toString().slice(-4)}`, ...payload };
      state.rumorsData.unshift(newRumor);
      sound.playClick();
      renderRumors();
      closeRumorModal();
      showToast(`Rumor clarification posted`);
      logActivity('RUMOR CONTROL', `Clarified: "${claim.slice(0, 60)}${claim.length > 60 ? '…' : ''}" — verified by ${verifiedBy}`);
    } catch (err) {
      showToast('Error posting rumor clarification', 'alert');
    }
  });
}
function renderDamageTable() {
  const tbody = getEl('damage-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // TODO: SERVER-SIDE ENFORCEMENT REQUIRED — Scoping should be enforced in API query responses
  const scopedDamage = filterDataByJurisdiction(state.damageData, 'jurisdiction', 'region');

  scopedDamage.forEach(d => {
    const row = document.createElement('tr');
    let sevBadge = 'badge-emerald';
    if (d.severity === 'CRITICAL' || d.severity === 'SEVERE') sevBadge = 'badge-alert';
    if (d.severity === 'MODERATE') sevBadge = 'badge-gold';

    row.innerHTML = `
      <td><strong>${d.sector}</strong></td>
      <td>${d.type}</td>
      <td><span class="badge ${sevBadge}">${d.severity}</span></td>
      <td>${d.damage}</td>
      <td><span class="mono text-xs">${d.reportedBy} (${d.time})</span></td>
    `;
    tbody.appendChild(row);
  });
}

function renderCorrectiveActions() {
  const tbody = getEl('corrective-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.correctiveActions.forEach((c, idx) => {
    const row = document.createElement('tr');
    let badgeClass = c.status === 'COMPLETED' ? 'badge-emerald' : 'badge-gold';
    row.innerHTML = `
      <td>${c.def}</td>
      <td>${c.action}</td>
      <td>${c.lead}</td>
      <td>
        <button class="badge ${badgeClass} cycle-cap-btn" data-idx="${idx}" style="cursor:pointer;">${c.status}</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  document.querySelectorAll('.cycle-cap-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const idx = parseInt(e.target.dataset.idx, 10);
      state.correctiveActions[idx].status = state.correctiveActions[idx].status === 'COMPLETED' ? 'IN PROGRESS' : 'COMPLETED';
      renderCorrectiveActions();
    });
  });
}

// =========================================================================
// ICS FORMS & SIGNATURE PAD
// =========================================================================
function initIapForms() {
  const formContainer = getEl('iap-form-container');
  if (!formContainer) return;

  renderIapForm('202', formContainer);

  document.querySelectorAll('.forms-nav-tabs .iap-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      sound.playClick();
      document.querySelectorAll('.forms-nav-tabs .iap-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const formNum = tab.dataset.form;
      renderIapForm(formNum, formContainer);
    });
  });

  const signBtn = getEl('sign-iap-btn');
  if (signBtn) {
    signBtn.addEventListener('click', async () => {
      if (!isActionAuthorized('sign_iap', state.mode)) {
        sound.playCriticalAlert();
        showToast('Unauthorized: Only Tier 1 Authority can sign and certify IAP declarations.', 'alert');
        return;
      }
      sound.playClick();
      const session = getAuthSession();
      const title = `IAP OPERATIONAL PERIOD 2 — CERTIFIED & SIGNED BY ${session ? session.name : 'NDMA AUTHORITY'}`;
      try {
        const res = await apiFetch('POST', '/declarations', { title, status: 'active', region: session ? session.region : null });
        if (res.ok) {
          showToast(`IAP Certified & Real Declaration Registered (ID: ${res.body.data ? res.body.data.id : 'DEC-01'})`);
          logActivity('COMMAND', `IAP Declaration registered and digitally certified by ${session ? session.name : 'NDMA Authority'}`);
        } else {
          showToast('IAP OPERATIONAL PERIOD 2 DIGITALLY SIGNED & CERTIFIED');
        }
      } catch {
        showToast('IAP OPERATIONAL PERIOD 2 DIGITALLY SIGNED & CERTIFIED');
      }
      renderIapForm('202', formContainer);
    });
  }

  const exportBtn = getEl('export-iap-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      sound.playClick();
      window.print();
    });
  }
}

function renderIapForm(formNum, container) {
  const session = getAuthSession();
  const approverName = (session && session.name) ? `${session.name} (${session.designation || 'NDMA Authority'})` : 'Shri Rajesh Verma, IAS (NDMA National Command)';
  const now = new Date();
  const certDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST';

  if (formNum === '202') {
    container.innerHTML = `
      <div class="nims-form-wrapper">
        <div class="nims-form-header" style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--border-color); padding-bottom: 6px;">
          <div>
            <h3 class="font-bold">INCIDENT OBJECTIVES (ICS FORM 202)</h3>
            <span class="mono text-xs text-muted">1. INCIDENT NAME: SEVERE CYCLONE DANA | 2. OPERATIONAL PERIOD: 18:00 - 06:00 IST</span>
          </div>
          <span class="badge badge-emerald">STATUS: SIGNED & ACTIVE</span>
        </div>
        <div class="form-field-group" style="margin-top: 10px;">
          <label class="form-label font-bold text-xs">3. OBJECTIVES & STRATEGIC PRIORITIES:</label>
          <div class="objective-box" style="padding: 8px; background: var(--bg-canvas); border: 1px solid var(--border-color); font-size: 0.8rem;">
            <div style="margin-bottom: 4px;"><strong>PRIORITY 1:</strong> Complete 100% evacuation of remaining coastal residents near Dhamra & Chandbali before 16:00 IST.</div>
            <div style="margin-bottom: 4px;"><strong>PRIORITY 2:</strong> Deploy 6 NDRF boat teams for creek rescue operations. Maintain clear corridor on NH-16.</div>
            <div><strong>PRIORITY 3:</strong> Maintain auxiliary diesel backup at Balasore District Headquarters Hospital.</div>
          </div>
        </div>
        <div class="form-field-group" style="margin-top: 10px;">
          <label class="form-label font-bold text-xs">4. WEATHER DIRECTIVE & HAZARDS:</label>
          <div style="padding: 8px; background: var(--bg-canvas); border: 1px solid var(--border-color); font-size: 0.75rem;">
            Peak landfall winds 125-135 km/h expected between Dhamra and Bhitarkanika. Tidal surge +3.8m above astronomical tide. Zero night navigation without high-intensity searchlights.
          </div>
        </div>
        <div class="form-field-group" style="margin-top: 10px;">
          <label class="form-label font-bold text-xs">5. DIGITAL SIGNATURE PAD (INCIDENT COMMANDER):</label>
          <div class="signature-canvas-wrap">
            <canvas id="sig-canvas" class="sig-canvas"></canvas>
            <div class="sig-tools">
              <span class="mono">Sign above using mouse / stylus</span>
              <button class="btn btn-xs btn-outline" id="clear-sig-btn">CLEAR SIGNATURE</button>
            </div>
          </div>
          <div style="margin-top: 6px; display: flex; justify-content: space-between; font-size: 0.75rem;">
            <span>APPROVED BY: <strong class="text-saffron">${approverName}</strong></span>
            <span class="mono text-emerald font-bold">CERTIFIED: ${certDateStr}</span>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const canvas = getEl('sig-canvas');
      const clearBtn = getEl('clear-sig-btn');
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      canvas.width = canvas.parentElement.clientWidth || 400;
      canvas.height = 80;
      ctx.strokeStyle = '#0B2545';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      let isDrawing = false;
      let lastX = 0;
      let lastY = 0;

      canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
      });

      canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        [lastX, lastY] = [e.offsetX, e.offsetY];
      });

      window.addEventListener('mouseup', () => isDrawing = false);

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          showToast('Signature cleared');
        });
      }
    }, 50);

  } else if (formNum === '203') {
    const icName = (session && session.tierLevel <= 2) ? session.name : 'Shri R. Mohanty, IAS';
    const icAgency = (session && session.region) ? `${session.region} SDMA` : 'SDMA Odisha / NDMA';
    container.innerHTML = `
      <div class="nims-form-wrapper">
        <div class="nims-form-header" style="border-bottom: 2px solid var(--border-color); padding-bottom: 6px;">
          <h3 class="font-bold">ORGANIZATION ASSIGNMENT LIST (ICS FORM 203)</h3>
          <span class="mono text-xs text-muted">COMPREHENSIVE COMMAND & GENERAL STAFF ROSTER</span>
        </div>
        <table class="brutal-table" style="margin-top: 10px;">
          <tr><th>POSITION</th><th>ASSIGNED OFFICER</th><th>AGENCY</th><th>RADIO CHANNEL</th></tr>
          <tr><td>Incident Commander</td><td><strong>${icName}</strong></td><td>${icAgency}</td><td>Command Net (155.475)</td></tr>
          <tr><td>Operations Chief</td><td>DIG S. K. Verma</td><td>NDRF HQ</td><td>Ops Net (154.280)</td></tr>
          <tr><td>Planning Chief</td><td>Dr. P. C. Dash</td><td>OSDMA</td><td>Command Net</td></tr>
          <tr><td>Logistics Chief</td><td>Shri Alok Mishra</td><td>Civil Supplies</td><td>Logistics Net (153.860)</td></tr>
          <tr><td>Safety Officer</td><td>Dr. K. S. Nayak</td><td>Fire Services</td><td>Command Net</td></tr>
          <tr><td>PIO Lead</td><td>Smt. Ananya Sen</td><td>Dept of I&PR</td><td>Comms Net</td></tr>
        </table>
      </div>
    `;
  } else if (formNum === '204') {
    container.innerHTML = `
      <div class="nims-form-wrapper">
        <div class="nims-form-header" style="border-bottom: 2px solid var(--border-color); padding-bottom: 6px;">
          <h3 class="font-bold">ASSIGNMENT LIST BY DIVISION / BRANCH (ICS FORM 204)</h3>
          <span class="mono text-xs text-muted">OPERATIONAL PERIOD: 18:00 - 06:00 IST</span>
        </div>
        <div style="padding: 8px; background: var(--bg-canvas); border: 1px solid var(--border-color); font-size: 0.8rem; margin-top: 10px;">
          <div><strong>DIVISION ALPHA (DHAMRA PORT):</strong> Search & Rescue operations along coastal fishing hamlets. Crew: NDRF 03 Bn (32 Rescuers, 6 IRBs). Frequency: Ops Net 154.280.</div>
          <div style="margin-top: 8px;"><strong>DIVISION BRAVO (KENDRAPARA CREST):</strong> Evacuation of low-lying creek communities to MCS Kendrapara. Crew: SDRF 02 Team. Frequency: Ops Net 154.280.</div>
          <div style="margin-top: 8px;"><strong>DIVISION CHARLIE (BHADRAK TRANSIT):</strong> Staging area for relief convoys & emergency power generation. Frequency: Logistics Net 153.860.</div>
        </div>
      </div>
    `;
  } else if (formNum === '214') {
    container.innerHTML = `
      <div class="nims-form-wrapper">
        <div class="nims-form-header" style="border-bottom: 2px solid var(--border-color); padding-bottom: 6px;">
          <h3 class="font-bold">UNIT ACTIVITY LOG (ICS FORM 214)</h3>
          <span class="mono text-xs text-muted">CHRONOLOGICAL RECORD OF INDIVIDUAL SECTION ACTIONS</span>
        </div>
        <table class="brutal-table" style="margin-top: 10px;">
          <tr><th>TIME</th><th>LOGGED EVENT / ACTION</th><th>OFFICER</th></tr>
          <tr><td>14:24</td><td>Dhamra Seawall overtopping reported, 6 IRBs dispatched</td><td>Ops Chief Verma</td></tr>
          <tr><td>14:05</td><td>12,000 rations arrived at Bhadrak Transit Depot via IAF</td><td>Logistics Lead Mishra</td></tr>
          <tr><td>13:40</td><td>NH-16 tree clearance accomplished by SDRF chainsaw squad</td><td>Division Lead Swain</td></tr>
          <tr><td>13:12</td><td>CAP-SACHET Cell broadcast siren executed to 1.84M mobiles</td><td>PIO Smt. Sen</td></tr>
        </table>
      </div>
    `;
  }
}

// =========================================================================
// SIMULATION ENGINE & TIME MACHINE
// =========================================================================
function initSimulationEngine() {
  function formatSimTime(sec) {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `H+${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateSimDisplay() {
    const formatted = formatSimTime(state.simTimeSec);
    const simReadout = getEl('sim-clock-readout');
    const exSimTime = getEl('exercise-sim-time');
    const scrubber = getEl('sim-scrubber');

    if (simReadout) simReadout.innerText = `SIM TIME: ${formatted} / H+06:00:00`;
    if (exSimTime) exSimTime.innerText = `SIM TIME: ${formatted} | SPEED: ${state.simSpeed}X`;
    if (scrubber) scrubber.value = state.simTimeSec;
  }

  const scrubber = getEl('sim-scrubber');
  if (scrubber) {
    scrubber.addEventListener('input', (e) => {
      state.simTimeSec = parseInt(e.target.value, 10);
      updateSimDisplay();
      checkInjectTriggers();
    });
  }

  const playBtn = getEl('sim-btn-play');
  const pauseBtn = getEl('sim-btn-pause');
  const rewindBtn = getEl('sim-btn-rewind');
  const ffBtn = getEl('sim-btn-ff');

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (!state.simPlaying) {
        sound.playClick();
        state.simPlaying = true;
        playBtn.innerText = 'PAUSE';
        state.simInterval = setInterval(() => {
          state.simTimeSec += state.simSpeed * 10;
          if (state.simTimeSec > 21600) state.simTimeSec = 21600;
          updateSimDisplay();
          checkInjectTriggers();
        }, 1000);
        showToast(`Simulation started at ${state.simSpeed}× speed`);
      } else {
        pauseSimulation();
      }
    });
  }

  function pauseSimulation() {
    sound.playClick();
    state.simPlaying = false;
    if (playBtn) playBtn.innerText = 'PLAY DRILL';
    clearInterval(state.simInterval);
  }

  if (pauseBtn) pauseBtn.addEventListener('click', pauseSimulation);

  if (rewindBtn) {
    rewindBtn.addEventListener('click', () => {
      sound.playClick();
      state.simTimeSec = Math.max(0, state.simTimeSec - 900);
      updateSimDisplay();
    });
  }

  if (ffBtn) {
    ffBtn.addEventListener('click', () => {
      sound.playClick();
      state.simTimeSec = Math.min(21600, state.simTimeSec + 900);
      updateSimDisplay();
    });
  }

  document.querySelectorAll('.speed-control-group .speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sound.playClick();
      document.querySelectorAll('.speed-control-group .speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.simSpeed = parseInt(btn.dataset.speed, 10);
      showToast(`Simulation Speed: ${state.simSpeed}×`);
      if (state.simPlaying) {
        pauseSimulation();
        if (playBtn) playBtn.click();
      }
    });
  });

  const manualInjectBtn = getEl('fire-manual-inject-btn');
  const injectModal = getEl('modal-custom-inject');
  if (manualInjectBtn && injectModal) {
    manualInjectBtn.addEventListener('click', () => {
      sound.playClick();
      injectModal.classList.remove('hidden');
    });
  }

  const closeInjectBtn = getEl('close-inject-modal');
  const cancelInjectBtn = getEl('cancel-inject-btn');
  const confirmFireInjectBtn = getEl('confirm-fire-inject-btn');

  const closeInjectModal = () => injectModal && injectModal.classList.add('hidden');
  if (closeInjectBtn) closeInjectBtn.addEventListener('click', closeInjectModal);
  if (cancelInjectBtn) cancelInjectBtn.addEventListener('click', closeInjectModal);

  if (confirmFireInjectBtn) {
    confirmFireInjectBtn.addEventListener('click', () => {
      const title = getEl('new-inject-title')?.value.trim() || 'Embankment Collapse at Sector 4';
      const target = getEl('new-inject-target')?.value || 'Operations';
      const mechanism = getEl('new-inject-mech')?.value || 'Drone Recon Video';

      const newInject = {
        timeOffset: state.simTimeSec,
        timeCode: formatSimTime(state.simTimeSec),
        title,
        status: "JUST FIRED",
        target,
        mechanism,
        executed: true
      };

      exerciseScenario.injects.unshift(newInject);
      sound.playCriticalAlert();
      renderInjects();
      closeInjectModal();
      showToast(`CUSTOM INJECT FIRED: ${title}`, 'alert');
    });
  }

  const pinsContainer = getEl('scrubber-pins');
  if (pinsContainer) {
    pinsContainer.innerHTML = `
      <span>H+00:00 (Landfall)</span>
      <span>H+01:15 (Substation)</span>
      <span>H+02:30 (NH16 Cut)</span>
      <span>H+04:00 (Air Fleet)</span>
      <span>H+06:00 (End)</span>
    `;
  }

  updateSimDisplay();
}

function checkInjectTriggers() {
  exerciseScenario.injects.forEach(inj => {
    if (!inj.executed && state.simTimeSec >= inj.timeOffset) {
      inj.executed = true;
      inj.status = "JUST FIRED";
      sound.playCriticalAlert();
      showToast(`SIM INJECT FIRED: ${inj.title}`, 'alert');
      renderInjects();
    }
  });
}

function renderInjects() {
  const container = getEl('inject-list-feed');
  if (!container) return;
  container.innerHTML = '';

  exerciseScenario.injects.forEach(inj => {
    const item = document.createElement('div');
    item.className = 'inject-card-item';
    item.innerHTML = `
      <div>
        <div class="font-bold text-xs"><span class="mono text-saffron">${inj.timeCode}</span> — ${inj.title}</div>
        <div class="mono text-xs text-muted">Target: ${inj.target} | Via: ${inj.mechanism}</div>
      </div>
      <span class="badge ${inj.executed ? 'badge-alert' : 'badge-gold'}">${inj.status}</span>
    `;
    container.appendChild(item);
  });
}

function renderTrainees() {
  const container = getEl('trainee-score-list');
  if (!container) return;
  container.innerHTML = '';

  exerciseScenario.traineeMatrix.forEach(t => {
    const item = document.createElement('div');
    item.className = 'shelter-entry';
    item.innerHTML = `
      <div class="shelter-entry-top">
        <span><strong>${t.name}</strong> (${t.role})</span>
        <span class="mono text-emerald font-bold">${t.score}</span>
      </div>
      <div class="inc-bottom">
        <span>Tasks: ${t.tasks}</span>
        <span>${t.cert}</span>
        <span class="badge badge-emerald text-xs">${t.status}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

// =========================================================================
// TACTICAL GIS SPATIAL ENGINE & UTILITIES
// =========================================================================

function calculateGeoDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestShelter(lat, lng) {
  const sheltersList = state.sheltersData && state.sheltersData.length ? state.sheltersData : shelters;
  if (!sheltersList || !sheltersList.length) return null;
  let nearest = null;
  let minDistance = Infinity;

  sheltersList.forEach(s => {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
    const dist = calculateGeoDistance(lat, lng, s.lat, s.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = { ...s, distanceKm: dist.toFixed(1) };
    }
  });
  return nearest;
}

function findNearestAsset(lat, lng, preferredType = null) {
  const assetList = state.assets && state.assets.length ? state.assets : fleetAssets;
  if (!assetList || !assetList.length) return null;
  let nearest = null;
  let minDistance = Infinity;

  assetList.forEach(a => {
    if (!a.lat || !a.lng || a.status === 'OUT_OF_SERVICE') return;
    if (preferredType && a.type !== preferredType) return;
    const dist = calculateGeoDistance(lat, lng, a.lat, a.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = { ...a, distanceKm: dist.toFixed(1) };
    }
  });
  return nearest;
}

function findNearestSosOrIncident(lat, lng) {
  const allTargets = [];
  const sosList = state.sosList && state.sosList.length ? state.sosList : citizenSosQueue;
  sosList.forEach(s => {
    if (s.lat && s.lng) allTargets.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, type: 'SOS' });
  });
  const incList = state.incidents && state.incidents.length ? state.incidents : chronoIncidents;
  incList.forEach(inc => {
    if (inc.lat && inc.lng && inc.severity === 'CRITICAL') allTargets.push({ id: inc.id, name: inc.title, lat: inc.lat, lng: inc.lng, type: 'INCIDENT' });
  });

  if (!allTargets.length) return null;
  let nearest = null;
  let minDistance = Infinity;

  allTargets.forEach(t => {
    const dist = calculateGeoDistance(lat, lng, t.lat, t.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = { ...t, distanceKm: dist.toFixed(1) };
    }
  });
  return nearest;
}

// =========================================================================
// OSRM ROUTING ENGINE & ACTIVE ROUTE HUD
// =========================================================================

async function calculateAndDrawRoute(startCoords, endCoords, title, routeType = 'EVACUATION', pinId = null) {
  if (!state.map) return;
  sound.playClick();
  showToast(`Calculating road route: ${title}...`);

  const [startLat, startLng] = startCoords;
  const [endLat, endLng] = endCoords;
  state.activeRoutePinId = pinId;

  try {
    if (state.routeLayer) {
      state.map.removeLayer(state.routeLayer);
      state.routeLayer = null;
    }

    const routeGroup = L.featureGroup();
    let coordinates = [];
    let distanceKm = '0';
    let etaMinutes = 0;
    let engine = 'OSRM Road Network';

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          distanceKm = (route.distance / 1000).toFixed(1);
          etaMinutes = Math.max(1, Math.round(route.duration / 60));
          coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
        }
      }
    } catch (fetchErr) {
      console.warn('OSRM API fetch failed, using geodesic fallback:', fetchErr);
    }

    if (!coordinates.length) {
      engine = 'Geodesic Evacuation Corridor (Tactical Fallback)';
      const directDist = calculateGeoDistance(startLat, startLng, endLat, endLng);
      distanceKm = directDist.toFixed(1);
      etaMinutes = Math.max(1, Math.round((directDist / 35) * 60));
      coordinates = [[startLat, startLng], [endLat, endLng]];
    }

    const glowLine = L.polyline(coordinates, {
      color: routeType === 'DISPATCH' ? '#059669' : '#0284C7',
      weight: 8,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round'
    });
    routeGroup.addLayer(glowLine);

    const innerLine = L.polyline(coordinates, {
      color: routeType === 'DISPATCH' ? '#34D399' : '#38BDF8',
      weight: 3.5,
      opacity: 0.95,
      dashArray: routeType === 'DISPATCH' ? '8, 6' : null
    });
    routeGroup.addLayer(innerLine);

    const startPin = L.circleMarker([startLat, startLng], {
      radius: 6,
      fillColor: '#38BDF8',
      color: '#FFFFFF',
      weight: 2,
      fillOpacity: 1
    }).bindPopup(`<div class="tactical-popup"><div class="tac-popup-head"><span>ROUTE ORIGIN</span></div><div class="tac-popup-body"><div class="tac-popup-title font-bold">${escapeHtml(title.split('➔')[0] || 'Origin')}</div></div></div>`);
    routeGroup.addLayer(startPin);

    const endPin = L.circleMarker([endLat, endLng], {
      radius: 7,
      fillColor: '#F59E0B',
      color: '#FFFFFF',
      weight: 2,
      fillOpacity: 1
    }).bindPopup(`<div class="tactical-popup"><div class="tac-popup-head head-saffron"><span>ROUTE DESTINATION</span></div><div class="tac-popup-body"><div class="tac-popup-title font-bold">${escapeHtml(title.split('➔')[1] || 'Destination')}</div></div></div>`);
    routeGroup.addLayer(endPin);

    routeGroup.addTo(state.map);
    state.routeLayer = routeGroup;

    const routeHud = getEl('gis-route-hud');
    const hudTitle = getEl('route-hud-title');
    const hudDist = getEl('route-hud-dist');
    const hudEta = getEl('route-hud-eta');
    const hudType = getEl('route-hud-type');
    const hudEngine = getEl('route-hud-engine');

    if (routeHud) {
      if (hudTitle) hudTitle.innerText = title;
      if (hudDist) hudDist.innerText = `${distanceKm} KM`;
      if (hudEta) hudEta.innerText = `${etaMinutes} MINS`;
      if (hudType) hudType.innerText = routeType === 'DISPATCH' ? 'TACTICAL ASSET DISPATCH ROUTE' : 'TACTICAL ROAD EVACUATION ROUTE';
      if (hudEngine) hudEngine.innerText = engine;
      routeHud.classList.remove('hidden');
    }

    state.map.fitBounds(routeGroup.getBounds(), { padding: [60, 60], maxZoom: 13 });
    sound.playModeToggle();
    showToast(`Active Route Plotted: ${distanceKm} km (ETA: ${etaMinutes} mins)`, 'alert');
    logActivity('GIS', `Active route calculated [${title}]: ${distanceKm} km, ETA ${etaMinutes}m`);

  } catch (err) {
    console.error('OSRM Routing Error:', err);
    showToast('Routing calculation error.');
  }
}

function clearActiveRoute() {
  if (state.routeLayer && state.map) {
    state.map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
  state.activeRoutePinId = null;
  const routeHud = getEl('gis-route-hud');
  if (routeHud) routeHud.classList.add('hidden');
  showToast('Active Tactical Route Cleared');
}

// Global popup action hooks
window.routeFromPointToShelter = (fromLat, fromLng, shelterLat, shelterLng, shelterName) => {
  calculateAndDrawRoute([fromLat, fromLng], [shelterLat, shelterLng], `Dropped Pin  ${shelterName}`, 'EVACUATION');
};

window.routeToShelter = (shelterLat, shelterLng, shelterName) => {
  let startLat = 20.78, startLng = 86.95;
  if (state.lastDroppedPin && state.lastDroppedPin.lat && state.lastDroppedPin.lng) {
    startLat = state.lastDroppedPin.lat;
    startLng = state.lastDroppedPin.lng;
  } else if (state.map) {
    const center = state.map.getCenter();
    startLat = center.lat;
    startLng = center.lng;
  }
  calculateAndDrawRoute([startLat, startLng], [shelterLat, shelterLng], `Tactical Location  ${shelterName}`, 'EVACUATION');
};

window.removeCustomPin = (pinId) => {
  if (!state.customPinsGroup) return;
  state.customPinsGroup.eachLayer(layer => {
    if (layer._pinId === pinId) {
      state.customPinsGroup.removeLayer(layer);
    }
  });
  if (state.lastDroppedPin && state.lastDroppedPin.id === pinId) {
    state.lastDroppedPin = null;
  }
  if (state.activeRoutePinId === pinId) {
    clearActiveRoute();
  }
  showToast(`📍 Tactical Pin ${pinId} removed`);
  logActivity('GIS', `Tactical hotspot pin [${pinId}] cancelled/removed`);
};

window.dispatchToSos = (sosId, sosLat, sosLng) => {
  const asset = findNearestAsset(sosLat, sosLng);
  if (!asset) {
    showToast('No available NDRF asset in operational radius', 'alert');
    return;
  }
  calculateAndDrawRoute([asset.lat, asset.lng], [sosLat, sosLng], `${asset.name} (${asset.id})  ${sosId}`, 'DISPATCH');
  showToast(`DISPATCHED ${asset.id} to ${sosId}`, 'alert');
  logActivity('OPS', `Asset ${asset.id} dispatched to ${sosId} at [${sosLat}, ${sosLng}]`);
};

window.routeSosToShelter = (sosLat, sosLng, sosId) => {
  const shelter = findNearestShelter(sosLat, sosLng);
  if (!shelter) {
    showToast('No cyclone shelter found in radius', 'alert');
    return;
  }
  calculateAndDrawRoute([sosLat, sosLng], [shelter.lat, shelter.lng], `${sosId}  ${shelter.name}`, 'EVACUATION');
};

// =========================================================================
// DYNAMIC GEOJSON DISASTER RISK POLYGONS
// =========================================================================

function renderScenarioRiskPolygons(scenarioKey) {
  if (!state.floodGroup) return;
  state.floodGroup.clearLayers();

  let geoJsonData = cycloneDanaInundationGeoJSON;
  if (scenarioKey === 'assam') geoJsonData = assamFloodsGeoJSON;
  else if (scenarioKey === 'chamoli') geoJsonData = chamoliGlofGeoJSON;
  else if (scenarioKey === 'wayanad') geoJsonData = wayanadLandslideGeoJSON;

  if (!geoJsonData) return;

  const geoJsonLayer = L.geoJSON(geoJsonData, {
    style: function (feature) {
      return {
        color: feature.properties.color || '#DC2626',
        fillColor: feature.properties.fillColor || '#DC2626',
        fillOpacity: feature.properties.fillOpacity || 0.35,
        weight: 2,
        dashArray: '4, 4'
      };
    },
    onEachFeature: function (feature, layer) {
      const p = feature.properties;
      layer.bindPopup(`
        <div class="tactical-popup">
          <div class="tac-popup-head ${p.severity === 'EXTREME' || p.severity === 'CRITICAL' ? 'head-danger' : 'head-saffron'}">
            <span class="tac-popup-tag">GEOJSON HAZARD LAYER</span>
            <span class="tac-popup-id font-mono">${p.id}</span>
          </div>
          <div class="tac-popup-body">
            <div class="tac-popup-title font-bold">${escapeHtml(p.name)}</div>
            <div class="tac-popup-desc">${escapeHtml(p.description)}</div>
            <div class="tac-popup-metrics">
              <div>Severity Level: <strong class="${p.severity === 'EXTREME' || p.severity === 'CRITICAL' ? 'text-alert' : 'text-saffron'}">${escapeHtml(p.severity)}</strong></div>
              <div>Water / Surge Depth: <strong>${escapeHtml(p.depth)}</strong></div>
            </div>
            <div class="tac-popup-coords font-mono text-xs"> ISRO Bhuvan & CWC Hydro-Spatial Model</div>
          </div>
        </div>
      `);
    }
  });

  state.floodGroup.addLayer(geoJsonLayer);
}

// =========================================================================
// DECLARE / DRAW RED DANGER & IMPACT ZONES (DMA §30)
// =========================================================================

function declareDangerZone(lat, lng, radiusKm, title = 'IMPACT DANGER ZONE', severity = 'CRITICAL', directive = 'Mandatory evacuation enforced under DMA 2005 §30.') {
  if (!state.map || !state.dangerZonesGroup) return;

  const validRadius = Math.max(0.2, parseFloat(radiusKm) || 5);
  const radiusMeters = validRadius * 1000;
  const zoneId = `DZ-${Date.now().toString().slice(-4)}`;

  // Outer red pulsing circle
  const dangerCircle = L.circle([lat, lng], {
    radius: radiusMeters,
    color: '#DC2626',
    fillColor: '#DC2626',
    fillOpacity: 0.30,
    weight: 3,
    dashArray: '6, 6'
  });

  // Inner core warning marker
  const centerMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'custom-map-marker-wrap',
      html: `<div class="danger-zone-center-pin" title="${escapeHtml(title)}"><span>⚠️</span><span>${escapeHtml(title)} (${validRadius.toFixed(1)}km)</span></div>`,
      iconSize: null
    })
  });

  const zoneFeatureGroup = L.featureGroup([dangerCircle, centerMarker]);
  zoneFeatureGroup._zoneId = zoneId;
  zoneFeatureGroup._lat = lat;
  zoneFeatureGroup._lng = lng;
  zoneFeatureGroup._radiusKm = validRadius;
  zoneFeatureGroup._title = title;
  zoneFeatureGroup._severity = severity;
  zoneFeatureGroup._directive = directive;

  const popupContent = `
    <div class="tactical-popup">
      <div class="tac-popup-head head-danger">
        <span class="tac-popup-tag">[CRITICAL] DECLARED IMPACT ZONE</span>
        <span class="tac-popup-id font-mono">${zoneId}</span>
      </div>
      <div class="tac-popup-body">
        <div class="tac-popup-title font-bold">${escapeHtml(title)}</div>
        <div class="tac-popup-desc">${escapeHtml(directive)}</div>
        <div class="tac-popup-metrics">
          <div>Hazard Level: <strong class="text-alert">${escapeHtml(severity)}</strong></div>
          <div>Impact Radius: <strong class="text-alert">${validRadius.toFixed(1)} KM (${(validRadius * 2).toFixed(1)} km dia)</strong></div>
          <div>Center Coordinates: <strong class="font-mono">${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E</strong></div>
          <div>Legal Authority: <strong>Disaster Management Act 2005 §30</strong></div>
        </div>
        <div class="tac-popup-actions">
          <button class="tac-action-btn btn-saffron-action" onclick="window.resizeDangerZone('${zoneId}')">✏️ Adjust Radius</button>
          <button class="tac-action-btn btn-danger-action" onclick="window.removeDangerZone('${zoneId}')">✕ Remove Hazard Zone</button>
        </div>
      </div>
    </div>
  `;

  dangerCircle.bindPopup(popupContent);
  centerMarker.bindPopup(popupContent);

  state.dangerZonesGroup.addLayer(zoneFeatureGroup);

  if (!state.map.hasLayer(state.dangerZonesGroup)) {
    state.map.addLayer(state.dangerZonesGroup);
  }

  sound.playCriticalAlert();
  showToast(`🔴 DANGER ZONE DECLARED: ${title} (${validRadius.toFixed(1)} km radius)`, 'alert');
  logActivity('GIS', `Declared danger/impact zone [${zoneId}]: ${title} (${validRadius.toFixed(1)}km) at [${lat}, ${lng}]`);
  centerMarker.openPopup();
}

window.removeDangerZone = (zoneId) => {
  if (!state.dangerZonesGroup) return;
  state.dangerZonesGroup.eachLayer(layer => {
    if (layer._zoneId === zoneId) {
      state.dangerZonesGroup.removeLayer(layer);
    }
  });
  showToast(`Danger Zone ${zoneId} removed`);
  logActivity('GIS', `Danger zone ${zoneId} de-escalated`);
};

window.resizeDangerZone = (zoneId) => {
  if (!state.dangerZonesGroup) return;
  state.dangerZonesGroup.eachLayer(layerGroup => {
    if (layerGroup._zoneId === zoneId) {
      const currentRadius = layerGroup._radiusKm || 5;
      const newRadiusStr = prompt(`Enter new impact radius in KM for ${zoneId}:`, currentRadius);
      if (newRadiusStr !== null) {
        const newRadiusKm = parseFloat(newRadiusStr);
        if (!isNaN(newRadiusKm) && newRadiusKm > 0) {
          const lat = layerGroup._lat;
          const lng = layerGroup._lng;
          const title = layerGroup._title || 'IMPACT DANGER ZONE';
          const severity = layerGroup._severity || 'CRITICAL';
          const directive = layerGroup._directive;
          state.dangerZonesGroup.removeLayer(layerGroup);
          declareDangerZone(lat, lng, newRadiusKm, title, severity, directive);
          showToast(`Hazard Zone ${zoneId} radius updated to ${newRadiusKm} km`);
        }
      }
    }
  });
};

// =========================================================================
// ADD SHELTER TO GIS MAP & APP STATE
// =========================================================================

function addShelterToGIS(s) {
  const pct = Math.round((s.occupied / s.capacity) * 100);
  const isCritical = pct >= 90;

  const icon = L.divIcon({
    className: 'custom-map-marker-wrap',
    html: `<div class="custom-map-pin shelter-pin" title="${s.name}">
      <span>🏢</span>
      <span>${s.name.replace('MCS ', '')}</span>
      <span class="pin-badge ${isCritical ? 'badge-crit' : ''}">${pct}%</span>
    </div>`,
    iconSize: null
  });

  const nearestNDRF = findNearestAsset(s.lat, s.lng);

  const marker = L.marker([s.lat, s.lng], { icon });
  marker.bindPopup(`
    <div class="tactical-popup">
      <div class="tac-popup-head head-saffron">
        <span class="tac-popup-tag">🏢 CYCLONE SHELTER (MCS)</span>
        <span class="tac-popup-id font-mono">${s.id}</span>
      </div>
      <div class="tac-popup-body">
        <div class="tac-popup-title font-bold">${s.name}</div>
        <div class="tac-popup-metrics">
          <div>Occupancy: <strong>${s.occupied} / ${s.capacity}</strong> (${pct}%)</div>
          <div>Medical Station: <strong>${s.medical}</strong></div>
          <div>Food Rations: <strong>${s.foodRations || '48h Stored'}</strong></div>
          <div>Status: <strong class="${isCritical ? 'text-alert' : 'text-emerald'}">${s.status}</strong></div>
          ${nearestNDRF ? `<div>Nearest NDRF: <strong class="text-emerald">${nearestNDRF.name} (${nearestNDRF.distanceKm} km)</strong></div>` : ''}
        </div>
        <div class="tac-popup-coords font-mono text-xs">📍 ${s.lat.toFixed(4)}° N, ${s.lng.toFixed(4)}° E</div>
        <div class="tac-popup-actions">
          <button class="tac-action-btn btn-saffron-action" onclick="window.routeToShelter(${s.lat}, ${s.lng}, '${escapeHtml(s.name)}')">🛣️ Route to Shelter</button>
        </div>
      </div>
    </div>
  `);

  s._marker = marker;
  if (state.sheltersGroup) state.sheltersGroup.addLayer(marker);
  if (!state.shelterMarkers) state.shelterMarkers = [];
  state.shelterMarkers.push(marker);
}

// =========================================================================
// NOMINATIM & LOCAL HYBRID LOCATION SEARCH ENGINE
// =========================================================================

function initGisSearch() {
  const searchContainer = getEl('gis-search-container');
  const searchInput = getEl('gis-search-input');
  const searchResults = getEl('gis-search-results');
  const clearBtn = getEl('gis-search-clear');
  const spinner = getEl('gis-search-spinner');

  if (!searchInput || !searchResults) return;

  // Prevent map from capturing clicks or drags inside the search box
  if (searchContainer && window.L && L.DomEvent) {
    L.DomEvent.disableClickPropagation(searchContainer);
    L.DomEvent.disableScrollPropagation(searchContainer);
  }

  const builtInLocations = [
    { name: 'Dhamra Port & Marine Jetty', sub: 'Bhadrak, Odisha', lat: 20.7937, lon: 86.9634, icon: '⚓' },
    { name: 'Chandbali Riverine Block', sub: 'Bhadrak, Odisha', lat: 20.7761, lon: 86.7420, icon: '📍' },
    { name: 'Basudevpur Coastal Sector', sub: 'Bhadrak, Odisha', lat: 21.1410, lon: 86.7520, icon: '📍' },
    { name: 'Rajnagar Lowlands & Creek', sub: 'Kendrapara, Odisha', lat: 20.5732, lon: 86.8522, icon: '📍' },
    { name: 'Aul Flood Safe Staging Camp', sub: 'Kendrapara, Odisha', lat: 20.6680, lon: 86.6430, icon: '📍' },
    { name: 'Pattamundai River Channel', sub: 'Kendrapara, Odisha', lat: 20.5810, lon: 86.5740, icon: '📍' },
    { name: 'Paradip Port & Coastal Radar', sub: 'Jagatsinghpur, Odisha', lat: 20.2644, lon: 86.6687, icon: '📡' },
    { name: 'Puri Seafront & Swargadwar', sub: 'Puri, Odisha', lat: 19.8135, lon: 85.8312, icon: '🌊' },
    { name: 'Balasore Defense & Coast', sub: 'Balasore, Odisha', lat: 21.4934, lon: 86.9135, icon: '🛡️' },
    { name: 'Gosaba & Sunderbans Embankment', sub: 'South 24 Parganas, West Bengal', lat: 22.1653, lon: 88.8021, icon: '🐅' },
    { name: 'Sagar Island South Coast', sub: 'South 24 Parganas, West Bengal', lat: 21.6420, lon: 88.0850, icon: '🏝️' },
    { name: 'Kakdwip Marine Flood Transit', sub: 'South 24 Parganas, West Bengal', lat: 21.8750, lon: 88.1880, icon: '📍' },
    { name: 'Digha Coastal Seafront', sub: 'East Medinipur, West Bengal', lat: 21.6260, lon: 87.5070, icon: '🌊' }
  ];

  let searchTimeout = null;

  function performSearch(query) {
    const term = query.trim().toLowerCase();
    if (!term || term.length < 2) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
      return;
    }

    // 1. Instant local index search
    const localMatches = [];

    // Search shelters
    (state.sheltersData || shelters).forEach(s => {
      if (s.name.toLowerCase().includes(term) || (s.region && s.region.toLowerCase().includes(term))) {
        localMatches.push({ name: s.name, sub: `Cyclone Shelter • Capacity: ${s.capacity} • ${s.region}`, lat: s.lat, lon: s.lng, icon: '🏢' });
      }
    });

    // Search assets
    (state.assets || fleetAssets).forEach(a => {
      if (a.name.toLowerCase().includes(term) || a.id.toLowerCase().includes(term) || (a.loc && a.loc.toLowerCase().includes(term))) {
        let assetIcon = '🚤';
        if (a.type === 'Heavy Vehicle') assetIcon = '🚛';
        else if (a.type === 'UAV Drone') assetIcon = '🛸';
        else if (a.type === 'Aviation') assetIcon = '🚁';
        localMatches.push({ name: `${a.name} (${a.id})`, sub: `${a.unit} • ${a.loc}`, lat: a.lat, lon: a.lng, icon: assetIcon });
      }
    });

    // Search built-in disaster cities & points
    builtInLocations.forEach(loc => {
      if (loc.name.toLowerCase().includes(term) || loc.sub.toLowerCase().includes(term)) {
        localMatches.push({ name: loc.name, sub: loc.sub, lat: loc.lat, lon: loc.lon, icon: loc.icon || '📍' });
      }
    });

    // Render instant local matches first
    if (localMatches.length > 0) {
      renderSearchResults(localMatches.slice(0, 6));
    }

    // 2. Query OSM Nominatim in background
    if (searchTimeout) clearTimeout(searchTimeout);
    if (spinner) spinner.style.display = 'block';

    searchTimeout = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(term)}&countrycodes=in&limit=5`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const apiPlaces = await res.json();
          const combined = [...localMatches];
          apiPlaces.forEach(p => {
            const parts = p.display_name.split(',');
            combined.push({
              name: parts[0],
              sub: parts.slice(1, 4).join(', '),
              lat: parseFloat(p.lat),
              lon: parseFloat(p.lon),
              icon: '🌐'
            });
          });
          renderSearchResults(combined.slice(0, 7));
        }
      } catch (err) {
        console.warn('Nominatim network query skipped, using local index:', err);
      } finally {
        if (spinner) spinner.style.display = 'none';
      }
    }, 300);
  }

  searchInput.addEventListener('input', (e) => {
    performSearch(e.target.value);
    if (clearBtn) clearBtn.style.display = e.target.value.length > 0 ? 'block' : 'none';
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstItem = searchResults.querySelector('.gis-search-item');
      if (firstItem) firstItem.click();
    }
  });

  function renderSearchResults(places) {
    if (!places || places.length === 0) {
      searchResults.innerHTML = `<div class="gis-search-item"><span class="text-xs text-muted">No tactical locations found</span></div>`;
      searchResults.classList.remove('hidden');
      return;
    }

    searchResults.innerHTML = places.map(p => `
      <div class="gis-search-item" data-lat="${p.lat}" data-lng="${p.lon}" data-name="${escapeHtml(p.name)}">
        <span class="gis-search-item-icon">${p.icon || '📍'}</span>
        <div class="gis-search-item-main">
          <div class="gis-search-item-name">${p.name}</div>
          <div class="gis-search-item-sub">${p.sub}</div>
        </div>
      </div>
    `).join('');

    searchResults.classList.remove('hidden');

    searchResults.querySelectorAll('.gis-search-item').forEach(item => {
      item.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const lat = parseFloat(item.dataset.lat);
        const lng = parseFloat(item.dataset.lon);
        const name = item.dataset.name;

        if (state.map && !isNaN(lat) && !isNaN(lng)) {
          state.map.flyTo([lat, lng], 13, { duration: 1.5 });

          const nearestShelter = findNearestShelter(lat, lng);
          const nearestAsset = findNearestAsset(lat, lng);

          const searchMarker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-map-marker-wrap',
              html: `<div class="custom-map-pin danger-pin"><span>📍</span><span>${name.toUpperCase()}</span></div>`,
              iconSize: null
            })
          }).addTo(state.map).bindPopup(`
            <div class="tactical-popup">
              <div class="tac-popup-head head-emerald">
                <span class="tac-popup-tag">📍 SEARCH PINPOINT</span>
                <span class="tac-popup-id font-mono">GRID-LOC</span>
              </div>
              <div class="tac-popup-body">
                <div class="tac-popup-title font-bold">${name}</div>
                <div class="tac-popup-metrics">
                  <div>Grid Coordinates: <strong class="font-mono">${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E</strong></div>
                  ${nearestShelter ? `<div>Nearest Shelter: <strong class="text-saffron">${nearestShelter.name} (${nearestShelter.distanceKm} km)</strong></div>` : ''}
                  ${nearestAsset ? `<div>Nearest NDRF: <strong class="text-emerald">${nearestAsset.name} (${nearestAsset.distanceKm} km)</strong></div>` : ''}
                </div>
                <div class="tac-popup-actions">
                  ${nearestShelter ? `<button class="tac-action-btn btn-saffron-action" onclick="window.routeToShelter(${nearestShelter.lat}, ${nearestShelter.lng}, '${escapeHtml(nearestShelter.name)}')">🛣️ Route to Shelter</button>` : ''}
                </div>
              </div>
            </div>
          `).openPopup();

          if (state.customPinsGroup) state.customPinsGroup.addLayer(searchMarker);
          searchResults.classList.add('hidden');
        }
      };
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      searchInput.value = '';
      clearBtn.style.display = 'none';
      searchResults.classList.add('hidden');
      searchInput.focus();
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#gis-search-container')) {
      searchResults.classList.add('hidden');
    }
  });
}

// =========================================================================
// MAIN TACTICAL LEAFLET GIS MAP INITIALIZATION
// =========================================================================
function initGISMap() {
  const mapElement = getEl('gis-map');
  if (!mapElement || state.mapInitialized) return;

  try {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path fill="%23E53935" stroke="%23000" stroke-width="2" d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12z"/><circle fill="%23FFF" cx="12" cy="12" r="5"/></svg>',
      iconRetinaUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path fill="%23E53935" stroke="%23000" stroke-width="2" d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12z"/><circle fill="%23FFF" cx="12" cy="12" r="5"/></svg>',
      shadowUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 12" width="36" height="12"><ellipse cx="18" cy="6" rx="14" ry="4" fill="rgba(0,0,0,0.3)"/></svg>',
      iconSize: [24, 36],
      iconAnchor: [12, 36],
      popupAnchor: [0, -32]
    });

    const map = L.map('gis-map', {
      center: [20.65, 86.85],
      zoom: 9,
      zoomControl: false,
      attributionControl: true
    });

    state.map = map;
    state.mapInitialized = true;
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // =======================================================================
    // 1. BASE MAP TILE LAYERS
    // =======================================================================
    const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors | NDMA GIS / IMD Telemetry',
      maxZoom: 19,
      crossOrigin: true
    }).addTo(map);

    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
      crossOrigin: true
    });

    const osmHumanitarian = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors, Humanitarian OSM',
      maxZoom: 19,
      crossOrigin: true
    });

    const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: 'Map: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors, SRTM | Style: &copy; OpenTopoMap',
      maxZoom: 17,
      crossOrigin: true
    });

    state.baseMaps = {
      "OpenStreetMap (Standard)": osmStandard,
      "ESRI Satellite (World Imagery)": esriSatellite,
      "OSM Humanitarian (HOT)": osmHumanitarian,
      "OpenTopoMap (Topography)": openTopo
    };

    L.control.layers(state.baseMaps, null, { position: 'topright', collapsed: true }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false, metric: true }).addTo(map);

    // =======================================================================
    // 2. LAYER GROUPS INITIALIZATION
    // =======================================================================
    state.radarGroup = L.layerGroup().addTo(map);
    state.floodGroup = L.layerGroup().addTo(map);
    state.evacGroup = L.layerGroup().addTo(map);
    state.sheltersGroup = L.layerGroup().addTo(map);
    state.assetsGroup = L.layerGroup().addTo(map);
    state.sosGroup = L.layerGroup().addTo(map);
    state.incidentsGroup = L.layerGroup().addTo(map);
    state.dangerZonesGroup = L.layerGroup().addTo(map);
    state.customPinsGroup = L.layerGroup().addTo(map);

    // =======================================================================
    // 3. DOPPLER RADAR CONCENTRIC STORM BANDS
    // =======================================================================
    const stormCenter = [20.2, 87.2];

    const radarRing1 = L.circle(stormCenter, {
      radius: 35000,
      color: '#E53935',
      fillColor: '#E53935',
      fillOpacity: 0.25,
      weight: 3
    }).bindPopup(`
      <div class="tactical-popup">
        <div class="tac-popup-head head-danger">
          <span class="tac-popup-tag">DOPPLER RADAR TELEMETRY</span>
          <span class="tac-popup-id font-mono">DANA-CORE</span>
        </div>
        <div class="tac-popup-body">
          <div class="tac-popup-title font-bold">CYCLONE DANA (CORE GALE ZONE)</div>
          <div class="tac-popup-metrics">
            <div>Sustained Core Winds: <strong class="text-alert">125 km/h</strong></div>
            <div>Peak Gusts: <strong class="text-alert">145 km/h</strong></div>
            <div>Central Pressure: <strong>978 hPa</strong></div>
            <div>Doppler Station: Paradip Coastal Radar</div>
          </div>
          <div class="tac-popup-coords font-mono text-xs"> 20.2000° N, 87.2000° E</div>
        </div>
      </div>
    `);

    const radarRing2 = L.circle(stormCenter, {
      radius: 70000,
      color: '#FF6F00',
      fillColor: '#FF6F00',
      fillOpacity: 0.14,
      weight: 2
    }).bindPopup(`
      <div class="tactical-popup">
        <div class="tac-popup-head head-saffron">
          <span class="tac-popup-tag">DOPPLER RADAR TELEMETRY</span>
          <span class="tac-popup-id font-mono">DANA-SQUALL</span>
        </div>
        <div class="tac-popup-body">
          <div class="tac-popup-title font-bold">CYCLONE DANA (HIGH SQUALL ZONE)</div>
          <div class="tac-popup-metrics">
            <div>Squall Winds: <strong class="text-saffron">90 - 110 km/h</strong></div>
            <div>Rainfall Rate: <strong>35 mm/hr</strong></div>
            <div>Radius: 70 km Coastal Swell Band</div>
          </div>
        </div>
      </div>
    `);

    const radarRing3 = L.circle(stormCenter, {
      radius: 110000,
      color: '#FFD600',
      fillColor: '#FFD600',
      fillOpacity: 0.06,
      weight: 1
    }).bindPopup(`
      <div class="tactical-popup">
        <div class="tac-popup-head">
          <span class="tac-popup-tag">DOPPLER RADAR TELEMETRY</span>
          <span class="tac-popup-id font-mono">DANA-OUTER</span>
        </div>
        <div class="tac-popup-body">
          <div class="tac-popup-title font-bold">CYCLONE DANA (OUTER SPIRAL RAINBAND)</div>
          <div class="tac-popup-metrics">
            <div>Outer Winds: <strong>65 - 80 km/h</strong></div>
            <div>Rainfall: Moderate to Heavy Inundation</div>
            <div>Radius: 110 km Synoptic Swath</div>
          </div>
        </div>
      </div>
    `);

    state.radarGroup.addLayer(radarRing1);
    state.radarGroup.addLayer(radarRing2);
    state.radarGroup.addLayer(radarRing3);

    // =======================================================================
    // 4. MANDATORY EVACUATION ZONE POLYGON
    // =======================================================================
    const evacPolygonCoords = [
      [20.85, 86.85],
      [20.90, 87.05],
      [20.65, 87.10],
      [20.45, 86.80],
      [20.55, 86.65]
    ];
    const evacPoly = L.polygon(evacPolygonCoords, {
      color: '#DC2626',
      fillColor: '#DC2626',
      fillOpacity: 0.30,
      weight: 3,
      dashArray: '6, 6'
    }).bindPopup(`
      <div class="tactical-popup">
        <div class="tac-popup-head head-danger">
          <span class="tac-popup-tag">MANDATORY EVACUATION ZONE</span>
          <span class="tac-popup-id font-mono">SECTOR 4 & 5</span>
        </div>
        <div class="tac-popup-body">
          <div class="tac-popup-title font-bold">Coastal Sectors 4 & 5 (Dhamra / Rajnagar)</div>
          <div class="tac-popup-desc">Evacuation enforced under Disaster Management Act 2005. High storm surge vulnerability.</div>
          <div class="tac-popup-metrics">
            <div>Target Population: <strong>43,000</strong></div>
            <div>Evacuated to MCS: <strong class="text-emerald">86.4% (37,150)</strong></div>
            <div>Remaining in Zone: <strong class="text-alert">5,850</strong></div>
          </div>
        </div>
      </div>
    `);
    state.evacGroup.addLayer(evacPoly);

    // =======================================================================
    // 5. GEOJSON DISASTER RISK POLYGONS
    // =======================================================================
    renderScenarioRiskPolygons(state.scenario);

    // =======================================================================
    // 6. MULTI-PURPOSE CYCLONE SHELTERS
    // =======================================================================
    const sheltersToRender = state.sheltersData && state.sheltersData.length ? state.sheltersData : shelters;
    sheltersToRender.forEach(s => addShelterToGIS(s));

    // =======================================================================
    // 7. NDRF & COAST GUARD FLEET ASSET MARKERS
    // =======================================================================
    const assetsToRender = state.assets && state.assets.length ? state.assets : fleetAssets;
    assetsToRender.forEach(asset => {
      if (!asset.lat || !asset.lng) return;

      let iconEmoji = '🚤';
      let pinClass = 'boat-pin';
      if (asset.type === 'Water Rescue') iconEmoji = '🚤';
      else if (asset.type === 'Heavy Vehicle') { iconEmoji = '🚛'; pinClass = 'truck-pin'; }
      else if (asset.type === 'UAV Drone') { iconEmoji = '🛸'; pinClass = 'drone-pin'; }
      else if (asset.type === 'Aviation') { iconEmoji = '🚁'; pinClass = 'helo-pin'; }

      const nearestSos = findNearestSosOrIncident(asset.lat, asset.lng);

      const icon = L.divIcon({
        className: 'custom-map-marker-wrap',
        html: `<div class="custom-map-pin ${pinClass}" title="${asset.name}">
          <span>${iconEmoji}</span>
          <span>${asset.id}</span>
        </div>`,
        iconSize: null
      });

      const marker = L.marker([asset.lat, asset.lng], { icon }).bindPopup(`
        <div class="tactical-popup">
          <div class="tac-popup-head head-emerald">
            <span class="tac-popup-tag">🚨 NDRF / RESCUE ASSET</span>
            <span class="tac-popup-id font-mono">${asset.id}</span>
          </div>
          <div class="tac-popup-body">
            <div class="tac-popup-title font-bold">${asset.name}</div>
            <div class="tac-popup-metrics">
              <div>Unit: <strong>${asset.unit}</strong></div>
              <div>Operational Status: <strong class="text-emerald">${asset.status}</strong></div>
              <div>Stationed Base: <strong>${asset.loc}</strong></div>
              <div>Crew: <strong>${asset.crew} Personnel</strong></div>
              ${asset.battery ? `<div>Telemetry Battery: <strong>${asset.battery}</strong></div>` : ''}
              ${asset.fuel ? `<div>Fuel Level: <strong>${asset.fuel}</strong></div>` : ''}
              ${nearestSos ? `<div>Nearest Incident/SOS: <strong class="text-alert">${nearestSos.id} (${nearestSos.distanceKm} km)</strong></div>` : ''}
            </div>
            <div class="tac-popup-coords font-mono text-xs">📍 ${asset.lat.toFixed(4)}° N, ${asset.lng.toFixed(4)}° E</div>
            ${nearestSos ? `
              <div class="tac-popup-actions">
                <button class="tac-action-btn btn-emerald-action" onclick="window.dispatchToSos('${nearestSos.id}', ${nearestSos.lat}, ${nearestSos.lng})">🚨 Dispatch to ${nearestSos.id}</button>
              </div>
            ` : ''}
          </div>
        </div>
      `);

      asset._marker = marker;
      state.assetsGroup.addLayer(marker);
    });

    // =======================================================================
    // 8. CITIZEN SOS DISTRESS QUEUE MARKERS
    // =======================================================================
    const sosToRender = state.sosList && state.sosList.length ? state.sosList : citizenSosQueue;
    sosToRender.forEach(sos => {
      if (!sos.lat || !sos.lng) return;

      const nearestShelter = findNearestShelter(sos.lat, sos.lng);
      const nearestNDRF = findNearestAsset(sos.lat, sos.lng);

      const icon = L.divIcon({
        className: 'custom-map-marker-wrap',
        html: `<div class="custom-map-pin sos-pin" title="Citizen SOS: ${sos.name}">
          <span>🆘</span>
          <span>${sos.id} • ${sos.name.split(' ')[0]}</span>
        </div>`,
        iconSize: null
      });

      const marker = L.marker([sos.lat, sos.lng], { icon }).bindPopup(`
        <div class="tactical-popup">
          <div class="tac-popup-head head-danger">
            <span class="tac-popup-tag">🆘 CITIZEN SOS QUEUE</span>
            <span class="tac-popup-id font-mono">${sos.id} • ${sos.time}</span>
          </div>
          <div class="tac-popup-body">
            <div class="tac-popup-title font-bold">${sos.name}</div>
            <div class="tac-popup-desc">"${sos.msg}"</div>
            <div class="tac-popup-metrics">
              <div>Location: <strong>${sos.location}</strong></div>
              <div>Urgency: <strong class="text-alert">${sos.urgency}</strong></div>
              <div>Assigned Unit: <strong>${sos.assignedUnit}</strong></div>
              ${nearestShelter ? `<div>Nearest Shelter: <strong class="text-saffron">${nearestShelter.name} (${nearestShelter.distanceKm} km)</strong></div>` : ''}
              ${nearestNDRF ? `<div>Nearest NDRF: <strong class="text-emerald">${nearestNDRF.name} (${nearestNDRF.distanceKm} km)</strong></div>` : ''}
            </div>
            <div class="tac-popup-coords font-mono text-xs">📍 ${sos.lat.toFixed(4)}° N, ${sos.lng.toFixed(4)}° E</div>
            <div class="tac-popup-actions">
              <button class="tac-action-btn btn-emerald-action" onclick="window.dispatchToSos('${sos.id}', ${sos.lat}, ${sos.lng})">🚨 Dispatch NDRF</button>
              <button class="tac-action-btn btn-saffron-action" onclick="window.routeSosToShelter(${sos.lat}, ${sos.lng}, '${sos.id}')">🏃 Evac Route</button>
            </div>
          </div>
        </div>
      `);

      sos._marker = marker;
      state.sosGroup.addLayer(marker);
    });

    // =======================================================================
    // 9. CHRONO INCIDENT HOTSPOT MARKERS
    // =======================================================================
    const incidentsToRender = state.incidents && state.incidents.length ? state.incidents : chronoIncidents;
    incidentsToRender.forEach(inc => {
      if (!inc.lat || !inc.lng) return;

      const nearestShelter = findNearestShelter(inc.lat, inc.lng);
      const nearestNDRF = findNearestAsset(inc.lat, inc.lng);

      const icon = L.divIcon({
        className: 'custom-map-marker-wrap',
        html: `<div class="custom-map-pin incident-pin" title="${inc.title}">
          <span>⚠️</span>
          <span>${inc.id}</span>
        </div>`,
        iconSize: null
      });

      const marker = L.marker([inc.lat, inc.lng], { icon }).bindPopup(`
        <div class="tactical-popup">
          <div class="tac-popup-head ${inc.severity === 'CRITICAL' ? 'head-danger' : 'head-saffron'}">
            <span class="tac-popup-tag">⚠️ ${inc.section} INCIDENT</span>
            <span class="tac-popup-id font-mono">${inc.id} • ${inc.time}</span>
          </div>
          <div class="tac-popup-body">
            <div class="tac-popup-title font-bold">${inc.title}</div>
            <div class="tac-popup-desc">${inc.details}</div>
            <div class="tac-popup-metrics">
              <div>Location: <strong>${inc.location}</strong></div>
              <div>Severity: <strong class="${inc.severity === 'CRITICAL' ? 'text-alert' : 'text-saffron'}">${inc.severity}</strong></div>
              <div>Status: <strong class="text-emerald">${inc.status}</strong></div>
              ${nearestShelter ? `<div>Nearest Shelter: <strong class="text-saffron">${nearestShelter.name} (${nearestShelter.distanceKm} km)</strong></div>` : ''}
              ${nearestNDRF ? `<div>Nearest NDRF: <strong class="text-emerald">${nearestNDRF.name} (${nearestNDRF.distanceKm} km)</strong></div>` : ''}
            </div>
            <div class="tac-popup-coords font-mono text-xs">📍 ${inc.lat.toFixed(4)}° N, ${inc.lng.toFixed(4)}° E</div>
          </div>
        </div>
      `);

      inc._marker = marker;
      state.incidentsGroup.addLayer(marker);
    });

    // =======================================================================
    // 10. INTERACTIVE DROP PIN & DANGER ZONE MAP CLICK & DRAW LISTENER
    // =======================================================================
    function updateGuidanceBanner(icon, title, msg, metric = null, isPin = false) {
      const banner = getEl('gis-draw-guidance');
      const iconEl = getEl('guidance-icon');
      const titleEl = getEl('guidance-title');
      const msgEl = getEl('guidance-msg');
      const metricEl = getEl('guidance-metric');
      if (!banner) return;
      if (iconEl) iconEl.innerText = icon;
      if (titleEl) titleEl.innerText = title;
      if (msgEl) msgEl.innerText = msg;
      if (metricEl) {
        if (metric) {
          metricEl.innerText = metric;
          metricEl.style.display = 'inline-block';
        } else {
          metricEl.style.display = 'none';
        }
      }
      banner.classList.toggle('mode-pin', isPin);
      banner.classList.remove('hidden');
    }

    function hideGuidanceBanner() {
      const banner = getEl('gis-draw-guidance');
      if (banner) banner.classList.add('hidden');
    }

    function cleanupDangerDrawing() {
      if (state.dangerDrawState) {
        if (state.dangerDrawState.previewCircle && state.map) {
          state.map.removeLayer(state.dangerDrawState.previewCircle);
        }
        if (state.dangerDrawState.previewLine && state.map) {
          state.map.removeLayer(state.dangerDrawState.previewLine);
        }
        if (state.dangerDrawState.previewMarker && state.map) {
          state.map.removeLayer(state.dangerDrawState.previewMarker);
        }
        state.dangerDrawState = null;
      }
    }

    function cancelActiveGisModes() {
      cleanupDangerDrawing();
      state.drawDangerMode = false;
      state.dropPinMode = false;
      getEl('gis-map')?.classList.remove('drawing-mode');
      getEl('draw-danger-zone-btn')?.classList.remove('chip-active');
      getEl('drop-pin-tool-btn')?.classList.remove('chip-active');
      hideGuidanceBanner();
    }

    const cancelGisModeBtn = getEl('cancel-gis-mode-btn');
    if (cancelGisModeBtn) {
      cancelGisModeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cancelActiveGisModes();
        showToast('Operation Cancelled');
      };
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.drawDangerMode || state.dropPinMode) {
          cancelActiveGisModes();
          showToast('Mode Cancelled (ESC)');
        }
      }
    });

    const dropPinBtn = getEl('drop-pin-tool-btn');
    if (dropPinBtn) {
      dropPinBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        sound.playClick();
        if (state.dropPinMode) {
          cancelActiveGisModes();
          showToast('Drop Pin Mode: CANCELLED');
        } else {
          cancelActiveGisModes();
          state.dropPinMode = true;
          dropPinBtn.classList.add('chip-active');
          getEl('gis-map')?.classList.add('drawing-mode');
          updateGuidanceBanner('📍', 'DROP PIN MODE ACTIVE', 'Click on map to drop tactical pin & auto-route to closest shelter', null, true);
          showToast('📍 Drop Pin Mode: Click on map to place a pin (Press ESC to cancel)');
        }
      };
    }

    const drawDangerBtn = getEl('draw-danger-zone-btn');
    if (drawDangerBtn) {
      drawDangerBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        sound.playClick();
        if (state.drawDangerMode) {
          cancelActiveGisModes();
          showToast('Danger Zone Drawing: CANCELLED');
        } else {
          cancelActiveGisModes();
          state.drawDangerMode = true;
          state.dangerDrawState = { step: 'CENTER', center: null, previewCircle: null, previewLine: null, previewMarker: null };
          drawDangerBtn.classList.add('chip-active');
          getEl('gis-map')?.classList.add('drawing-mode');
          updateGuidanceBanner('🔴', 'DANGER ZONE DRAWING ACTIVE', 'Step 1: Click on map to set Circle Center');
          showToast('🔴 Danger Zone Drawing: Click on map to set circle center (Press ESC to cancel)');
        }
      };
    }

    map.on('mousemove', (e) => {
      if (state.drawDangerMode && state.dangerDrawState && state.dangerDrawState.step === 'RADIUS' && state.dangerDrawState.center) {
        const center = state.dangerDrawState.center;
        const currentLatLng = e.latlng;
        const distMeters = center.distanceTo(currentLatLng);
        const radiusMeters = Math.max(100, Math.round(distMeters));
        const radiusKm = (radiusMeters / 1000).toFixed(1);
        const areaSqKm = (Math.PI * Math.pow(radiusMeters / 1000, 2)).toFixed(1);

        if (state.dangerDrawState.previewCircle) {
          state.dangerDrawState.previewCircle.setRadius(radiusMeters);
        }
        if (state.dangerDrawState.previewLine) {
          state.dangerDrawState.previewLine.setLatLngs([center, currentLatLng]);
        }
        updateGuidanceBanner('🔴', 'SET DANGER ZONE RADIUS', 'Step 2: Move mouse to set radius, then click to finalize', `RADIUS: ${radiusKm} KM (${areaSqKm} km²)`);
      }
    });

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;

      // Handle Interactive 2-Step Danger Zone Drawing
      if (state.drawDangerMode) {
        if (!state.dangerDrawState || state.dangerDrawState.step === 'CENTER') {
          // STEP 1: Center selected
          const center = e.latlng;
          state.dangerDrawState = {
            step: 'RADIUS',
            center: center,
            previewMarker: L.circleMarker(center, {
              radius: 6,
              color: '#FFFFFF',
              fillColor: '#DC2626',
              fillOpacity: 1,
              weight: 2
            }).addTo(map),
            previewCircle: L.circle(center, {
              radius: 500,
              color: '#DC2626',
              fillColor: '#DC2626',
              fillOpacity: 0.32,
              weight: 3,
              dashArray: '6, 6'
            }).addTo(map),
            previewLine: L.polyline([center, center], {
              color: '#F87171',
              weight: 2,
              dashArray: '4, 4'
            }).addTo(map)
          };
          sound.playClick();
          updateGuidanceBanner('🔴', 'SET DANGER ZONE RADIUS', 'Step 2: Move mouse outward to expand radius, then click to confirm', 'RADIUS: 0.5 KM');
          showToast('Center set! Move mouse to size radius and click to finalize.');
          return;
        } else if (state.dangerDrawState.step === 'RADIUS') {
          // STEP 2: Radius finalized
          const center = state.dangerDrawState.center;
          const distMeters = center.distanceTo(e.latlng);
          const finalRadiusKm = Math.max(0.2, parseFloat((distMeters / 1000).toFixed(1)));

          cleanupDangerDrawing();
          state.drawDangerMode = false;
          getEl('gis-map')?.classList.remove('drawing-mode');
          drawDangerBtn?.classList.remove('chip-active');
          hideGuidanceBanner();

          declareDangerZone(center.lat, center.lng, finalRadiusKm, 'IMPACT DANGER ZONE', 'CRITICAL', 'Mandatory evacuation enforced under Disaster Management Act 2005 §30.');
          return;
        }
      }

      // Handle Drop Pin Mode
      if (state.dropPinMode) {
        cancelActiveGisModes();
        sound.playCriticalAlert();

        const pinId = 'PIN-' + Date.now().toString().slice(-4);
        const nearestShelter = findNearestShelter(lat, lng);
        const nearestAsset = findNearestAsset(lat, lng);

        const initialPin = L.divIcon({
          className: 'custom-map-marker-wrap',
          html: `<div class="custom-map-pin danger-pin"><span class="pin-icon">📍</span><span class="pin-name">PINPOINT</span></div>`,
          iconSize: null
        });

        const marker = L.marker([lat, lng], { icon: initialPin });
        marker._pinId = pinId;
        state.customPinsGroup.addLayer(marker);
        state.lastDroppedPin = { id: pinId, lat, lng, marker };

        // Automatically plot shortest driving route to nearest shelter
        if (nearestShelter) {
          calculateAndDrawRoute([lat, lng], [nearestShelter.lat, nearestShelter.lng], `Tactical Pin ➔ ${nearestShelter.name}`, 'EVACUATION', pinId);
        }

        const buildPopupHtml = (title, details) => `
          <div class="tactical-popup">
            <div class="tac-popup-head head-danger">
              <span class="tac-popup-tag">TACTICAL HOTSPOT PIN</span>
              <span class="tac-popup-id font-mono">${pinId}</span>
            </div>
            <div class="tac-popup-body">
              <div class="tac-popup-title font-bold">${escapeHtml(title)}</div>
              <div class="tac-popup-desc">${escapeHtml(details)}</div>
              <div class="tac-popup-metrics">
                <div>Coordinates: <strong class="font-mono">${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E</strong></div>
                ${nearestShelter ? `<div>Nearest Shelter: <strong class="text-saffron">${escapeHtml(nearestShelter.name)} (${nearestShelter.distanceKm} km)</strong></div>` : ''}
                ${nearestAsset ? `<div>Nearest NDRF: <strong class="text-emerald">${escapeHtml(nearestAsset.name)} (${nearestAsset.distanceKm} km)</strong></div>` : ''}
              </div>
              <div class="tac-popup-actions">
                ${nearestShelter ? `
                  <button class="tac-action-btn btn-saffron-action" onclick="window.routeToShelter(${nearestShelter.lat}, ${nearestShelter.lng}, '${escapeHtml(nearestShelter.name)}')">🛣️ Re-Route to Shelter</button>
                ` : ''}
                <button class="tac-action-btn btn-danger-action" onclick="window.removeCustomPin('${pinId}')">✕ Remove / Cancel Pin</button>
              </div>
            </div>
          </div>
        `;

        marker.bindPopup(buildPopupHtml('Tactical Hotspot Pinpoint', `Fetching OpenStreetMap address telemetry for [${lat.toFixed(4)}, ${lng.toFixed(4)}]...`)).openPopup();

        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
          headers: { 'Accept': 'application/json' }
        })
          .then(res => res.json())
          .then(data => {
            const locality = data.address?.village || data.address?.town || data.address?.suburb || data.address?.city || data.address?.county || 'Tactical Sector';
            const fullAddress = data.display_name || `Grid [${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E]`;

            const updatedIcon = L.divIcon({
              className: 'custom-map-marker-wrap',
              html: `<div class="custom-map-pin danger-pin"><span>📍</span><span>${escapeHtml(locality.toUpperCase())}</span></div>`,
              iconSize: null
            });
            marker.setIcon(updatedIcon);
            marker.setPopupContent(buildPopupHtml(locality, fullAddress));

            showToast(`OSM Pin: ${locality} [${lat.toFixed(3)}, ${lng.toFixed(3)}] ➔ Route Active`);
            logActivity('GIS', `Tactical hotspot [${pinId}] pinned at ${locality} — Nearest shelter routed`);
          })
          .catch(err => {
            console.warn('Nominatim reverse geocode fallback:', err);
          });
      }
    });

    // =======================================================================
    // 11. NOMINATIM SEARCH BAR INITIALIZATION
    // =======================================================================
    initGisSearch();

    // =======================================================================
    // 12. ACTIVE ROUTE CLEAR BUTTON
    // =======================================================================
    const clearRouteBtn = getEl('clear-route-btn');
    if (clearRouteBtn) {
      clearRouteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        sound.playClick();
        clearActiveRoute();
      };
    }

    // =======================================================================
    // 13. TACTICAL GIS LEGEND COLLAPSIBLE CONTROLLER & CLICK PROPAGATION
    // =======================================================================
    const legendPanel = getEl('gis-legend-panel');
    const legendToggle = getEl('gis-legend-toggle');
    const legendBody = getEl('gis-legend-body');
    const legendChevron = getEl('legend-chevron');

    if (legendPanel && window.L && L.DomEvent) {
      L.DomEvent.disableClickPropagation(legendPanel);
      L.DomEvent.disableScrollPropagation(legendPanel);
    }

    if (legendToggle && legendBody) {
      legendToggle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        sound.playClick();
        const isCollapsed = legendBody.classList.toggle('collapsed');
        if (legendChevron) legendChevron.innerText = isCollapsed ? '▸' : '▾';
      };
    }

    // =======================================================================
    // 14. LAYER TOGGLES CONTROLLER (SYNCHRONOUS LAYERGROUPS)
    // =======================================================================
    function setupLayerToggle(btnId, layerGroup, label) {
      const btn = getEl(btnId);
      if (!btn) return;
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        sound.playClick();
        if (map.hasLayer(layerGroup)) {
          map.removeLayer(layerGroup);
          btn.classList.remove('chip-active');
          showToast(`${label}: OFF`);
        } else {
          map.addLayer(layerGroup);
          btn.classList.add('chip-active');
          showToast(`${label}: ON`);
        }
      };
    }

    setupLayerToggle('toggle-radar-btn', state.radarGroup, 'Doppler Radar Storm Bands');
    setupLayerToggle('toggle-flood-btn', state.floodGroup, 'GeoJSON Flood Risk Layer');
    setupLayerToggle('toggle-evac-btn', state.evacGroup, 'Evacuation Zones');
    setupLayerToggle('toggle-assets-btn', state.assetsGroup, 'NDRF / Rescue Fleet');
    setupLayerToggle('toggle-shelters-btn', state.sheltersGroup, 'Multi-Purpose Shelters');
    setupLayerToggle('toggle-incidents-btn', state.incidentsGroup, 'Chrono Incidents');
    setupLayerToggle('toggle-sos-btn', state.sosGroup, 'Citizen SOS Queue');

    // =======================================================================
    // 15. ADD SHELTER & DANGER ZONE MODAL TRIGGERS
    // =======================================================================
    const addShelterGisBtn = getEl('add-shelter-gis-btn');
    if (addShelterGisBtn) {
      addShelterGisBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        sound.playClick();
        const center = map.getCenter();
        const latInput = getEl('new-shelter-lat');
        const lngInput = getEl('new-shelter-lng');
        if (latInput) latInput.value = center.lat.toFixed(4);
        if (lngInput) lngInput.value = center.lng.toFixed(4);
        getEl('modal-shelter')?.classList.remove('hidden');
      };
    }

    // Modal close & save handlers for Danger Zone
    const dangerModal = getEl('modal-danger-zone');
    const closeDangerBtn = getEl('close-danger-modal');
    const cancelDangerBtn = getEl('cancel-danger-modal-btn');
    const saveDangerBtn = getEl('save-danger-zone-btn');
    const clickMapDangerBtn = getEl('click-map-danger-btn');

    const closeDangerModal = () => dangerModal?.classList.add('hidden');
    if (closeDangerBtn) closeDangerBtn.onclick = closeDangerModal;
    if (cancelDangerBtn) cancelDangerBtn.onclick = closeDangerModal;

    if (clickMapDangerBtn) {
      clickMapDangerBtn.onclick = (e) => {
        e.preventDefault();
        closeDangerModal();
        cancelActiveGisModes();
        state.drawDangerMode = true;
        state.dangerDrawState = { step: 'CENTER', center: null, previewCircle: null, previewLine: null, previewMarker: null };
        drawDangerBtn?.classList.add('chip-active');
        getEl('gis-map')?.classList.add('drawing-mode');
        updateGuidanceBanner('🔴', 'DANGER ZONE DRAWING ACTIVE', 'Step 1: Click on map to set Circle Center');
        showToast('🔴 Click on map to set Danger Zone Center', 'alert');
      };
    }

    if (saveDangerBtn) {
      saveDangerBtn.onclick = (e) => {
        e.preventDefault();
        const title = getEl('new-danger-title')?.value.trim() || 'IMPACT DANGER ZONE';
        const severity = getEl('new-danger-severity')?.value || 'CRITICAL';
        const radius = parseFloat(getEl('new-danger-radius')?.value) || 5;
        const lat = parseFloat(getEl('new-danger-lat')?.value);
        const lng = parseFloat(getEl('new-danger-lng')?.value);
        const directive = getEl('new-danger-directive')?.value.trim() || 'Immediate evacuation order under DMA 2005 §30.';

        if (isNaN(lat) || isNaN(lng)) {
          showToast('Please specify valid latitude and longitude coordinates');
          return;
        }

        declareDangerZone(lat, lng, radius, title, severity, directive);
        closeDangerModal();
        map.flyTo([lat, lng], 11, { duration: 1 });
      };
    }

  } catch (err) {
    console.error('Leaflet OpenStreetMap Map Init Error:', err);
  }
}

// =========================================================================
// LIVE TACTICAL RECON FEEDS & CANVAS ANIMATION SIMULATION ENGINE
// =========================================================================

let droneAnimationReq = null;
let activeInspectCam = '1';

function initDroneFeeds() {
  const droneModal = getEl('modal-drone-inspect');
  const closeDroneBtn = getEl('close-drone-modal');
  const toggleFlirBtn = getEl('toggle-flir-btn');
  const canvasContainer = getEl('inspect-video-canvas');
  let isFlir = false;

  const camDetails = {
    '1': {
      title: '📹 CAM 01 | PURI SEAFRONT (CCTV-04)',
      line1: 'SURGE HEIGHT: +3.28m | WIND: 118 KM/H GUSTS | VISIBILITY: 450m',
      line2: 'OPTICAL ZOOM: 4X | FPS: 30 | LATENCY: 0.08s | ENCRYPTION: AES-256',
      sector: 'SECTOR: PURI SEAFRONT & SWARGADWAR SEAWALL BARRIER'
    },
    '2': {
      title: '🛸 CAM 02 | NDRF UAV FALCON-9 (DHAMRA JETTY)',
      line1: 'ALTITUDE: 145m | AZIMUTH: 042° | GROUND SPEED: 38 km/h | BATT: 88%',
      line2: 'FLIR OPTICS: DUAL-SENSOR 4K | AUTO-SAR TARGET TRACKING: ACTIVE',
      sector: 'SECTOR: DHAMRA PORT JETTY CREEK SAR SWEEP'
    },
    '3': {
      title: '🏢 CAM 03 | KENDRAPARA MCS GATE-02 (THERMAL IR)',
      line1: 'HEADCOUNT TOTAL: 482 | QUEUE FLOW: 14 PAX/MIN | BODY TEMP: 36.6°C',
      line2: 'IR NIGHT-OPTIC SENSOR | AMBIENT: 27.2°C | FILTER: LONG-WAVE IR',
      sector: 'SECTOR: RAJNAGAR MCS EMERGENCY INGRESS GATE 02'
    }
  };

  function updateInspectHud(camId) {
    const detail = camDetails[camId] || camDetails['1'];
    const title = getEl('inspect-cam-title');
    const line1 = getEl('inspect-hud-line1');
    const line2 = getEl('inspect-hud-line2');
    const sector = getEl('inspect-hud-sector');

    if (title) title.innerText = detail.title;
    if (line1) line1.innerText = detail.line1;
    if (line2) line2.innerText = detail.line2;
    if (sector) sector.innerText = detail.sector;
  }

  document.querySelectorAll('.drone-card').forEach(card => {
    card.addEventListener('click', () => {
      sound.playClick();
      document.querySelectorAll('.drone-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      activeInspectCam = card.dataset.cam || '1';
      updateInspectHud(activeInspectCam);
      if (droneModal) droneModal.classList.remove('hidden');
    });
  });

  if (closeDroneBtn && droneModal) {
    closeDroneBtn.addEventListener('click', () => {
      sound.playClick();
      droneModal.classList.add('hidden');
    });
  }

  if (toggleFlirBtn && canvasContainer) {
    toggleFlirBtn.addEventListener('click', () => {
      sound.playClick();
      isFlir = !isFlir;
      canvasContainer.classList.toggle('flir-mode', isFlir);
      toggleFlirBtn.innerText = isFlir ? 'FLIR THERMAL: ON' : 'FLIR THERMAL: OFF';
      showToast(`FLIR Thermal Mode: ${isFlir ? 'ACTIVE (Hot Iron Spectrum)' : 'STANDBY (Visible Light)'}`);
    });
  }

  const printBtn = getEl('print-aar-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      sound.playClick();
      window.print();
    });
  }

  // Canvas Simulation Loop
  const canvas1 = getEl('drone-canvas-1');
  const canvas2 = getEl('drone-canvas-2');
  const canvas3 = getEl('drone-canvas-3');
  const inspectCanvas = getEl('drone-flir-canvas');

  let tick = 0;

  function drawCam1(ctx, w, h, isLarge, flir) {
    // CAM 1: Puri Seafront Surge CCTV
    tick++;
    ctx.clearRect(0, 0, w, h);

    // Background
    if (flir) {
      ctx.fillStyle = '#0a0d1f';
      ctx.fillRect(0, 0, w, h);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.45, '#1e293b');
      grad.addColorStop(1, '#0369a1');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // Dynamic wave swell layers
    const waves = 4;
    for (let i = 0; i < waves; i++) {
      ctx.beginPath();
      const baseY = h * 0.42 + i * (h * 0.15);
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const y = baseY +
          Math.sin((x * 0.025) + (tick * 0.04) + i * 1.5) * (6 + i * 4) +
          Math.cos((x * 0.015) - (tick * 0.02)) * (4 + i * 2);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();

      if (flir) {
        ctx.fillStyle = i === 0 ? 'rgba(59, 130, 246, 0.45)' :
                        i === 1 ? 'rgba(168, 85, 247, 0.55)' :
                        i === 2 ? 'rgba(234, 88, 12, 0.70)' :
                        'rgba(239, 68, 68, 0.85)';
      } else {
        ctx.fillStyle = i === 0 ? 'rgba(2, 132, 199, 0.45)' :
                        i === 1 ? 'rgba(3, 105, 161, 0.65)' :
                        i === 2 ? 'rgba(14, 116, 144, 0.80)' :
                        'rgba(15, 23, 42, 0.95)';
      }
      ctx.fill();
    }

    // Foam caps
    ctx.strokeStyle = flir ? 'rgba(254, 240, 138, 0.85)' : 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 12; x < w; x += 28) {
      const foamY = h * 0.52 + Math.sin((x * 0.03) + (tick * 0.04)) * 10;
      ctx.moveTo(x - 10, foamY);
      ctx.lineTo(x + 10, foamY - 1.5);
    }
    ctx.stroke();

    // Rain streaks / gale gusts
    ctx.strokeStyle = flir ? 'rgba(250, 204, 21, 0.25)' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    const drops = isLarge ? 40 : 12;
    for (let d = 0; d < drops; d++) {
      const rx = (Math.sin(tick * 0.08 + d * 17) * 0.5 + 0.5) * w;
      const ry = ((tick * 7 + d * 40) % h);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 10, ry + 15);
      ctx.stroke();
    }

    if (isLarge) {
      ctx.fillStyle = '#38BDF8';
      ctx.font = '11px monospace';
      const now = new Date();
      ctx.fillText(`REC ● [PURI SEAFRONT CCTV-04] ${now.toLocaleTimeString()} IST`, 16, 28);
      ctx.fillStyle = '#EF4444';
      ctx.fillText(`⚠️ WATER LEVEL: +3.28m (CRITICAL DANGER THRESHOLD EXCEEDED)`, 16, 48);

      // Target lock box
      const targetX = w * 0.58 + Math.sin(tick * 0.02) * 15;
      const targetY = h * 0.56 + Math.cos(tick * 0.02) * 8;
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(targetX - 35, targetY - 25, 70, 50);
      ctx.fillStyle = '#F59E0B';
      ctx.fillText('SEAWALL PIER 04', targetX - 35, targetY - 30);
    }
  }

  function drawCam2(ctx, w, h, isLarge, flir) {
    // CAM 2: NDRF UAV Falcon-9 (Dhamra Jetty Creek SAR Sweep)
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = flir ? '#0f172a' : '#06101e';
    ctx.fillRect(0, 0, w, h);

    // River creek channel
    ctx.beginPath();
    ctx.moveTo(0, h * 0.35);
    ctx.bezierCurveTo(w * 0.35, h * 0.45, w * 0.65, h * 0.25, w, h * 0.75);
    ctx.lineTo(w, h * 0.95);
    ctx.bezierCurveTo(w * 0.65, h * 0.50, w * 0.35, h * 0.65, 0, h * 0.55);
    ctx.closePath();
    ctx.fillStyle = flir ? 'rgba(234, 88, 12, 0.45)' : 'rgba(14, 116, 144, 0.55)';
    ctx.fill();

    // Radar cone / sweep
    const cx = w * 0.5;
    const cy = h * 0.5;
    const sweepAngle = (tick * 0.04) % (Math.PI * 2);
    const radius = Math.min(w, h) * 0.42;

    ctx.strokeStyle = flir ? 'rgba(251, 146, 60, 0.25)' : 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = flir ? 'rgba(251, 146, 60, 0.9)' : 'rgba(52, 211, 153, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * radius, cy + Math.sin(sweepAngle) * radius);
    ctx.stroke();

    // Moving SAR targets
    const targets = [
      { x: w * 0.36 + Math.sin(tick * 0.015) * 8, y: h * 0.46, label: 'BOAT #01 (STRANDED)' },
      { x: w * 0.68 + Math.cos(tick * 0.02) * 6, y: h * 0.38, label: 'GROUP 14 PAX (ROOF)' }
    ];

    targets.forEach((t) => {
      ctx.strokeStyle = flir ? '#EF4444' : '#38BDF8';
      ctx.lineWidth = 1.5;
      const bSize = isLarge ? 26 : 12;
      ctx.strokeRect(t.x - bSize/2, t.y - bSize/2, bSize, bSize);

      ctx.fillStyle = (tick % 30 < 15) ? (flir ? '#FEF08A' : '#34D399') : (flir ? '#DC2626' : '#0284C7');
      ctx.beginPath();
      ctx.arc(t.x, t.y, isLarge ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();

      if (isLarge) {
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '10px monospace';
        ctx.fillText(`[${t.label} 96%]`, t.x - 35, t.y - 18);
      }
    });

    if (isLarge) {
      // Artificial Horizon
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - 45, h * 0.5);
      ctx.lineTo(w * 0.5 - 15, h * 0.5);
      ctx.moveTo(w * 0.5 + 15, h * 0.5);
      ctx.lineTo(w * 0.5 + 45, h * 0.5);
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.font = '11px monospace';
      ctx.fillText(`UAV FALCON-9 | ALT: 145m | GS: 38 km/h | HDG: 042°`, 16, 28);
      ctx.fillText(`TELEMETRY GPS: 20.7885° N, 86.9580° E | BATT: 88%`, 16, 48);
    }
  }

  function drawCam3(ctx, w, h, isLarge, flir) {
    // CAM 3: Kendrapara MCS Gate-02 (Thermal Evac Inspection)
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = flir ? '#1e1b4b' : '#090d16';
    ctx.fillRect(0, 0, w, h);

    // Gate doorway frame
    ctx.strokeStyle = flir ? 'rgba(129, 140, 248, 0.45)' : 'rgba(71, 85, 105, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.18, h * 0.15, w * 0.64, h * 0.85);

    // People walking through gate
    const count = 5;
    for (let i = 0; i < count; i++) {
      const px = ((tick * 1.2 + i * (w * 0.18)) % (w * 0.65)) + w * 0.18;
      const py = h * 0.66 + Math.sin(tick * 0.1 + i) * 2;
      const pH = isLarge ? 48 : 22;
      const pW = isLarge ? 14 : 7;

      if (flir) {
        const radGrad = ctx.createRadialGradient(px, py - pH * 0.55, 2, px, py - pH * 0.55, pH * 0.75);
        radGrad.addColorStop(0, '#FFFFFF');
        radGrad.addColorStop(0.3, '#FEF08A');
        radGrad.addColorStop(0.65, '#EA580C');
        radGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = radGrad;
      } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
      }

      ctx.beginPath();
      ctx.arc(px, py - pH * 0.75, pW * 0.6, 0, Math.PI * 2);
      ctx.ellipse(px, py - pH * 0.32, pW * 0.75, pH * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isLarge) {
      ctx.fillStyle = flir ? '#F97316' : '#34D399';
      ctx.font = '11px monospace';
      ctx.fillText(`GATE-02 IR SENSOR | HEADCOUNT PROCESSED: 482`, 16, 28);
      ctx.fillText(`THERMAL BODY TEMP: 36.4°C - 37.1°C [HEALTH NOMINAL]`, 16, 48);

      // Temperature gradient bar
      const barX = w - 24;
      const barY = 32;
      const barH = h - 64;
      const tempGrad = ctx.createLinearGradient(0, barY, 0, barY + barH);
      tempGrad.addColorStop(0, '#FFFFFF');
      tempGrad.addColorStop(0.25, '#FEF08A');
      tempGrad.addColorStop(0.5, '#EA580C');
      tempGrad.addColorStop(0.75, '#9333EA');
      tempGrad.addColorStop(1, '#1E1B4B');
      ctx.fillStyle = tempGrad;
      ctx.fillRect(barX, barY, 12, barH);
      ctx.strokeStyle = '#FFFFFF';
      ctx.strokeRect(barX, barY, 12, barH);
    }
  }

  function loop() {
    // 1. Mini Card 1
    if (canvas1) {
      if (canvas1.width !== canvas1.clientWidth) {
        canvas1.width = canvas1.clientWidth || 260;
        canvas1.height = canvas1.clientHeight || 80;
      }
      const ctx1 = canvas1.getContext('2d');
      if (ctx1) drawCam1(ctx1, canvas1.width, canvas1.height, false, false);
    }

    // 2. Mini Card 2
    if (canvas2) {
      if (canvas2.width !== canvas2.clientWidth) {
        canvas2.width = canvas2.clientWidth || 260;
        canvas2.height = canvas2.clientHeight || 80;
      }
      const ctx2 = canvas2.getContext('2d');
      if (ctx2) drawCam2(ctx2, canvas2.width, canvas2.height, false, false);
    }

    // 3. Mini Card 3
    if (canvas3) {
      if (canvas3.width !== canvas3.clientWidth) {
        canvas3.width = canvas3.clientWidth || 260;
        canvas3.height = canvas3.clientHeight || 80;
      }
      const ctx3 = canvas3.getContext('2d');
      if (ctx3) drawCam3(ctx3, canvas3.width, canvas3.height, false, false);
    }

    // 4. Modal Large Canvas (if modal is open)
    if (droneModal && !droneModal.classList.contains('hidden') && inspectCanvas) {
      if (inspectCanvas.width !== inspectCanvas.clientWidth) {
        inspectCanvas.width = inspectCanvas.clientWidth || 640;
        inspectCanvas.height = inspectCanvas.clientHeight || 360;
      }
      const inspectCtx = inspectCanvas.getContext('2d');
      if (inspectCtx) {
        if (activeInspectCam === '1') drawCam1(inspectCtx, inspectCanvas.width, inspectCanvas.height, true, isFlir);
        else if (activeInspectCam === '2') drawCam2(inspectCtx, inspectCanvas.width, inspectCanvas.height, true, isFlir);
        else drawCam3(inspectCtx, inspectCanvas.width, inspectCanvas.height, true, isFlir);
      }
    }

    droneAnimationReq = requestAnimationFrame(loop);
  }

  if (droneAnimationReq) cancelAnimationFrame(droneAnimationReq);
  droneAnimationReq = requestAnimationFrame(loop);
}

// Modals Controller
function initModals() {
  // Add Incident Modal
  const addIncBtn = getEl('add-incident-btn');
  const incModal = getEl('modal-incident');
  const closeIncBtn = getEl('close-incident-modal');
  const cancelIncBtn = getEl('cancel-inc-btn');
  const saveIncBtn = getEl('save-inc-btn');

  if (addIncBtn && incModal) {
    addIncBtn.addEventListener('click', () => {
      sound.playClick();
      incModal.classList.remove('hidden');
    });
  }

  const closeIncModal = () => incModal && incModal.classList.add('hidden');
  if (closeIncBtn) closeIncBtn.addEventListener('click', closeIncModal);
  if (cancelIncBtn) cancelIncBtn.addEventListener('click', closeIncModal);

  if (saveIncBtn) {
    saveIncBtn.addEventListener('click', () => {
      const titleInput = getEl('new-inc-title');
      const sectionInput = getEl('new-inc-section');
      const severityInput = getEl('new-inc-severity');
      const locInput = getEl('new-inc-loc');
      const detailsInput = getEl('new-inc-details');

      const title = titleInput ? titleInput.value.trim() : '';
      const section = sectionInput ? sectionInput.value : 'OPS';
      const severity = severityInput ? severityInput.value : 'CRITICAL';
      const loc = locInput ? locInput.value.trim() : 'Dhamra Coastal Sector';
      const details = detailsInput ? detailsInput.value.trim() : 'Field report logged via EOC console.';

      if (!title) {
        alert('Please enter an incident title');
        return;
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';

      const newInc = {
        id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
        time: timeStr,
        section,
        severity,
        title,
        details,
        location: loc,
        status: 'LOGGED & DISPATCHED'
      };

      state.incidents.unshift(newInc);
      sound.playCriticalAlert();
      renderIncidents();
      closeIncModal();
      showToast(`NEW INCIDENT COMMITTED: ${title}`, 'alert');

      if (titleInput) titleInput.value = '';
      if (locInput) locInput.value = '';
      if (detailsInput) detailsInput.value = '';
    });
  }

  // Assign Officer Modal
  const assignModal = getEl('modal-assign-officer');
  const closeAssignBtn = getEl('close-assign-modal');
  const cancelAssignBtn = getEl('cancel-assign-btn');
  const confirmAssignBtn = getEl('confirm-assign-btn');

  const closeAssignModal = () => assignModal && assignModal.classList.add('hidden');
  if (closeAssignBtn) closeAssignBtn.addEventListener('click', closeAssignModal);
  if (cancelAssignBtn) cancelAssignBtn.addEventListener('click', closeAssignModal);

  if (confirmAssignBtn) {
    confirmAssignBtn.addEventListener('click', () => {
      const nameInput = getEl('assign-officer-name');
      const agencyInput = getEl('assign-officer-agency');

      const name = nameInput ? nameInput.value.trim() : 'Wing Commander S. Roy, IAF';
      const agency = agencyInput ? agencyInput.value.trim() : 'Indian Air Force Liaison';

      if (state.selectedRoleForAssign) {
        const { secName, branchName } = state.selectedRoleForAssign;
        const sec = state.icsTree.sections.find(s => s.name === secName);
        if (sec) {
          const branch = sec.branches.find(b => b.name === branchName);
          if (branch) {
            branch.lead = `${name} (${agency})`;
            branch.assigned = true;
          }
        }
        renderIcsRoster();
        sound.playClick();
        showToast(`APPOINTMENT CONFIRMED: ${name} as ${branchName}`);
      }
      closeAssignModal();
    });
  }

  // Register Asset Modal
  const addAssetBtn = getEl('add-asset-btn');
  const assetModal = getEl('modal-asset');
  const closeAssetBtn = getEl('close-asset-modal');
  const cancelAssetBtn = getEl('cancel-asset-btn');
  const saveAssetBtn = getEl('save-asset-btn');

  if (addAssetBtn && assetModal) {
    addAssetBtn.addEventListener('click', () => {
      sound.playClick();
      assetModal.classList.remove('hidden');
    });
  }

  const closeAssetModal = () => assetModal && assetModal.classList.add('hidden');
  if (closeAssetBtn) closeAssetBtn.addEventListener('click', closeAssetModal);
  if (cancelAssetBtn) cancelAssetBtn.addEventListener('click', closeAssetModal);

  if (saveAssetBtn) {
    saveAssetBtn.addEventListener('click', () => {
      const name = getEl('new-asset-name')?.value.trim() || 'High-Speed Zodiac 05';
      const type = getEl('new-asset-type')?.value || 'Water Rescue';
      const unit = getEl('new-asset-unit')?.value || 'NDRF 03 Bn';
      const loc = getEl('new-asset-loc')?.value.trim() || 'Chandbali Jetty';

      const newAsset = {
        id: `NDRF-AST-${Math.floor(100 + Math.random() * 900)}`,
        name,
        type,
        unit,
        status: 'AVAILABLE',
        loc,
        crew: 4
      };

      state.assets.unshift(newAsset);
      sound.playClick();
      renderAssets();
      closeAssetModal();
      showToast(`ASSET REGISTERED: ${name}`);
      logActivity('ASSET', `New asset registered: ${name} (${type}) — ${unit}`);
    });
  }

  // Damage & Corrective Action buttons
  const addDamageBtn = getEl('add-damage-btn');
  if (addDamageBtn) {
    addDamageBtn.addEventListener('click', () => {
      sound.playClick();
      const sector = prompt('Enter Sector Location (e.g. Soro Junction):', 'Soro NH-16 Sector');
      const damage = prompt('Enter Damage Details:', 'Culvert erosion with 0.8m standing water');
      if (sector && damage) {
        state.damageData.unshift({
          id: `DA-${Math.floor(100 + Math.random() * 900)}`,
          sector,
          type: 'Infrastructure / Highway',
          severity: 'MODERATE',
          damage,
          reportedBy: 'SDRF Highway Patrol',
          time: 'Just now'
        });
        renderDamageTable();
        showToast('Damage assessment recorded');
      }
    });
  }

  const addCapBtn = getEl('add-cap-btn');
  if (addCapBtn) {
    addCapBtn.addEventListener('click', () => {
      sound.playClick();
      const def = prompt('Enter Identified Deficiency:', 'Dhamra communication repeater battery drain.');
      const action = prompt('Enter Corrective Action:', 'Install auxiliary solar battery array at high school.');
      const lead = prompt('Enter Lead Agency:', 'Telecom / SDRF Comms');
      if (def && action) {
        state.correctiveActions.push({
          def,
          action,
          lead: lead || 'Operations',
          status: 'IN PROGRESS'
        });
        renderCorrectiveActions();
        showToast('Corrective action item logged');
      }
    });
  }
}

// Telemetry Ticker
function initTelemetryTicker() {
  setInterval(() => {
    const baseWind = 125;
    const currentWind = baseWind + Math.floor(Math.random() * 6 - 3);

    const windGauge = getEl('gauge-wind-val');
    const hudWind = getEl('hud-wind');
    if (windGauge) windGauge.innerHTML = `${currentWind} <small class="text-xs">km/h</small>`;
    if (hudWind) hudWind.innerText = `${currentWind} KM/H`;

    const groundIntel = getEl('ground-intel-text');
    if (groundIntel && Math.random() > 0.6) {
      const intelReports = [
        '<span class="text-alert font-bold">[VERIFIED SOS]:</span> Satbhaya creek breached. 14 families relocated to Kendrapara MCS. High-water dinghies requested.',
        '<span class="text-emerald font-bold">[ROAD CLEAR]:</span> NH-16 left lane cleared near Bhadrak by SDRF chainsaw team. Emergency convoys moving.',
        '<span class="text-saffron font-bold">[POWER GRID]:</span> 33kV auxiliary feeder energized at Balasore District Hospital.',
        '<span class="text-alert font-bold">[DRONE INTEL]:</span> High tide overtopping observed along Chandbali secondary embankment.'
      ];
      groundIntel.innerHTML = intelReports[Math.floor(Math.random() * intelReports.length)];
    }
  }, 4000);
}

// =========================================================================
// DEPENDENCY CRISIS & CRITICAL INFRASTRUCTURE CASCADE SIMULATOR
// =========================================================================
let depNodes = [];
let depEdges = [];
let depIdSeq = 1;
const DEP_COLORS = ['#5FA8D3', '#D8B24C', '#7FB88A', '#C1583A', '#9A7FC7', '#4FA98F', '#E39A6B', '#6FA8DC'];

const DEP_BASELINE_PLANS = {
  flood: {
    leadCapability: 'Water management & levee/dam embankment telemetry',
    evacuation: 'Elevation-based, timing-critical coastal/riverine corridor',
    dependencies: ['Upstream gauge & IMD rainfall telemetry', 'Coastal levee structural integrity', 'High-volume dewatering pump capacity'],
  },
  wildfire: {
    leadCapability: 'Fire suppression, helicopter air tankers & defensible perimeter',
    evacuation: 'Directional corridor, speed-critical route security',
    dependencies: ['Wind & humidity sensor feeds', 'Air tanker squadron availability', 'Comms relay tower integrity'],
  },
  earthquake: {
    leadCapability: 'Urban search & rescue (USAR) & structural damage triage',
    evacuation: 'Structural-safety-based, aftershock-aware multi-modal transit',
    dependencies: ['Building/bridge structural health assessments', 'District hospital trauma surge capacity', 'High-voltage grid & gas trunklines'],
  },
};

function depNewNode(overrides) {
  return Object.assign({
    id: 'n' + (depIdSeq++),
    label: 'Infrastructure Node',
    capacity: 100,
    recovery: 4,
    fragility: 0.5,
    threshStrained: 70,
    threshCritical: 40,
    threshFailed: 15,
    hazardType: 'none',
    hazardMag: 0,
    hazardStart: 0,
    hazardDuration: 10
  }, overrides);
}

// ===========================================================================
// HAZARD CLUSTER DEPENDENCY GRAPH ENGINE (32 IN-SCOPE HAZARDS, 4 CLUSTERS)
// ===========================================================================

const CLUSTER_META = {
  evacuation: {
    id: "evacuation",
    label: "Directional Evacuation",
    short: "Evacuation",
    icon: "",
    status: "ready",
    statusLabel: "Engine ready",
    blurb: "Existing cascade engine (hop-1 / hop-2), extended with threat-zone geometry — radial, directional, or point-then-radiating.",
  },
  threshold: {
    id: "threshold",
    label: "Sustained-Load / Threshold",
    short: "Threshold",
    icon: "",
    status: "blocked-engine",
    statusLabel: "New engine required",
    blurb: "Tiered escalation over time, not a discrete trigger to inject. Needs a threshold/attrition engine — the current cascade engine doesn't apply.",
  },
  containment: {
    id: "containment",
    label: "Point-Source Containment",
    short: "Containment",
    icon: "",
    status: "ready",
    statusLabel: "Engine ready",
    blurb: "Existing cascade engine — the closest fit of any cluster. One clear origin node rather than a moving or expanding threat zone.",
  },
  crowd: {
    id: "crowd",
    label: "Crowd / Security",
    short: "Crowd",
    icon: "",
    status: "blocked-research",
    statusLabel: "Blocked — research",
    blurb: "Needs the agent-based population model already flagged as an open research problem. Design-ready, not build-ready.",
  },
};

const CLUSTER_ORDER = ["evacuation", "threshold", "containment", "crowd"];

const EVAC_GENERIC = {
  nodes: [
    { id: "power", label: "Power Grid", icon: "zap", x: 130, y: 90 },
    { id: "comms", label: "Communications", icon: "radio", x: 400, y: 60 },
    { id: "roads", label: "Access Routes", icon: "route", x: 660, y: 90 },
    { id: "coord", label: "Evacuation Coordination", icon: "users", x: 250, y: 300 },
    { id: "relief", label: "Relief Teams", icon: "truck", x: 540, y: 300 },
    { id: "hospital", label: "Hospital Capacity", icon: "building", x: 395, y: 420 },
  ],
  edges: [
    { from: "power", to: "comms", w: 0.5 },
    { from: "power", to: "hospital", w: 0.4 },
    { from: "roads", to: "relief", w: 0.6 },
    { from: "roads", to: "coord", w: 0.3 },
    { from: "comms", to: "coord", w: 0.5 },
    { from: "comms", to: "relief", w: 0.5 },
    { from: "coord", to: "hospital", w: 0.3 },
    { from: "relief", to: "hospital", w: 0.4 },
  ],
  presets: [
    { id: "route_out", label: "Route Disabled", target: "roads", drop: 6, note: "Primary evacuation route disabled" },
    { id: "comms_out", label: "Comms Outage", target: "comms", drop: 7, note: "Regional communications failure" },
    { id: "coord_strain", label: "Coordination Strain", target: "coord", drop: 5, note: "Evacuation coordination overwhelmed" },
    { id: "power_fail", label: "Power Failure", target: "power", drop: 6, note: "Power grid failure in affected zone" },
  ],
};

const CONTAINMENT_GENERIC = {
  nodes: [
    { id: "origin", label: "Failure Origin", icon: "alert", x: 130, y: 90 },
    { id: "power", label: "Power Grid", icon: "zap", x: 400, y: 60 },
    { id: "comms", label: "Communications", icon: "radio", x: 660, y: 90 },
    { id: "transit", label: "Transportation Access", icon: "route", x: 250, y: 300 },
    { id: "specialist", label: "Specialist Response Readiness", icon: "wrench", x: 540, y: 300 },
    { id: "hospital", label: "Hospital Capacity", icon: "building", x: 395, y: 420 },
  ],
  edges: [
    { from: "origin", to: "power", w: 0.6 },
    { from: "origin", to: "comms", w: 0.3 },
    { from: "power", to: "hospital", w: 0.4 },
    { from: "power", to: "transit", w: 0.2 },
    { from: "comms", to: "specialist", w: 0.4 },
    { from: "transit", to: "specialist", w: 0.5 },
    { from: "specialist", to: "hospital", w: 0.4 },
    { from: "transit", to: "hospital", w: 0.3 },
  ],
  presets: [
    { id: "origin_trip", label: "Origin Trips", target: "origin", drop: 7, note: "Point-source failure triggered at origin" },
    { id: "power_surge", label: "Power Cascade", target: "power", drop: 6, note: "Cascading power disruption from origin" },
    { id: "comms_disrupt", label: "Comms Disrupted", target: "comms", drop: 5, note: "Communications relay affected by incident" },
    { id: "access_restricted", label: "Access Restricted", target: "transit", drop: 5, note: "Exclusion zone restricts transit access" },
  ],
};

const GENERIC_TEMPLATES = { evacuation: EVAC_GENERIC, containment: CONTAINMENT_GENERIC };

const FULL_BUILDS = {
  wildfire: {
    cluster: "evacuation",
    label: "Wildfire",
    nodes: [
      { id: "power", label: "Power Grid", icon: "zap", x: 130, y: 90 },
      { id: "comms", label: "Communications", icon: "radio", x: 400, y: 60 },
      { id: "roads", label: "Road Network", icon: "route", x: 660, y: 90 },
      { id: "crowd", label: "Crowd Control", icon: "users", x: 250, y: 300 },
      { id: "relief", label: "Relief Teams", icon: "truck", x: 540, y: 300 },
      { id: "hospital", label: "Hospital Capacity", icon: "building", x: 395, y: 420 },
    ],
    edges: [
      { from: "power", to: "comms", w: 0.5 },
      { from: "power", to: "hospital", w: 0.4 },
      { from: "roads", to: "relief", w: 0.6 },
      { from: "roads", to: "crowd", w: 0.3 },
      { from: "comms", to: "crowd", w: 0.5 },
      { from: "comms", to: "relief", w: 0.5 },
      { from: "crowd", to: "hospital", w: 0.3 },
      { from: "relief", to: "hospital", w: 0.4 },
    ],
    presets: [
      { id: "bridge", label: "Bridge Out", target: "roads", drop: 6, note: "Primary river crossing disabled" },
      { id: "comms_out", label: "Comms Outage", target: "comms", drop: 7, note: "Tower failure, sector 4" },
      { id: "surge", label: "Crowd Surge", target: "crowd", drop: 5, note: "Unplanned convergence at shelter A" },
      { id: "power_fail", label: "Power Failure", target: "power", drop: 6, note: "Substation trip, north grid" },
    ],
  },
  flood: {
    cluster: "evacuation",
    label: "Flood",
    nodes: [
      { id: "levee", label: "Levee / Dam Status", icon: "droplet", x: 130, y: 90 },
      { id: "comms", label: "Communications", icon: "radio", x: 400, y: 60 },
      { id: "roads", label: "Road Network", icon: "route", x: 660, y: 90 },
      { id: "evac", label: "Evacuation Coordination", icon: "users", x: 250, y: 300 },
      { id: "relief", label: "Relief Teams", icon: "truck", x: 540, y: 300 },
      { id: "hospital", label: "Hospital Capacity", icon: "building", x: 395, y: 420 },
    ],
    edges: [
      { from: "levee", to: "roads", w: 0.6 },
      { from: "levee", to: "evac", w: 0.4 },
      { from: "levee", to: "comms", w: 0.2 },
      { from: "roads", to: "relief", w: 0.5 },
      { from: "comms", to: "evac", w: 0.5 },
      { from: "comms", to: "relief", w: 0.4 },
      { from: "evac", to: "hospital", w: 0.3 },
      { from: "relief", to: "hospital", w: 0.4 },
    ],
    presets: [
      { id: "levee_breach", label: "Levee Breach", target: "levee", drop: 7, note: "Section 12 failure, rising water" },
      { id: "comms_flood", label: "Upstream Comms Loss", target: "comms", drop: 5, note: "Relay station flooded" },
      { id: "route_flood", label: "Evac Route Flooded", target: "roads", drop: 6, note: "Route 9 impassable" },
      { id: "evac_overwhelm", label: "Evac Overwhelmed", target: "evac", drop: 5, note: "Shelter intake exceeding capacity" },
    ],
  },
};

const HAZARDS_BY_CLUSTER = {
  evacuation: [
    { id: "wildfire", label: "Wildfire" },
    { id: "flood", label: "Flood" },
    { id: "earthquake", label: "Earthquake" },
    { id: "hurricane", label: "Hurricane / Cyclone / Typhoon" },
    { id: "tornado", label: "Tornado" },
    { id: "landslide", label: "Landslide / Mudslide" },
    { id: "volcano", label: "Volcanic Eruption" },
    { id: "tsunami", label: "Tsunami" },
    { id: "avalanche", label: "Avalanche" },
    { id: "damLevee", label: "Dam or Levee Failure" },
    { id: "coldwave", label: "Extreme Cold / Winter Storm" },
  ],
  threshold: [
    { id: "drought", label: "Drought" },
    { id: "heatwave", label: "Extreme Heat Wave" },
    { id: "outbreak", label: "Infectious Disease Outbreak" },
    { id: "pandemic", label: "Pandemic" },
    { id: "hospitalOverload", label: "Hospital System Overload" },
  ],
  containment: [
    { id: "powerGrid", label: "Power Grid Failure / Blackout" },
    { id: "transportation", label: "Major Transportation Failure" },
    { id: "telecom", label: "Telecommunications Outage" },
    { id: "industrial", label: "Industrial Accident" },
    { id: "nuclear", label: "Nuclear or Radiological Incident" },
    { id: "collapse", label: "Structural Collapse" },
    { id: "gasPipeline", label: "Gas Pipeline Failure / Explosion" },
    { id: "hazmat", label: "Hazardous Materials Spill" },
    { id: "fire", label: "Major Structural Fire (non-wildfire)" },
  ],
  crowd: [
    { id: "massCasualtyMedical", label: "Mass Casualty Medical Event" },
    { id: "activeThreat", label: "Mass Casualty / Active Threat Situation" },
    { id: "civilUnrest", label: "Large-Scale Civil Unrest" },
    { id: "terrorism", label: "Terrorism-Related Incident" },
    { id: "crowdCrush", label: "Stadium or Venue Crowd Crush" },
    { id: "publicEvent", label: "Large Public Event Emergency" },
    { id: "transitCrowd", label: "Transit Hub Crowd Emergency" },
  ],
};

function depStatusColor(v) {
  if (v >= 7) return "var(--emerald)";
  if (v >= 4) return "var(--gold)";
  return "var(--alert)";
}

function depStatusLabel(v) {
  if (v >= 7) return "Nominal";
  if (v >= 4) return "Degraded";
  return "Critical";
}

function depFreshness(ageSec) {
  if (ageSec < 20) return { tier: "fresh", label: "fresh", opacity: 1 };
  if (ageSec < 50) return { tier: "aging", label: "aging", opacity: 0.82 };
  return { tier: "stale", label: "stale", opacity: 0.55 };
}

function depSeverityMultiplier(sev) {
  return 0.5 + sev / 10;
}

function depBaselineForSeverity(sev) {
  if (sev <= 3) return 9;
  if (sev <= 6) return 8;
  if (sev <= 8) return 7;
  return 6;
}

function depResolveTemplate(clusterId, hazardId) {
  if (hazardId && FULL_BUILDS[hazardId]) {
    return { ...FULL_BUILDS[hazardId], isGeneric: false, isFull: true };
  }
  const generic = GENERIC_TEMPLATES[clusterId];
  if (!generic) return null;
  const meta = (HAZARDS_BY_CLUSTER[clusterId] || []).find((h) => h.id === hazardId);
  return {
    ...generic,
    cluster: clusterId,
    label: meta ? meta.label : CLUSTER_META[clusterId].label,
    isGeneric: true,
    isFull: false,
  };
}

// Icon path helper for SVG rendering
function getSvgIconPath(type) {
  switch (type) {
    case 'zap': return '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'radio': return '<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    case 'route': return '<circle cx="6" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2"/>';
    case 'users': return '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 21v-2a4 4 0 0 0-3-3.87" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="currentColor" stroke-width="2"/>';
    case 'truck': return '<rect x="1" y="3" width="15" height="13" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="5.5" cy="18.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18.5" cy="18.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>';
    case 'building': return '<rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 22v-4h6v4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" fill="none" stroke="currentColor" stroke-width="2"/>';
    case 'droplet': return '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'wrench': return '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="none" stroke="currentColor" stroke-width="2"/>';
    case 'alert': return '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="9" x2="12" y2="13" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17" r="1" fill="currentColor"/>';
    default: return '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>';
  }
}

// Engine State
let depClusterId = "evacuation";
let depHazardId = "flood";
let depEngineMode = "exercise";
let depSeverity = 5;
let depScores = {};
let depLog = [];
let depPulsingEdges = [];
let depPulseKind = "crit";
let depActivePresets = [];
let depClock = 0;
let depSourceMap = {};
let depConflictLogged = new Set();
let depClockTimer = null;
let depLiveFeedTimer = null;

function initDependencySimulator() {
  // Subtab navigation switcher
  const subtabs = document.querySelectorAll('.sim-subtab-btn');
  subtabs.forEach(btn => {
    btn.addEventListener('click', () => {
      sound.playClick();
      const targetTab = btn.dataset.simtab;
      subtabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const mselContent = getEl('sim-tab-msel');
      const depContent = getEl('sim-tab-dependency');
      if (targetTab === 'msel') {
        if (mselContent) mselContent.classList.add('active');
        if (depContent) depContent.classList.remove('active');
      } else {
        if (mselContent) mselContent.classList.remove('active');
        if (depContent) depContent.classList.add('active');
        depRenderEngine();
      }
    });
  });

  // Cluster Picker buttons
  CLUSTER_ORDER.forEach(id => {
    const card = getEl(`cluster-card-${id}`);
    if (card) {
      card.addEventListener('click', () => {
        sound.playClick();
        depSwitchCluster(id);
      });
    }
  });

  // Hazard dropdown
  const hazardSelect = getEl('dep-hazard-select');
  if (hazardSelect) {
    hazardSelect.addEventListener('change', (e) => {
      sound.playClick();
      depSwitchHazard(e.target.value);
    });
  }

  // Severity Slider
  const sevSlider = getEl('dep-severity-slider');
  if (sevSlider) {
    sevSlider.addEventListener('input', (e) => {
      const v = +e.target.value;
      const readout = getEl('dep-severity-readout');
      if (readout) readout.innerText = `${v}/10`;
    });
    sevSlider.addEventListener('change', (e) => {
      depCommitSeverity(+e.target.value);
    });
  }

  // Reset button
  const resetBtn = getEl('dep-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      sound.playClick();
      depReset();
    });
  }

  // Timers
  if (depClockTimer) clearInterval(depClockTimer);
  depClockTimer = setInterval(() => {
    depClock += 1;
    // Re-render every few ticks to update freshness labels if view is open
    const depContent = getEl('sim-tab-dependency');
    if (depContent && depContent.classList.contains('active') && depClock % 5 === 0) {
      depRenderEngine();
    }
  }, 1000);

  if (depLiveFeedTimer) clearInterval(depLiveFeedTimer);
  depLiveFeedTimer = setInterval(() => {
    if (depEngineMode !== "live") return;
    const clusterMeta = CLUSTER_META[depClusterId];
    if (clusterMeta.status !== "ready") return;
    const H = depResolveTemplate(depClusterId, depHazardId);
    if (!H) return;

    const ids = Object.keys(depScores);
    if (ids.length === 0) return;
    const pick = ids[Math.floor(Math.random() * ids.length)];
    const delta = Math.random() < 0.5 ? -1 : 1;
    const cur = depScores[pick];
    if (cur) {
      depScores[pick] = {
        value: Math.max(2, Math.min(10, cur.value + delta)),
        updatedAt: depClock,
        source: "live feed",
      };
      depRenderEngine();
    }
  }, 9000);

  // Initial setup
  depInitBaseline();
  depRenderEngine();
}

function depInitBaseline() {
  const clusterMeta = CLUSTER_META[depClusterId];
  if (clusterMeta.status !== "ready") return;
  const H = depResolveTemplate(depClusterId, depHazardId);
  if (!H) return;

  const base = depBaselineForSeverity(depSeverity);
  depScores = {};
  H.nodes.forEach(n => {
    depScores[n.id] = { value: base, updatedAt: depClock, source: depEngineMode === "live" ? "live feed" : "baseline" };
  });
  depSourceMap = {};
  depConflictLogged = new Set();
  depActivePresets = [];
  depPulsingEdges = [];
  depLog = [{ t: depStamp(), text: `Scenario loaded: ${H.label} (${clusterMeta.label}). All capabilities at baseline, crisis scale ${depSeverity}/10.`, kind: "info" }];
}

function depStamp() {
  const s = depClock;
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function addDepLog(text, kind = "info") {
  depLog.unshift({ t: depStamp(), text, kind });
  if (depLog.length > 50) depLog.pop();
}

function depNeighbors(H, id) {
  return H.edges.filter(e => e.from === id);
}

function depMarkSource(H, nodeId, presetId) {
  const set = depSourceMap[nodeId] || new Set();
  const before = set.size;
  set.add(presetId);
  depSourceMap[nodeId] = set;
  if (set.size >= 2 && before < 2 && !depConflictLogged.has(nodeId)) {
    depConflictLogged.add(nodeId);
    const nd = H.nodes.find(n => n.id === nodeId);
    const label = nd ? nd.label : nodeId;
    addDepLog(
      `CONFLICT DETECTED — ${label} is being degraded by more than one active failure at once. A contingency written for a single failure may not hold here.`,
      "conflict"
    );
  }
}

function depTriggerFailure(preset) {
  const H = depResolveTemplate(depClusterId, depHazardId);
  if (!H || depEngineMode !== "exercise" || depActivePresets.includes(preset.id)) return;

  depActivePresets.push(preset.id);
  if (depActivePresets.length >= 2) {
    addDepLog(`COMPOUND INJECT — ${preset.label} triggered while another failure is still active.`, "trigger");
  }

  const mult = depSeverityMultiplier(depSeverity);
  const adjDrop = Math.max(1, Math.round(preset.drop * mult));
  if (depScores[preset.target]) {
    depScores[preset.target] = {
      value: Math.max(0, depScores[preset.target].value - adjDrop),
      updatedAt: depClock,
      source: "manual inject",
    };
  }

  depMarkSource(H, preset.target, preset.id);
  const targetNode = H.nodes.find(n => n.id === preset.target);
  addDepLog(`INJECT — ${targetNode ? targetNode.label : preset.target}: ${preset.note} (scale ${depSeverity}/10)`, "trigger");
  sound.playCriticalAlert();
  depRenderEngine();

  // Hop 1 cascade after 550ms
  setTimeout(() => {
    depPulseKind = "crit";
    depPulsingEdges = depNeighbors(H, preset.target).map(e => `${e.from}-${e.to}`);
    const sourceVal = depScores[preset.target] ? depScores[preset.target].value : 5;
    depNeighbors(H, preset.target).forEach(e => {
      const impact = Math.round(e.w * (10 - sourceVal) * mult);
      if (impact > 0 && depScores[e.to]) {
        depScores[e.to] = {
          value: Math.max(0, depScores[e.to].value - impact),
          updatedAt: depClock,
          source: "cascade",
        };
        depMarkSource(H, e.to, preset.id);
      }
    });
    depRenderEngine();
  }, 550);

  // Hop 2 cascade after 1150ms
  setTimeout(() => {
    depNeighbors(H, preset.target).forEach(e => {
      if (depScores[e.to] && depScores[e.to].value < 7) {
        const destNode = H.nodes.find(n => n.id === e.to);
        const srcNode = H.nodes.find(n => n.id === preset.target);
        addDepLog(
          `CASCADE — hop 1 — ${destNode ? destNode.label : e.to} degraded to ${depScores[e.to].value}/10 (depends on ${srcNode ? srcNode.label : preset.target})`,
          "cascade"
        );
      }
    });

    const hop2Edges = [];
    depNeighbors(H, preset.target).forEach(e1 => {
      depNeighbors(H, e1.to).forEach(e2 => hop2Edges.push(`${e2.from}-${e2.to}`));
    });
    depPulsingEdges = [...depPulsingEdges, ...hop2Edges];

    depNeighbors(H, preset.target).forEach(e1 => {
      const midScore = depScores[e1.to] ? depScores[e1.to].value : 5;
      depNeighbors(H, e1.to).forEach(e2 => {
        const impact = Math.round(e2.w * (10 - midScore) * 0.6 * mult);
        if (impact > 0 && depScores[e2.to]) {
          depScores[e2.to] = {
            value: Math.max(0, depScores[e2.to].value - impact),
            updatedAt: depClock,
            source: "cascade",
          };
          depMarkSource(H, e2.to, preset.id);
          const n2 = H.nodes.find(n => n.id === e2.to);
          const n1 = H.nodes.find(n => n.id === e1.to);
          addDepLog(`CASCADE — hop 2 — ${n2 ? n2.label : e2.to} affected via ${n1 ? n1.label : e1.to}`, "cascade2");
        }
      });
    });
    depRenderEngine();
  }, 1150);

  setTimeout(() => {
    depPulsingEdges = [];
    depRenderEngine();
  }, 2300);
}

function depDispatch(nodeId) {
  const H = depResolveTemplate(depClusterId, depHazardId);
  if (!H || !depScores[nodeId]) return;

  const node = H.nodes.find(n => n.id === nodeId);
  const label = node ? node.label : nodeId;
  depScores[nodeId] = {
    value: Math.min(10, depScores[nodeId].value + 3),
    updatedAt: depClock,
    source: depEngineMode === "live" ? "dispatch (live)" : "dispatch (exercise)",
  };
  addDepLog(`DISPATCH — response committed to ${label}. Capability reinforced.`, "dispatch");
  sound.playClick();
  depRenderEngine();

  setTimeout(() => {
    depPulseKind = "good";
    depPulsingEdges = depNeighbors(H, nodeId).map(e => `${e.from}-${e.to}`);
    depNeighbors(H, nodeId).forEach(e => {
      const relief = Math.round(e.w * 2);
      if (relief > 0 && depScores[e.to]) {
        depScores[e.to] = {
          value: Math.min(10, depScores[e.to].value + relief),
          updatedAt: depClock,
          source: "relief cascade",
        };
      }
    });
    depNeighbors(H, nodeId).forEach(e => {
      const targetN = H.nodes.find(n => n.id === e.to);
      addDepLog(`RELIEF CASCADE — hop 1 — ${targetN ? targetN.label : e.to} eased by reinforcement of ${label}`, "dispatch");
    });
    depRenderEngine();
  }, 500);

  setTimeout(() => {
    depPulsingEdges = [];
    depRenderEngine();
  }, 1400);
}

function depReset() {
  depInitBaseline();
  addDepLog(`Reset to baseline at crisis scale ${depSeverity}/10. All active injects cleared.`, "info");
  depRenderEngine();
  showToast('Simulation reset to baseline');
}

function depSwitchMode(next) {
  if (next === depEngineMode) return;
  depEngineMode = next;
  depInitBaseline();
  addDepLog(
    next === "live"
      ? "Data source switched to LIVE. Manual injection disabled; capabilities now driven by feed."
      : "Data source switched to EXERCISE. Synthetic inputs enabled.",
    "mode"
  );
  depRenderEngine();
}

function depSwitchCluster(id) {
  if (id === depClusterId) return;
  depClusterId = id;
  depHazardId = (id === "evacuation" ? "flood" : null);
  depInitBaseline();
  depRenderEngine();
}

function depSwitchHazard(id) {
  depHazardId = id || null;
  depInitBaseline();
  depRenderEngine();
}

function depCommitSeverity(v) {
  depSeverity = v;
  const readout = getEl('dep-severity-readout');
  if (readout) readout.innerText = `${v}/10`;
  depInitBaseline();
  depRenderEngine();
}

function depRenderEngine() {
  const clusterMeta = CLUSTER_META[depClusterId];
  const isReady = clusterMeta.status === "ready";
  const H = isReady ? depResolveTemplate(depClusterId, depHazardId) : null;
  const hazardList = HAZARDS_BY_CLUSTER[depClusterId] || [];

  // Update Cluster Picker Cards
  CLUSTER_ORDER.forEach(id => {
    const card = getEl(`cluster-card-${id}`);
    if (card) {
      card.classList.toggle('active', depClusterId === id);
      card.classList.toggle('blocked', CLUSTER_META[id].status !== 'ready');
    }
  });

  // Update Blurb Bar
  const blurbBar = getEl('cluster-blurb-bar');
  if (blurbBar) blurbBar.innerText = clusterMeta.blurb;

  // Update Hazard Select dropdown
  const hazardSelect = getEl('dep-hazard-select');
  if (hazardSelect) {
    hazardSelect.innerHTML = `<option value="">Generic ${clusterMeta.label} template</option>` +
      hazardList.map(h => `<option value="${h.id}" ${h.id === depHazardId ? 'selected' : ''}>${h.label}</option>`).join('');
    const advisory = isReady && !depHazardId && depSeverity >= 6;
    hazardSelect.classList.toggle('needs-attention', advisory);
  }

  // Update Advisory Banner
  const advisoryBanner = getEl('dep-advisory-banner');
  const advisoryText = getEl('dep-advisory-text');
  const advisory = isReady && !depHazardId && depSeverity >= 6;
  if (advisoryBanner) {
    advisoryBanner.style.display = advisory ? 'flex' : 'none';
    if (advisoryText) {
      advisoryText.innerText = `Crisis scale ${depSeverity}/10 — at this level, hazard behavior tends to diverge enough that picking the exact crisis above gives a materially better model. The generic template will still run as an approximation; select a specific hazard for anything you plan to rely on.`;
    }
  }

  // Update Mode Banner
  const modeBanner = getEl('dep-mode-banner');
  if (modeBanner) {
    modeBanner.className = `mode-banner ${depEngineMode}`;
    modeBanner.innerText = depEngineMode === "exercise"
      ? "Exercise, exercise, exercise — synthetic data, no operational effect"
      : "Live mode — driven by feed data, manual injection disabled";
  }

  // Views Switching
  const engineView = getEl('dep-engine-view');
  const thresholdView = getEl('dep-threshold-blocked-view');
  const crowdView = getEl('dep-crowd-blocked-view');

  if (depClusterId === 'threshold') {
    if (engineView) engineView.style.display = 'none';
    if (crowdView) crowdView.style.display = 'none';
    if (thresholdView) {
      thresholdView.style.display = 'block';
      const picked = (hazardList.find(x => x.id === depHazardId) || {}).label;
      const bText = getEl('dep-threshold-body-text');
      if (bText) {
        bText.innerText = (picked ? `You're scoping ${picked}. ` : '') +
          `This cluster has no discrete trigger event to inject — capacity erodes under sustained demand instead of failing all at once, so the injection-and-cascade UI used by the other clusters doesn't apply here.`;
      }
    }
    return;
  }

  if (depClusterId === 'crowd') {
    if (engineView) engineView.style.display = 'none';
    if (thresholdView) thresholdView.style.display = 'none';
    if (crowdView) {
      crowdView.style.display = 'block';
      const picked = (hazardList.find(x => x.id === depHazardId) || {}).label;
      const bText = getEl('dep-crowd-body-text');
      if (bText) {
        bText.innerText = (picked ? `You're scoping ${picked}. ` : '') +
          `This cluster needs the agent-based population model already flagged in the handoff specification as an open research problem. Building a template here without it would just be a relabeled Point-Source graph with a crowd score standing in for something it can't actually simulate.`;
      }
    }
    return;
  }

  // Engine Ready Mode
  if (thresholdView) thresholdView.style.display = 'none';
  if (crowdView) crowdView.style.display = 'none';
  if (engineView) engineView.style.display = 'grid';

  if (!H || !depScores[H.nodes[0]?.id]) return;

  // Render Presets
  const presetsBox = getEl('dep-presets-list');
  if (presetsBox) {
    presetsBox.innerHTML = H.presets.map(p => {
      const active = depActivePresets.includes(p.id);
      return `
        <button class="preset-btn ${active ? 'is-active' : ''}" data-preset-id="${p.id}" ${depEngineMode !== 'exercise' || active ? 'disabled' : ''}>
          <span style="font-size:11px; opacity:0.8; margin-top:1px; font-weight: bold;">[INJECT]</span>
          <div>
            <div>${p.label}</div>
            <div class="preset-note">${p.note}</div>
            ${active ? '<div class="active-tag">ACTIVE</div>' : ''}
          </div>
        </button>
      `;
    }).join('');

    presetsBox.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.presetId;
        const preset = H.presets.find(p => p.id === pid);
        if (preset) depTriggerFailure(preset);
      });
    });
  }

  // Calculate Metrics & Top Leverage
  const overall = Math.round(H.nodes.reduce((sum, n) => sum + (depScores[n.id]?.value || 0), 0) / H.nodes.length);
  const avgAge = H.nodes.reduce((sum, n) => sum + (depClock - (depScores[n.id]?.updatedAt || 0)), 0) / H.nodes.length;
  const confidence = avgAge < 20 ? "High" : avgAge < 50 ? "Medium" : "Low";
  const critNodes = H.nodes.filter(n => (depScores[n.id]?.value || 0) < 4);
  const warnNodes = H.nodes.filter(n => (depScores[n.id]?.value || 0) >= 4 && (depScores[n.id]?.value || 0) < 7);

  const leverage = {};
  H.nodes.forEach(n => { leverage[n.id] = 0; });
  H.edges.forEach(e => { leverage[e.from] += e.w; });
  let topScore = -1;
  let topLeverageId = H.nodes[0].id;
  H.nodes.forEach(n => {
    const degradation = (10 - (depScores[n.id]?.value || 0)) / 10;
    const score = leverage[n.id] * (0.4 + degradation);
    if (score > topScore) { topScore = score; topLeverageId = n.id; }
  });

  const topNode = H.nodes.find(n => n.id === topLeverageId);
  const topNameEl = getEl('dep-top-leverage-name');
  if (topNameEl) topNameEl.innerText = topNode ? topNode.label : topLeverageId;

  // Update Overview Card
  const tplBadge = getEl('dep-tpl-badge');
  if (tplBadge) {
    tplBadge.className = `tpl-badge ${H.isFull ? 'full' : 'generic'}`;
    tplBadge.innerText = H.isFull ? 'Full Template' : 'Generic Template';
  }

  const confTag = getEl('dep-confidence-tag');
  if (confTag) {
    confTag.className = `confidence-tag ${confidence}`;
    confTag.innerText = `Confidence: ${confidence}`;
  }

  const scoreEl = getEl('dep-overall-score');
  if (scoreEl) {
    scoreEl.style.color = depStatusColor(overall);
    scoreEl.innerText = overall;
  }

  const labelEl = getEl('dep-overall-label');
  if (labelEl) {
    labelEl.innerText = `${H.label} — Overall system readiness — ${depStatusLabel(overall)}`;
  }

  const alertBox = getEl('dep-alert-chips-box');
  if (alertBox) {
    if (critNodes.length === 0 && warnNodes.length === 0) {
      alertBox.innerHTML = `<span style="font-size: 11.5px; color: var(--text-muted);">No active alerts.</span>`;
    } else {
      alertBox.innerHTML = critNodes.map(n => `<span class="alert-chip crit">[CRIT] ${n.label}</span>`).join('') +
        warnNodes.map(n => `<span class="alert-chip warn">[WARN] ${n.label}</span>`).join('');
    }
  }

  // Render SVG Graph
  const svg = getEl('dep-graph-svg');
  if (svg) {
    let svgContent = '';

    // Edges
    H.edges.forEach(e => {
      const a = H.nodes.find(n => n.id === e.from);
      const b = H.nodes.find(n => n.id === e.to);
      if (!a || !b) return;
      const key = `${e.from}-${e.to}`;
      const active = depPulsingEdges.includes(key);
      const stroke = active ? (depPulseKind === "good" ? "var(--emerald)" : "var(--alert)") : "var(--border-color)";
      const strokeW = active ? 3 : 1.5;
      svgContent += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${strokeW}" style="transition: stroke 0.3s ease, stroke-width 0.3s ease;"/>`;
    });

    // Nodes
    H.nodes.forEach(n => {
      const s = depScores[n.id] || { value: 8, updatedAt: depClock, source: 'baseline' };
      const color = depStatusColor(s.value);
      const age = depClock - s.updatedAt;
      const fr = depFreshness(age);
      const isTop = n.id === topLeverageId;

      svgContent += `<g transform="translate(${n.x},${n.y})" opacity="${fr.opacity}" style="transition: opacity 0.4s ease; cursor: pointer;" data-node-id="${n.id}">`;
      if (isTop) {
        svgContent += `<circle r="46" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.8"/>`;
      }
      svgContent += `<circle r="38" fill="var(--bg-panel)" stroke="${color}" stroke-width="2.5" style="transition: stroke 0.4s ease;"/>`;

      if (s.value < 4) {
        svgContent += `
          <circle r="38" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.4">
            <animate attributeName="r" values="38;50;38" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
          </circle>
        `;
      }

      // Icon SVG inside circle
      svgContent += `
        <g transform="translate(-12, -22)" style="color: ${color};">
          <svg width="24" height="24" viewBox="0 0 24 24">${getSvgIconPath(n.icon)}</svg>
        </g>
      `;

      // Score Text
      svgContent += `<text y="14" text-anchor="middle" font-size="16" font-weight="800" font-family="'Space Grotesk',sans-serif" fill="var(--text-main)">${s.value}</text>`;

      // Label below node
      svgContent += `<text y="58" text-anchor="middle" font-size="11.5" font-weight="600" font-family="'Plus Jakarta Sans',sans-serif" fill="var(--text-main)">${n.label}</text>`;

      svgContent += `</g>`;
    });

    svg.innerHTML = svgContent;

    // Node click to dispatch
    svg.querySelectorAll('g[data-node-id]').forEach(g => {
      g.addEventListener('click', () => {
        const nid = g.dataset.nodeId;
        depDispatch(nid);
      });
    });
  }

  // Render Capabilities Node Cards
  const nodesList = getEl('dep-nodes-list');
  if (nodesList) {
    nodesList.innerHTML = H.nodes.map(n => {
      const s = depScores[n.id] || { value: 8, updatedAt: depClock, source: 'baseline' };
      const color = depStatusColor(s.value);
      const isTop = n.id === topLeverageId;
      const age = depClock - s.updatedAt;
      const fr = depFreshness(age);

      return `
        <div class="node-row ${isTop ? 'is-top' : ''}" data-node-id="${n.id}">
          <div class="node-head">
            <div class="node-label">
              <span class="node-dot" style="background:${color};"></span>
              <strong>${n.label}</strong>
              ${isTop ? '<span class="top-tag">Top leverage</span>' : ''}
            </div>
            <div class="node-score" style="color:${color};">${s.value}/10</div>
          </div>
          <div class="node-bar"><div class="node-bar-fill" style="width: ${s.value * 10}%; background:${color};"></div></div>
          <div class="node-meta">
            <span class="node-source ${fr.tier === 'fresh' ? 'fresh' : ''}">${s.source} · ${fr.label}</span>
            <button class="dispatch-btn" data-dispatch-id="${n.id}" title="Dispatch response to reinforce this capability">
              Dispatch
            </button>
          </div>
        </div>
      `;
    }).join('');

    nodesList.querySelectorAll('.dispatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nid = btn.dataset.dispatchId;
        depDispatch(nid);
      });
    });
  }

  // Render Event Log
  const logBox = getEl('dep-event-log-box');
  if (logBox) {
    logBox.innerHTML = depLog.map(entry => `
      <div class="log-entry ${entry.kind}">
        <span class="log-time mono">${entry.t}</span>${entry.text}
      </div>
    `).join('');
  }
}