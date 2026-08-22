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
      state.sheltersData[idx].occupied = Math.max(0, state.sheltersData[idx].occupied - 10);
      renderShelterMatrix();
      renderShelters();
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
    });
  });
}

const addShelterBtn = getEl('add-shelter-btn');
if (addShelterBtn) {
  addShelterBtn.addEventListener('click', () => {
    sound.playClick();
    const name = prompt('Enter Shelter Name (e.g. MCS Chandbali Community Hall):', 'MCS Chandbali Community Hall');
    if (!name) return;
    const capacity = parseInt(prompt('Enter Total Capacity:', '250'), 10);
    if (!capacity || capacity <= 0) { showToast('Invalid capacity value'); return; }
    state.sheltersData.push({
      id: `MCS-${String(state.sheltersData.length + 1).padStart(2, '0')}`,
      name,
      capacity,
      occupied: 0,
      status: 'AVAILABLE',
      lat: 20.5,
      lng: 86.5,
      medical: 'Not Yet Staffed',
      foodRations: 'Pending Stock'
    });
    renderShelterMatrix();
    renderShelters();
    showToast(`🏠 Shelter registered: ${name}`);
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
    });
  });
}

const addMutualAidBtn = getEl('add-mutual-aid-btn');
if (addMutualAidBtn) {
  addMutualAidBtn.addEventListener('click', () => {
    sound.playClick();
    const agency = prompt('Requesting Agency:', 'Jagatsinghpur District EOC');
    if (!agency) return;
    const resource = prompt('Resource Requested:', 'High-Water Rescue Trucks');
    if (!resource) return;
    const qty = parseInt(prompt('Quantity:', '2'), 10) || 1;
    state.mutualAidData.unshift({
      id: `MA-${String(state.mutualAidData.length + 1).padStart(2, '0')}`,
      agency,
      resource,
      qty,
      priority: 'HIGH',
      status: 'PENDING',
      requestedAt: 'Just now',
      approvedBy: null
    });
    renderMutualAid();
    renderAarMutualAidSummary();
    showToast(`🤝 Mutual aid request logged: ${agency}`);
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
      if (!confirm(`Remove ${vol.name} from the volunteer pool? This can't be undone from here — if they registered via the Google Form, also delete their row in the response Sheet to keep things tidy.`)) return;
      removeVolunteer(state, volId);
      renderVolunteerPool();
      showToast(`🗑 ${vol.name} removed from the pool`);
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
      } else {
        showToast(`🟡 [EXERCISE SANDBOX]: Alert queued to simulation terminals only.`);
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

// Damage Table & Corrective Actions
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
        // Render chart when switching to make sure dimensions are ready
        setTimeout(() => { depRunSim(); }, 50);
      }
    });
  });

  // Preset button listeners
  const presetFlood = getEl('dep-preset-flood');
  const presetWildfire = getEl('dep-preset-wildfire');
  const presetEarthquake = getEl('dep-preset-earthquake');
  const presetBlank = getEl('dep-preset-blank');

  if (presetFlood) presetFlood.addEventListener('click', () => { sound.playClick(); depLoadPreset('flood'); });
  if (presetWildfire) presetWildfire.addEventListener('click', () => { sound.playClick(); depLoadPreset('wildfire'); });
  if (presetEarthquake) presetEarthquake.addEventListener('click', () => { sound.playClick(); depLoadPreset('earthquake'); });
  if (presetBlank) presetBlank.addEventListener('click', () => { sound.playClick(); depLoadPreset('blank'); });

  // Add Node and Add Edge buttons
  const addNodeBtn = getEl('dep-add-node-btn');
  const addEdgeBtn = getEl('dep-add-edge-btn');

  if (addNodeBtn) addNodeBtn.addEventListener('click', () => {
    sound.playClick();
    depNodes.push(depNewNode({ label: `Lifeline Node ${depNodes.length + 1}` }));
    depRenderAll();
    showToast('Infrastructure node added');
  });

  if (addEdgeBtn) addEdgeBtn.addEventListener('click', () => {
    sound.playClick();
    if (depNodes.length < 2) {
      showToast('Need at least 2 nodes to create a dependency edge', 'alert');
      return;
    }
    depEdges.push({ from: depNodes[0].id, to: depNodes[1].id, weight: 0.5 });
    depRenderAll();
    showToast('Dependency cascade edge added');
  });

  // Run Simulation button
  const runSimBtn = getEl('dep-run-sim-btn');
  if (runSimBtn) runSimBtn.addEventListener('click', () => {
    sound.playClick();
    depRunSim();
    showToast('⚡ Cascade simulation executed');
  });

  // Run Fuzz button
  const runFuzzBtn = getEl('dep-run-fuzz-btn');
  if (runFuzzBtn) runFuzzBtn.addEventListener('click', () => {
    sound.playCriticalAlert();
    depRunFuzz();
    showToast('🎲 Monte Carlo 300-run vulnerability analysis completed!');
  });

  // Initial load
  depLoadPreset('flood');
}

