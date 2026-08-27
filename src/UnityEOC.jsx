import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  AlertTriangle, Radio, Zap, Route, Users, Building2, Truck, Droplet,
  RotateCcw, ShieldAlert, ShieldPlus, Activity, Star, GitMerge, ClipboardList,
  Lock, Target, Layers, Gauge, Play, Pause, Square, Rewind, Eye, UserCog,
  FileText, Plus, X, Send, ListChecks, Radar, CalendarClock, Flame, Wind,
  CheckCircle2, XCircle, ArrowUpRight, ShieldCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Unity EOC — dependency graph engine demo (v3 - Light Mode Edition)
//
// Selection model, rebuilt:
//   1. Pick one of the 4 CLUSTERS. Each cluster ships a GENERIC template —
//      hazard-agnostic nodes/edges/presets that are good enough for a
//      severity 1-5 event on their own.
//   2. A severity slider (1-10) scales baseline capacity and failure
//      intensity for whatever template is active, generic or specific.
//   3. Optionally drill into a SPECIFIC crisis within the cluster. This is
//      only really necessary at severity 6-10, where the generic template's
//      abstraction stops being good enough and the specific dependency
//      shape of the actual hazard starts to matter. Below that, the UI says
//      so and defaults to generic.
//   4. Specific Cluster 1 builds are available for Flood, Wildfire,
//      Earthquake, Hurricane/Cyclone, Tornado, and Landslide/Mudslide.
//      Every other specific crisis is listed (so the
//      option is visible and the scope is honest) but falls back to its
//      cluster's generic template with a "not yet detailed" note.
//      This includes a growing set of non-disaster crisis types (stampede,
//      bomb threat, hostage situation, cyberattack, prison riot, water/food
//      contamination, gas leak evacuation, etc.) — added as dropdown-only
//      placeholders (full: false) per cluster. No nodes/edges/presets have
//      been built for these yet; they exist so the option is visible.
//   5. Clusters 2 and 4 remain plan-only — the cascade engine underneath
//      this prototype is the wrong shape for sustained-load and crowd
//      dynamics, so those two show their Management Plan instead of a
//      graph that would misrepresent what the model can actually do.
//   6. Escalation Requests & Approvals: Field & agency escalation workflow
//      with multi-tier authorization, resource replenishment, and capability reinforcement.
// ---------------------------------------------------------------------------

