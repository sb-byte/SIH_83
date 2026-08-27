// =========================================================================
// VOLUNTEER REGISTRATION SYNC (Google Form -> Google Sheet -> Website)
// =========================================================================
//
// HOW THIS WORKS
// 1. Volunteers register through a Google Form (link the "+ REGISTER
//    VOLUNTEER" button to it — see openRegistrationForm() below).
// 2. The Form's responses land in a linked Google Sheet.
// 3. This module reads that Sheet via the Google Sheets API v4 (read-only,
//    API-key auth) on page load and on an interval, and merges new rows
//    into state.volunteerPoolData as status: 'REGISTERED', so they show
//    up in the pool ready to be assigned to a squad from the dropdown.
//
// WHY THE SHEETS API INSTEAD OF "PUBLISH TO WEB" CSV: the CSV export does
// NOT send an Access-Control-Allow-Origin header, so browsers block the
// fetch outright with a CORS error — the site would silently never sync.
// The Sheets API v4 endpoint does support CORS for browser fetches, so
// this is the version that actually works in production, not just when
// you open the URL directly in a tab.
//
// SETUP CHECKLIST (do this once):
//   a) Create a Google Form with these fields, in this order:
//        - Full Name              (Short answer, required)
//        - Phone Number           (Short answer)
//        - Primary Skill          (Multiple choice, required) — suggested
//              options: Water Rescue & First Aid, Ham Radio Operator,
//              Boat Handling, Chainsaw / Tree Clearing, Shelter
//              Management, Field Nursing, Logistics & Ham Radio,
//              General Support, and an "Other" free-text option.
//        - Location / Block       (Short answer, required)
//   b) In the Form's "Responses" tab, click the green Sheets icon to
//      create the linked response Spreadsheet.
//   c) Open that Spreadsheet's normal edit URL — it looks like
//      https://docs.google.com/spreadsheets/d/AbCdEf12345.../edit — and
//      copy the ID between /d/ and /edit into VOLUNTEER_SHEET_ID below.
//   d) Make sure the Sheet is shared as "Anyone with the link – Viewer"
//      (Share button, top right) — the API key below can only read
//      public sheets, it can't authenticate as you.
//   e) In Google Cloud Console (console.cloud.google.com): create/select
//      a project > "APIs & Services" > "Library" > enable "Google Sheets
//      API" > "Credentials" > "Create Credentials" > "API key". Then
//      click the new key > "Restrict key" > under "API restrictions"
//      choose "Google Sheets API" only (so it can't be reused elsewhere).
//      Optionally also restrict by HTTP referrer to your site's domain.
//      Paste the key into VOLUNTEER_SHEETS_API_KEY below.
//   f) Copy the Form's live "Send" link into VOLUNTEER_FORM_URL below.
//
// Until VOLUNTEER_SHEET_ID and VOLUNTEER_SHEETS_API_KEY are both filled
// in, sync silently does nothing (no errors thrown at people who haven't
// set this up yet). Registration opens a friendly reminder instead of a
// broken link until VOLUNTEER_FORM_URL is set.
// =========================================================================

export const VOLUNTEER_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeaCANZky3OKG6idXEn1ZiGRHvIND337KT86NN__SSLdL-6gA/viewform?usp=publish-editor';

export const VOLUNTEER_SHEET_ID = '1zgub9vwpm2WqsuF_hTLtPWsY2m3VniMy7SG21Bx8B1Y';
export const VOLUNTEER_SHEET_RANGE = 'Form Responses 1!A:E'; // tab name + column range
export const VOLUNTEER_SHEETS_API_KEY = 'AIzaSyCt0rNMthzo48T0TnMF0V6QzPU4xQ7DWUs';

const AUTO_SYNC_INTERVAL_MS = 30_000; // 30s — adjust as needed

// =========================================================================
// REMOVED VOLUNTEERS (persisted locally so deletions stick)
// =========================================================================
//
// Deletions need to survive two things that would otherwise undo them:
//   - a page reload (which reseeds the pool from the hardcoded data.js list)
//   - the next auto-sync (which would re-pull a still-present Sheet row)
// So removals are tracked by ID in localStorage and filtered out of both
// the initial seed list and every future sync, regardless of whether the
// volunteer originally came from data.js or the Google Form.
const REMOVED_IDS_KEY = 'unity-eoc-removed-volunteer-ids';

function getRemovedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(REMOVED_IDS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveRemovedIds(idSet) {
  try {
    localStorage.setItem(REMOVED_IDS_KEY, JSON.stringify([...idSet]));
  } catch (err) {
    console.warn('Could not persist removed volunteer IDs.', err);
  }
}

/** Filters a volunteer array against the removed-IDs list. Call this on
 * the initial hardcoded seed list before first render. */
export function filterRemovedVolunteers(volunteers) {
  const removed = getRemovedIds();
  return volunteers.filter(v => !removed.has(v.id));
}

/** Permanently removes a volunteer from the site (persists across reloads
 * and future syncs). Mutates state.volunteerPoolData in place. */
export function removeVolunteer(state, volunteerId) {
  const removed = getRemovedIds();
  removed.add(volunteerId);
  saveRemovedIds(removed);

  const idx = state.volunteerPoolData.findIndex(v => v.id === volunteerId);
  if (idx !== -1) state.volunteerPoolData.splice(idx, 1);
}

/**
 * Turns a raw Sheets API row (array of cell strings) into a
 * volunteerPool-shaped object. Header matching is case/whitespace
 * insensitive so small wording differences in the Form don't break sync.
 */
function rowToVolunteer(headerMap, cells, existingById) {
  const get = (label) => {
    const idx = headerMap[label];
    return idx !== undefined ? (cells[idx] || '').trim() : '';
  };

  const timestamp = get('timestamp');
  const name = get('full name') || get('name');
  const phone = get('phone number') || get('phone');
  const skill = get('primary skill') || get('skill') || 'General Support';
  const location = get('location / block') || get('location') || 'Unassigned Sector';

  if (!name || !timestamp) return null; // skip malformed rows

  // Stable ID derived from the response timestamp, so re-syncing the same
  // row never creates a duplicate entry.
  const id = `AM-VOL-GF-${timestamp.replace(/[^0-9A-Za-z]/g, '')}`;

  // Preserve any assignment already made on the site for this volunteer —
  // syncing should never demote an ASSIGNED volunteer back to REGISTERED.
  const existing = existingById[id];

  return {
    id,
    name,
    phone: phone || undefined,
    skill,
    location,
    status: existing ? existing.status : 'REGISTERED',
    squad: existing ? existing.squad : null,
  };
}

/**
 * Fetches the response Sheet via the Sheets API v4, and merges new/updated
 * Google Form registrations into state.volunteerPoolData in place.
 * Returns the number of newly-added volunteers (0 if nothing new, or if
 * VOLUNTEER_SHEET_ID / VOLUNTEER_SHEETS_API_KEY haven't been set yet).
 */
export async function syncVolunteerRegistrations(state) {
  if (!VOLUNTEER_SHEET_ID || !VOLUNTEER_SHEETS_API_KEY) return 0;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${VOLUNTEER_SHEET_ID}/values/${encodeURIComponent(VOLUNTEER_SHEET_RANGE)}?key=${VOLUNTEER_SHEETS_API_KEY}`;

  let values;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Sheets API fetch failed: ${res.status}`);
    const data = await res.json();
    values = data.values || [];
  } catch (err) {
    console.warn('Volunteer sync: could not reach the Google Sheets API.', err);
    return 0;
  }

  if (values.length < 2) return 0; // header only, or empty

  const headerRow = values[0].map(h => String(h).trim().toLowerCase());
  const headerMap = {};
  headerRow.forEach((h, idx) => { headerMap[h] = idx; });

  const existingById = {};
  state.volunteerPoolData.forEach(v => { existingById[v.id] = v; });
  const removedIds = getRemovedIds();

  let addedCount = 0;
  for (const cells of values.slice(1)) {
    const parsed = rowToVolunteer(headerMap, cells, existingById);
    if (!parsed) continue;
    if (removedIds.has(parsed.id)) continue; // deleted on the site — stay gone

    const idx = state.volunteerPoolData.findIndex(v => v.id === parsed.id);
    if (idx === -1) {
      state.volunteerPoolData.unshift(parsed);
      addedCount++;
    } else {
      // Update contact/skill/location details but never clobber a squad
      // assignment already made on the site (handled in rowToVolunteer).
      state.volunteerPoolData[idx] = { ...state.volunteerPoolData[idx], ...parsed };
    }
  }

  return addedCount;
}

/** Opens the Google Form for a new volunteer to register. */
export function openRegistrationForm() {
  if (!VOLUNTEER_FORM_URL) {
    alert(
      'The volunteer registration Google Form link hasn\'t been set yet.\n\n' +
      'Add it to VOLUNTEER_FORM_URL in src/volunteerSync.js once the form is created.'
    );
    return;
  }
  window.open(VOLUNTEER_FORM_URL, '_blank', 'noopener');
}

/** Starts the periodic background sync. Call once on app init. */
export function startAutoSync(state, onSync) {
  const runSync = async (isInitial = false) => {
    const added = await syncVolunteerRegistrations(state);
    if (onSync) onSync(added, isInitial);
  };
  runSync(true); // sync immediately on load silently
  setInterval(() => runSync(false), AUTO_SYNC_INTERVAL_MS);
}