function depRenderPlan(kind) {
  const panel = getEl('dep-plan-panel');
  const body = getEl('dep-plan-body');
  if (!panel || !body) return;
  const plan = DEP_BASELINE_PLANS[kind];
  if (!plan) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  body.innerHTML = `
    <div style="margin-bottom:6px;"><span style="color:var(--text-muted);">Lead capability:</span> <strong class="text-saffron">${plan.leadCapability}</strong></div>
    <div style="margin-bottom:6px;"><span style="color:var(--text-muted);">Evacuation logic:</span> <strong>${plan.evacuation}</strong></div>
    <div><span style="color:var(--text-muted);">Key dependencies:</span> <strong>${plan.dependencies.join(' · ')}</strong></div>
  `;
}

function depLoadPreset(kind) {
  depIdSeq = 1;
  if (kind === 'blank') {
    depNodes = [];
    depEdges = [];
    depRenderPlan(null);
    depRenderAll();
    return;
  }
  depRenderPlan(kind);
  if (kind === 'flood') {
    depNodes = [
      depNewNode({ id: 'n1', label: 'Baitarani Tributary A', capacity: 100, recovery: 6, fragility: 0.7, hazardType: 'pulse', hazardMag: 95, hazardStart: 2, hazardDuration: 6 }),
      depNewNode({ id: 'n2', label: 'Salandi Tributary B', capacity: 100, recovery: 5, fragility: 0.6, hazardType: 'pulse', hazardMag: 70, hazardStart: 3, hazardDuration: 6 }),
      depNewNode({ id: 'n3', label: 'Mainstem Embankment', capacity: 100, recovery: 3, fragility: 0.5, hazardType: 'none' }),
      depNewNode({ id: 'n4', label: 'Coastal Levee Integrity', capacity: 100, recovery: 2, fragility: 0.6, hazardType: 'none' }),
      depNewNode({ id: 'n5', label: 'Dewatering Pump Capacity', capacity: 100, recovery: 4, fragility: 0.4, hazardType: 'none' }),
      depNewNode({ id: 'n6', label: 'Dhamra Port Sector A', capacity: 100, recovery: 2, fragility: 0.8, hazardType: 'none' }),
      depNewNode({ id: 'n7', label: 'Chandbali Evacuation Sector B', capacity: 100, recovery: 2, fragility: 0.8, hazardType: 'none' }),
    ];
    depEdges = [
      { from: 'n1', to: 'n3', weight: 0.6 },
      { from: 'n2', to: 'n3', weight: 0.6 },
      { from: 'n3', to: 'n4', weight: 0.5 },
      { from: 'n3', to: 'n5', weight: 0.3 },
      { from: 'n3', to: 'n6', weight: 0.6 },
      { from: 'n4', to: 'n6', weight: 0.5 },
      { from: 'n3', to: 'n7', weight: 0.4 },
      { from: 'n4', to: 'n7', weight: 0.3 },
    ];
  } else if (kind === 'wildfire') {
    depNodes = [
      depNewNode({ id: 'n1', label: 'Wind & Humidity Conditions', capacity: 100, recovery: 1, fragility: 0.5, hazardType: 'sustained', hazardMag: 75, hazardStart: 0, hazardDuration: 40 }),
      depNewNode({ id: 'n2', label: 'Forest Fire Perimeter', capacity: 100, recovery: 2, fragility: 0.8, hazardType: 'none' }),
      depNewNode({ id: 'n3', label: 'Air Tanker Availability', capacity: 100, recovery: 3, fragility: 0.5, hazardType: 'none' }),
      depNewNode({ id: 'n4', label: 'Defensible Break Line', capacity: 100, recovery: 2, fragility: 0.6, hazardType: 'none' }),
      depNewNode({ id: 'n5', label: 'Comms Relay Tower', capacity: 100, recovery: 1, fragility: 0.9, hazardType: 'spike', hazardMag: 100, hazardStart: 8, hazardDuration: 2 }),
      depNewNode({ id: 'n6', label: 'Valley Evac Corridor', capacity: 100, recovery: 3, fragility: 0.7, hazardType: 'none' }),
      depNewNode({ id: 'n7', label: 'Settlement Risk Level', capacity: 100, recovery: 2, fragility: 0.8, hazardType: 'none' }),
    ];
    depEdges = [
      { from: 'n1', to: 'n2', weight: 0.8 },
      { from: 'n2', to: 'n3', weight: 0.6 },
      { from: 'n2', to: 'n4', weight: 0.7 },
      { from: 'n2', to: 'n6', weight: 0.5 },
      { from: 'n5', to: 'n6', weight: 0.4 },
      { from: 'n6', to: 'n7', weight: 0.6 },
      { from: 'n4', to: 'n7', weight: 0.5 },
      { from: 'n3', to: 'n7', weight: 0.3 },
    ];
  } else if (kind === 'earthquake') {
    depNodes = [
      depNewNode({ id: 'n1', label: 'Masonry Building Stock', capacity: 100, recovery: 1, fragility: 0.9, hazardType: 'pulse', hazardMag: 95, hazardStart: 1, hazardDuration: 2 }),
      depNewNode({ id: 'n2', label: 'Highway & Bridge Grid', capacity: 100, recovery: 3, fragility: 0.6, hazardType: 'none' }),
      depNewNode({ id: 'n3', label: 'Substation & Gas Trunklines', capacity: 100, recovery: 3, fragility: 0.6, hazardType: 'none' }),
      depNewNode({ id: 'n4', label: 'Hospital Trauma Surge', capacity: 100, recovery: 2, fragility: 0.7, hazardType: 'none' }),
      depNewNode({ id: 'n5', label: 'NDRF USAR Rescue Teams', capacity: 100, recovery: 2, fragility: 0.5, hazardType: 'none' }),
      depNewNode({ id: 'n6', label: 'District Containment', capacity: 100, recovery: 2, fragility: 0.8, hazardType: 'none' }),
    ];
    depEdges = [
      { from: 'n1', to: 'n2', weight: 0.7 },
      { from: 'n1', to: 'n3', weight: 0.6 },
      { from: 'n1', to: 'n4', weight: 0.4 },
      { from: 'n2', to: 'n4', weight: 0.5 },
      { from: 'n1', to: 'n5', weight: 0.5 },
      { from: 'n4', to: 'n6', weight: 0.6 },
      { from: 'n2', to: 'n6', weight: 0.5 },
      { from: 'n3', to: 'n6', weight: 0.4 },
    ];
  }
  depRenderAll();
  depRunSim();
}

