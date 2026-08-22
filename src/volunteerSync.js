// =========================================================================
// VOLUNTEER REGISTRATION SYNC (Google Form -> Google Sheet -> Website)
// =========================================================================
//
// HOW THIS WORKS
// 1. Volunteers register through a Google Form (link the "+ REGISTER
//    VOLUNTEER" button to it — see openRegistrationForm() below).
// 2. The Form's responses land in a linked Google Sheet.
// 3. That Sheet is published to the web as CSV (File > Share > Publish to
//    web > select the responses tab > CSV > Publish). Paste that URL into
//    VOLUNTEER_SHEET_CSV_URL below.
// 4. This module fetches that CSV on page load and on an interval, parses
//    new rows, and merges them into state.volunteerPoolData as
//    status: 'REGISTERED', so they show up in the pool ready to be
//    assigned to a squad from the dropdown.
//
// SETUP CHECKLIST (do this once):
//   a) Create a Google Form with these fields, in this order:
//        - Full Name              (Short answer, required)
//        - Phone Number           (Short answer)
//        - Primary Skill          (Dropdown, required) — suggested options:
//              Water Rescue & First Aid
//              Ham Radio Operator
//              Boat Handling
//              Chainsaw / Tree Clearing
//              Shelter Management
//              Field Nursing
//              Logistics & Ham Radio
//              General Support
//              Other (add an "Other" option so it's never a dead end)
//        - Location / Block       (Short answer, required)
//   b) In the Form's "Responses" tab, click the green Sheets icon to
//      create the linked response Spreadsheet.
//   c) In that Spreadsheet: File > Share > Publish to web > choose the
//      response sheet tab > format "Comma-separated values (.csv)" > Publish.
//   d) Copy the resulting URL into VOLUNTEER_SHEET_CSV_URL below.
//   e) Copy the Form's live "Send" link into VOLUNTEER_FORM_URL below.
//
// Until both URLs are filled in, registration opens a placeholder tab and
// sync silently does nothing (no errors thrown at people who haven't set
// this up yet).
// =========================================================================

export const VOLUNTEER_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeaCANZky3OKG6idXEn1ZiGRHvIND337KT86NN__SSLdL-6gA/viewform?usp=publish-editor';
export const VOLUNTEER_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwdLJXOkQx8Nj9eDxOSmckSPrONg3JxEUOap0Kmslq-bV_5pyTE1gtpcXTvEm1FgHfbl2z7D4mvKI4/pub?gid=829303670&single=true&output=csv';

const AUTO_SYNC_INTERVAL_MS = 30_000; // 30s — adjust as needed

/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
 * and escaped quotes ("") inside quoted fields. Good enough for Google
 * Sheets' published CSV export.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

/**
 * Turns a raw CSV row into a volunteerPool-shaped object. Google Forms
 * headers are matched loosely (case/whitespace-insensitive) so small
 * wording differences in the Form don't break the sync.
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
 * Fetches the published Sheet CSV, parses it, and merges new/updated
 * Google Form registrations into state.volunteerPoolData in place.
 * Returns the number of newly-added volunteers (0 if nothing new, or if
 * VOLUNTEER_SHEET_CSV_URL hasn't been configured yet).
 */
export async function syncVolunteerRegistrations(state) {
  if (!VOLUNTEER_SHEET_CSV_URL) return 0;

  let text;
  try {
    const res = await fetch(VOLUNTEER_SHEET_CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    text = await res.text();
  } catch (err) {
    console.warn('Volunteer sync: could not reach the published Sheet CSV.', err);
    return 0;
  }

  const rows = parseCsv(text);
  if (rows.length < 2) return 0; // header only, or empty

  const headerRow = rows[0].map(h => h.trim().toLowerCase());
  const headerMap = {};
  headerRow.forEach((h, idx) => { headerMap[h] = idx; });

  const existingById = {};
  state.volunteerPoolData.forEach(v => { existingById[v.id] = v; });

  let addedCount = 0;
  for (const cells of rows.slice(1)) {
    const parsed = rowToVolunteer(headerMap, cells, existingById);
    if (!parsed) continue;

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
  const runSync = async () => {
    const added = await syncVolunteerRegistrations(state);
    if (onSync) onSync(added);
  };
  runSync(); // sync immediately on load
  setInterval(runSync, AUTO_SYNC_INTERVAL_MS);
}