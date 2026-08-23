import L from 'leaflet';
import { sound } from './audio.js';
import { openRegistrationForm, startAutoSync, filterRemovedVolunteers, removeVolunteer } from './volunteerSync.js';
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
  volunteerPool
} from './data.js';

// Global Application State
const state = {
  mode: 'LIVE',
  view: 'landing',
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
  customMarkers: [],
  selectedRoleForAssign: null
};

// Safe DOM retrieval
const getEl = (id) => document.getElementById(id);

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
// APPLICATION INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initNavigation();
  initModeSwitcher();
  initScenarioSwitcher();
  initTheme();
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
  initIapForms();
  initSimulationEngine();
  initDependencySimulator();
  initDroneFeeds();
  initRadioConsole();
  initModals();
  initAssignSquadModal();
  initSachetAlerting();
  initTelemetryTicker();
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
    brandBtn.addEventListener('click', () => switchView('landing'));
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
      audioBtn.innerText = sound.enabled ? '🔊' : '🔇';
      showToast(sound.enabled ? 'Tactical Audio: ENABLED' : 'Tactical Audio: MUTED');
    });
  }
}

function switchView(viewName) {
  sound.playClick();
  state.view = viewName;

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === viewName);
  });

  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });

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

  if (key === 'dana') {
    if (headerCrumb) headerCrumb.innerText = 'SEVERE CYCLONE DANA (BAY OF BENGAL) | T+05:18:22';
    if (state.map) state.map.flyTo([20.65, 86.85], 9);
    showToast('🌀 SCENARIO LOADED: Cyclone Dana (Odisha Coast)', 'alert');
  } else if (key === 'assam') {
    if (headerCrumb) headerCrumb.innerText = 'ASSAM BRAHMAPUTRA RIVERINE FLOODS | WAVE 3';
    if (state.map) state.map.flyTo([26.2006, 92.9376], 8);
    showToast('🌊 SCENARIO LOADED: Assam Brahmaputra Floods');
  } else if (key === 'chamoli') {
    if (headerCrumb) headerCrumb.innerText = 'CHAMOLI GLOF GLACIAL BURST & SURGE | RAPID RESPONSE';
    if (state.map) state.map.flyTo([30.5556, 79.5667], 10);
    showToast('🏔️ SCENARIO LOADED: Chamoli GLOF Glacial Burst', 'alert');
  } else if (key === 'wayanad') {
    if (headerCrumb) headerCrumb.innerText = 'WAYANAD CHOORALMALA LANDSLIDE SEARCH & RESCUE';
    if (state.map) state.map.flyTo([11.5200, 76.1300], 11);
    showToast('⛰️ SCENARIO LOADED: Wayanad Landslide Rescue');
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
      showToast('🚨 CAP-SACHET EMERGENCY ALERT CONSOLE ARMED', 'alert');
    });
  }
}