function depRenderNodes() {
  const list = getEl('dep-node-list');
  if (!list) return;
  list.innerHTML = '';
  if (depNodes.length === 0) {
    list.innerHTML = '<div class="empty-state mono text-xs text-muted">No infrastructure nodes defined. Click "+ ADD NODE" or choose a preset above.</div>';
    return;
  }

  depNodes.forEach(n => {
    const card = document.createElement('div');
    card.className = 'dep-node-card';
    card.innerHTML = `
      <div class="dep-node-row1">
        <input type="text" class="dep-node-name-input" value="${n.label}" data-node-id="${n.id}" data-key="label">
        <button class="btn btn-xs btn-outline text-alert font-bold" data-remove-node="${n.id}">REMOVE</button>
      </div>
      <div class="dep-field-grid">
        <div class="dep-field">
          <label>Initial Capacity (0-100)</label>
          <input type="number" min="0" max="100" class="dep-input" value="${n.capacity}" data-node-id="${n.id}" data-key="capacity">
        </div>
        <div class="dep-field">
          <label>Recovery / Tick</label>
          <input type="number" min="0" max="20" class="dep-input" value="${n.recovery}" data-node-id="${n.id}" data-key="recovery">
        </div>
        <div class="dep-field">
          <label>Fragility Factor (0-1)</label>
          <input type="number" step="0.1" min="0" max="1" class="dep-input" value="${n.fragility}" data-node-id="${n.id}" data-key="fragility">
        </div>
        <div class="dep-field">
          <label>Hazard Wave Type</label>
          <select class="dep-select" data-node-id="${n.id}" data-key="hazardType">
            ${['none', 'spike', 'pulse', 'sustained', 'ramp', 'random'].map(t => `<option value="${t}" ${n.hazardType === t ? 'selected' : ''}>${t.toUpperCase()}</option>`).join('')}
          </select>
        </div>
        <div class="dep-field">
          <label>Hazard Magnitude</label>
          <input type="number" min="0" max="150" class="dep-input" value="${n.hazardMag}" data-node-id="${n.id}" data-key="hazardMag">
        </div>
        <div class="dep-field">
          <label>Hazard Start Tick</label>
          <input type="number" min="0" max="120" class="dep-input" value="${n.hazardStart}" data-node-id="${n.id}" data-key="hazardStart">
        </div>
        <div class="dep-field">
          <label>Hazard Duration</label>
          <input type="number" min="0" max="120" class="dep-input" value="${n.hazardDuration}" data-node-id="${n.id}" data-key="hazardDuration">
        </div>
        <div class="dep-field">
          <label>Strained / Critical Cutoffs</label>
          <div style="display:flex;gap:4px;">
            <input type="number" min="0" max="100" class="dep-input" style="width:50%" value="${n.threshStrained}" data-node-id="${n.id}" data-key="threshStrained" title="Strained threshold">
            <input type="number" min="0" max="100" class="dep-input" style="width:50%" value="${n.threshCritical}" data-node-id="${n.id}" data-key="threshCritical" title="Critical threshold">
          </div>
        </div>
      </div>
    `;

    // Event listeners for inputs
    card.querySelectorAll('input, select').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const id = e.target.dataset.nodeId;
        const key = e.target.dataset.key;
        const val = e.target.type === 'number' ? +e.target.value : e.target.value;
        const targetNode = depNodes.find(item => item.id === id);
        if (targetNode) targetNode[key] = val;
        depRenderEdges(); // update dropdown labels if name changed
        depRunSim();
      });
    });

    // Remove node button
    const rmBtn = card.querySelector('[data-remove-node]');
    if (rmBtn) {
      rmBtn.addEventListener('click', () => {
        sound.playClick();
        depNodes = depNodes.filter(item => item.id !== n.id);
        depEdges = depEdges.filter(e => e.from !== n.id && e.to !== n.id);
        depRenderAll();
        depRunSim();
      });
    }

    list.appendChild(card);
  });
}