const CLUSTERS = {
  1: {
    title: "Directional Evacuation",
    short: "Evacuation",
    color: "#2563eb",
    buildable: true,
    plan: {
      engineMode: "Cascade engine (hop-1 / hop-2 propagation) with a spreading threat geometry.",
      coreNodes: "Infrastructure access, power, communications, population safety, response teams, medical capacity.",
      needed: [
        { label: "Threat-zone geometry", text: "radial, directional, or point-then-radiating — set per specific crisis once built." },
        { label: "Time-to-impact clock", text: "a countdown distinct from node degradation." },
        { label: "Route capacity vs. population load", text: "infrastructure access split into capacity and demand." },
      ],
      dispatch: "Response / transport teams, plus shelter-intake coordination.",
      responseLogic: "Reinforcement action — dispatch raises a node's score and ripples a relief cascade to dependents.",
      demoNote: "Live-demoable now. Generic template covers severity 1-5; use a full specific crisis build at severity 6-10 when its operational dependencies matter.",
    },
    generic: {
      nodes: [
        { id: "infra", label: "Critical Infrastructure", icon: Route, x: 130, y: 90, desc: "Roads, bridges, and access routes into the affected area." },
        { id: "power", label: "Power Grid", icon: Zap, x: 400, y: 60, desc: "Electricity supply keeping critical systems running." },
        { id: "comms", label: "Communications", icon: Radio, x: 660, y: 90, desc: "Phone, radio, and internet used to coordinate the response." },
        { id: "population", label: "Population Safety", icon: Users, x: 250, y: 300, desc: "Overall safety and wellbeing of people in the affected zone." },
        { id: "response", label: "Response Teams", icon: Truck, x: 540, y: 300, desc: "Teams and vehicles available to physically respond." },
        { id: "medical", label: "Medical Capacity", icon: Building2, x: 395, y: 420, desc: "Hospitals and emergency medical capacity." },
      ],
      edges: [
        { from: "infra", to: "response", w: 0.6 },
        { from: "infra", to: "population", w: 0.3 },
        { from: "power", to: "comms", w: 0.5 },
        { from: "power", to: "medical", w: 0.4 },
        { from: "comms", to: "population", w: 0.5 },
        { from: "comms", to: "response", w: 0.5 },
        { from: "population", to: "medical", w: 0.3 },
        { from: "response", to: "medical", w: 0.4 },
      ],
      presets: [
        { id: "infra_down", label: "Infrastructure Disruption", target: "infra", drop: 5, note: "Critical access route disrupted" },
        { id: "power_down", label: "Power Disruption", target: "power", drop: 6, note: "Power disruption reported" },
        { id: "comms_down", label: "Comms Disruption", target: "comms", drop: 6, note: "Communications disrupted" },
        { id: "population_event", label: "Population Safety Event", target: "population", drop: 5, note: "Population safety incident reported" },
      ],
    },
    specific: {
      flood: {
        label: "Flood", full: true,
        geometry: "Directional spread, riverine/coastal",
        nodes: [
          { id: "levee", label: "Levee / Dam Status", icon: Droplet, x: 130, y: 90, locationNote: "Brahmaputra north-bank embankment", desc: "The embankment holding back river water. If this fails, water reaches everything downstream first." },
          { id: "comms", label: "Communications", icon: Radio, x: 400, y: 60, locationNote: "Doordarshan Kendra tower, Guwahati", desc: "Communication lines used to coordinate the evacuation and relief effort." },
          { id: "roads", label: "Road Network", icon: Route, x: 660, y: 90, locationNote: "NH27 corridor, east Guwahati", desc: "Routes evacuees and relief teams need to move through." },
          { id: "evac", label: "Evacuation Coordination", icon: Users, x: 250, y: 300, locationNote: "Relief camp zone, west Guwahati", desc: "Coordination of where people go and how shelters are managed." },
          { id: "relief", label: "Relief Teams", icon: Truck, x: 540, y: 300, locationNote: "District disaster response HQ", desc: "Teams physically deployed to help — rescue, supplies, logistics." },
          { id: "hospital", label: "Hospital Capacity", icon: Building2, x: 395, y: 420, locationNote: "Gauhati Medical College & Hospital", desc: "Capacity to treat injuries and health emergencies from the flood." },
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
      wildfire: {
        label: "Wildfire", full: true,
        geometry: "Wind-driven spread, terrain-influenced",
        nodes: [
          { id: "perimeter", label: "Fire Perimeter / Containment Line", icon: Flame, x: 130, y: 90, locationNote: "Ridge line, Almora forest division, Uttarakhand", desc: "The active fire edge and the control lines holding it back. A breach here means the fire escapes containment." },
          { id: "weather", label: "Fire Weather & Spread Conditions", icon: Wind, x: 400, y: 50, locationNote: "IMD fire-weather station, Nainital", desc: "Wind, heat, and humidity driving how fast the fire spreads and in which direction." },
          { id: "routes", label: "Evacuation Routes", icon: Route, x: 660, y: 90, locationNote: "NH109 hill corridor", desc: "Roads people and vehicles need to safely get out of the fire zone." },
          { id: "warning", label: "Public Warning & Communications", icon: Radio, x: 130, y: 300, locationNote: "District disaster warning cell", desc: "Alert systems, radio coverage, and evacuation messaging reaching residents." },
          { id: "suppression", label: "Fire Suppression Capacity", icon: Truck, x: 400, y: 260, locationNote: "Forest fire response base camp", desc: "Crews, engines, aircraft, water supply, and shift endurance actively fighting the fire." },
          { id: "shelter", label: "Evacuation & Shelter Coordination", icon: Users, x: 660, y: 300, locationNote: "Relief shelter zone, Almora town", desc: "Organizing evacuation zones, transport support, and shelter intake for displaced residents." },
          { id: "medical", label: "Medical / Smoke-Health Capacity", icon: Building2, x: 400, y: 430, locationNote: "District hospital, Almora", desc: "Capacity to treat burns and smoke inhalation, and to handle hospital surge." },
        ],
        edges: [
          { from: "weather", to: "perimeter", w: 0.6 },
          { from: "weather", to: "routes", w: 0.3 },
          { from: "weather", to: "medical", w: 0.3 },
          { from: "perimeter", to: "routes", w: 0.5 },
          { from: "perimeter", to: "suppression", w: 0.4 },
          { from: "routes", to: "shelter", w: 0.5 },
          { from: "warning", to: "shelter", w: 0.4 },
          { from: "suppression", to: "medical", w: 0.3 },
          { from: "shelter", to: "medical", w: 0.4 },
        ],
        presets: [
          { id: "wind_shift", label: "Wind Shift / Spotting Event", target: "weather", drop: 7, note: "Erratic gusts driving spot fires ahead of the line" },
          { id: "line_breach", label: "Containment-Line Breach", target: "perimeter", drop: 7, note: "Control line breached on the eastern flank" },
          { id: "route_closure", label: "Evacuation-Route Closure", target: "routes", drop: 6, note: "Fire and smoke block the main descent road" },
          { id: "comms_outage", label: "Communications Outage", target: "warning", drop: 6, note: "Relay tower down, alert delivery disrupted" },
          { id: "suppression_loss", label: "Water / Aircraft Availability Loss", target: "suppression", drop: 6, note: "Water source and aerial tankers unavailable" },
          { id: "shelter_exceeded", label: "Shelter Capacity Exceeded", target: "shelter", drop: 5, note: "Relief shelters over capacity, evacuees redirected" },
          { id: "smoke_escalation", label: "Smoke Plume Escalation", target: "medical", drop: 6, note: "Dense smoke plume over the valley, air quality plummets" },
        ],
      },
      earthquake: {
        label: "Earthquake", full: true,
        geometry: "Simultaneous multi-site damage, aftershock risk",
        nodes: [
          { id: "seismic", label: "Seismic Impact / Damaged Zones", icon: AlertTriangle, x: 130, y: 90, locationNote: "Bhuj fault zone, Kutch, Gujarat", desc: "Initial shaking intensity, affected areas, and ongoing aftershock risk." },
          { id: "buildings", label: "Building & Critical-Facility Safety", icon: Building2, x: 400, y: 50, locationNote: "Bhuj civil hospital & municipal buildings", desc: "Hospitals, schools, shelters, bridges, and public buildings — how structurally safe they are to use." },
          { id: "roads", label: "Road & Access Network", icon: Route, x: 660, y: 90, locationNote: "Bhuj–Anjar highway corridor", desc: "Blocked roads, bridge safety, and debris clearance determining access for responders." },
          { id: "utilities", label: "Power, Water & Utilities", icon: Zap, x: 130, y: 300, locationNote: "Kutch power & water substation", desc: "Electricity, water mains, gas, and wastewater service across the affected area." },
          { id: "comms", label: "Communications & Public Warning", icon: Radio, x: 400, y: 260, locationNote: "Bhuj relay tower", desc: "Emergency radio, cellular coverage, dispatch, and public update channels." },
          { id: "rescue", label: "Search, Rescue & Medical Capacity", icon: ShieldPlus, x: 660, y: 300, locationNote: "NDRF forward staging base, Bhuj", desc: "Urban search-and-rescue teams, triage, ambulances, and hospital surge capacity." },
          { id: "shelter", label: "Evacuation & Shelter Coordination", icon: Users, x: 400, y: 430, locationNote: "Relief camp zone, Anjar", desc: "Safe assembly areas, shelter intake, transport, and family reunification." },
        ],
        edges: [
          { from: "seismic", to: "buildings", w: 0.6 },
          { from: "seismic", to: "utilities", w: 0.5 },
          { from: "seismic", to: "roads", w: 0.5 },
          { from: "buildings", to: "comms", w: 0.3 },
          { from: "roads", to: "rescue", w: 0.5 },
          { from: "utilities", to: "rescue", w: 0.3 },
          { from: "comms", to: "rescue", w: 0.4 },
          { from: "rescue", to: "shelter", w: 0.4 },
          { from: "utilities", to: "shelter", w: 0.3 },
          { from: "shelter", to: "rescue", w: 0.3 },
        ],
        presets: [
          { id: "aftershock", label: "Major Aftershock", target: "seismic", drop: 7, note: "New shaking event, aftershock risk elevated" },
          { id: "hospital_evac", label: "Hospital Structural Evacuation", target: "rescue", drop: 6, note: "Hospital evacuated, medical capacity abruptly cut" },
          { id: "bridge_fail", label: "Bridge Inspection Failure", target: "roads", drop: 6, note: "Critical bridge closed pending structural inspection" },
          { id: "gas_rupture", label: "Gas-Line Rupture / Fire Risk", target: "utilities", drop: 6, note: "Ruptured gas line, secondary fire risk, area evacuation required" },
          { id: "tower_outage", label: "Communications Tower Outage", target: "comms", drop: 6, note: "Primary relay tower down, dispatch and public alerts degraded" },
          { id: "landslide_block", label: "Landslide / Debris Blockage", target: "roads", drop: 5, note: "Debris blockage isolating a neighborhood" },
          { id: "false_report", label: "False Structural-Collapse Report", target: "buildings", drop: 3, note: "Unverified collapse report pending field confirmation" },
          { id: "shelter_overcrowd", label: "Shelter Overcrowding", target: "shelter", drop: 5, note: "Intake exceeding capacity, transport and medical support strained" },
          { id: "watermain_fail", label: "Water-Main Failure", target: "utilities", drop: 6, note: "Main break cutting water to shelters and hospitals" },
          { id: "sar_fatigue", label: "SAR Team Fatigue / Equipment Breakdown", target: "rescue", drop: 5, note: "Sustained operations degrading rescue team capacity and equipment" },
        ],
      },
      hurricane: {
        label: "Hurricane / Cyclone / Typhoon", full: true,
        geometry: "Wide-area coastal impact, multi-day approach window",
        nodes: [
          { id: "track", label: "Storm Track & Surge Zone", icon: Radar, x: 90, y: 80, locationNote: "Bay of Bengal track, approaching Odisha coast", desc: "Forecast path, landfall window, and storm-surge/flood exposure driving the whole response." },
          { id: "defenses", label: "Coastal / Flood Defenses", icon: ShieldAlert, x: 300, y: 40, locationNote: "Puri seawall and coastal embankments", desc: "Seawalls, levees, drainage, and pumps protecting low-lying areas from surge and flooding." },
          { id: "utilities", label: "Power & Utilities", icon: Zap, x: 500, y: 40, locationNote: "Paradip power & water grid", desc: "Grid reliability, backup power, water, wastewater, and fuel access across the impact zone." },
          { id: "roads", label: "Roads & Evacuation Routes", icon: Route, x: 710, y: 80, locationNote: "NH16 coastal corridor, Puri–Bhubaneswar", desc: "Bridge closures, flooding, debris, traffic flow, and safe evacuation egress." },
          { id: "comms", label: "Communications & Public Warning", icon: Radio, x: 90, y: 320, locationNote: "Bhubaneswar emergency dispatch relay", desc: "Early warnings, emergency broadcast, mobile/radio coverage, and dispatch capability." },
          { id: "shelter", label: "Evacuation & Shelter Coordination", icon: Users, x: 320, y: 260, locationNote: "Cyclone shelter zone, Puri district", desc: "Zone orders, transport, shelter capacity, and family reunification." },
          { id: "response", label: "Response & Restoration Teams", icon: Truck, x: 540, y: 320, locationNote: "Odisha Disaster Rapid Action Force base, Bhubaneswar", desc: "Rescue, debris clearance, utility repair, boats, and relief logistics on the ground." },
          { id: "medical", label: "Medical Capacity", icon: Building2, x: 710, y: 320, locationNote: "Capital Hospital, Bhubaneswar", desc: "Emergency care, hospital backup power, injuries, and flood-related health risk." },
        ],
        edges: [
          { from: "track", to: "defenses", w: 0.6 },
          { from: "track", to: "utilities", w: 0.5 },
          { from: "track", to: "roads", w: 0.5 },
          { from: "defenses", to: "roads", w: 0.4 },
          { from: "defenses", to: "shelter", w: 0.3 },
          { from: "utilities", to: "comms", w: 0.5 },
          { from: "utilities", to: "medical", w: 0.3 },
          { from: "roads", to: "response", w: 0.5 },
          { from: "roads", to: "shelter", w: 0.3 },
          { from: "comms", to: "shelter", w: 0.3 },
          { from: "response", to: "medical", w: 0.3 },
          { from: "shelter", to: "medical", w: 0.4 },
        ],
        presets: [
          { id: "track_shift", label: "Forecast Track Shift", target: "track", drop: 6, note: "New district entering the surge/wind-impact zone" },
          { id: "levee_overtop", label: "Storm-Surge Overtopping / Levee Breach", target: "defenses", drop: 7, note: "Seawall overtopped, coastal routes and shelters threatened" },
          { id: "power_outage", label: "Widespread Power Outage", target: "utilities", drop: 7, note: "Grid down across the impact zone" },
          { id: "route_closure", label: "Main Evacuation-Route Closure", target: "roads", drop: 6, note: "Bridge closure and flooding blocking the primary route" },
          { id: "comms_outage", label: "Communications Outage", target: "comms", drop: 6, note: "Tower damage and network overload cutting warning reach" },
          { id: "shelter_exceeded", label: "Shelter Capacity Exceeded", target: "shelter", drop: 5, note: "Primary shelter over capacity, overflow site needed" },
          { id: "pump_failure", label: "Flood-Pump Failure", target: "defenses", drop: 5, note: "Pump station failure worsening inland flooding" },
          { id: "fuel_interruption", label: "Fuel Distribution Interruption", target: "utilities", drop: 5, note: "Fuel shortage limiting generators and response vehicles" },
          { id: "sar_surge", label: "Search-and-Rescue Demand Surge", target: "response", drop: 6, note: "Stranded residents and roof rescues straining response teams" },
          { id: "generator_fail", label: "Hospital Generator Failure", target: "medical", drop: 7, note: "Backup power failure forcing patient transfer" },
          { id: "debris_block", label: "Debris-Field Blockage", target: "response", drop: 5, note: "Debris blocking relief delivery and utility restoration" },
          { id: "health_alert", label: "Secondary Public-Health Alert", target: "medical", drop: 4, note: "Contaminated water raising disease risk post-flood" },
        ],
      },
      tornado: {
        label: "Tornado", full: true,
        geometry: "Narrow high-intensity path, short lead time",
        nodes: [
          { id: "warning", label: "Tornado Warning & Track", icon: Radar, x: 90, y: 80, locationNote: "NWS Norman radar, tracking toward Moore, Oklahoma", desc: "Radar warning, projected path, lead time, and the zones currently in the tornado's path." },
          { id: "pubwarn", label: "Public Warning & Communications", icon: Radio, x: 300, y: 40, locationNote: "Cleveland County emergency sirens network", desc: "Sirens, cell broadcast, radio, dispatch, and how far warnings actually reach residents." },
          { id: "shelter_access", label: "Safe Shelter Access", icon: Lock, x: 500, y: 40, locationNote: "Moore Public Schools storm shelter network", desc: "Basements, designated shelters, school and venue safe rooms, and their accessibility." },
          { id: "buildings", label: "Building & Critical-Facility Safety", icon: Building2, x: 710, y: 80, locationNote: "Moore Medical Center and area schools", desc: "Structural damage to homes, schools, hospitals, and public facilities." },
          { id: "roads", label: "Road & Access Network", icon: Route, x: 200, y: 280, locationNote: "I-35 corridor through Moore", desc: "Debris, downed trees and power lines, bridge safety, and responder access routes." },
          { id: "utilities", label: "Power & Utilities", icon: Zap, x: 420, y: 330, locationNote: "OG&E substation, Moore", desc: "Electricity, gas, water, and damaged utility infrastructure." },
          { id: "rescue", label: "Search, Rescue & Medical Capacity", icon: ShieldPlus, x: 640, y: 280, locationNote: "Moore Fire Department rescue task force", desc: "Triage, ambulances, rescue teams, hospital surge, and patient transport." },
          { id: "tempshelter", label: "Evacuation / Temporary Shelter Coordination", icon: Users, x: 420, y: 440, locationNote: "Cleveland County Fairgrounds relief site", desc: "Displaced residents, family reunification, temporary shelter, and relief routing." },
        ],
        edges: [
          { from: "warning", to: "pubwarn", w: 0.6 },
          { from: "warning", to: "shelter_access", w: 0.5 },
          { from: "warning", to: "buildings", w: 0.5 },
          { from: "buildings", to: "roads", w: 0.4 },
          { from: "buildings", to: "utilities", w: 0.4 },
          { from: "pubwarn", to: "rescue", w: 0.3 },
          { from: "roads", to: "rescue", w: 0.5 },
          { from: "utilities", to: "rescue", w: 0.3 },
          { from: "shelter_access", to: "tempshelter", w: 0.3 },
          { from: "rescue", to: "tempshelter", w: 0.4 },
        ],
        presets: [
          { id: "warning_upgrade", label: "Sudden Warning Upgrade", target: "warning", drop: 7, note: "Watch upgraded to confirmed tornado warning, limited lead time" },
          { id: "track_shift", label: "Tornado Track Shift", target: "warning", drop: 6, note: "Projected impact moving toward a school, hospital, or dense area" },
          { id: "siren_outage", label: "Siren / Cell-Broadcast Outage", target: "pubwarn", drop: 6, note: "Primary alert channel down, switching to backup channels" },
          { id: "shelter_capacity", label: "School / Venue Shelter Capacity Issue", target: "shelter_access", drop: 5, note: "Designated shelter over capacity or inaccessible" },
          { id: "facility_strike", label: "Critical-Facility Strike", target: "buildings", drop: 7, note: "Hospital, fire station, or dispatch centre struck and unavailable" },
          { id: "debris_block", label: "Major Debris Blockage", target: "roads", drop: 6, note: "Access route blocked by damaged buildings, trees, or downed lines" },
          { id: "line_gas", label: "Power-Line Collapse / Gas Leak", target: "utilities", drop: 6, note: "Downed lines and gas leak creating a secondary hazard, limiting access" },
          { id: "comms_overload", label: "Communications Overload", target: "pubwarn", drop: 5, note: "Emergency call surge straining radio coordination" },
          { id: "mass_casualty", label: "Multiple Casualty Reports", target: "rescue", drop: 6, note: "Mass-casualty reports testing triage and mutual-aid dispatch" },
          { id: "false_damage", label: "False Damage Report", target: "buildings", drop: 3, note: "Unverified damage report pending field confirmation" },
          { id: "second_cell", label: "Second Tornado Cell / Repeat Warning", target: "warning", drop: 6, note: "New cell forming, teams must sustain operations while deployed" },
          { id: "tempshelter_overload", label: "Temporary Shelter Overload", target: "tempshelter", drop: 5, note: "Displaced residents exceeding temporary shelter capacity" },
        ],
      },
      landslide: {
        label: "Landslide / Mudslide", full: true,
        geometry: "Downslope debris-flow path, rainfall-driven, secondary-slide risk",
        nodes: [
          { id: "slope", label: "Slope Stability & Rainfall Conditions", icon: Droplet, x: 90, y: 80, locationNote: "Rainfall gauges above Mandi, Himachal Pradesh", desc: "Ground saturation, rainfall intensity, soil movement, and the forecast conditions that increase the likelihood of slope failure." },
          { id: "impact", label: "Landslide Impact Zone", icon: AlertTriangle, x: 300, y: 40, locationNote: "Downslope settlement corridor, Mandi district", desc: "The active slide path, debris-flow extent, buried structures, and exclusion area where secondary movement remains a risk." },
          { id: "roads", label: "Road & Bridge Access", icon: Route, x: 520, y: 40, locationNote: "NH3 mountain corridor", desc: "Blocked roads, damaged bridges, isolated settlements, and detours controlling safe access for rescue and evacuation." },
          { id: "utilities", label: "Utilities & Water Systems", icon: Zap, x: 710, y: 80, locationNote: "Mandi power and water distribution network", desc: "Downed power lines, ruptured gas or water pipes, drainage, and contamination risk in the affected area." },
          { id: "comms", label: "Communications & Warning", icon: Radio, x: 100, y: 300, locationNote: "District emergency communications relay", desc: "Rainfall alerts, local warnings, radio/cell coverage, and field coordination across difficult terrain." },
          { id: "rescue", label: "Search & Rescue Capacity", icon: ShieldPlus, x: 315, y: 280, locationNote: "NDRF forward staging point, Mandi", desc: "Rescue teams, excavation capability, dogs, heavy equipment, triage, and the ability to operate safely near an unstable slope." },
          { id: "evac", label: "Evacuation & Shelter Coordination", icon: Users, x: 535, y: 320, locationNote: "Safe shelter zone, Mandi town", desc: "Moving people from unstable slopes, arranging transport, opening safe shelters, and family reunification." },
          { id: "medical", label: "Medical & Public-Health Capacity", icon: Building2, x: 710, y: 320, locationNote: "Zonal Hospital Mandi", desc: "Trauma care, hypothermia, contaminated-water and respiratory risks, and hospital capacity during a rescue surge." },
        ],
        edges: [
          { from: "slope", to: "impact", w: 0.7 },
          { from: "slope", to: "comms", w: 0.2 },
          { from: "impact", to: "roads", w: 0.6 },
          { from: "impact", to: "utilities", w: 0.4 },
          { from: "impact", to: "rescue", w: 0.5 },
          { from: "roads", to: "rescue", w: 0.5 },
          { from: "roads", to: "evac", w: 0.5 },
          { from: "utilities", to: "medical", w: 0.3 },
          { from: "comms", to: "rescue", w: 0.4 },
          { from: "comms", to: "evac", w: 0.3 },
          { from: "rescue", to: "medical", w: 0.5 },
          { from: "evac", to: "medical", w: 0.3 },
        ],
        presets: [
          { id: "rainfall_escalation", label: "Intense-Rainfall Escalation", target: "slope", drop: 6, note: "Rapid saturation expanding the at-risk slope zone" },
          { id: "initial_slope_failure", label: "Initial Slope Failure", target: "impact", drop: 7, note: "Debris flow damages homes and blocks the lower access road" },
          { id: "secondary_slide", label: "Secondary Slide / Debris-Flow Surge", target: "impact", drop: 7, note: "New slide movement threatens a second area and the exclusion zone" },
          { id: "bridge_washout", label: "Bridge Collapse / Road Washout", target: "roads", drop: 6, note: "Only access route closed, isolating an upstream settlement" },
          { id: "utility_rupture", label: "Utility Rupture", target: "utilities", drop: 6, note: "Downed lines and water-main damage create a secondary hazard" },
          { id: "comms_deadzone", label: "Communications Dead Zone", target: "comms", drop: 6, note: "Terrain and damaged infrastructure cut contact with field teams" },
          { id: "false_trapped_report", label: "False Trapped-Persons Report", target: "rescue", drop: 3, note: "Unverified report tests dispatch verification before asset commitment" },
          { id: "equipment_delay", label: "Heavy-Equipment Failure / Delay", target: "rescue", drop: 5, note: "Excavation and debris-clearing capacity reduced" },
          { id: "evac_zone_expansion", label: "Evacuation-Zone Expansion", target: "evac", drop: 5, note: "Assessment identifies new instability near occupied homes" },
          { id: "shelter_disruption", label: "Shelter Access Disrupted", target: "evac", drop: 5, note: "Designated shelter or transport route is no longer safe" },
          { id: "hospital_delay", label: "Hospital-Access Delay", target: "medical", drop: 5, note: "Road damage delays ambulances and patient transfers" },
          { id: "weather_deterioration", label: "Overnight Weather Deterioration", target: "rescue", drop: 5, note: "Poor visibility and renewed rain limit safe rescue operations" },
        ],
      },
      volcanic: {
        label: "Volcanic Eruption", full: true,
        geometry: "Radial exclusion zones with downslope lava/lahar paths and wind-driven ashfall",
        nodes: [
          { id: "activity", label: "Volcanic Activity & Hazard Zone", icon: AlertTriangle, x: 90, y: 80, locationNote: "Mount Merapi exclusion zone, Central Java", desc: "Seismic activity, eruption column, lava and pyroclastic-flow paths, ashfall, and the active exclusion zones." },
          { id: "monitoring", label: "Monitoring & Scientific Assessment", icon: Radar, x: 300, y: 40, locationNote: "Volcanology observation post", desc: "Observatory sensors, field reports, forecasts, and the hazard maps used to verify what is happening." },
          { id: "comms", label: "Public Warning & Communications", icon: Radio, x: 520, y: 40, locationNote: "Regional emergency communications centre", desc: "Alert delivery, evacuation orders, radio/cell networks, dispatch, and rumor control." },
          { id: "routes", label: "Roads, Aviation & Evacuation Access", icon: Route, x: 710, y: 80, locationNote: "Yogyakarta–Magelang transport corridor", desc: "Ash-covered roads, bridge safety, airspace closures, transport availability, and safe evacuation corridors." },
          { id: "utilities", label: "Utilities & Water Systems", icon: Zap, x: 90, y: 300, locationNote: "Regional power and water-treatment network", desc: "Power, water treatment, drainage, fuel, and contamination caused by ash or lahars." },
          { id: "response", label: "Search, Rescue & Response Capacity", icon: Truck, x: 315, y: 280, locationNote: "Emergency response staging base", desc: "Rescue teams, fire services, protective equipment, vehicles, and logistics operating in hazardous conditions." },
          { id: "shelter", label: "Evacuation & Shelter Coordination", icon: Users, x: 535, y: 320, locationNote: "Evacuation shelter network, Sleman", desc: "Zone-based movement, transport, shelter intake, family reunification, and support for displaced communities." },
          { id: "medical", label: "Medical & Ash-Health Capacity", icon: Building2, x: 710, y: 320, locationNote: "Regional hospital, Yogyakarta", desc: "Capacity for burns, trauma, respiratory illness, eye injuries, and a hospital surge caused by ash exposure." },
        ],
        edges: [
          { from: "activity", to: "monitoring", w: 0.6 },
          { from: "activity", to: "routes", w: 0.5 },
          { from: "activity", to: "utilities", w: 0.4 },
          { from: "monitoring", to: "comms", w: 0.5 },
          { from: "comms", to: "shelter", w: 0.5 },
          { from: "routes", to: "response", w: 0.5 },
          { from: "routes", to: "shelter", w: 0.5 },
          { from: "utilities", to: "medical", w: 0.4 },
          { from: "response", to: "medical", w: 0.4 },
          { from: "shelter", to: "medical", w: 0.4 },
        ],
        presets: [
          { id: "alert_raise", label: "Volcanic-Alert Level Raised", target: "monitoring", drop: 5, note: "Accelerated seismicity and deformation expand the readiness posture" },
          { id: "ash_plume", label: "Explosive Eruption / Ash Plume", target: "activity", drop: 7, note: "Major ashfall disrupts health, utilities, roads, and aviation" },
          { id: "pyroclastic_warning", label: "Pyroclastic-Flow Warning", target: "activity", drop: 7, note: "Exclusion zones expand immediately along high-risk valleys" },
          { id: "lava_shift", label: "Lava-Flow Direction Shift", target: "activity", drop: 6, note: "A new settlement and utility corridor enter the projected flow path" },
          { id: "lahar_surge", label: "Lahar / Mudflow Surge", target: "routes", drop: 6, note: "Rain remobilizes ash and debris through river valleys" },
          { id: "sensor_outage", label: "Observatory Sensor Outage", target: "monitoring", drop: 6, note: "Hazard-map confidence reduced; alternate verification required" },
          { id: "tower_failure", label: "Communications Tower Failure", target: "comms", drop: 6, note: "Warning delivery to a high-risk community is disrupted" },
          { id: "ash_route", label: "Ash-Covered Evacuation Route", target: "routes", drop: 6, note: "Visibility and road traction force closure of a critical corridor" },
          { id: "airspace_close", label: "Airport / Airspace Closure", target: "routes", drop: 5, note: "Medical evacuation, relief flights, and aerial assessment interrupted" },
          { id: "water_contamination", label: "Water-Treatment Contamination", target: "utilities", drop: 6, note: "Ash disrupts safe drinking-water supply and shelter operations" },
          { id: "substation_failure", label: "Power-Substation Failure", target: "utilities", drop: 6, note: "Ash and lightning cause a prolonged regional outage" },
          { id: "shelter_overload", label: "Shelter Capacity Exceeded", target: "shelter", drop: 5, note: "An additional evacuation zone opens unexpectedly" },
          { id: "respiratory_surge", label: "Respiratory-Health Surge", target: "medical", drop: 6, note: "Masks, oxygen, and hospital capacity become constrained" },
          { id: "false_rumor", label: "False Eruption Rumor", target: "comms", drop: 3, note: "Unverified report tests rumor control and verified public messaging" },
          { id: "eruption_pulse", label: "Secondary Eruption Pulse", target: "activity", drop: 6, note: "A renewed ashfall or flow event arrives while teams are deployed" },
        ],
      },
      tsunami: {
        label: "Tsunami", full: true,
        geometry: "Rapid coastal inundation, wave-arrival countdown, repeated-wave and re-entry risk",
        nodes: [
          { id: "detection", label: "Tsunami Detection & Impact Forecast", icon: Radar, x: 90, y: 80, locationNote: "Indian Tsunami Early Warning Centre, INCOIS", desc: "Seismic trigger, buoy and tide-gauge data, predicted arrival time, inundation zones, and forecast confidence." },
          { id: "warning", label: "Public Warning & Communications", icon: Radio, x: 300, y: 40, locationNote: "Coastal emergency warning network", desc: "Sirens, cell broadcast, radio, dispatch, multilingual alerts, and whether the warning reaches exposed communities." },
          { id: "routes", label: "Coastal Evacuation Routes & Vertical Shelters", icon: Route, x: 520, y: 40, locationNote: "Coastal evacuation corridor, Port Blair", desc: "Roads, bridges, pedestrian routes, high ground, signage, and vertical-evacuation buildings that make safe escape possible." },
          { id: "infrastructure", label: "Coastal Infrastructure & Utilities", icon: Zap, x: 710, y: 80, locationNote: "Port, power, water, and wastewater corridor", desc: "Ports, power, water, wastewater, fuel, and communications sites exposed to coastal inundation." },
          { id: "rescue", label: "Search, Rescue & Marine Response", icon: Truck, x: 90, y: 300, locationNote: "Coastal rescue staging base", desc: "Swift-water rescue, boats, helicopters, dive teams, staging, and survivor search capacity after inundation." },
          { id: "shelter", label: "Evacuation & Shelter Coordination", icon: Users, x: 315, y: 280, locationNote: "High-ground shelter network", desc: "Zone clearance, transport support, shelter intake, family reunification, and assistance for vulnerable groups." },
          { id: "medical", label: "Medical & Public-Health Capacity", icon: Building2, x: 535, y: 320, locationNote: "Regional hospital and field triage sites", desc: "Trauma, drowning and near-drowning care, contaminated-water risks, hospital surge, and disease prevention." },
          { id: "assessment", label: "Damage Assessment & Debris Clearance", icon: ShieldPlus, x: 710, y: 320, locationNote: "Coastal public-works command post", desc: "Rapid assessment, blocked-road clearance, structural safety checks, and restoration prioritization after the waves recede." },
        ],
        edges: [
          { from: "detection", to: "warning", w: 0.7 }, { from: "detection", to: "routes", w: 0.5 }, { from: "detection", to: "infrastructure", w: 0.4 },
          { from: "warning", to: "shelter", w: 0.6 }, { from: "routes", to: "shelter", w: 0.6 }, { from: "infrastructure", to: "rescue", w: 0.4 },
          { from: "infrastructure", to: "medical", w: 0.4 }, { from: "rescue", to: "medical", w: 0.5 }, { from: "shelter", to: "medical", w: 0.4 },
          { from: "assessment", to: "rescue", w: 0.3 }, { from: "assessment", to: "medical", w: 0.3 },
        ],
        presets: [
          { id: "offshore_quake", label: "Offshore Earthquake Confirmed", target: "detection", drop: 7, note: "Tsunami warning issued with a short arrival window" },
          { id: "forecast_change", label: "Forecast Update / Arrival-Time Change", target: "detection", drop: 6, note: "Lead time reduced and the mapped impact zone expanded" },
          { id: "siren_outage", label: "Siren / Cell-Broadcast Outage", target: "warning", drop: 6, note: "Primary warning channel down; alternate community alerts required" },
          { id: "route_congestion", label: "Coastal-Route Congestion", target: "routes", drop: 6, note: "Evacuation traffic and pedestrian crowding slow the safest egress route" },
          { id: "bridge_washout", label: "Bridge / Road Washout", target: "routes", drop: 7, note: "Surge damages a route and isolates a coastal settlement" },
          { id: "vertical_shelter_overload", label: "Vertical-Shelter Capacity Exceeded", target: "routes", drop: 5, note: "High-ground and designated buildings cannot accept more evacuees" },
          { id: "first_wave", label: "First-Wave Inundation", target: "infrastructure", drop: 7, note: "Coastal utilities, port access, and communications infrastructure damaged" },
          { id: "second_wave", label: "Larger Second Wave", target: "detection", drop: 7, note: "Teams must prevent premature return to the inundation zone" },
          { id: "marina_debris", label: "Port / Marina Debris Field", target: "rescue", drop: 5, note: "Floating debris blocks marine rescue and relief access" },
          { id: "hospital_access", label: "Hospital-Access Disruption", target: "medical", drop: 6, note: "Damaged roads delay ambulances and patient transfers" },
          { id: "water_contamination", label: "Water-Treatment Contamination", target: "infrastructure", drop: 6, note: "Saltwater and debris compromise drinking-water supply" },
          { id: "sar_surge", label: "Search-and-Rescue Demand Surge", target: "rescue", drop: 6, note: "Multiple trapped-person reports strain water-rescue capacity" },
          { id: "false_all_clear", label: "False All-Clear Message", target: "warning", drop: 4, note: "Unverified message tests control of public re-entry guidance" },
          { id: "aftershock", label: "Aftershock Warning", target: "detection", drop: 5, note: "A new tremor requires continued evacuation readiness during rescue" },
        ],
      },
      avalanche: {
        label: "Avalanche", full: true,
        geometry: "Mountain runout paths, weather-driven hazard escalation, secondary-avalanche risk",
        nodes: [
          { id: "snowpack", label: "Snowpack Stability & Weather", icon: Droplet, x: 90, y: 80, locationNote: "Snow and Avalanche Study Establishment forecast station", desc: "Snow loading, wind slab formation, temperature changes, visibility, and avalanche forecast confidence." },
          { id: "hazard", label: "Avalanche Hazard Zone & Runout Path", icon: AlertTriangle, x: 300, y: 40, locationNote: "Gulmarg bowl and runout corridor", desc: "Start zones, likely travel paths, deposition zones, and areas that require closure or evacuation." },
          { id: "access", label: "Mountain Access & Transport Routes", icon: Route, x: 520, y: 40, locationNote: "Gulmarg–Tangmarg road and lift network", desc: "Roads, passes, ski lifts, trails, and access routes for rescue and evacuation." },
          { id: "warning", label: "Warnings, Closures & Communications", icon: Radio, x: 710, y: 80, locationNote: "Resort and district emergency communications", desc: "Avalanche bulletins, road and lift closures, radio/cell coverage, and visitor messaging." },
          { id: "rescue", label: "Search & Rescue Capacity", icon: ShieldPlus, x: 90, y: 300, locationNote: "Mountain rescue staging base", desc: "Rescue teams, dogs, probes, beacons, helicopters, medical evacuation, and the equipment needed to locate buried people." },
          { id: "shelter", label: "Shelter & Stranded-Person Coordination", icon: Users, x: 315, y: 280, locationNote: "Mountain warming-centre network", desc: "Warming centres, transport, lodging, accountability, and family communication for stranded visitors and residents." },
          { id: "utilities", label: "Utilities & Critical Facilities", icon: Zap, x: 535, y: 320, locationNote: "Mountain power, heating, and communications network", desc: "Power, communications, heating, water, and critical facilities exposed to snow or debris damage." },
          { id: "medical", label: "Medical & Hypothermia Capacity", icon: Building2, x: 710, y: 320, locationNote: "District hospital and mountain medical post", desc: "Trauma, burial/asphyxia, hypothermia, hospital surge, and the ability to transfer patients safely." },
        ],
        edges: [
          { from: "snowpack", to: "hazard", w: 0.7 }, { from: "snowpack", to: "warning", w: 0.3 },
          { from: "hazard", to: "access", w: 0.6 }, { from: "hazard", to: "rescue", w: 0.5 }, { from: "hazard", to: "utilities", w: 0.3 },
          { from: "access", to: "rescue", w: 0.5 }, { from: "access", to: "shelter", w: 0.4 }, { from: "warning", to: "shelter", w: 0.4 },
          { from: "utilities", to: "shelter", w: 0.3 }, { from: "rescue", to: "medical", w: 0.5 }, { from: "shelter", to: "medical", w: 0.4 },
        ],
        presets: [
          { id: "wind_loading", label: "Heavy Snowfall / Wind-Loading Escalation", target: "snowpack", drop: 6, note: "Rapid wind slab formation raises risk across exposed slopes" },
          { id: "forecast_upgrade", label: "Avalanche Forecast Upgraded", target: "warning", drop: 5, note: "Hazard expansion requires immediate closures and public alerts" },
          { id: "initial_release", label: "Initial Avalanche Release", target: "hazard", drop: 7, note: "Slide blocks a road, trail, or ski-area sector and starts rescue operations" },
          { id: "secondary_avalanche", label: "Secondary Avalanche", target: "hazard", drop: 7, note: "New slide threatens rescuers and the remaining access route" },
          { id: "pass_closure", label: "Road-Pass Closure", target: "access", drop: 6, note: "Snow and debris block emergency access and isolate a community" },
          { id: "lift_evacuation", label: "Ski-Lift / Cable-Car Evacuation", target: "access", drop: 5, note: "Wind, power loss, or exposure strands visitors on the lift network" },
          { id: "comms_deadzone", label: "Communications Dead Zone", target: "warning", drop: 6, note: "Terrain and weather break contact with field teams" },
          { id: "helicopter_grounding", label: "Helicopter Grounding", target: "rescue", drop: 6, note: "Poor visibility and wind prevent aerial search and evacuation" },
          { id: "beacon_failure", label: "Search-Dog / Beacon Equipment Failure", target: "rescue", drop: 5, note: "Buried-person location capability is reduced" },
          { id: "false_missing", label: "False Missing-Person Report", target: "rescue", drop: 3, note: "Unverified report tests accountability before scarce teams are dispatched" },
          { id: "warming_overload", label: "Warming-Centre Overload", target: "shelter", drop: 5, note: "Stranded visitors exceed safe shelter, heating, or transport capacity" },
          { id: "heating_failure", label: "Power / Heating Failure", target: "utilities", drop: 6, note: "Shelters, hotels, and remote facilities lose critical heating" },
          { id: "hypothermia_surge", label: "Hypothermia / Trauma Surge", target: "medical", drop: 6, note: "Medical capacity becomes constrained by rescue casualties" },
          { id: "overnight_weather", label: "Overnight Weather Deterioration", target: "rescue", drop: 5, note: "Poor visibility and renewed rain limit safe rescue operations" },
          { id: "release_failure", label: "Controlled-Release Failure", target: "hazard", drop: 5, note: "Mitigation blast or closure plan fails to reduce the expected hazard" },
        ],
      },
      dam: { label: "Dam or Levee Failure", full: false },
      coldstorm: { label: "Extreme Cold / Winter Storm", full: false },
      gas_leak_evac: { label: "Gas Leak Requiring Area Evacuation", full: false },
      building_fire_evac: { label: "Building/High-Rise Fire Evacuation", full: false },
    },
  },

  2: {
    title: "Sustained-Load / Threshold",
    short: "Threshold",
    color: "#d97706",
    buildable: false,
    plan: {
      engineMode: "Needs a new engine mode: tiered threshold escalation, not cascade propagation. No discrete trigger event to inject.",
      coreNodes: "Hospital capacity, personnel/supply attrition rate, power (cooling/medical), public messaging.",
      needed: [
        { label: "Load-over-time tracking", text: "each node needs a trend line, not a snapshot." },
        { label: "Escalation tiers", text: "70% / 90% / 100% capacity mapped to different response postures." },
        { label: "Attrition rate as a variable", text: "separate from current capacity." },
        { label: "Contagion sub-model", text: "Pandemic/Outbreak only — feeds hospital load as an input." },
      ],
      dispatch: "Mutual aid / surge staffing request.",
      responseLogic: "A request/replenish action that raises the rate of replenishment, not a node's score directly.",
      demoNote: "Not demoable on this engine yet, regardless of severity or which specific crisis is picked.",
    },
    generic: { nodes: [], edges: [], presets: [] },
    specific: {
      drought: { label: "Drought", full: false },
      heatwave: { label: "Extreme Heat Wave", full: false },
      outbreak: { label: "Infectious Disease Outbreak", full: false },
      pandemic: { label: "Pandemic", full: false },
      hospital_overload: { label: "Hospital System Overload", full: false },
      water_contamination: { label: "Water Supply Contamination", full: false },
      food_poisoning: { label: "Mass Food / Water Poisoning Event", full: false },
      prison_riot: { label: "Prison Riot / Sustained Unrest", full: false },
      cyberattack: { label: "Cyberattack on Critical Infrastructure", full: false },
      grid_blackout: { label: "Mass Power Grid Failure / Blackout", full: false },
    },
  },

  3: {
    title: "Point-Source Containment",
    short: "Containment",
    color: "#059669",
    buildable: true,
    plan: {
      engineMode: "Cascade engine — closest fit of any cluster, one clear origin node.",
      coreNodes: "Origin node, containment/exclusion radius, dependent infrastructure, specialist response teams.",
      needed: [
        { label: "Containment radius", text: "shrinks as specialist teams are dispatched to the origin node." },
        { label: "Specialist-team dispatch", text: "hazmat, structural engineers, utility crews — a distinct pool." },
        { label: "Exposure sub-layer", text: "Nuclear/Gas/Hazmat specific crises only, not yet built." },
      ],
      dispatch: "Specialist teams, plus utility/restoration crews.",
      responseLogic: "Dispatch to the origin node shrinks the containment radius; dependents recover on their normal function.",
      demoNote: "Live-demoable now via the generic template. No specific crisis in this cluster has a full build yet — see Flood in Cluster 1 for what a full build looks like.",
    },
    generic: {
      nodes: [
        { id: "origin", label: "Origin Point", icon: Zap, x: 130, y: 90 },
        { id: "infraA", label: "Dependent Infrastructure A", icon: Route, x: 400, y: 60 },
        { id: "infraB", label: "Dependent Infrastructure B", icon: Radio, x: 660, y: 90 },
        { id: "infraC", label: "Dependent Infrastructure C", icon: Droplet, x: 250, y: 300 },
        { id: "response", label: "Specialist Teams", icon: Truck, x: 540, y: 300 },
        { id: "medical", label: "Medical Capacity", icon: Building2, x: 395, y: 420 },
      ],
      edges: [
        { from: "origin", to: "infraA", w: 0.4 },
        { from: "origin", to: "infraB", w: 0.3 },
        { from: "origin", to: "infraC", w: 0.5 },
        { from: "origin", to: "medical", w: 0.5 },
        { from: "infraB", to: "response", w: 0.3 },
        { from: "infraA", to: "response", w: 0.3 },
        { from: "infraC", to: "medical", w: 0.3 },
      ],
      presets: [
        { id: "origin_fail_primary", label: "Origin Failure (Primary)", target: "origin", drop: 8, note: "Primary point-source failure" },
        { id: "origin_fail_secondary", label: "Origin Failure (Secondary)", target: "origin", drop: 4, note: "Secondary failure at origin" },
      ],
      containment: true,
    },
    specific: {
      power_grid: {
        label: "Power Grid Failure / Blackout", full: true,
        geometry: "Point-source origin (substation/transmission), radiating outward through the distribution network",
        nodes: [
          { id: "distribution", label: "Distribution Network Status", icon: Route, x: 400, y: 50, locationNote: "Feeder network, Pune Zone II", desc: "Downstream feeders and local distribution lines carrying power out from the substation to homes, businesses, and facilities." },
          { id: "origin", label: "Substation / Transmission Failure", icon: Zap, x: 130, y: 90, locationNote: "220kV grid substation, Aundh, Pune", desc: "The failed transformer, transmission line, or substation where the outage originated. Containment radius shrinks as repair crews work here." },
          { id: "backup", label: "Backup Generators & UPS", icon: Truck, x: 660, y: 90, locationNote: "Hospital & data-centre backup bank, Pune", desc: "Diesel generators and UPS systems at hospitals, water plants, and critical facilities, running on stored fuel and battery charge." },
          { id: "water", label: "Water & Sewage Pumping", icon: Droplet, x: 130, y: 300, locationNote: "Parvati water pumping station, Pune", desc: "Pumping stations that rely on grid power to keep water supply and sewage systems running." },
          { id: "comms", label: "Communications & Data Networks", icon: Radio, x: 400, y: 260, locationNote: "Cell tower cluster & exchange, Pune", desc: "Cell towers, exchanges, and data centres — most run on battery backup that depletes without grid power or refuelling." },
          { id: "traffic", label: "Traffic Signals & Public Safety Systems", icon: AlertTriangle, x: 660, y: 300, locationNote: "Signal control network, central Pune", desc: "Traffic signals, streetlighting, and public-safety systems that go dark or fail open without power." },
          { id: "repair", label: "Utility Repair Crews", icon: ShieldPlus, x: 250, y: 430, locationNote: "Discom field response depot, Pune", desc: "Line crews and specialist teams dispatched to isolate the fault and restore the substation or feeders." },
          { id: "medical", label: "Hospital Power & Medical Capacity", icon: Building2, x: 540, y: 430, locationNote: "Sassoon General Hospital, Pune", desc: "Hospital capacity to keep critical equipment running — dependent on backup power once grid supply is lost." },
        ],
        edges: [
          { from: "origin", to: "distribution", w: 0.7 },
          { from: "origin", to: "backup", w: 0.3 },
          { from: "distribution", to: "water", w: 0.5 },
          { from: "distribution", to: "comms", w: 0.4 },
          { from: "distribution", to: "traffic", w: 0.5 },
          { from: "backup", to: "medical", w: 0.5 },
          { from: "backup", to: "comms", w: 0.2 },
          { from: "water", to: "medical", w: 0.3 },
          { from: "comms", to: "repair", w: 0.3 },
          { from: "traffic", to: "repair", w: 0.2 },
          { from: "repair", to: "distribution", w: 0.5 },
          { from: "repair", to: "origin", w: 0.6 },
        ],
        presets: [
          { id: "transformer_fail", label: "Transformer / Substation Failure", target: "origin", drop: 8, note: "Main transformer trips, substation offline" },
          { id: "cascading_trip", label: "Cascading Feeder Trip", target: "distribution", drop: 7, note: "Protective relays trip across adjacent feeders" },
          { id: "tower_collapse", label: "Transmission Tower Collapse", target: "origin", drop: 6, note: "Tower down on a primary transmission line" },
          { id: "generator_fail", label: "Backup Generator Failure", target: "backup", drop: 6, note: "Generator fails to start or trips under load" },
          { id: "fuel_shortage", label: "Generator Fuel Shortage", target: "backup", drop: 5, note: "Diesel supply for backup generators running low" },
          { id: "pump_outage", label: "Water Pumping Station Outage", target: "water", drop: 6, note: "Pumping station loses power, supply pressure dropping" },
          { id: "tower_battery", label: "Cell Tower Battery Depletion", target: "comms", drop: 5, note: "Backup batteries at cell sites nearing depletion" },
          { id: "signal_blackout", label: "Traffic Signal Blackout", target: "traffic", drop: 5, note: "Major intersections dark, manual traffic control needed" },
          { id: "scada_fault", label: "SCADA / Control-System Fault", target: "origin", drop: 6, note: "Grid control system fault delaying fault isolation" },
          { id: "hospital_backup_strain", label: "Hospital Backup Power Strain", target: "medical", drop: 7, note: "Extended outage straining hospital backup capacity" },
          { id: "crew_delay", label: "Repair Crew Access Delay", target: "repair", drop: 5, note: "Crew access to the fault site delayed by traffic or terrain" },
          { id: "restoration_setback", label: "Restoration Attempt Setback", target: "distribution", drop: 4, note: "Reclosing attempt fails, feeder trips again" },
        ],
        containment: true,
      },
      transport: { label: "Major Transportation Failure", full: false },
      telecom: { label: "Telecommunications Outage", full: false },
      industrial: { label: "Industrial Accident", full: false },
      nuclear: { label: "Nuclear or Radiological Incident", full: false },
      structural: { label: "Structural Collapse", full: false },
      gas: { label: "Gas Pipeline Failure or Explosion", full: false },
      hazmat: { label: "Hazardous Materials Spill", full: false },
      fire: { label: "Major Structural Fire (non-wildfire)", full: false },
      crane_collapse: { label: "Crane / Construction Site Collapse", full: false },
      train_derailment: { label: "Train Derailment (hazmat involved)", full: false },
    },
  },

  4: {
    title: "Crowd / Security",
    short: "Crowd",
    color: "#e11d48",
    buildable: true,
    plan: {
      engineMode: "Cascade engine (same hop-1/hop-2 propagation as Clusters 1 & 3) run as a stopgap. This is a simplification: it treats crowd pressure as an aggregate node score rather than true per-exit egress modeling, which remains the real open research problem.",
      coreNodes: "Crowd density/egress capacity, venue infrastructure (barriers/gates), public communication, security dispatch, medical/trauma response, incident command.",
      needed: [
        { label: "Per-exit egress modeling", text: "still not represented — this build uses one aggregate egress-capacity node, not a true per-exit population model." },
        { label: "Security dispatch type", text: "modeled here as a normal cascade-engine dispatch pool; a distinct authority/escalation structure from relief or specialist teams is still not modeled." },
        { label: "Command-authority handoff", text: "represented as a single command node; multi-agency handoff dynamics are not yet modeled." },
      ],
      dispatch: "Security / crowd-control response, plus on-site medical and command coordination.",
      responseLogic: "Same reinforcement action as other clusters — dispatch raises a node's score and ripples a relief cascade to dependents.",
      demoNote: "Live-demoable now via the generic template and the Stampede full build (severity 1-10). Other specific crises in this cluster still fall back to the generic template with a \"not yet detailed\" note.",
    },
    generic: {
      nodes: [
        { id: "venue", label: "Venue Infrastructure (barriers, gates, exits)", icon: Building2, x: 130, y: 90, desc: "Physical layout of the venue — barriers, gates, and exit routes that shape how crowd flow can be controlled." },
        { id: "egress", label: "Exit & Egress Capacity", icon: Route, x: 400, y: 60, desc: "How much outgoing crowd flow the open exits can actually absorb." },
        { id: "comms", label: "Public Address & Crowd Communication", icon: Radio, x: 660, y: 90, desc: "Loudspeaker and messaging systems used to direct crowd movement and prevent panic." },
        { id: "security", label: "Security / Crowd-Control Response", icon: Truck, x: 250, y: 300, desc: "Personnel deployed to manage crowd flow and respond to pressure points." },
        { id: "medical", label: "On-Site Medical Capacity", icon: ShieldPlus, x: 540, y: 300, desc: "Trauma triage, ambulances, and medical staff available on site." },
        { id: "command", label: "Incident Command & Coordination", icon: UserCog, x: 395, y: 420, desc: "Central authority directing security, medical, and crowd-control response." },
      ],
      edges: [
        { from: "venue", to: "egress", w: 0.6 },
        { from: "comms", to: "egress", w: 0.4 },
        { from: "comms", to: "security", w: 0.3 },
        { from: "security", to: "medical", w: 0.4 },
        { from: "egress", to: "medical", w: 0.3 },
        { from: "command", to: "security", w: 0.5 },
        { from: "command", to: "medical", w: 0.3 },
        { from: "command", to: "comms", w: 0.4 },
      ],
      presets: [
        { id: "egress_overload", label: "Egress Overload", target: "egress", drop: 6, note: "Exit routes overwhelmed by crowd volume" },
        { id: "barrier_incident", label: "Barrier / Gate Incident", target: "venue", drop: 6, note: "Barrier or gate failure reported" },
        { id: "comms_failure", label: "PA / Comms Failure", target: "comms", drop: 5, note: "Public address system failure" },
        { id: "security_delay", label: "Security Response Delay", target: "security", drop: 5, note: "Security response delayed reaching the pressure point" },
      ],
    },
    specific: {
      stampede: {
        label: "Stampede at Mass Gathering (religious/festival)", full: true,
        geometry: "Point-of-crush origin radiating outward through crowd density and egress routes",
        nodes: [
          { id: "trigger", label: "Crowd Surge / Crush Trigger Point", icon: AlertTriangle, x: 130, y: 90, locationNote: "Ghat approach bottleneck, Kumbh Mela, Prayagraj", desc: "The specific bottleneck, barrier failure, or panic point where the crush originates. Everything downstream depends on relieving pressure here first." },
          { id: "density", label: "Crowd Density Monitoring", icon: Users, x: 400, y: 50, locationNote: "CCTV density-tracking grid, main ghat", desc: "Real-time headcount and density readings showing where crowd pressure is building toward critical levels." },
          { id: "barriers", label: "Barrier & Gate Integrity", icon: ShieldAlert, x: 660, y: 90, locationNote: "Perimeter barricades, Sector 4", desc: "Physical barriers, railings, and gates holding crowd flow in a controlled pattern. Failure here removes the last physical buffer." },
          { id: "egress", label: "Exit & Egress Route Capacity", icon: Route, x: 130, y: 300, locationNote: "Designated exit corridors, Sector 4", desc: "Number and width of open exit routes able to actually absorb outgoing crowd flow." },
          { id: "comms", label: "Public Address & Crowd Communication", icon: Radio, x: 400, y: 260, locationNote: "PA tower & announcement network, Mela grounds", desc: "Loudspeaker and messaging systems used to direct crowd movement and prevent panic-driven surges." },
          { id: "security", label: "Security / Crowd-Control Response", icon: Truck, x: 660, y: 300, locationNote: "Crowd-control response post, Sector 4", desc: "Personnel dispatched to relieve pressure at the trigger point and manage crowd flow." },
          { id: "medical", label: "On-Site Medical & Trauma Response", icon: Building2, x: 400, y: 430, locationNote: "Mobile medical camp, ghat zone", desc: "Trauma triage, ambulances, and medical staff capacity to treat crush injuries on site." },
          { id: "command", label: "Incident Command & Coordination", icon: UserCog, x: 660, y: 430, locationNote: "Unified command post, Mela control room", desc: "Central coordination authority directing security, medical, and crowd-control response in real time." },
        ],
        edges: [
          { from: "trigger", to: "density", w: 0.5 },
          { from: "trigger", to: "barriers", w: 0.7 },
          { from: "barriers", to: "egress", w: 0.5 },
          { from: "density", to: "comms", w: 0.4 },
          { from: "density", to: "security", w: 0.5 },
          { from: "comms", to: "egress", w: 0.4 },
          { from: "security", to: "egress", w: 0.3 },
          { from: "security", to: "medical", w: 0.3 },
          { from: "egress", to: "medical", w: 0.4 },
          { from: "command", to: "security", w: 0.5 },
          { from: "command", to: "comms", w: 0.4 },
          { from: "command", to: "medical", w: 0.3 },
        ],
        presets: [
          { id: "crush_point", label: "Crush Reported at Bottleneck", target: "trigger", drop: 8, note: "Crush reported at bottleneck, pressure building rapidly" },
          { id: "barrier_failure", label: "Barrier / Barricade Failure", target: "barriers", drop: 8, note: "Barricade collapse under crowd pressure" },
          { id: "density_critical", label: "Density Reaches Critical Threshold", target: "density", drop: 6, note: "Density readings cross critical threshold" },
          { id: "exit_blocked", label: "Exit Corridor Blocked", target: "egress", drop: 6, note: "Primary exit corridor blocked or overwhelmed" },
          { id: "pa_failure", label: "PA System Failure", target: "comms", drop: 5, note: "Public-address failure, crowd instructions not reaching the area" },
          { id: "false_rumor", label: "False Rumor Triggers Panic", target: "comms", drop: 4, note: "Unverified rumor triggers panic movement" },
          { id: "security_delay", label: "Security Response Delay", target: "security", drop: 5, note: "Security response delayed reaching the pressure point" },
          { id: "medical_surge", label: "Mass Casualty Medical Surge", target: "medical", drop: 6, note: "Mass casualty surge overwhelms on-site medical capacity" },
          { id: "command_confusion", label: "Command Confusion", target: "command", drop: 5, note: "Conflicting instructions from multiple command posts" },
          { id: "secondary_crush", label: "Secondary Crush Point Forms", target: "trigger", drop: 7, note: "Secondary crush forms at an adjacent bottleneck" },
          { id: "stampede_onset", label: "Panic-Driven Stampede Onset", target: "egress", drop: 7, note: "Panic-driven stampede begins toward nearest exit" },
          { id: "lighting_loss", label: "Lighting / PA Power Loss", target: "comms", drop: 4, note: "Lighting and PA power loss after dark, panic risk rising" },
        ],
      },
      mass_casualty: { label: "Mass Casualty Medical Event", full: false },
      active_threat: { label: "Mass Casualty / Active Threat Situation", full: false },
      civil_unrest: { label: "Large-Scale Civil Unrest", full: false },
      terrorism: { label: "Terrorism-Related Incident", full: false },
      crowd_crush: { label: "Stadium or Venue Crowd Crush", full: false },
      public_event: { label: "Large Public Event Emergency", full: false },
      transit_crowd: { label: "Transit Hub Crowd Emergency", full: false },
      bomb_threat: { label: "Bomb Threat / Suspicious Device", full: false },
      hostage: { label: "Hostage Situation", full: false },
      vip_security: { label: "VIP Security Breach / Protest Breach", full: false },
    },
  },
};

// ---------------------------------------------------------------------------
// 3 Initial Multi-Agency Escalations (Realistic District / State / Regional Assets)
// ---------------------------------------------------------------------------
const INITIAL_ESCALATIONS = [
  {
    id: "esc-1",
    title: "SDRF / NDRF Heavy Rescue Battalion Deployment",
    agency: "State Emergency Operations Center (SEOC)",
    tier: "Tier 2 — State Mutual Aid",
    urgency: "High",
    requestedAt: "00:01:20",
    status: "pending", // 'pending' | 'approved' | 'rejected'
    grantUnits: 3,
    targetNodeHint: ["rescue", "response", "relief", "suppression"],
    description: "Multi-point infrastructure failure reported. Requesting 3 specialized heavy search & rescue task teams with boat/amphibious gear.",
    justification: "Local first responders have exhausted 100% of forward deployed capacity.",
  },
  {
    id: "esc-2",
    title: "Inter-District Medical Evacuation & Trauma Corridor",
    agency: "Directorate of Health Services",
    tier: "Tier 2 — Regional Health Authority",
    urgency: "Critical",
    requestedAt: "00:02:45",
    status: "pending",
    grantUnits: 2,
    targetNodeHint: ["medical", "hospital"],
    description: "Requesting immediate priority green corridor clearance, 12 Advanced Life Support ambulances, and 50 trauma bed reservations in adjacent district.",
    justification: "Zonal hospital triage index has reached critical overload.",
  },
  {
    id: "esc-3",
    title: "Emergency Mobile Substation & Generator Bank Authorization",
    agency: "State Electricity Transmission Utility",
    tier: "Tier 1 — Critical Infrastructure",
    urgency: "Medium",
    requestedAt: "00:03:10",
    status: "approved",
    approvedAt: "00:03:40",
    grantUnits: 2,
    targetNodeHint: ["power", "utilities", "backup"],
    description: "4x 500kVA mobile diesel generators authorized for emergency backup at primary communication towers and water pumping facilities.",
    justification: "Pre-emptive containment against total telemetry and municipal blackout.",
  }
];

const EXERCISE_TYPES = {
  tabletop: { label: "Tabletop", pool: 6, note: "Discussion-based walkthrough. Low time pressure, decisions talked through rather than raced." },
  functional: { label: "Functional", pool: 10, note: "Simulated real-time decision-making, single function or team under load." },
  fullscale: { label: "Full-Scale", pool: 15, note: "Real-time, multi-agency. May involve real assets moved in a contained, notional way." },
};

const OBJECTIVE_PRESETS = [
  "Inter-agency handoff speed",
  "Evacuation logistics",
  "Communication chain under load",
  "Resource deployment speed",
  "Custom",
];

const DEFAULT_METRICS_BY_OBJECTIVE = {
  "Inter-agency handoff speed": [
    { label: "Time to first dispatch", target: "< 2 min" },
    { label: "Handoff confirmations logged", target: "100%" },
  ],
  "Evacuation logistics": [
    { label: "Time to evac/population-safety dispatch", target: "< 3 min" },
    { label: "Population-safety node recovered to ≥ 7", target: "Yes" },
  ],
  "Communication chain under load": [
    { label: "Comms node time-to-recovery", target: "< 4 min" },
    { label: "Conflicting-source events", target: "0" },
  ],
  "Resource deployment speed": [
    { label: "Resource units committed", target: "≤ pool size" },
    { label: "Time to full containment", target: "< 6 min" },
  ],
};

let _idSeq = 1;
const nextId = () => `id${_idSeq++}`;

function fmtClock(sec) {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function statusColor(v) {
  if (v >= 7) return "var(--good)";
  if (v >= 4) return "var(--warn)";
  return "var(--crit)";
}

function statusLabel(v) {
  if (v >= 7) return "Nominal";
  if (v >= 4) return "Degraded";
  return "Critical";
}

function freshness(ageSec) {
  if (ageSec < 20) return { tier: "fresh", label: "fresh", opacity: 1 };
  if (ageSec < 50) return { tier: "aging", label: "aging", opacity: 0.85 };
  return { tier: "stale", label: "stale", opacity: 0.6 };
}

function severityBaseline(sev) {
  return Math.max(2, Math.min(9, Math.round(9.5 - sev * 0.55)));
}

function severityMultiplier(sev) {
  return 0.55 + sev * 0.09;
}

function ManagementPlan({ clusterId, cluster, standalone }) {
  const plan = cluster.plan;
  return (
    <div className={standalone ? "plan-standalone" : "plan-card"}>
      <div className="plan-header">
        <span className="cluster-badge" style={{ background: "#eff6ff", color: cluster.color, border: `1px solid #bfdbfe` }}>
          <Layers size={11} /> Cluster {clusterId} — {cluster.title}
        </span>
        <span className={`buildable-tag ${cluster.buildable ? "yes" : "no"}`}>
          {cluster.buildable ? <><Target size={11} /> Live-demoable</> : <><Lock size={11} /> Plan only — not demoable</>}
        </span>
      </div>
      <div className="plan-row"><span className="plan-label">Engine Mode</span><span className="plan-text">{plan.engineMode}</span></div>
      <div className="plan-row"><span className="plan-label">Core Nodes</span><span className="plan-text">{plan.coreNodes}</span></div>
      <div className="plan-row-block">
        <span className="plan-label">What's Needed</span>
        <ul className="plan-list">
          {plan.needed.map((n, i) => (<li key={i}><strong>{n.label}</strong> — {n.text}</li>))}
        </ul>
      </div>
      <div className="plan-row"><span className="plan-label">Dispatch Type</span><span className="plan-text">{plan.dispatch}</span></div>
      <div className="plan-row"><span className="plan-label">Response Logic</span><span className="plan-text">{plan.responseLogic}</span></div>
      <div className="plan-row-block plan-demo">
        <span className="plan-label">Demo Note</span>
        <span className="plan-text">{plan.demoNote}</span>
      </div>
    </div>
  );
}

function ControllerBar({
  exerciseStatus, objective, customObjective, exerciseType, onOpenSetup,
  onStart, onPause, onResume, onStop, checkpointsCount, onRewind,
  observerMode, onToggleObserver, timelineCount,
}) {
  const objectiveLabel = objective === "Custom" ? (customObjective || "custom, unlabeled") : (objective || "not set");
  return (
    <div className="controller-bar">
      <span className="controller-tag"><UserCog size={13} /> Exercise Controller</span>
      <span className={`status-pill ${exerciseStatus}`}>{exerciseStatus}</span>
      <span className="isolated-badge"><Radar size={11} /> DRILL-NET Simulated Link</span>
      <div className="ctrl-spacer" />
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
        Objective: <strong style={{ color: "var(--text)" }}>{objectiveLabel}</strong> · {EXERCISE_TYPES[exerciseType].label} · {timelineCount} inject{timelineCount === 1 ? "" : "s"}
      </span>
      <button className="ctrl-btn" onClick={onOpenSetup}><ListChecks size={12} /> Setup</button>
      <label className="observer-toggle">
        <input type="checkbox" checked={observerMode} onChange={onToggleObserver} /> <Eye size={12} /> Observer
      </label>
      {exerciseStatus === "idle" && <button className="ctrl-btn primary" onClick={onStart}><Play size={12} /> Start Exercise</button>}
      {exerciseStatus === "running" && <button className="ctrl-btn" onClick={onPause}><Pause size={12} /> Pause</button>}
      {exerciseStatus === "paused" && <button className="ctrl-btn primary" onClick={onResume}><Play size={12} /> Resume</button>}
      <button className="ctrl-btn" onClick={onRewind} disabled={checkpointsCount === 0} title="Restore the last checkpoint"><Rewind size={12} /> Rewind</button>
      <button className="ctrl-btn danger" onClick={onStop} disabled={exerciseStatus === "idle" || exerciseStatus === "stopped"}><Square size={12} /> Stop &amp; Review</button>
    </div>
  );
}

function SetupPanel({
  onClose, objective, customObjective, onObjectiveChange, onCustomObjectiveChange,
  exerciseType, onTypeChange, metrics, onAddMetric, onUpdateMetric, onRemoveMetric,
  roster, onAddRoster, onUpdateRoster, onRemoveRoster, briefing, onBriefingChange,
  timeline, onAddTimeline, onUpdateTimeline, onRemoveTimeline, presetOptions, onStart, exerciseStatus,
}) {
  return (
    <div className="setup-overlay" onClick={onClose}>
      <div className="setup-panel" onClick={(e) => e.stopPropagation()}>
        <div className="setup-head">
          <div className="setup-title"><ListChecks size={16} /> Exercise Setup</div>
          <button className="setup-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="setup-sub">Drill-specific controls: learning objective, scripted timeline, roster, and success metrics to grade against.</div>

        <div className="setup-notional-note">
          <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          All resources, teams, and outcomes in this exercise are notional. Units replenish as inter-agency escalations are approved.
        </div>

        <div className="setup-section">
          <div className="setup-section-title"><Target size={12} /> 1. Learning Objective</div>
          <div className="setup-field-row">
            <select className="setup-select" value={objective} onChange={(e) => onObjectiveChange(e.target.value)}>
              <option value="">— choose an objective —</option>
              {OBJECTIVE_PRESETS.map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
          </div>
          {objective === "Custom" && (
            <input className="setup-input" placeholder="Describe the capability being tested…" value={customObjective} onChange={(e) => onCustomObjectiveChange(e.target.value)} />
          )}
        </div>

        <div className="setup-section">
          <div className="setup-section-title"><Gauge size={12} /> Exercise Type (sets the notional resource pool)</div>
          <div className="type-options">
            {Object.entries(EXERCISE_TYPES).map(([id, t]) => (
              <div key={id} className={`type-card ${exerciseType === id ? "active" : ""}`} onClick={() => onTypeChange(id)}>
                <div className="type-card-label">{t.label} · pool {t.pool}</div>
                <div className="type-card-note">{t.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <div className="setup-section-title"><ClipboardList size={12} /> 4. Success Metrics</div>
          {metrics.map((m) => (
            <div key={m.id} className="table-row-2">
              <input className="setup-input" placeholder="Metric (e.g. Time to first dispatch)" value={m.label} onChange={(e) => onUpdateMetric(m.id, "label", e.target.value)} />
              <input className="setup-input" placeholder="Target (e.g. < 2 min)" value={m.target} onChange={(e) => onUpdateMetric(m.id, "target", e.target.value)} />
              <button className="row-x-btn" onClick={() => onRemoveMetric(m.id)}><X size={13} /></button>
            </div>
          ))}
          <button className="add-row-btn" onClick={onAddMetric}><Plus size={12} /> Add metric</button>
        </div>

        <div className="setup-section">
          <div className="setup-section-title"><UserCog size={12} /> 5. Roster &amp; Roles</div>
          {roster.map((r) => (
            <div key={r.id} className="table-row-2">
              <input className="setup-input" placeholder="Role (e.g. Incident Commander)" value={r.role} onChange={(e) => onUpdateRoster(r.id, "role", e.target.value)} />
              <input className="setup-input" placeholder="Participant name" value={r.name} onChange={(e) => onUpdateRoster(r.id, "name", e.target.value)} />
              <button className="row-x-btn" onClick={() => onRemoveRoster(r.id)}><X size={13} /></button>
            </div>
          ))}
          <button className="add-row-btn" onClick={onAddRoster}><Plus size={12} /> Add role</button>
        </div>

        <div className="setup-section">
          <div className="setup-section-title"><FileText size={12} /> Pre-Exercise Briefing</div>
          <textarea className="setup-textarea" placeholder="What participants are told before the drill starts…" value={briefing} onChange={(e) => onBriefingChange(e.target.value)} />
        </div>

        <div className="setup-section">
          <div className="setup-section-title"><CalendarClock size={12} /> 2. Scripted Injects Timeline</div>
          {timeline.map((t) => (
            <div key={t.id} className="table-row-3">
              <select className="setup-select" value={t.presetId} onChange={(e) => onUpdateTimeline(t.id, "presetId", e.target.value)}>
                {presetOptions.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
              </select>
              <input className="setup-input" type="number" min={0} step={1} value={t.triggerMin} onChange={(e) => onUpdateTimeline(t.id, "triggerMin", Number(e.target.value))} title="Minutes into the exercise" />
              <button className="row-x-btn" onClick={() => onRemoveTimeline(t.id)}><X size={13} /></button>
            </div>
          ))}
          {presetOptions.length > 0 ? (
            <button className="add-row-btn" onClick={onAddTimeline}><Plus size={12} /> Add scripted inject (minutes into exercise)</button>
          ) : (
            <div className="aar-empty">No presets available for this template yet.</div>
          )}
        </div>

        <div className="setup-footer">
          <button className="ctrl-btn" onClick={onClose}>Close</button>
          {exerciseStatus === "idle" && <button className="ctrl-btn primary" onClick={onStart}><Play size={12} /> Start Exercise</button>}
        </div>
      </div>
    </div>
  );
}

function AARView({ objective, customObjective, exerciseType, roster, metrics, evalLog, debrief, onDebriefChange, duration, log, onBack, onReset }) {
  const objectiveLabel = objective === "Custom" ? (customObjective || "Custom (unlabeled)") : (objective || "Not set");
  const dispatchCount = log.filter((l) => l.kind === "dispatch").length;
  const injectCount = log.filter((l) => l.kind === "trigger").length;
  const cascadeCount = log.filter((l) => l.kind === "cascade" || l.kind === "cascade2").length;
  const conflictCount = log.filter((l) => l.kind === "conflict").length;
  const firstDispatch = [...log].reverse().find((l) => l.kind === "dispatch");

  const autoActual = (label) => {
    const l = label.toLowerCase();
    if (l.includes("time to first dispatch")) return firstDispatch ? firstDispatch.t : "no dispatch logged";
    if (l.includes("conflicting-source") || l.includes("conflicts")) return String(conflictCount);
    if (l.includes("resource units committed")) return String(dispatchCount);
    return null;
  };

  return (
    <div className="aar-view">
      <div className="aar-header">
        <h1>After-Action Review</h1>
        <div className="sub">Structured debrief comparing what happened against what the exercise set out to test.</div>
      </div>

      <div className="aar-section">
        <div className="aar-section-title"><Target size={12} /> Objective &amp; Setup</div>
        <div className="aar-grid">
          <div className="aar-stat"><div className="num" style={{ fontSize: 13 }}>{objectiveLabel}</div><div className="lbl">Objective</div></div>
          <div className="aar-stat"><div className="num" style={{ fontSize: 13 }}>{EXERCISE_TYPES[exerciseType].label}</div><div className="lbl">Exercise Type</div></div>
          <div className="aar-stat"><div className="num">{fmtClock(duration)}</div><div className="lbl">Duration</div></div>
        </div>
      </div>

      <div className="aar-section">
        <div className="aar-section-title"><Activity size={12} /> Run Statistics</div>
        <div className="aar-grid">
          <div className="aar-stat"><div className="num">{injectCount}</div><div className="lbl">Injects fired</div></div>
          <div className="aar-stat"><div className="num">{dispatchCount}</div><div className="lbl">Dispatch actions</div></div>
          <div className="aar-stat"><div className="num">{cascadeCount}</div><div className="lbl">Cascade events</div></div>
        </div>
      </div>

      <div className="aar-section">
        <div className="aar-section-title"><ClipboardList size={12} /> Success Metrics — Target vs. Actual</div>
        {metrics.length === 0 && <div className="aar-empty">No metrics were defined for this run.</div>}
        {metrics.filter((m) => m.label).map((m) => (
          <div key={m.id} className="aar-metric-row">
            <span>{m.label}</span>
            <span className="aar-metric-target">Target: {m.target || "—"}</span>
            <span className="aar-metric-actual">{autoActual(m.label) ?? "Manual entry — score from observer notes"}</span>
          </div>
        ))}
      </div>

      <div className="aar-section">
        <div className="aar-section-title"><UserCog size={12} /> Roster</div>
        {roster.length === 0 && <div className="aar-empty">No roster was recorded.</div>}
        {roster.filter((r) => r.role || r.name).map((r) => (
          <div key={r.id} className="aar-metric-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <span>{r.role || "Unassigned role"}</span>
            <span className="aar-metric-target">{r.name || "—"}</span>
          </div>
        ))}
      </div>

      <div className="aar-section">
        <div className="aar-section-title"><Eye size={12} /> Gap / Lessons-Learned Log</div>
        {evalLog.length === 0 && <div className="aar-empty">No observer notes were logged during this run.</div>}
        {evalLog.map((e, i) => (
          <div key={i} className="aar-eval-entry">
            <span className={`aar-eval-tag ${e.tag}`}>{e.tag}</span>
            <span className="log-time mono">{e.t}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>

      <div className="aar-section">
        <div className="aar-section-title"><FileText size={12} /> Debrief Notes — feeds into SOP revision</div>
        <textarea className="setup-textarea" placeholder="Structured debrief: what happened vs. what should have happened…" value={debrief} onChange={(e) => onDebriefChange(e.target.value)} />
      </div>

      <div className="aar-actions">
        <button className="ctrl-btn" onClick={onBack}>Back to Dashboard</button>
        <button className="ctrl-btn primary" onClick={onReset}><RotateCcw size={12} /> Reset &amp; Run Again</button>
      </div>
    </div>
  );
}

export default function UnityEOC() {
  const [clusterId, setClusterId] = useState(1);
  const [specificId, setSpecificId] = useState(null);
  const [severity, setSeverity] = useState(5);
  const [mode, setMode] = useState("exercise");
  const [scores, setScores] = useState({});
  const [log, setLog] = useState([]);
  const [pulsingEdges, setPulsingEdges] = useState([]);
  const [pulseKind, setPulseKind] = useState("crit");
  const [activePresets, setActivePresets] = useState([]);
  const [containmentRadius, setContainmentRadius] = useState(100);
  const [showPlan, setShowPlan] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const [cascadeToast, setCascadeToast] = useState(null);
  const [, forceTick] = useState(0);

  // --- Escalation State (3 Pre-loaded Requests & Tab Selector) ---
  const [escalations, setEscalations] = useState(INITIAL_ESCALATIONS);
  const [leftTab, setLeftTab] = useState("injects"); // 'injects' | 'escalations'

  // --- Exercise State ---
  const [setupOpen, setSetupOpen] = useState(false);
  const [objective, setObjective] = useState("");
  const [customObjective, setCustomObjective] = useState("");
  const [exerciseType, setExerciseType] = useState("functional");
  const [metrics, setMetrics] = useState([]);
  const [roster, setRoster] = useState([]);
  const [briefing, setBriefing] = useState("");
  const [timeline, setTimeline] = useState([]);
  const [exerciseStatus, setExerciseStatus] = useState("idle");
  const [observerMode, setObserverMode] = useState(false);
  const [evalLog, setEvalLog] = useState([]);
  const [gapNote, setGapNote] = useState("");
  const [gapTag, setGapTag] = useState("gap");
  const [debrief, setDebrief] = useState("");
  const [resourcePool, setResourcePool] = useState({ total: 10, available: 10 });
  const [checkpoints, setCheckpoints] = useState([]);
  const [showAAR, setShowAAR] = useState(false);
  const [exerciseStartClock, setExerciseStartClock] = useState(0);

  const clockRef = useRef(0);
  const sourceMapRef = useRef({});
  const conflictLoggedRef = useRef(new Set());

  const cluster = CLUSTERS[clusterId];
  const buildable = cluster.buildable;
  const specificEntry = specificId ? cluster.specific[specificId] : null;
  const usingFallback = !!specificId && specificEntry && !specificEntry.full;
  const T = (specificEntry && specificEntry.full) ? specificEntry : cluster.generic;
  const templateLabel = (specificEntry && specificEntry.full) ? specificEntry.label : `${cluster.title} (generic)`;

  const pendingEscalationsCount = escalations.filter(e => e.status === "pending").length;

  const buildBaseline = useCallback((m, sev) => {
    const base = severityBaseline(sev);
    const out = {};
    T.nodes.forEach((n) => {
      out[n.id] = { value: base, updatedAt: 0, source: m === "live" ? "live feed" : "baseline" };
    });
    return out;
  }, [T]);

  const resetScenario = useCallback((sev, m, note) => {
    if (!buildable || T.nodes.length === 0) return;
    setScores(buildBaseline(m, sev));
    sourceMapRef.current = {};
    conflictLoggedRef.current = new Set();
    setActivePresets([]);
    setContainmentRadius(100);
    clockRef.current = 0;
    setPulsingEdges([]);
    setEscalations(INITIAL_ESCALATIONS);
    setLog([{ t: "00:00:00", text: note, kind: "info" }]);
    setExerciseStatus("idle");
    setExerciseStartClock(0);
    setEvalLog([]);
    setCheckpoints([]);
    setShowAAR(false);
    setTimeline((tl) => tl.map((t) => ({ ...t, fired: false })));
    const poolTotal = EXERCISE_TYPES[exerciseType]?.pool ?? 10;
    setResourcePool({ total: poolTotal, available: poolTotal });
  }, [buildable, T, buildBaseline, exerciseType]);

  useEffect(() => {
    setSpecificId(null);
    setShowPlan(!CLUSTERS[clusterId].buildable);
    setSetupOpen(false);
    setObjective("");
    setCustomObjective("");
    setMetrics([]);
    setRoster([]);
    setBriefing("");
    setDebrief("");
    setTimeline([]);
    setObserverMode(false);
  }, [clusterId]);

  useEffect(() => {
    if (!buildable) return;
    resetScenario(severity, mode, `Scenario loaded: ${templateLabel}. Severity ${severity}/10. All capabilities at baseline.`);
  }, [clusterId, specificId, buildable, resetScenario, severity, mode, templateLabel]);

  const isPaused = mode === "exercise" && exerciseStatus === "paused";

  useEffect(() => {
    const clockTimer = setInterval(() => {
      if (!isPaused) clockRef.current += 1;
    }, 1000);
    const tickTimer = setInterval(() => forceTick((x) => x + 1), 4000);
    return () => { clearInterval(clockTimer); clearInterval(tickTimer); };
  }, [isPaused]);

  useEffect(() => {
    if (mode !== "live" || !buildable || T.nodes.length === 0) return;
    const feed = setInterval(() => {
      setScores((prev) => {
        const ids = Object.keys(prev);
        if (!ids.length) return prev;
        const pick = ids[Math.floor(Math.random() * ids.length)];
        const delta = Math.random() < 0.5 ? -1 : 1;
        const next = { ...prev };
        const cur = next[pick];
        next[pick] = { value: Math.max(2, Math.min(10, cur.value + delta)), updatedAt: clockRef.current, source: "live feed" };
        return next;
      });
    }, 8500);
    return () => clearInterval(feed);
  }, [mode, buildable, T]);

  const stamp = () => {
    const s = clockRef.current;
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const addLog = useCallback((text, kind = "info") => {
    setLog((l) => [{ t: stamp(), text, kind }, ...l].slice(0, 50));
  }, []);

  const neighbors = (id) => T.edges.filter((e) => e.from === id);

  const markSource = (nodeId, presetId) => {
    const set = sourceMapRef.current[nodeId] || new Set();
    const before = set.size;
    set.add(presetId);
    sourceMapRef.current[nodeId] = set;
    if (set.size >= 2 && before < 2 && !conflictLoggedRef.current.has(nodeId)) {
      conflictLoggedRef.current.add(nodeId);
      const label = T.nodes.find((n) => n.id === nodeId)?.label || nodeId;
      addLog(`CONFLICT DETECTED — ${label} is being degraded by more than one active failure at once.`, "conflict");
    }
  };

  const triggerFailure = (preset) => {
    if (mode !== "exercise" || activePresets.includes(preset.id) || isPaused) return;
    const mult = severityMultiplier(severity);
    const scaledDrop = Math.max(1, Math.round(preset.drop * mult));
    setActivePresets((a) => [...a, preset.id]);
    if (activePresets.length >= 1) addLog(`COMPOUND INJECT — ${preset.label} triggered while another failure is still active.`, "trigger");
    if (T.containment && preset.target === "origin") setContainmentRadius(100);

    setScores((prev) => {
      const next = { ...prev };
      next[preset.target] = { value: Math.max(0, prev[preset.target].value - scaledDrop), updatedAt: clockRef.current, source: "manual inject" };
      return next;
    });
    markSource(preset.target, preset.id);
    const targetLabel = T.nodes.find((n) => n.id === preset.target)?.label || preset.target;
    addLog(`INJECT — ${targetLabel}: ${preset.note} (severity-scaled impact: -${scaledDrop})`, "trigger");
    setCascadeToast({ text: `${targetLabel} hit → watch it ripple to dependent capabilities`, kind: "crit" });
    setTimeout(() => setCascadeToast((cur) => (cur && cur.text.startsWith(targetLabel) ? null : cur)), 4200);

    setTimeout(() => {
      setPulseKind("crit");
      setPulsingEdges(neighbors(preset.target).map((e) => `${e.from}-${e.to}`));
      setScores((prev) => {
        const next = { ...prev };
        const sourceVal = next[preset.target].value;
        neighbors(preset.target).forEach((e) => {
          const impact = Math.round(e.w * (10 - sourceVal) * mult);
          if (impact > 0) {
            next[e.to] = { value: Math.max(0, next[e.to].value - impact), updatedAt: clockRef.current, source: "cascade" };
            markSource(e.to, preset.id);
          }
        });
        return next;
      });
    }, 550);

    setTimeout(() => {
      setScores((current) => {
        const affected = [];
        neighbors(preset.target).forEach((e) => {
          if (current[e.to].value < 7) {
            const toLabel = T.nodes.find((n) => n.id === e.to)?.label || e.to;
            addLog(`CASCADE — hop 1 — ${toLabel} degraded to ${current[e.to].value}/10`, "cascade");
            affected.push(toLabel);
          }
        });
        if (affected.length) {
          setCascadeToast({ text: `${targetLabel} → ${affected.join(", ")}`, kind: "crit" });
          setTimeout(() => setCascadeToast(null), 4200);
        }
        return current;
      });
      const hop2Edges = [];
      neighbors(preset.target).forEach((e1) => neighbors(e1.to).forEach((e2) => hop2Edges.push(`${e2.from}-${e2.to}`)));
      setPulsingEdges((prev) => [...prev, ...hop2Edges]);
      setScores((prev) => {
        const next = { ...prev };
        neighbors(preset.target).forEach((e1) => {
          const midScore = next[e1.to].value;
          neighbors(e1.to).forEach((e2) => {
            const impact = Math.round(e2.w * (10 - midScore) * 0.6 * mult);
            if (impact > 0) {
              next[e2.to] = { value: Math.max(0, next[e2.to].value - impact), updatedAt: clockRef.current, source: "cascade" };
              markSource(e2.to, preset.id);
              addLog(`CASCADE — hop 2 — ${T.nodes.find((n) => n.id === e2.to)?.label} affected via ${T.nodes.find((n) => n.id === e1.to)?.label}`, "cascade2");
            }
          });
        });
        return next;
      });
    }, 1150);

    setTimeout(() => setPulsingEdges([]), 2300);
  };

  const dispatch = (nodeId) => {
    if (isPaused) return;
    if (mode === "exercise" && resourcePool.available <= 0) {
      addLog("DISPATCH BLOCKED — no notional response units available. Approve pending escalations to release more units.", "controller");
      setCascadeToast({ text: "Zero units available! Approve an escalation request.", kind: "crit" });
      return;
    }
    const label = T.nodes.find((n) => n.id === nodeId)?.label || nodeId;
    const isOriginContainment = T.containment && nodeId === "origin";

    if (mode === "exercise") {
      setResourcePool((p) => ({ ...p, available: Math.max(0, p.available - 1) }));
    }

    setScores((prev) => {
      const next = { ...prev };
      next[nodeId] = { value: Math.min(10, prev[nodeId].value + 3), updatedAt: clockRef.current, source: mode === "live" ? "dispatch (live)" : "dispatch (exercise)" };
      return next;
    });

    if (isOriginContainment) {
      setContainmentRadius((r) => {
        const next = Math.max(0, r - 30);
        addLog(`SPECIALIST DISPATCH — containment radius reduced to ${next}%.${next === 0 ? " Origin contained." : ""}`, "dispatch");
        return next;
      });
    } else {
      addLog(`DISPATCH — response committed to ${label}. Capability reinforced.`, "dispatch");
    }

    setTimeout(() => {
      setPulseKind("good");
      setPulsingEdges(neighbors(nodeId).map((e) => `${e.from}-${e.to}`));
      setScores((prev) => {
        const next = { ...prev };
        neighbors(nodeId).forEach((e) => {
          const relief = Math.round(e.w * 2);
          if (relief > 0) next[e.to] = { value: Math.min(10, next[e.to].value + relief), updatedAt: clockRef.current, source: "relief cascade" };
        });
        return next;
      });
      neighbors(nodeId).forEach((e) => addLog(`RELIEF CASCADE — hop 1 — ${T.nodes.find((n) => n.id === e.to)?.label} eased by reinforcement of ${label}`, "dispatch"));
      const eased = neighbors(nodeId).map((e) => T.nodes.find((n) => n.id === e.to)?.label).filter(Boolean);
      if (eased.length) {
        setCascadeToast({ text: `${label} reinforced → ${eased.join(", ")} recovering`, kind: "good" });
        setTimeout(() => setCascadeToast(null), 4200);
      }
    }, 500);
    setTimeout(() => setPulsingEdges([]), 1400);
  };

  // --- Escalation Handlers ---
  const handleApproveEscalation = (esc) => {
    setEscalations((prev) => prev.map((item) => item.id === esc.id ? { ...item, status: "approved", approvedAt: stamp() } : item));
    
    // Replenish notional resource pool
    setResourcePool((p) => ({
      total: p.total + esc.grantUnits,
      available: p.available + esc.grantUnits,
    }));

    // Find and boost any matching target capability node
    const matchingNode = T.nodes.find((n) => esc.targetNodeHint.some((hint) => n.id.toLowerCase().includes(hint) || n.label.toLowerCase().includes(hint)));
    if (matchingNode) {
      setScores((prev) => ({
        ...prev,
        [matchingNode.id]: {
          value: Math.min(10, (prev[matchingNode.id]?.value || 5) + 2),
          updatedAt: clockRef.current,
          source: "escalation surge"
        }
      }));
    }

    addLog(`ESCALATION APPROVED — ${esc.title} authorized by SEOC (+${esc.grantUnits} units released)`, "dispatch");
    setCascadeToast({ text: `Escalation Authorized: +${esc.grantUnits} Units Released`, kind: "good" });
  };

  const handleRejectEscalation = (esc) => {
    setEscalations((prev) => prev.map((item) => item.id === esc.id ? { ...item, status: "rejected", rejectedAt: stamp() } : item));
    addLog(`ESCALATION DECLINED — ${esc.title} held at command level.`, "info");
  };

  const handleRequestNewEscalation = () => {
    const newId = `esc-${Date.now()}`;
    const newEsc = {
      id: newId,
      title: "Armed Forces / Engineering Task Force Mutual Aid",
      agency: "HQ Integrated Defence Staff",
      tier: "Tier 3 — National Command",
      urgency: "Critical",
      requestedAt: stamp(),
      status: "pending",
      grantUnits: 3,
      targetNodeHint: ["roads", "infra", "rescue", "perimeter"],
      description: "Air-droppable heavy Bailey bridge units, heavy plant machinery, and satellite mobile terminal uplink.",
      justification: "District transport arteries severed by primary hazard escalation.",
    };
    setEscalations((prev) => [newEsc, ...prev]);
    addLog(`ESCALATION FILED — ${newEsc.title} requested by Field Commander.`, "trigger");
    setLeftTab("escalations");
  };

  const reset = () => resetScenario(severity, mode, "Reset to baseline. All active injects cleared.");

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    resetScenario(severity, next, next === "live"
      ? "Data source switched to LIVE. Manual injection disabled; capabilities now driven by telemetry."
      : "Data source switched to EXERCISE. Synthetic inputs enabled.");
    if (next === "live") { setSetupOpen(false); setShowAAR(false); }
  };

  const saveCheckpoint = (label) => {
    setCheckpoints((c) => [
      ...c.slice(-4),
      { clock: clockRef.current, label, scores, log, activePresets, containmentRadius },
    ]);
  };

  const rewind = () => {
    setCheckpoints((c) => {
      if (c.length === 0) return c;
      const last = c[c.length - 1];
      setScores(last.scores);
      setLog(last.log);
      setActivePresets(last.activePresets);
      setContainmentRadius(last.containmentRadius);
      clockRef.current = last.clock;
      setTimeout(() => addLog(`REWIND — restored exercise to ${fmtClock(last.clock)} checkpoint (${last.label}).`, "controller"), 0);
      return c.slice(0, -1);
    });
  };

  const startExercise = () => {
    setExerciseStatus("running");
    setExerciseStartClock(clockRef.current);
    addLog(`EXERCISE STARTED — controller began the run. Objective: ${objective === "Custom" ? customObjective : (objective || "none set")}.`, "controller");
    setSetupOpen(false);
  };
  const pauseExercise = () => {
    setExerciseStatus("paused");
    addLog("EXERCISE PAUSED by controller.", "controller");
  };
  const resumeExercise = () => {
    setExerciseStatus("running");
    addLog("EXERCISE RESUMED by controller.", "controller");
  };
  const stopExercise = () => {
    setExerciseStatus("stopped");
    setShowAAR(true);
    addLog("EXERCISE STOPPED — generating After-Action Review.", "controller");
  };
  const addEvalNote = () => {
    if (!gapNote.trim()) return;
    setEvalLog((l) => [...l, { t: fmtClock(clockRef.current), tag: gapTag, text: gapNote.trim() }]);
    setGapNote("");
  };
  const addMetric = () => setMetrics((m) => [...m, { id: nextId(), label: "", target: "" }]);
  const updateMetric = (id, field, val) => setMetrics((m) => m.map((x) => (x.id === id ? { ...x, [field]: val } : x)));
  const removeMetric = (id) => setMetrics((m) => m.filter((x) => x.id !== id));
  const addRosterRow = () => setRoster((r) => [...r, { id: nextId(), role: "", name: "" }]);
  const updateRoster = (id, field, val) => setRoster((r) => r.map((x) => (x.id === id ? { ...x, [field]: val } : x)));
  const removeRoster = (id) => setRoster((r) => r.filter((x) => x.id !== id));
  const addTimelineRow = () => {
    if (!T.presets.length) return;
    setTimeline((tl) => [...tl, { id: nextId(), presetId: T.presets[0].id, triggerMin: 1, fired: false }]);
  };
  const updateTimeline = (id, field, val) => setTimeline((tl) => tl.map((x) => (x.id === id ? { ...x, [field]: val } : x)));
  const removeTimelineRow = (id) => setTimeline((tl) => tl.filter((x) => x.id !== id));

  const setObjectiveChoice = (val) => {
    setObjective(val);
    if (val !== "Custom" && DEFAULT_METRICS_BY_OBJECTIVE[val] && metrics.length === 0) {
      setMetrics(DEFAULT_METRICS_BY_OBJECTIVE[val].map((m) => ({ id: nextId(), ...m })));
    }
  };

  useEffect(() => {
    if (mode !== "exercise" || exerciseStatus !== "running") return;
    const t = setInterval(() => {
      const due = timeline.filter((item) => !item.fired && clockRef.current >= item.triggerMin * 60);
      if (due.length === 0) return;
      due.forEach((item) => {
        const preset = T.presets.find((p) => p.id === item.presetId);
        if (preset) {
          saveCheckpoint(`before scripted inject: ${preset.label}`);
          addLog(`SCRIPTED INJECT — controller's pre-planned "${preset.label}" fired at T+${fmtClock(item.triggerMin * 60)}.`, "controller");
          triggerFailure(preset);
        }
      });
      setTimeline((tl) => tl.map((it) => (due.find((d) => d.id === it.id) ? { ...it, fired: true } : it)));
    }, 1000);
    return () => clearInterval(t);
  }, [mode, exerciseStatus, timeline, T]);

  const commitSeverity = (val) => {
    setSeverity(val);
    if (buildable && T.nodes.length) {
      resetScenario(val, mode, `Severity set to ${val}/10 — baseline capacity and failure intensity recalculated.`);
    }
  };

  const rootStyle = (
    <style>{`
      .eoc-root {
        --bg: #f8fafc; --panel: #ffffff; --panel-2: #f1f5f9; --line: #e2e8f0; --line-soft: #f1f5f9;
        --text: #0f172a; --text-dim: #475569; --text-dimmer: #94a3b8;
        --good: #16a34a; --good-bg: #ecfdf5; --warn: #d97706; --warn-bg: #fffbeb;
        --crit: #dc2626; --crit-bg: #fef2f2; --live: #dc2626; --exercise: #2563eb; --conflict: #b45309;
        font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh;
      }
      .eoc-root * { box-sizing: border-box; }
      .mono { font-family: 'JetBrains Mono', 'SF Mono', monospace; }

      .eoc-topbar { display: flex; flex-direction: column; gap: 10px; padding: 12px 24px; border-bottom: 1px solid var(--line); background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
      .topbar-top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
      .eoc-brand { display: flex; align-items: center; gap: 10px; }
      .eoc-brand-mark { width: 32px; height: 32px; border: 1.5px solid #bfdbfe; border-radius: 8px; background: #eff6ff; display: flex; align-items: center; justify-content: center; position: relative; }
      .eoc-brand-mark::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--good); }
      .eoc-brand-text { font-weight: 800; font-size: 15px; letter-spacing: -0.01em; color: var(--text); }
      .eoc-brand-sub { font-size: 10.5px; font-weight: 600; color: var(--text-dim); letter-spacing: 0.05em; text-transform: uppercase; margin-top: 1px; }

      .topbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .cluster-toggle { display: flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--panel-2); padding: 2px; }
      .seg-btn { padding: 6px 11px; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; background: transparent; border: none; border-radius: 6px; color: var(--text-dim); cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 6px; }
      .seg-btn.active { background: #ffffff; color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      .seg-btn .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
      .mode-btn.active.exercise { background: var(--exercise); color: #fff; }
      .mode-btn.active.live { background: var(--live); color: #fff; }
      .seg-btn:not(.active):hover { color: var(--text); }
      .mode-toggle { display: flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--panel-2); padding: 2px; }

      .plan-toggle-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: #ffffff; color: var(--text-dim); font-size: 11px; font-weight: 700; cursor: pointer; }
      .plan-toggle-btn:hover { color: var(--text); background: var(--panel-2); }
      .plan-toggle-btn.active { color: var(--exercise); border-color: #bfdbfe; background: #eff6ff; }

      .topbar-bottom { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
      .severity-block { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 260px; }
      .severity-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
      .severity-slider { flex: 1; accent-color: var(--exercise); cursor: pointer; }
      .severity-value { font-size: 13px; font-weight: 800; min-width: 44px; text-align: right; }
      .severity-band { font-size: 10px; color: var(--text-dimmer); white-space: nowrap; }
      .specific-select { background: #ffffff; border: 1px solid var(--line); color: var(--text); font-size: 11.5px; font-weight: 600; padding: 6px 10px; border-radius: 7px; min-width: 240px; cursor: pointer; }

      .mode-banner { text-align: center; padding: 7px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .mode-banner.exercise { background: #eff6ff; color: #1e40af; border-bottom: 1px solid #bfdbfe; }
      .mode-banner.live { background: #fef2f2; color: #b91c1c; border-bottom: 1px solid #fecaca; animation: livepulse 2.2s ease-in-out infinite; }
      @keyframes livepulse { 0%, 100% { background: #fef2f2; } 50% { background: #fee2e2; } }

      .fallback-banner { display: flex; align-items: center; gap: 8px; background: #f0fdf4; border-bottom: 1px solid #bbf7d0; color: #166534; padding: 8px 24px; font-size: 11.5px; font-weight: 600; }

      .eoc-layout { display: grid; grid-template-columns: 310px 1fr 310px; gap: 1px; background: var(--line); min-height: calc(100vh - 120px); }
      .eoc-panel { background: #ffffff; padding: 16px; overflow-y: auto; }
      .panel-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }

      /* Tab Switcher in Left Column */
      .tab-switcher { display: flex; background: var(--panel-2); border-radius: 8px; padding: 3px; margin-bottom: 14px; border: 1px solid var(--line); }
      .tab-btn { flex: 1; padding: 6px 8px; font-size: 11px; font-weight: 700; background: transparent; border: none; border-radius: 6px; color: var(--text-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s ease; }
      .tab-btn.active { background: #ffffff; color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
      .badge-count { font-size: 9.5px; padding: 1px 6px; border-radius: 10px; background: var(--crit); color: #ffffff; font-weight: 800; }

      .preset-btn { width: 100%; text-align: left; background: #ffffff; border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; margin-bottom: 8px; color: var(--text); cursor: pointer; transition: all 0.15s ease; font-size: 12px; font-weight: 600; display: flex; align-items: flex-start; gap: 8px; }
      .preset-btn:hover:not(:disabled) { border-color: #93c5fd; background: #f8fafc; }
      .preset-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .preset-btn.is-active { border-color: var(--crit); background: var(--crit-bg); }
      .preset-note { font-size: 10px; color: var(--text-dim); font-weight: 400; margin-top: 2px; }
      .active-tag { font-size: 9px; color: var(--crit); font-weight: 800; letter-spacing: 0.05em; margin-top: 3px; }

      .reset-btn { width: 100%; margin-top: 4px; background: transparent; border: 1px dashed var(--line); border-radius: 7px; padding: 7px; color: var(--text-dim); font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
      .reset-btn:hover:not(:disabled) { color: var(--text); border-color: var(--text-dim); background: var(--panel-2); }
      .reset-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      /* Escalation Cards */
      .escalation-card { background: #ffffff; border: 1px solid var(--line); border-radius: 9px; padding: 12px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
      .escalation-card.pending { border-left: 4px solid var(--warn); background: #fffdfa; }
      .escalation-card.approved { border-left: 4px solid var(--good); background: #fafdfb; }
      .escalation-card.rejected { border-left: 4px solid var(--text-dimmer); background: #f8fafc; opacity: 0.75; }
      .esc-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px; }
      .esc-title { font-size: 12px; font-weight: 700; color: var(--text); line-height: 1.3; }
      .esc-tag { font-size: 9.5px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.03em; white-space: nowrap; }
      .esc-tag.pending { background: var(--warn-bg); color: var(--warn); border: 1px solid #fde68a; }
      .esc-tag.approved { background: var(--good-bg); color: var(--good); border: 1px solid #bbf7d0; }
      .esc-tag.rejected { background: #e2e8f0; color: var(--text-dim); }
      .esc-desc { font-size: 11px; color: var(--text-dim); margin-bottom: 8px; line-height: 1.4; }
      .esc-meta { font-size: 9.5px; color: var(--text-dimmer); margin-bottom: 10px; }
      .esc-actions { display: flex; gap: 6px; }
      .esc-btn { flex: 1; padding: 6px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; border: none; }
      .esc-btn.approve { background: var(--good); color: #ffffff; }
      .esc-btn.approve:hover { filter: brightness(1.08); }
      .esc-btn.reject { background: #f1f5f9; color: var(--text-dim); border: 1px solid var(--line); }
      .esc-btn.reject:hover { background: #e2e8f0; }

      .overall-card { background: #ffffff; border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
      .overall-score { font-size: 34px; font-weight: 800; line-height: 1; }
      .overall-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 6px; font-weight: 700; }
      .confidence-tag { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 5px; }
      .confidence-tag.High { background: var(--good-bg); color: var(--good); border: 1px solid #bbf7d0; }
      .confidence-tag.Medium { background: var(--warn-bg); color: var(--warn); border: 1px solid #fde68a; }
      .confidence-tag.Low { background: var(--crit-bg); color: var(--crit); border: 1px solid #fecaca; }

      .leverage-note { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #854d0e; background: #fefce8; border: 1px solid #fef08a; border-radius: 7px; padding: 8px 10px; margin-top: 10px; }
      .geometry-note { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--text-dim); margin-top: 8px; }
      .geometry-note .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--exercise); flex-shrink: 0; }

      .containment-card { background: #ffffff; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
      .containment-head { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--good); margin-bottom: 8px; }
      .containment-bar { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
      .containment-fill { height: 100%; background: linear-gradient(90deg, var(--crit), var(--warn), var(--good)); transition: width 0.5s ease; }
      .containment-caption { font-size: 10px; color: var(--text-dim); margin-top: 6px; }

      .graph-wrap { display: flex; align-items: center; justify-content: center; padding: 8px; background: #f8fafc; border: 1px solid var(--line); border-radius: 10px; position: relative; }
      .graph-context { flex: 1; min-height: 180px; margin-top: 12px; padding: 14px; background: #ffffff; border: 1px solid var(--line); border-radius: 10px; }
      .graph-context-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
      .graph-context-title { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--text-dim); }
      .graph-context-geometry { font-size: 10px; color: var(--exercise); text-align: right; }
      .graph-context-copy { font-size: 12px; color: var(--text); line-height: 1.5; margin-bottom: 10px; }
      .graph-paths { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
      .graph-path { padding: 7px 9px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; font-size: 10.5px; color: var(--text-dim); line-height: 1.4; }
      .graph-path strong { color: var(--text); }

      .graph-legend { position: absolute; top: 8px; left: 8px; z-index: 5; background: rgba(255,255,255,0.98); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; max-width: 240px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
      .graph-legend-close { position: absolute; top: 6px; right: 6px; background: none; border: none; color: var(--text-dimmer); cursor: pointer; padding: 2px; display: flex; }
      .graph-legend-close:hover { color: var(--text); }
      .graph-legend-title { font-size: 10px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text); margin-bottom: 8px; padding-right: 14px; }
      .graph-legend-row { display: flex; align-items: center; gap: 7px; font-size: 10.5px; color: var(--text-dim); margin-top: 5px; line-height: 1.3; }
      .legend-node-sample { width: 12px; height: 12px; border-radius: 50%; border: 2px solid; flex-shrink: 0; background: #ffffff; }
      .legend-line-sample { width: 16px; height: 0; border-top: 1.5px solid var(--line); flex-shrink: 0; }
      .legend-pulse-sample { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--crit); flex-shrink: 0; opacity: 0.7; }
      .graph-legend-reopen { position: absolute; top: 8px; left: 8px; z-index: 5; display: flex; align-items: center; gap: 5px; background: #ffffff; border: 1px solid var(--line); border-radius: 6px; padding: 5px 9px; color: var(--text-dim); font-size: 10.5px; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }

      .cascade-toast { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; align-items: center; gap: 7px; background: #ffffff; border: 1px solid var(--line); border-radius: 20px; padding: 7px 16px; font-size: 11px; font-weight: 700; white-space: nowrap; box-shadow: 0 4px 16px rgba(0,0,0,0.08); animation: toast-in 0.25s ease; }
      .cascade-toast.crit { color: var(--crit); border-color: #fca5a5; background: #fff5f5; }
      .cascade-toast.good { color: var(--good); border-color: #86efac; background: #f0fdf4; }
      @keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(-6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

      .node-tooltip { background: #ffffff; border: 1px solid var(--line); border-radius: 8px; padding: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.1); }
      .node-tooltip-title { font-size: 11.5px; font-weight: 800; color: var(--text); margin-bottom: 3px; }
      .node-tooltip-desc { font-size: 10.5px; color: var(--text-dim); line-height: 1.4; }
      .node-tooltip-loc { font-size: 9.5px; color: var(--text-dimmer); font-style: italic; margin-top: 4px; }

      .node-card { background: #ffffff; border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; margin-bottom: 7px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
      .node-row { display: flex; align-items: center; justify-content: space-between; }
      .node-name { font-size: 11.5px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
      .node-score { font-size: 13px; font-weight: 800; }
      .node-bar { height: 4px; background: var(--line); border-radius: 2px; margin-top: 6px; overflow: hidden; }
      .node-bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
      .node-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
      .node-source { font-size: 9.5px; color: var(--text-dimmer); }
      .node-source.fresh { color: var(--text-dim); }
      .dispatch-btn { background: #ffffff; border: 1px solid #86efac; border-radius: 5px; padding: 3px 8px; color: var(--good); cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 700; }
      .dispatch-btn:hover { background: var(--good-bg); border-color: var(--good); }

      .log-entry { padding: 7px 0; border-bottom: 1px solid var(--line-soft); font-size: 11px; line-height: 1.4; }
      .log-entry:first-child { padding-top: 0; }
      .log-time { color: var(--text-dimmer); margin-right: 6px; }
      .log-entry.trigger { color: var(--crit); }
      .log-entry.cascade { color: #b45309; }
      .log-entry.cascade2 { color: #92400e; padding-left: 8px; opacity: 0.9; }
      .log-entry.dispatch { color: var(--good); }
      .log-entry.conflict { color: var(--conflict); font-weight: 700; }
      .log-entry.info { color: var(--text-dim); }
      .log-entry.controller { color: #1e40af; font-weight: 600; }

      .alert-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 5px; margin-right: 6px; margin-top: 6px; }
      .alert-chip.crit { background: var(--crit-bg); color: var(--crit); border: 1px solid #fecaca; }
      .alert-chip.warn { background: var(--warn-bg); color: var(--warn); border: 1px solid #fde68a; }

      .plan-standalone { max-width: 760px; margin: 24px auto; padding: 22px 26px; }
      .plan-card { background: #ffffff; border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; margin: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
      .plan-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
      .cluster-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; }
      .buildable-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; padding: 4px 9px; border-radius: 6px; }
      .buildable-tag.yes { background: var(--good-bg); color: var(--good); border: 1px solid #bbf7d0; }
      .buildable-tag.no { background: var(--warn-bg); color: var(--warn); border: 1px solid #fde68a; }
      .plan-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); font-size: 12.5px; }
      .plan-row-block { padding: 10px 0; border-bottom: 1px solid var(--line-soft); font-size: 12.5px; }
      .plan-row-block.plan-demo { border-bottom: none; }
      .plan-label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); }
      .plan-text { color: var(--text); line-height: 1.5; }
      .plan-list { margin: 8px 0 0; padding-left: 18px; }
      .plan-list li { margin-bottom: 6px; line-height: 1.5; color: var(--text); font-size: 12px; }
      .plan-empty-banner { display: flex; align-items: center; gap: 8px; background: var(--warn-bg); border: 1px solid #fde68a; color: var(--warn); border-radius: 8px; padding: 10px 14px; margin: 12px 24px 0; font-size: 12px; font-weight: 600; }

      .resource-pool-card { background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
      .resource-pool-head { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 7px; }
      .resource-pool-bar { display: flex; gap: 3px; }
      .resource-pip { flex: 1; height: 7px; border-radius: 2px; background: var(--line); }
      .resource-pip.on { background: var(--good); }
      .resource-pool-caption { font-size: 9.5px; color: var(--text-dimmer); margin-top: 6px; line-height: 1.4; }

      .controller-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 24px; background: #f1f5f9; border-bottom: 1px solid var(--line); }
      .controller-tag { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #334155; }
      .isolated-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 5px; background: #e2e8f0; color: #475569; border: 1px solid #cbd5e1; }
      .ctrl-btn { display: flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--line); background: #ffffff; color: var(--text); font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.1s ease; }
      .ctrl-btn:hover:not(:disabled) { background: var(--panel-2); }
      .ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .ctrl-btn.primary { background: var(--exercise); color: #ffffff; border-color: var(--exercise); }
      .ctrl-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
      .ctrl-btn.danger { color: var(--crit); border-color: #fca5a5; }
      .ctrl-btn.danger:hover:not(:disabled) { background: var(--crit-bg); }
      .ctrl-spacer { flex: 1; }
      .observer-toggle { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; color: var(--text-dim); cursor: pointer; user-select: none; }
      .observer-toggle input { accent-color: var(--exercise); }
      .status-pill { font-size: 9.5px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; padding: 2px 8px; border-radius: 12px; }
      .status-pill.idle { background: #e2e8f0; color: var(--text-dim); }
      .status-pill.running { background: var(--good-bg); color: var(--good); border: 1px solid #bbf7d0; }
      .status-pill.paused { background: var(--warn-bg); color: var(--warn); border: 1px solid #fde68a; }
      .status-pill.stopped { background: var(--crit-bg); color: var(--crit); border: 1px solid #fecaca; }

      .gap-note-row { display: flex; gap: 6px; padding: 8px 24px; background: #f8fafc; border-bottom: 1px solid var(--line); align-items: center; }
      .gap-note-row select { background: #ffffff; border: 1px solid var(--line); color: var(--text); font-size: 11px; font-weight: 700; padding: 6px 8px; border-radius: 6px; }
      .gap-note-row input { flex: 1; background: #ffffff; border: 1px solid var(--line); color: var(--text); font-size: 11.5px; padding: 6px 10px; border-radius: 6px; }
      .gap-note-row button { background: var(--exercise); border: none; color: #ffffff; padding: 6px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; }

      .setup-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 50; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 40px 20px; }
      .setup-panel { background: #ffffff; border: 1px solid var(--line); border-radius: 12px; width: 100%; max-width: 680px; padding: 22px 26px 26px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
      .setup-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
      .setup-title { font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
      .setup-close { background: transparent; border: none; color: var(--text-dim); cursor: pointer; padding: 4px; }
      .setup-sub { font-size: 11.5px; color: var(--text-dim); margin-bottom: 16px; line-height: 1.5; }
      .setup-section { margin-bottom: 18px; }
      .setup-section-title { font-size: 10.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
      .setup-field-row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
      .setup-select, .setup-input, .setup-textarea { background: var(--panel-2); border: 1px solid var(--line); color: var(--text); font-size: 12px; padding: 8px 10px; border-radius: 7px; width: 100%; }
      .setup-textarea { min-height: 60px; resize: vertical; font-family: inherit; }
      .type-options { display: flex; gap: 8px; }
      .type-card { flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 10px; cursor: pointer; background: var(--panel-2); }
      .type-card.active { border-color: var(--exercise); background: #eff6ff; }
      .type-card-label { font-size: 12px; font-weight: 700; margin-bottom: 3px; }
      .type-card-note { font-size: 9.5px; color: var(--text-dim); line-height: 1.4; }
      .table-row-2 { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 7px; align-items: center; }
      .table-row-3 { display: grid; grid-template-columns: 1fr 90px auto; gap: 8px; margin-bottom: 7px; align-items: center; }
      .row-x-btn { background: transparent; border: 1px solid var(--line); color: var(--text-dimmer); border-radius: 6px; padding: 6px; cursor: pointer; display: flex; }
      .row-x-btn:hover { color: var(--crit); border-color: var(--crit); }
      .add-row-btn { display: flex; align-items: center; gap: 5px; background: transparent; border: 1px dashed var(--line); color: var(--text-dim); font-size: 11px; font-weight: 600; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
      .add-row-btn:hover { color: var(--text); border-color: var(--text-dim); }
      .setup-notional-note { display: flex; gap: 8px; align-items: flex-start; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; font-size: 11px; line-height: 1.5; padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; }
      .setup-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }

      .aar-view { max-width: 820px; margin: 24px auto; padding: 0 24px 40px; }
      .aar-header { text-align: center; margin-bottom: 20px; }
      .aar-header h1 { font-size: 22px; margin: 0 0 4px; }
      .aar-header .sub { font-size: 11.5px; color: var(--text-dim); }
      .aar-section { background: #ffffff; border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
      .aar-section-title { font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
      .aar-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .aar-stat { background: var(--panel-2); border-radius: 8px; padding: 10px 12px; }
      .aar-stat .num { font-size: 20px; font-weight: 800; }
      .aar-stat .lbl { font-size: 9.5px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 3px; }
      .aar-metric-row { display: grid; grid-template-columns: 1fr 140px 140px; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); font-size: 12px; }
      .aar-metric-row:last-child { border-bottom: none; }
      .aar-metric-target { color: var(--text-dim); }
      .aar-metric-actual { color: var(--good); font-weight: 600; }
      .aar-eval-entry { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--line-soft); font-size: 12px; align-items: flex-start; }
      .aar-eval-tag { font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 5px; text-transform: uppercase; flex-shrink: 0; margin-top: 1px; }
      .aar-eval-tag.gap { background: var(--crit-bg); color: var(--crit); }
      .aar-eval-tag.strength { background: var(--good-bg); color: var(--good); }
      .aar-eval-tag.note { background: #e2e8f0; color: var(--text-dim); }
      .aar-empty { font-size: 11.5px; color: var(--text-dimmer); font-style: italic; }
      .aar-actions { display: flex; justify-content: center; gap: 10px; margin-top: 6px; }

      @media (max-width: 960px) { .eoc-layout { grid-template-columns: 1fr; } .graph-paths { grid-template-columns: 1fr; } }
    `}</style>
  );

  const topbar = (
    <div className="eoc-topbar">
      <div className="topbar-top">
        <div className="eoc-brand">
          <div className="eoc-brand-mark">
            <ShieldCheck size={18} color="var(--exercise)" />
          </div>
          <div>
            <div className="eoc-brand-text">UNITY EOC</div>
            <div className="eoc-brand-sub">Dependency &amp; Escalation Command Platform</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="cluster-toggle">
            {Object.entries(CLUSTERS).map(([id, c]) => (
              <button key={id} className={`seg-btn ${clusterId === Number(id) ? "active" : ""}`} onClick={() => setClusterId(Number(id))}>
                <span className="dot" style={{ background: c.color }} />
                {c.short}
                {!c.buildable && <Lock size={10} />}
              </button>
            ))}
          </div>
          <button className={`plan-toggle-btn ${showPlan ? "active" : ""}`} onClick={() => setShowPlan((s) => !s)}>
            <ClipboardList size={13} /> Management Plan
          </button>
          {buildable && (
            <div className="mode-toggle">
              <button className={`seg-btn mode-btn exercise ${mode === "exercise" ? "active exercise" : ""}`} onClick={() => switchMode("exercise")}>EXERCISE</button>
              <button className={`seg-btn mode-btn live ${mode === "live" ? "active live" : ""}`} onClick={() => switchMode("live")}>LIVE</button>
            </div>
          )}
        </div>
      </div>
      <div className="topbar-bottom">
        <div className="severity-block">
          <span className="severity-label"><Gauge size={12} /> Severity</span>
          <input
            type="range" min={1} max={10} step={1} value={severity}
            className="severity-slider"
            onChange={(e) => commitSeverity(Number(e.target.value))}
          />
          <span className="severity-value mono" style={{ color: severity >= 7 ? "var(--crit)" : severity >= 4 ? "var(--warn)" : "var(--good)" }}>{severity}/10</span>
          <span className="severity-band">{severity <= 5 ? "generic template recommended" : "select specific crisis if available"}</span>
        </div>
        <select className="specific-select" value={specificId || ""} onChange={(e) => setSpecificId(e.target.value || null)}>
          <option value="">Generic Cluster Template {severity <= 5 ? "(recommended)" : ""}</option>
          {Object.entries(cluster.specific).map(([id, s]) => (
            <option key={id} value={id}>{s.label} {s.full ? "— full build" : "— coming soon"}</option>
          ))}
        </select>
      </div>
    </div>
  );

  if (!buildable) {
    return (
      <div className="eoc-root">
        {rootStyle}
        {topbar}
        <div className="plan-empty-banner">
          <Lock size={14} /> Cluster {clusterId} — {cluster.title} isn't buildable on the current engine yet. Showing the management plan.
        </div>
        <ManagementPlan clusterId={clusterId} cluster={cluster} standalone />
      </div>
    );
  }

  if (!scores[T.nodes[0]?.id]) return <div className="eoc-root">{rootStyle}{topbar}</div>;

  const overall = Math.round(T.nodes.reduce((sum, n) => sum + (scores[n.id]?.value || 0), 0) / T.nodes.length);
  const avgAge = T.nodes.reduce((sum, n) => sum + (clockRef.current - (scores[n.id]?.updatedAt || 0)), 0) / T.nodes.length;
  const confidence = avgAge < 20 ? "High" : avgAge < 50 ? "Medium" : "Low";
  const critNodes = T.nodes.filter((n) => (scores[n.id]?.value || 0) < 4);
  const warnNodes = T.nodes.filter((n) => (scores[n.id]?.value || 0) >= 4 && (scores[n.id]?.value || 0) < 7);

  const leverage = {};
  T.nodes.forEach((n) => { leverage[n.id] = 0; });
  T.edges.forEach((e) => { leverage[e.from] += e.w; });
  let topLeverageId = T.nodes[0].id;
  let topLeverageScore = -1;
  T.nodes.forEach((n) => {
    const degradation = (10 - (scores[n.id]?.value || 0)) / 10;
    const score = leverage[n.id] * (0.4 + degradation);
    if (score > topLeverageScore) { topLeverageScore = score; topLeverageId = n.id; }
  });

  const focusPaths = T.edges.reduce((paths, edge) => {
    if (!paths.some((path) => path.from === edge.from)) paths.push(edge);
    return paths;
  }, []).slice(0, 6);

  if (showAAR) {
    return (
      <div className="eoc-root">
        {rootStyle}
        {topbar}
        <AARView
          objective={objective} customObjective={customObjective} exerciseType={exerciseType}
          roster={roster} metrics={metrics} evalLog={evalLog} debrief={debrief} onDebriefChange={setDebrief}
          duration={clockRef.current - exerciseStartClock} log={log}
          onBack={() => setShowAAR(false)}
          onReset={() => { setShowAAR(false); reset(); }}
        />
      </div>
    );
  }

  return (
    <div className="eoc-root">
      {rootStyle}
      {topbar}

      {mode === "exercise" && (
        <ControllerBar
          exerciseStatus={exerciseStatus} objective={objective} customObjective={customObjective}
          exerciseType={exerciseType} onOpenSetup={() => setSetupOpen(true)}
          onStart={startExercise} onPause={pauseExercise} onResume={resumeExercise} onStop={stopExercise}
          checkpointsCount={checkpoints.length} onRewind={rewind}
          observerMode={observerMode} onToggleObserver={() => setObserverMode((o) => !o)}
          timelineCount={timeline.length}
        />
      )}

      {mode === "exercise" && observerMode && (
        <div className="gap-note-row">
          <select value={gapTag} onChange={(e) => setGapTag(e.target.value)}>
            <option value="gap">Gap</option>
            <option value="strength">Strength</option>
            <option value="note">Note</option>
          </select>
          <input placeholder="Log an observer note (feeds After-Action Review)…" value={gapNote} onChange={(e) => setGapNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addEvalNote(); }} />
          <button onClick={addEvalNote}><Send size={13} /></button>
        </div>
      )}

      {setupOpen && (
        <SetupPanel
          onClose={() => setSetupOpen(false)}
          objective={objective} customObjective={customObjective}
          onObjectiveChange={setObjectiveChoice} onCustomObjectiveChange={setCustomObjective}
          exerciseType={exerciseType} onTypeChange={setExerciseType}
          metrics={metrics} onAddMetric={addMetric} onUpdateMetric={updateMetric} onRemoveMetric={removeMetric}
          roster={roster} onAddRoster={addRosterRow} onUpdateRoster={updateRoster} onRemoveRoster={removeRoster}
          briefing={briefing} onBriefingChange={setBriefing}
          timeline={timeline} onAddTimeline={addTimelineRow} onUpdateTimeline={updateTimeline} onRemoveTimeline={removeTimelineRow}
          presetOptions={T.presets} onStart={startExercise} exerciseStatus={exerciseStatus}
        />
      )}

      <div className={`mode-banner ${mode}`}>
        {mode === "exercise"
          ? "Exercise mode — synthetic data, simulated operational feedback"
          : "Live mode — continuous telemetry feed. Real-time monitoring."}
      </div>

      {usingFallback && (
        <div className="fallback-banner">
          <AlertTriangle size={13} /> "{specificEntry.label}" running Cluster {clusterId}'s generic baseline.
        </div>
      )}

      {showPlan && <ManagementPlan clusterId={clusterId} cluster={cluster} />}

      <div className="eoc-layout">
        {/* Left Column: Tabbed Injects & Escalations */}
        <div className="eoc-panel">
          <div className="tab-switcher">
            <button className={`tab-btn ${leftTab === "injects" ? "active" : ""}`} onClick={() => setLeftTab("injects")}>
              <ShieldAlert size={12} /> Injects ({T.presets.length})
            </button>
            <button className={`tab-btn ${leftTab === "escalations" ? "active" : ""}`} onClick={() => setLeftTab("escalations")}>
              <ArrowUpRight size={12} /> Escalations
              {pendingEscalationsCount > 0 && <span className="badge-count">{pendingEscalationsCount}</span>}
            </button>
          </div>

          {leftTab === "injects" ? (
            <div>
              <div className="panel-title">Inject Failure</div>
              {T.presets.map((p) => {
                const active = activePresets.includes(p.id);
                return (
                  <button key={p.id} className={`preset-btn ${active ? "is-active" : ""}`} disabled={mode !== "exercise" || active || isPaused} onClick={() => { saveCheckpoint(`before inject: ${p.label}`); triggerFailure(p); }}>
                    <ShieldAlert size={14} style={{ flexShrink: 0, color: active ? "var(--crit)" : "var(--text-dim)", marginTop: 1 }} />
                    <div>
                      <div>{p.label}</div>
                      <div className="preset-note">{p.note}</div>
                      {active && <div className="active-tag">ACTIVE</div>}
                    </div>
                  </button>
                );
              })}
              <button className="reset-btn" onClick={reset} disabled={mode !== "exercise" || isPaused}>
                <RotateCcw size={12} /> Reset to baseline
              </button>

              {mode === "exercise" && (
                <div className="resource-pool-card">
                  <div className="resource-pool-head">
                    <span>Notional Response Units</span>
                    <span className="mono">{resourcePool.available}/{resourcePool.total}</span>
                  </div>
                  <div className="resource-pool-bar">
                    {Array.from({ length: resourcePool.total }).map((_, i) => (
                      <span key={i} className={`resource-pip ${i < resourcePool.available ? "on" : "off"}`} />
                    ))}
                  </div>
                  <div className="resource-pool-caption">Simulated capacity — replenishes when higher-tier escalations are approved.</div>
                </div>
              )}

              <div className="panel-title" style={{ marginTop: 22 }}>Leverage</div>
              <div className="leverage-note">
                <Star size={13} style={{ flexShrink: 0 }} />
                Protecting <strong style={{ margin: "0 3px" }}>{T.nodes.find((n) => n.id === topLeverageId)?.label}</strong> prevents downstream propagation.
              </div>
              {T.geometry && <div className="geometry-note"><span className="dot" /> {T.geometry}</div>}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim)" }}>
                  Escalation Requests ({escalations.length})
                </span>
                <button
                  onClick={handleRequestNewEscalation}
                  style={{ fontSize: 10.5, fontWeight: 700, color: "var(--exercise)", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                >
                  <Plus size={12} /> Request
                </button>
              </div>

              {escalations.map((esc) => (
                <div key={esc.id} className={`escalation-card ${esc.status}`}>
                  <div className="esc-header">
                    <span className="esc-title">{esc.title}</span>
                    <span className={`esc-tag ${esc.status}`}>{esc.status}</span>
                  </div>
                  <div className="esc-desc">{esc.description}</div>
                  <div className="esc-meta">
                    <strong>{esc.agency}</strong> · {esc.tier} · Req: <span className="mono">{esc.requestedAt}</span>
                  </div>
                  {esc.status === "pending" ? (
                    <div className="esc-actions">
                      <button className="esc-btn approve" onClick={() => handleApproveEscalation(esc)}>
                        <CheckCircle2 size={12} /> Approve (+{esc.grantUnits} Units)
                      </button>
                      <button className="esc-btn reject" onClick={() => handleRejectEscalation(esc)}>
                        <XCircle size={12} /> Decline
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, fontWeight: 700, color: esc.status === "approved" ? "var(--good)" : "var(--text-dimmer)" }}>
                      {esc.status === "approved" ? `Authorized at ${esc.approvedAt} (+${esc.grantUnits} Units Granted)` : "Declined by Incident Command"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Center Column: Graph Canvas */}
        <div className="eoc-panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="overall-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span className="overall-score mono" style={{ color: statusColor(overall) }}>{overall}</span>
                <span style={{ fontSize: 15, color: "var(--text-dim)" }}>/10</span>
              </div>
              <span className={`confidence-tag ${confidence}`}>Confidence: {confidence}</span>
            </div>
            <div className="overall-label">{templateLabel} — {statusLabel(overall)} · severity {severity}/10</div>
            <div style={{ marginTop: 8 }}>
              {critNodes.map((n) => (<span key={n.id} className="alert-chip crit"><AlertTriangle size={11} /> {n.label}</span>))}
              {warnNodes.map((n) => (<span key={n.id} className="alert-chip warn"><Activity size={11} /> {n.label}</span>))}
              {critNodes.length === 0 && warnNodes.length === 0 && (<span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>All capabilities nominal.</span>)}
            </div>
          </div>

          {T.containment && (
            <div className="containment-card">
              <div className="containment-head">
                <span><Target size={12} style={{ verticalAlign: -2, marginRight: 5 }} />Containment Radius</span>
                <span className="mono">{containmentRadius}%</span>
              </div>
              <div className="containment-bar"><div className="containment-fill" style={{ width: `${containmentRadius}%` }} /></div>
              <div className="containment-caption">
                {containmentRadius === 0 ? "Origin contained. Downstream nodes recovering." : "Dispatch specialist teams to shrink containment radius."}
              </div>
            </div>
          )}

          <div className="graph-wrap">
            {showLegend && (
              <div className="graph-legend">
                <button className="graph-legend-close" onClick={() => setShowLegend(false)} title="Hide legend"><X size={11} /></button>
                <div className="graph-legend-title">How to read this</div>
                <div className="graph-legend-row"><span className="legend-node-sample" style={{ borderColor: "var(--good)" }} /> Circle = capability, color = health</div>
                <div className="graph-legend-row"><span className="legend-line-sample" /> Line = depends on. Arrow = cause → effect</div>
                <div className="graph-legend-row"><span className="legend-pulse-sample" /> Pulse = failure or relief cascade</div>
                <div className="graph-legend-row" style={{ opacity: 0.75 }}>Hover or click circle to inspect</div>
              </div>
            )}
            {!showLegend && (
              <button className="graph-legend-reopen" onClick={() => setShowLegend(true)} title="Show legend"><Eye size={11} /> Legend</button>
            )}
            {cascadeToast && (
              <div className={`cascade-toast ${cascadeToast.kind}`}>
                {cascadeToast.kind === "good" ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
                {cascadeToast.text}
              </div>
            )}
            <svg viewBox="0 0 800 470" width="100%" style={{ maxWidth: 700 }}>
              <defs>
                <marker id="arrow-line" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#cbd5e1" />
                </marker>
                <marker id="arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--crit)" />
                </marker>
                <marker id="arrow-good" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--good)" />
                </marker>
              </defs>
              {T.edges.map((e) => {
                const a = T.nodes.find((n) => n.id === e.from);
                const b = T.nodes.find((n) => n.id === e.to);
                if (!a || !b) return null;
                const key = `${e.from}-${e.to}`;
                const active = pulsingEdges.includes(key);
                const stroke = active ? (pulseKind === "good" ? "var(--good)" : "var(--crit)") : "#cbd5e1";
                const marker = active ? (pulseKind === "good" ? "url(#arrow-good)" : "url(#arrow-crit)") : "url(#arrow-line)";
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const ex = b.x - (dx / dist) * 40;
                const ey = b.y - (dy / dist) * 40;
                return <line key={key} x1={a.x} y1={a.y} x2={ex} y2={ey} stroke={stroke} strokeWidth={active ? 2.5 : 1.5} markerEnd={marker} style={{ transition: "stroke 0.3s ease, stroke-width 0.3s ease" }} />;
              })}
              {T.nodes.map((n) => {
                const s = scores[n.id] || { value: 7, updatedAt: 0, source: "baseline" };
                const color = statusColor(s.value);
                const Icon = n.icon;
                const age = clockRef.current - s.updatedAt;
                const fr = freshness(age);
                const isTop = n.id === topLeverageId;
                const isOrigin = T.containment && n.id === "origin";
                const isHovered = hoveredNode === n.id;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    opacity={fr.opacity}
                    style={{ transition: "opacity 0.6s ease", cursor: "pointer" }}
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode((cur) => (cur === n.id ? null : cur))}
                    onClick={() => dispatch(n.id)}
                  >
                    {isTop && <circle r={46} fill="none" stroke="#d97706" strokeWidth={1.2} strokeDasharray="3 4" opacity={0.7} />}
                    {isOrigin && containmentRadius > 0 && <circle r={52} fill="none" stroke="var(--crit)" strokeWidth={1} strokeDasharray="2 5" opacity={0.5} />}
                    <circle r={38} fill="#ffffff" stroke={color} strokeWidth={isHovered ? 3.5 : 2.5} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.06))", transition: "stroke 0.4s ease, stroke-width 0.2s ease" }} />
                    {s.value < 4 && (
                      <circle r={38} fill="none" stroke={color} strokeWidth={2.5} opacity={0.4}>
                        <animate attributeName="r" values="38;50;38" dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <foreignObject x={-14} y={-30} width={28} height={28}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                        <Icon size={16} color={color} />
                      </div>
                    </foreignObject>
                    <text textAnchor="middle" y={6} fontSize="15" fontWeight="800" fill={color} fontFamily="JetBrains Mono, monospace">{s.value}</text>
                    <text textAnchor="middle" y={58} fontSize="10.5" fontWeight="700" fill="var(--text)" letterSpacing="0.02em">{n.label}</text>
                    <text textAnchor="middle" y={71} fontSize="8.5" fill="var(--text-dimmer)" letterSpacing="0.03em">{fr.label} · {s.source}</text>
                    {isHovered && (
                      <foreignObject x={-100} y={-135} width={200} height={100} style={{ overflow: "visible" }}>
                        <div className="node-tooltip">
                          <div className="node-tooltip-title">{n.label} — {statusLabel(s.value)}</div>
                          {n.desc && <div className="node-tooltip-desc">{n.desc}</div>}
                          {n.locationNote && <div className="node-tooltip-loc">{n.locationNote}</div>}
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="graph-context">
            <div className="graph-context-head">
              <div className="graph-context-title"><GitMerge size={12} /> Cascade focus</div>
              {T.geometry && <div className="graph-context-geometry">{T.geometry}</div>}
            </div>
            <div className="graph-context-copy">
              Prioritize <strong>{T.nodes.find((n) => n.id === topLeverageId)?.label}</strong>: strongest downstream influence.
            </div>
            <div className="graph-paths">
              {focusPaths.map((edge) => {
                const from = T.nodes.find((n) => n.id === edge.from);
                const to = T.nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                return <div key={`${edge.from}-${edge.to}`} className="graph-path"><strong>{from.label}</strong> <span style={{ color: "var(--text-dimmer)" }}>→</span> {to.label}</div>;
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Capabilities & Event Log */}
        <div className="eoc-panel">
          <div className="panel-title">Capabilities ({T.nodes.length})</div>
          {T.nodes.map((n) => {
            const s = scores[n.id] || { value: 7, source: "baseline" };
            const color = statusColor(s.value);
            const age = clockRef.current - (s.updatedAt || 0);
            const fr = freshness(age);
            const isOrigin = T.containment && n.id === "origin";
            return (
              <div key={n.id} className="node-card" style={{ opacity: fr.opacity }}>
                <div className="node-row">
                  <span className="node-name">{n.label}</span>
                  <span className="node-score mono" style={{ color }}>{s.value}</span>
                </div>
                <div className="node-bar"><div className="node-bar-fill" style={{ width: `${s.value * 10}%`, background: color }} /></div>
                <div className="node-meta">
                  <span className={`node-source ${fr.tier === "fresh" ? "fresh" : ""}`}>{s.source} · {fr.label}</span>
                  <button
                    className="dispatch-btn"
                    disabled={isPaused || (mode === "exercise" && resourcePool.available <= 0)}
                    onClick={() => { saveCheckpoint(`before dispatch: ${n.label}`); dispatch(n.id); }}
                    title={isOrigin ? "Dispatch specialist team to origin" : "Dispatch response unit to reinforce"}
                  >
                    <ShieldPlus size={11} /> {isOrigin ? "Contain" : "Dispatch"}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="panel-title" style={{ marginTop: 20 }}>
            <span>Event Log</span>
            <GitMerge size={12} style={{ opacity: 0.5 }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {log.map((entry, i) => (
              <div key={i} className={`log-entry ${entry.kind}`}>
                <span className="log-time mono">{entry.t}</span>{entry.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