function setMode(newMode) {
  if (state.mode === newMode) return;
  state.mode = newMode;
  sound.playModeToggle();

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
      sachetGuard.innerText = '⚠️ LIVE DISPATCH ARMED — Transmits instant Cell Broadcast to mobile towers in target geometry!';
      showToast('MODE SWITCHED: LIVE CRISIS (ARMED)', 'alert');
    } else {
      sachetGuard.className = 'sachet-guard-pill exercise-guard';
      sachetGuard.innerText = '🟡 EXERCISE SANDBOX ACTIVE — All outgoing alerts are isolated to simulator terminals only.';
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

  // If SOS filter is selected, show SOS Queue
  if (state.activeFilter === 'SOS') {
    state.sosList.forEach((sos, idx) => {
      const card = document.createElement('div');
      card.className = 'incident-card sos-card';
      card.innerHTML = `
        <div class="inc-top-line">
          <span class="badge badge-alert">[${sos.urgency}] ${sos.time}</span>
          <span class="mono text-xs text-alert font-bold">${sos.id}</span>
        </div>
        <div class="inc-title">👤 ${sos.name}</div>
        <div class="inc-desc">"${sos.msg}"</div>
        <div class="inc-bottom">
          <span>📍 ${sos.location}</span>
          <span class="mono font-bold text-saffron">UNIT: ${sos.assignedUnit}</span>
        </div>
        <div class="sos-actions-row">
          <button class="btn btn-xs btn-saffron dispatch-boat-btn" data-idx="${idx}">🚤 DISPATCH BOAT</button>
          <button class="btn btn-xs btn-outline resolve-sos-btn" data-idx="${idx}">✓ RESOLVE</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        sound.playClick();
        if (state.map && sos.lat && sos.lng) {
          state.map.flyTo([sos.lat, sos.lng], 13, { animate: true, duration: 1 });
          showToast(`📍 Centered on SOS: ${sos.name}`);
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
        state.sosList[idx].assignedUnit = "NDRF IRB-101 (Dispatched)";
        state.sosList[idx].status = "IN PROGRESS";
        renderIncidents();
        showToast(`🚤 Rescue boat assigned to ${state.sosList[idx].name}`);
      });
    });

    document.querySelectorAll('.resolve-sos-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.playClick();
        const idx = parseInt(e.target.dataset.idx, 10);
        showToast(`✓ SOS [${state.sosList[idx].id}] resolved & evac confirmed!`);
        state.sosList.splice(idx, 1);
        renderIncidents();
      });
    });

    return;
  }

  // Standard Incident Stream
  const filtered = state.incidents.filter(inc => {
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
        <span>📍 ${inc.location}</span>
        <span class="text-emerald font-bold">${inc.status}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      sound.playClick();
      if (state.map && inc.lat && inc.lng) {
        state.map.flyTo([inc.lat, inc.lng], 12, { animate: true, duration: 1 });
        showToast(`📍 Map Centered on: ${inc.title}`);
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
        <span>⚕️ ${s.medical}</span>
        <span>🍞 ${s.foodRations}</span>
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
  const filtered = state.assets.filter(a => {
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

    row.innerHTML = `
      <td><strong>${asset.name}</strong><br><span class="mono text-xs text-muted">${asset.id}</span></td>
      <td>${asset.type}</td>
      <td>${asset.unit}</td>
      <td><span class="badge ${statusClass}">${asset.status}</span></td>
      <td>📍 ${asset.loc}</td>
      <td class="asset-action-cell">
        <button class="btn btn-xs btn-outline cycle-status-btn" data-id="${asset.id}">
          🔄 CYCLE
        </button>
        <button class="btn btn-xs btn-outline tag-loc-btn" data-id="${asset.id}">
          📍 TAG LOC
        </button>
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
          showToast(`📍 Location tagged: ${asset.id} → ${asset.loc}`);
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

  state.sheltersData.forEach((s, idx) => {
    const pct = Math.round((s.occupied / s.capacity) * 100);
    let statusClass = 'badge-emerald';
    if (pct >= 90) statusClass = 'badge-alert';
    else if (pct >= 70) statusClass = 'badge-gold';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${s.name}</strong><br><span class="mono text-xs text-muted">${s.id}</span></td>
      <td class="mono">${s.occupied}/${s.capacity} <span class="text-muted text-xs">(${pct}%)</span></td>
      <td><span class="badge ${statusClass}">${pct >= 90 ? 'CRITICAL' : pct >= 70 ? 'NEAR FULL' : 'AVAILABLE'}</span></td>
      <td>⚕️ ${s.medical}</td>
      <td>🍞 ${s.foodRations}</td>
      <td class="asset-action-cell">
        <button class="btn btn-xs btn-outline shelter-matrix-minus" data-idx="${idx}">-10</button>
        <button class="btn btn-xs btn-outline shelter-matrix-plus" data-idx="${idx}">+10</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  document.querySelectorAll('.shelter-matrix-minus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      const s = state.sheltersData[idx];
      s.occupied = Math.max(0, s.occupied - 10);
      renderShelterMatrix();
      renderShelters();
      logActivity('SHELTER', `Occupancy adjusted: ${s.name} → ${s.occupied}/${s.capacity}`);
    });
  });

  document.querySelectorAll('.shelter-matrix-plus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      const s = state.sheltersData[idx];
      s.occupied = Math.min(s.capacity, s.occupied + 10);
      renderShelterMatrix();
      renderShelters();
      logActivity('SHELTER', `Occupancy adjusted: ${s.name} → ${s.occupied}/${s.capacity}`);
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
    const medical = getEl('new-shelter-medical')?.value.trim() || 'Not Yet Staffed';
    const foodRations = getEl('new-shelter-food')?.value.trim() || 'Pending Stock';

    if (!name) { showToast('Shelter name is required'); return; }
    if (!capacity || capacity <= 0) { showToast('Enter a valid capacity'); return; }

    state.sheltersData.push({
      id: `MCS-${String(state.sheltersData.length + 1).padStart(2, '0')}`,
      name,
      capacity,
      occupied: 0,
      status: 'AVAILABLE',
      lat: 20.5,
      lng: 86.5,
      medical,
      foodRations
    });

    sound.playClick();
    renderShelterMatrix();
    renderShelters();
    closeShelterModal();
    getEl('new-shelter-name').value = '';
    getEl('new-shelter-capacity').value = '';
    getEl('new-shelter-medical').value = '';
    getEl('new-shelter-food').value = '';
    showToast(`🏠 Shelter registered: ${name}`);
    logActivity('SHELTER', `New shelter registered: ${name} (capacity ${capacity})`);
  });
}

// =========================================================================
// MUTUAL AID REQUEST LOG
// =========================================================================
function renderMutualAid() {
  const tbody = getEl('mutual-aid-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.mutualAidData.forEach((req, idx) => {
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
          <button class="btn btn-xs btn-outline mutual-aid-approve" data-idx="${idx}">✅ APPROVE</button>
          <button class="btn btn-xs btn-outline mutual-aid-deny" data-idx="${idx}">❌ DENY</button>
        ` : `<span class="mono text-xs text-muted">—</span>`}
      </td>
    `;
    tbody.appendChild(row);
  });

  document.querySelectorAll('.mutual-aid-approve').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      const req = state.mutualAidData[idx];
      req.status = 'APPROVED';
      req.approvedBy = 'State EOC Duty Officer';
      renderMutualAid();
      renderAarMutualAidSummary();
      showToast(`✅ Mutual aid request approved: ${req.resource} → ${req.agency}`);
      logActivity('MUTUAL AID', `Approved: ${req.resource} ×${req.qty} → ${req.agency}`);
    });
  });

  document.querySelectorAll('.mutual-aid-deny').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sound.playClick();
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      const req = state.mutualAidData[idx];
      req.status = 'DENIED';
      req.approvedBy = 'State EOC Duty Officer';
      renderMutualAid();
      renderAarMutualAidSummary();
      showToast(`❌ Mutual aid request denied: ${req.resource} → ${req.agency}`);
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
    showToast(`🤝 Mutual aid request logged: ${agency}`);
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

  const registered = state.volunteerPoolData.filter(v => v.status === 'REGISTERED').length;
  const awaiting = state.volunteerPoolData.filter(v => v.status === 'AWAITING_ASSIGNMENT').length;
  const assigned = state.volunteerPoolData.filter(v => v.status === 'ASSIGNED').length;

  const regEl = getEl('vol-count-registered');
  const awaitEl = getEl('vol-count-awaiting');
  const assignEl = getEl('vol-count-assigned');
  if (regEl) regEl.innerText = registered;
  if (awaitEl) awaitEl.innerText = awaiting;
  if (assignEl) assignEl.innerText = assigned;

  const filtered = state.volunteerPoolData.filter(v =>
    state.activeVolunteerFilter === 'ALL' || v.status === state.activeVolunteerFilter
  );

  filtered.forEach(v => {
    let statusClass = 'badge-navy';
    if (v.status === 'ASSIGNED') statusClass = 'badge-emerald';
    if (v.status === 'AWAITING_ASSIGNMENT') statusClass = 'badge-gold';

    const item = document.createElement('div');
    item.className = 'aid-chip';
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${v.name}</strong>
        <span class="badge ${statusClass} text-xs">${v.status.replace('_', ' ')}</span>
      </div>
      <div style="color:var(--text-muted); font-size:0.65rem;">📍 ${v.location} | Skill: ${v.skill}${v.squad ? ` | Squad: ${v.squad}` : ''}</div>
      <div style="display:flex; gap:0.4rem;">
        ${v.status !== 'ASSIGNED' ? `<button class="btn btn-xs btn-outline assign-volunteer-btn mt-1" data-id="${v.id}">➡️ ASSIGN TO SQUAD</button>` : ''}
        <button class="btn btn-xs btn-outline remove-volunteer-btn mt-1" data-id="${v.id}" title="Remove volunteer">🗑 REMOVE</button>
      </div>
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
        showToast(`🗑 ${vol.name} hidden here — delete their Sheet row to remove them everywhere`, 'alert');
      } else {
        showToast(`🗑 ${vol.name} removed from the pool`);
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
        showToast(`➡️ ${vol.name} assigned to ${squadSelect.value}`);
        logActivity('VOLUNTEER', `${vol.name} assigned to ${squadSelect.value}`);
      }
      close();
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
    showToast(`🙋 ${addedCount} new volunteer${addedCount > 1 ? 's' : ''} synced from registration form`);
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
        showToast(`📻 Radio tuned to: ${chan.name}`);
      }
    });
  }

  if (pttBtn) {
    pttBtn.addEventListener('mousedown', () => {
      sound.playRadioPtt();
      pttBtn.classList.add('btn-saffron');
      pttBtn.innerText = '🔴 TRANSMITTING (LIVE ON AIR)...';
    });

    const releasePtt = () => {
      pttBtn.classList.remove('btn-saffron');
      pttBtn.innerText = '🎙️ PUSH TO TALK (PTT)';
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
    <div class="tree-role">⭐ INCIDENT COMMANDER (IC)</div>
    <div class="tree-name">${t.incidentCommander.name}</div>
    <div class="tree-agency">${t.incidentCommander.agency} | 📞 ${t.incidentCommander.phone}</div>
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
        branchesHtml += `<div class="vacant-line assign-branch-btn" data-sec="${sec.name}" data-branch="${b.name}">⚠️ ${b.name}: ${b.lead} (CLICK TO ASSIGN)</div>`;
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
      badge.innerText = `⚠️ ${vacancyCount} UNASSIGNED ROLES`;
    } else {
      badge.className = 'badge badge-emerald';
      badge.innerText = `✓ ALL ROLES APPOINTED`;
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
  const completed = state.tasksData.filter(t => t.completed).length;
  const total = state.tasksData.length;
  const pct = Math.round((completed / total) * 100);

  const progressTxt = getEl('task-progress-txt');
  const progressBar = getEl('task-progress-bar');
  if (progressTxt) progressTxt.innerText = `SECTION TASKS COMPLETION (${completed}/${total} COMPLETED - ${pct}%)`;
  if (progressBar) progressBar.style.width = `${pct}%`;
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
          broadcastText.innerText = `🚨 [LIVE WEA/CAP BROADCAST]: ${msg}`;
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

        showToast(`⚡ CAP-SACHET ALERT BROADCAST SENT TO 1.84M SUBSCRIBERS (${eventType})`, 'alert');
        logActivity('SACHET ALERT', `LIVE broadcast transmitted: ${eventType} — "${msg.slice(0, 70)}${msg.length > 70 ? '…' : ''}"`);
      } else {
        showToast(`🟡 [EXERCISE SANDBOX]: Alert queued to simulation terminals only.`);
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

const closeRumorBtn = getEl('close-rumor-modal');
const cancelRumorBtn = getEl('cancel-rumor-btn');
if (closeRumorBtn) closeRumorBtn.addEventListener('click', closeRumorModal);
if (cancelRumorBtn) cancelRumorBtn.addEventListener('click', closeRumorModal);

const saveRumorBtn = getEl('save-rumor-btn');
if (saveRumorBtn) {
  saveRumorBtn.addEventListener('click', () => {
    const claim = getEl('new-rumor-claim')?.value.trim();
    const clarification = getEl('new-rumor-clarification')?.value.trim();
    const verifiedBy = getEl('new-rumor-verifier')?.value.trim() || 'EOC Duty Officer';

    if (!claim) { showToast('Enter the claim being circulated'); return; }
    if (!clarification) { showToast('Enter the official clarification'); return; }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';

    state.rumorsData.unshift({
      claim,
      clarification,
      status: 'DEBUNKED',
      verifiedBy,
      timestamp: timeStr
    });

    sound.playClick();
    renderRumors();
    closeRumorModal();
    getEl('new-rumor-claim').value = '';
    getEl('new-rumor-clarification').value = '';
    getEl('new-rumor-verifier').value = '';
    showToast(`🛡️ Rumor clarification posted`);
    logActivity('RUMOR CONTROL', `Clarified: "${claim.slice(0, 60)}${claim.length > 60 ? '…' : ''}" — verified by ${verifiedBy}`);
  });
}
function renderDamageTable() {
  const tbody = getEl('damage-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.damageData.forEach(d => {
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
    signBtn.addEventListener('click', () => {
      sound.playClick();
      showToast('✍️ IAP OPERATIONAL PERIOD 2 DIGITALLY SIGNED & CERTIFIED');
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
            <span>APPROVED BY: <strong class="text-saffron">Shri R. Mohanty, IAS (State IC)</strong></span>
            <span class="mono text-emerald font-bold">CERTIFIED: 2026-08-15 13:35 IST</span>
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
    container.innerHTML = `
      <div class="nims-form-wrapper">
        <div class="nims-form-header" style="border-bottom: 2px solid var(--border-color); padding-bottom: 6px;">
          <h3 class="font-bold">ORGANIZATION ASSIGNMENT LIST (ICS FORM 203)</h3>
          <span class="mono text-xs text-muted">COMPREHENSIVE COMMAND & GENERAL STAFF ROSTER</span>
        </div>
        <table class="brutal-table" style="margin-top: 10px;">
          <tr><th>POSITION</th><th>ASSIGNED OFFICER</th><th>AGENCY</th><th>RADIO CHANNEL</th></tr>
          <tr><td>Incident Commander</td><td>Shri R. Mohanty, IAS</td><td>SDMA Odisha</td><td>Command Net (155.475)</td></tr>
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
        playBtn.innerText = '⏸ PAUSE';
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
    if (playBtn) playBtn.innerText = '▶ PLAY DRILL';
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
      showToast(`🚨 CUSTOM INJECT FIRED: ${title}`, 'alert');
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
      showToast(`⚡ SIM INJECT FIRED: ${inj.title}`, 'alert');
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
// TACTICAL LEAFLET GIS MAP & DRAWING TOOLS
// =========================================================================
function initGISMap() {
  const mapElement = getEl('gis-map');
  if (!mapElement || state.mapInitialized) return;

  try {
    // Fix Leaflet Default Icon path issues in bundlers with SVG data URIs
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
      zoomControl: false
    });

    state.map = map;
    state.mapInitialized = true;
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; ISRO Bhuvan / IMD / CartoDB',
      maxZoom: 18
    }).addTo(map);

    const stormCenter = [20.2, 87.2];

    const radarRing1 = L.circle(stormCenter, { radius: 35000, color: '#E53935', fillColor: '#E53935', fillOpacity: 0.25, weight: 3 }).addTo(map)
      .bindPopup('<b>CYCLONE DANA (CORE GALE ZONE)</b><br>Sustained Winds: 125 km/h<br>Central Pressure: 978 hPa');

    const radarRing2 = L.circle(stormCenter, { radius: 70000, color: '#FF6F00', fillColor: '#FF6F00', fillOpacity: 0.12, weight: 2 }).addTo(map);
    const radarRing3 = L.circle(stormCenter, { radius: 110000, color: '#FFD600', fillColor: '#FFD600', fillOpacity: 0.05, weight: 1 }).addTo(map);
    state.radarLayers.push(radarRing1, radarRing2, radarRing3);

    const evacPolygonCoords = [
      [20.85, 86.85],
      [20.90, 87.05],
      [20.65, 87.10],
      [20.45, 86.80],
      [20.55, 86.65]
    ];
    state.evacPolygon = L.polygon(evacPolygonCoords, {
      color: '#E53935',
      fillColor: '#E53935',
      fillOpacity: 0.35,
      weight: 3,
      dashArray: '6, 6'
    }).addTo(map).bindPopup('<b>MANDATORY EVACUATION ZONE (SECTOR 4 & 5)</b><br>Est. Population: 43,000<br>Status: 86.4% Evacuated');

    // Shelter Markers with custom styled divIcons
    shelters.forEach(s => {
      const icon = L.divIcon({
        className: 'custom-map-icon',
        html: `<div class="custom-map-pin" style="background:#FF6F00; color:#FFF; font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:10px; padding:3px 7px; border:2px solid #121417; box-shadow:3px 3px 0 #000; border-radius:3px; white-space:nowrap; display:flex; align-items:center; gap:4px;">🏠 ${s.name}</div>`,
        iconSize: [120, 26],
        iconAnchor: [60, 13]
      });
      const marker = L.marker([s.lat, s.lng], { icon }).addTo(map)
        .bindPopup(`<b>${s.name}</b><br>Occupancy: ${s.occupied}/${s.capacity} (${Math.round(s.occupied / s.capacity * 100)}%)<br>Medical: ${s.medical}`);
      state.shelterMarkers.push(marker);
    });

    // NDRF Boat Rescue Assets with custom green divIcons
    const boatIcon1 = L.divIcon({
      className: 'custom-map-icon',
      html: `<div class="custom-map-pin" style="background:#00E676; color:#0E1317; font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:10px; padding:3px 7px; border:2px solid #000; box-shadow:3px 3px 0 #000; border-radius:3px; white-space:nowrap; display:flex; align-items:center; gap:4px;">🚤 NDRF Boat 01</div>`,
      iconSize: [110, 26],
      iconAnchor: [55, 13]
    });
    const boat1 = L.marker([20.78, 86.94], { icon: boatIcon1 }).addTo(map)
      .bindPopup('<b>NDRF Rescue Boat 01</b><br>Unit: 03 Bn<br>Status: Active Search & Rescue at Dhamra Jetty');

    const boatIcon2 = L.divIcon({
      className: 'custom-map-icon',
      html: `<div class="custom-map-pin" style="background:#00E676; color:#0E1317; font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:10px; padding:3px 7px; border:2px solid #000; box-shadow:3px 3px 0 #000; border-radius:3px; white-space:nowrap; display:flex; align-items:center; gap:4px;">🚤 NDRF Boat 02</div>`,
      iconSize: [110, 26],
      iconAnchor: [55, 13]
    });
    const boat2 = L.marker([20.58, 86.83], { icon: boatIcon2 }).addTo(map)
      .bindPopup('<b>NDRF Rescue Boat 02</b><br>Unit: 03 Bn<br>Status: Evacuating stranded families at Rajnagar creek');
    state.assetMarkers.push(boat1, boat2);

    // Interactive Drop Pin Mode
    const dropPinBtn = getEl('drop-pin-tool-btn');
    if (dropPinBtn) {
      dropPinBtn.addEventListener('click', () => {
        sound.playClick();
        state.dropPinMode = !state.dropPinMode;
        dropPinBtn.classList.toggle('chip-active', state.dropPinMode);
        showToast(state.dropPinMode ? '📍 Click anywhere on the map to drop an incident hotspot pin' : 'Drop Pin Mode: CANCELLED');
      });
    }

    map.on('click', (e) => {
      if (!state.dropPinMode) return;
      sound.playCriticalAlert();
      const { lat, lng } = e.latlng;
      const pinIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `<div class="custom-map-pin" style="background:#E53935; color:#FFF; font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:10px; padding:3px 7px; border:2px solid #000; box-shadow:3px 3px 0 #000; border-radius:3px; white-space:nowrap; display:flex; align-items:center; gap:4px;">⚠️ DANGER PIN</div>`,
        iconSize: [105, 26],
        iconAnchor: [52, 13]
      });
      const marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map)
        .bindPopup(`<b>⚠️ FIELD DANGER HOTSPOT</b><br>Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}<br>Status: Dispatched`)
        .openPopup();
      state.customMarkers.push(marker);
      state.dropPinMode = false;
      dropPinBtn.classList.remove('chip-active');
      showToast(`📍 Field danger hotspot marked at [${lat.toFixed(3)}, ${lng.toFixed(3)}]`);
    });

    getEl('toggle-radar-btn')?.addEventListener('click', (e) => {
      sound.playClick();
      e.target.classList.toggle('chip-active');
      state.radarLayers.forEach(l => map.hasLayer(l) ? map.removeLayer(l) : map.addLayer(l));
      showToast('Doppler Radar Layer toggled');
    });

    getEl('toggle-evac-btn')?.addEventListener('click', (e) => {
      sound.playClick();
      e.target.classList.toggle('chip-active');
      if (state.evacPolygon) {
        map.hasLayer(state.evacPolygon) ? map.removeLayer(state.evacPolygon) : map.addLayer(state.evacPolygon);
      }
      showToast('Evacuation Polygon toggled');
    });

    getEl('toggle-assets-btn')?.addEventListener('click', (e) => {
      sound.playClick();
      e.target.classList.toggle('chip-active');
      state.assetMarkers.forEach(m => map.hasLayer(m) ? map.removeLayer(m) : map.addLayer(m));
      showToast('NDRF Fleet Markers toggled');
    });

    getEl('toggle-shelters-btn')?.addEventListener('click', (e) => {
      sound.playClick();
      e.target.classList.toggle('chip-active');
      state.shelterMarkers.forEach(m => map.hasLayer(m) ? map.removeLayer(m) : map.addLayer(m));
      showToast('Shelter Markers toggled');
    });

  } catch (err) {
    console.error('Leaflet Map Init Error:', err);
  }
}

// Drone Feeds & FLIR Modal
function initDroneFeeds() {
  const droneModal = getEl('modal-drone-inspect');
  const closeDroneBtn = getEl('close-drone-modal');
  const toggleFlirBtn = getEl('toggle-flir-btn');
  const canvas = getEl('inspect-video-canvas');
  let isFlir = false;

  document.querySelectorAll('.drone-card').forEach(card => {
    card.addEventListener('click', () => {
      sound.playClick();
      document.querySelectorAll('.drone-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const camId = card.dataset.cam;

      const title = getEl('inspect-cam-title');
      if (title) title.innerText = `📹 DRONE RECON FEED INSPECTOR — CAM 0${camId}`;
      if (droneModal) droneModal.classList.remove('hidden');
    });
  });

  if (closeDroneBtn && droneModal) {
    closeDroneBtn.addEventListener('click', () => {
      droneModal.classList.add('hidden');
    });
  }

  if (toggleFlirBtn && canvas) {
    toggleFlirBtn.addEventListener('click', () => {
      sound.playClick();
      isFlir = !isFlir;
      canvas.classList.toggle('flir-mode', isFlir);
      toggleFlirBtn.innerText = isFlir ? 'FLIR THERMAL: ON' : 'FLIR THERMAL: OFF';
      showToast(`FLIR Thermal Mode: ${isFlir ? 'ACTIVE' : 'STANDBY'}`);
    });
  }

  const printBtn = getEl('print-aar-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      sound.playClick();
      window.print();
    });
  }
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
      showToast(`✅ NEW INCIDENT COMMITTED: ${title}`, 'alert');

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
        showToast(`⭐ APPOINTMENT CONFIRMED: ${name} as ${branchName}`);
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
      showToast(`🚛 ASSET REGISTERED: ${name}`);
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
    icon: "🛣️",
    status: "ready",
    statusLabel: "Engine ready",
    blurb: "Existing cascade engine (hop-1 / hop-2), extended with threat-zone geometry — radial, directional, or point-then-radiating.",
  },
  threshold: {
    id: "threshold",
    label: "Sustained-Load / Threshold",
    short: "Threshold",
    icon: "📈",
    status: "blocked-engine",
    statusLabel: "New engine required",
    blurb: "Tiered escalation over time, not a discrete trigger to inject. Needs a threshold/attrition engine — the current cascade engine doesn't apply.",
  },
  containment: {
    id: "containment",
    label: "Point-Source Containment",
    short: "Containment",
    icon: "🛡️",
    status: "ready",
    statusLabel: "Engine ready",
    blurb: "Existing cascade engine — the closest fit of any cluster. One clear origin node rather than a moving or expanding threat zone.",
  },
  crowd: {
    id: "crowd",
    label: "Crowd / Security",
    short: "Crowd",
    icon: "🚨",
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
          <span style="font-size:14px; opacity:0.8; margin-top:1px;">⚡</span>
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
      alertBox.innerHTML = critNodes.map(n => `<span class="alert-chip crit">⚠️ ${n.label}</span>`).join('') +
        warnNodes.map(n => `<span class="alert-chip warn">⚡ ${n.label}</span>`).join('');
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

      // Icon
      svgContent += `
        <g transform="translate(-10, -28)" color="${color}">
          <svg width="20" height="20" viewBox="0 0 24 24">${getSvgIconPath(n.icon)}</svg>
        </g>
      `;

      svgContent += `
        <text text-anchor="middle" y="6" font-size="15" font-weight="800" fill="${color}" font-family="JetBrains Mono, monospace">${s.value}</text>
        <text text-anchor="middle" y="58" font-size="10.5" font-weight="700" fill="var(--text-main)" letter-spacing="0.02em">${n.label}</text>
        <text text-anchor="middle" y="71" font-size="8.5" fill="var(--text-muted)" letter-spacing="0.03em">${fr.label} · ${s.source}</text>
      </g>`;
    });

    svg.innerHTML = svgContent;

    svg.querySelectorAll('g[data-node-id]').forEach(g => {
      g.addEventListener('click', () => {
        const nid = g.dataset.nodeId;
        depDispatch(nid);
      });
    });
  }

  // Render Capabilities List
  const nodesList = getEl('dep-nodes-status-list');
  if (nodesList) {
    nodesList.innerHTML = H.nodes.map(n => {
      const s = depScores[n.id] || { value: 8, updatedAt: depClock, source: 'baseline' };
      const color = depStatusColor(s.value);
      const age = depClock - s.updatedAt;
      const fr = depFreshness(age);
      return `
        <div class="node-card" style="opacity: ${fr.opacity};">
          <div class="node-row">
            <span class="node-name">${n.label}</span>
            <span class="node-score mono" style="color:${color};">${s.value}</span>
          </div>
          <div class="node-bar"><div class="node-bar-fill" style="width: ${s.value * 10}%; background:${color};"></div></div>
          <div class="node-meta">
            <span class="node-source ${fr.tier === 'fresh' ? 'fresh' : ''}">${s.source} · ${fr.label}</span>
            <button class="dispatch-btn" data-dispatch-id="${n.id}" title="Dispatch response to reinforce this capability">
              🛡️ Dispatch
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