function depRenderEdges() {
  const list = getEl('dep-edge-list');
  if (!list) return;
  list.innerHTML = '';
  if (depEdges.length === 0) {
    list.innerHTML = '<div class="empty-state mono text-xs text-muted">No dependency edges. Click "+ ADD EDGE" to connect nodes.</div>';
    return;
  }

  depEdges.forEach((e, idx) => {
    const row = document.createElement('div');
    row.className = 'dep-edge-row';
    const opts = depNodes.map(n => `<option value="${n.id}">${n.label}</option>`).join('');
    row.innerHTML = `
      <select class="dep-select dep-edge-from">${depNodes.map(n => `<option value="${n.id}" ${n.id === e.from ? 'selected' : ''}>${n.label}</option>`).join('')}</select>
      <span class="dep-arrow-sep">→</span>
      <select class="dep-select dep-edge-to">${depNodes.map(n => `<option value="${n.id}" ${n.id === e.to ? 'selected' : ''}>${n.label}</option>`).join('')}</select>
      <input type="number" step="0.1" min="0" max="1" class="dep-input dep-edge-weight" value="${e.weight}" title="Transfer weight (0.0 to 1.0)">
      <button class="btn btn-xs btn-outline text-alert font-bold" data-remove-edge="${idx}">×</button>
    `;

    const fromSel = row.querySelector('.dep-edge-from');
    const toSel = row.querySelector('.dep-edge-to');
    const weightInp = row.querySelector('.dep-edge-weight');
    const rmBtn = row.querySelector('[data-remove-edge]');

    if (fromSel) fromSel.addEventListener('change', (evt) => { depEdges[idx].from = evt.target.value; depRunSim(); });
    if (toSel) toSel.addEventListener('change', (evt) => { depEdges[idx].to = evt.target.value; depRunSim(); });
    if (weightInp) weightInp.addEventListener('change', (evt) => { depEdges[idx].weight = +evt.target.value; depRunSim(); });
    if (rmBtn) rmBtn.addEventListener('click', () => {
      sound.playClick();
      depEdges.splice(idx, 1);
      depRenderEdges();
      depRunSim();
    });

    list.appendChild(row);
  });
}

function depRenderAll() {
  depRenderNodes();
  depRenderEdges();
}

function depHazardAt(n, tick) {
  const t = tick - n.hazardStart;
  if (t < 0) return 0;
  switch (n.hazardType) {
    case 'none': return 0;
    case 'spike': return t < n.hazardDuration ? n.hazardMag : 0;
    case 'sustained': return t < n.hazardDuration ? n.hazardMag : 0;
    case 'ramp': {
      if (t > n.hazardDuration) return n.hazardMag;
      return n.hazardMag * (t / Math.max(1, n.hazardDuration));
    }
    case 'pulse': {
      if (t > n.hazardDuration * 3) return 0;
      if (t <= n.hazardDuration) return n.hazardMag * (t / n.hazardDuration);
      return n.hazardMag * Math.exp(-(t - n.hazardDuration) / (n.hazardDuration * 0.8));
    }
    case 'random': {
      if (t > n.hazardDuration) return 0;
      return Math.max(0, n.hazardMag * (0.6 + Math.random() * 0.8));
    }
    default: return 0;
  }
}

function depStatusFor(n, capacity) {
  if (capacity < n.threshCritical * 0.5) return 'Failed';
  if (capacity < n.threshCritical) return 'Critical';
  if (capacity < n.threshStrained) return 'Strained';
  return 'Normal';
}

function depSimulate(nodesCfg, edgesCfg, ticks, seedNoise) {
  const stateMap = {};
  nodesCfg.forEach(n => { stateMap[n.id] = n.capacity; });
  const history = { ticks: [], series: {} };
  nodesCfg.forEach(n => { history.series[n.id] = []; });

  for (let t = 0; t < ticks; t++) {
    const outputLoad = {};
    nodesCfg.forEach(n => { outputLoad[n.id] = Math.max(0, 100 - stateMap[n.id]); });

    const newState = {};
    nodesCfg.forEach(n => {
      let hazard = depHazardAt(n, t);
      if (seedNoise) hazard *= seedNoise[n.id] ?? 1;
      let incoming = 0;
      edgesCfg.forEach(e => {
        if (e.to === n.id) incoming += e.weight * (outputLoad[e.from] || 0);
      });
      const totalStress = hazard + incoming;
      let cap = stateMap[n.id];
      const frag = seedNoise ? n.fragility * (seedNoise['frag_' + n.id] ?? 1) : n.fragility;
      const rec = seedNoise ? n.recovery * (seedNoise['rec_' + n.id] ?? 1) : n.recovery;
      if (totalStress > cap) {
        cap = cap - frag * (totalStress - cap) * 0.15;
      } else {
        cap = cap + rec * 0.5;
      }
      cap = Math.max(0, Math.min(100, cap));
      newState[n.id] = cap;
    });
    Object.assign(stateMap, newState);
    history.ticks.push(t);
    nodesCfg.forEach(n => { history.series[n.id].push(stateMap[n.id]); });
  }
  return history;
}

let depLastHistory = null;

function depRunSim() {
  if (depNodes.length === 0) return;
  const ticksInput = getEl('dep-ticks-input');
  const ticks = ticksInput ? (+ticksInput.value || 30) : 30;
  depLastHistory = depSimulate(depNodes, depEdges, ticks, null);
  depDrawChart(depLastHistory);
  depRenderFinalTable(depLastHistory);

  const statusTag = getEl('dep-sim-status-tag');
  if (statusTag) statusTag.innerText = `CASCADE CONVERGED (T=${ticks})`;
}

function depDrawChart(history) {
  const svg = getEl('chart-cap');
  if (!svg) return;
  const W = 940, H = 340, padL = 40, padR = 15, padT = 16, padB = 32;
  const n = history.ticks.length;
  const xFor = i => padL + (W - padL - padR) * (i / (Math.max(1, n - 1)));
  const top = padT, h = H - padT - padB;
  const yFor = v => top + h - (v / 100) * h;
  let s = '';

  // Horizontal Grid Lines & Y Labels
  [0, 25, 50, 75, 100].forEach(v => {
    const y = yFor(v);
    s += `<line class="axis-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`;
    s += `<text class="chart-label" x="4" y="${(y + 3).toFixed(1)}">${v}%</text>`;
  });

  // Series Lines
  const ids = Object.keys(history.series);
  ids.forEach((id, idx) => {
    const vals = history.series[id];
    const path = vals.map((v, i) => (i === 0 ? 'M' : 'L') + xFor(i).toFixed(1) + ',' + yFor(v).toFixed(1)).join(' ');
    s += `<path d="${path}" fill="none" stroke="${DEP_COLORS[idx % DEP_COLORS.length]}" stroke-width="2.5" stroke-linecap="round"/>`;
  });

  // X-axis Time Labels
  const step = Math.max(1, Math.ceil(n / 10));
  for (let i = 0; i < n; i += step) {
    s += `<text class="chart-label" x="${xFor(i).toFixed(1)}" y="${H - padB + 18}" text-anchor="middle">T+${i}</text>`;
  }
  svg.innerHTML = s;

  // Legend
  const legend = getEl('legend-cap');
  if (legend) {
    legend.innerHTML = '';
    ids.forEach((id, idx) => {
      const nd = depNodes.find(n => n.id === id);
      const item = document.createElement('div');
      item.className = 'dep-legend-item';
      item.innerHTML = `<span class="dep-legend-swatch" style="background:${DEP_COLORS[idx % DEP_COLORS.length]}"></span>${nd ? nd.label : id}`;
      legend.appendChild(item);
    });
  }
}

function depRenderFinalTable(history) {
  const body = getEl('dep-final-table-body');
  if (!body) return;
  body.innerHTML = '';
  depNodes.forEach(n => {
    const vals = history.series[n.id];
    if (!vals || vals.length === 0) return;
    const finalCap = vals[vals.length - 1];
    const status = depStatusFor(n, finalCap);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${n.label}</strong></td>
      <td class="text-right mono font-bold">${finalCap.toFixed(1)}%</td>
      <td><span class="dep-status-pill dep-status-${status}">${status.toUpperCase()}</span></td>
    `;
    body.appendChild(tr);
  });
}

function depRunFuzz() {
  if (depNodes.length === 0) return;
  const ticksInput = getEl('dep-ticks-input');
  const ticks = ticksInput ? (+ticksInput.value || 30) : 30;
  const N = 300;
  const results = [];

  for (let run = 0; run < N; run++) {
    const noise = {};
    depNodes.forEach(n => {
      noise[n.id] = 0.6 + Math.random() * 0.8;
      noise['frag_' + n.id] = 0.7 + Math.random() * 0.6;
      noise['rec_' + n.id] = 0.7 + Math.random() * 0.6;
    });
    const hist = depSimulate(depNodes, depEdges, ticks, noise);
    const failedSet = [];
    let minCapByNode = {};
    depNodes.forEach(n => {
      const vals = hist.series[n.id];
      const minCap = Math.min(...vals);
      minCapByNode[n.id] = minCap;
      if (depStatusFor(n, minCap) === 'Failed') failedSet.push(n.label);
    });
    results.push({ failedSet: failedSet.sort(), minCapByNode });
  }

  const byCombo = {};
  results.forEach(r => {
    const key = r.failedSet.length ? r.failedSet.join(' + ') : '(None Failed)';
    if (!byCombo[key]) byCombo[key] = [];
    const worst = Math.min(...Object.values(r.minCapByNode));
    byCombo[key].push(worst);
  });

  const ranked = Object.entries(byCombo).map(([combo, vals]) => ({
    combo,
    n: vals.length,
    avgWorst: vals.reduce((a, b) => a + b, 0) / vals.length
  })).sort((a, b) => a.avgWorst - b.avgWorst).slice(0, 8);

  const multi = results.filter(r => r.failedSet.length >= 2).length;
  const fuzzNote = getEl('dep-fuzz-note');
  if (fuzzNote) {
    fuzzNote.innerText = `${N} RUNS · ${(100 * multi / N).toFixed(0)}% MULTI-LIFELINE SYSTEMIC COLLAPSE`;
  }

  const body = getEl('dep-fuzz-body');
  if (body) {
    body.innerHTML = `
      <table class="dep-data-table">
        <thead>
          <tr>
            <th>CONCURRENT COLLAPSE COMBINATION</th>
            <th class="text-right">RUNS</th>
            <th class="text-right">AVG WORST-CASE CAPACITY</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map(r => `
            <tr>
              <td><strong class="text-alert">${r.combo}</strong></td>
              <td class="text-right mono font-bold">${r.n}</td>
              <td class="text-right mono font-bold ${r.avgWorst < 25 ? 'text-alert' : 'text-saffron'}">${r.avgWorst.toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}