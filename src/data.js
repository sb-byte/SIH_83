// =========================================================================
// UNITY EOC INDIA — COMPREHENSIVE PRODUCTION DATASETS (SIH 2026)
// =========================================================================

export const liveIncidentData = {
  name: "SEVERE CYCLONE DANA (BAY OF BENGAL)",
  code: "IND-CYC-2026-08A",
  severity: "CATEGORY 4 / EXTREME",
  landfallLocation: "Dhamra Port / Bhadrak Coast [20.79° N, 86.96° E]",
  landfallEst: "T-02:45:00",
  elapsedTime: "T+05:18:22",
  activationLevel: "NDMA LEVEL 1 - MAXIMUM NATIONAL ACTIVATION",
  windSpeed: 125, // km/h
  windGusts: 145, // km/h
  rainfall24h: 210, // mm
  stormSurge: 3.8, // meters
  evacTarget: 320000,
  evacCompleted: 276480, // 86.4%
  activePersonnel: 64,
  connectedAgencies: [
    "NDMA (National Disaster Management Authority)",
    "SDMA Odisha (OSDMA)",
    "SDMA West Bengal (WBDMA)",
    "NDRF 03 Bn (Mundali)",
    "NDRF 02 Bn (Haringhata)",
    "India Meteorological Department (IMD)",
    "Central Water Commission (CWC)",
    "Indian Coast Guard (ICG)",
    "Indian Air Force (IAF Liaison Desk)",
    "Aapda Mitra Community Volunteers"
  ]
};

export const citizenSosQueue = [
  // {
  //   id: "SOS-801",
  //   region: "Odisha",
  //   site: "Kendrapara / Rajnagar",
  //   time: "14:28 IST",
  //   name: "Subrata Jena (6 family members)",
  //   phone: "+91-98612-XXXXX",
  //   location: "Satbhaya Coastal Hamlet [20.612° N, 86.914° E]",
  //   lat: 20.612,
  //   lng: 86.914,
  //   urgency: "CRITICAL",
  //   msg: "Water level rose 1.5m in 20 mins. Trapped on rooftop with infant. Floodwater entering ground floor.",
  //   status: "DISPATCHED",
  //   assignedUnit: "NDRF IRB-101"
  // },
  {
    id: "SOS-802",
    region: "Odisha",
    site: "Kendrapara / Rajnagar",
    time: "14:21 IST",
    name: "Pravakar Mohapatra (Village Elder)",
    phone: "+91-94371-XXXXX",
    location: "Rajnagar Creek School [20.573° N, 86.852° E]",
    lat: 20.573,
    lng: 86.852,
    urgency: "HIGH",
    msg: "18 elderly citizens stranded without drinking water. Generator submerged.",
    status: "PENDING",
    assignedUnit: "UNASSIGNED"
  },
  // {
  //   id: "SOS-803",
  //   region: "Odisha",
  //   site: "Bhadrak / Dhamra",
  //   time: "14:09 IST",
  //   name: "Deepak Sahoo (Fisherman)",
  //   phone: "+91-97773-XXXXX",
  //   location: "Dhamra Jetty South Creek [20.781° N, 86.955° E]",
  //   lat: 20.781,
  //   lng: 86.955,
  //   urgency: "CRITICAL",
  //   msg: "Trawler anchor snapped. 3 crew adrift near sandbar in 90 km/h winds.",
  //   status: "IN PROGRESS",
  //   assignedUnit: "ICG Hovercraft 02"
  // },
  // {
  //   id: "SOS-804",
  //   region: "West Bengal",
  //   site: "Kolkata / Sunderbans",
  //   time: "13:58 IST",
  //   name: "Ashima Halder (4 family members)",
  //   phone: "+91-90513-XXXXX",
  //   location: "Gosaba Island Embankment Ward 4 [22.165° N, 88.802° E]",
  //   lat: 22.165,
  //   lng: 88.802,
  //   urgency: "HIGH",
  //   msg: "Earthen embankment leaking beside homestead. Family sheltering on school roof, need boat evacuation before high tide.",
  //   status: "PENDING",
  //   assignedUnit: "UNASSIGNED"
  // }
];

export const chronoIncidents = [
  // {
  //   id: "INC-1092",
  //   region: "Odisha",
  //   site: "Bhadrak / Dhamra",
  //   time: "14:24 IST",
  //   section: "OPS",
  //   severity: "CRITICAL",
  //   title: "Dhamra Port Seawall Overtopped",
  //   details: "Tidal surge of +3.2m breached secondary barrier at Dhamra port fishing jetty. NDRF 03 Bn Bravo Team en route with 6 Inflatable Rescue Boats (IRBs).",
  //   location: "Dhamra, Bhadrak [20.7937° N, 86.9634° E]",
  //   lat: 20.7937,
  //   lng: 86.9634,
  //   status: "RESPONSE DEPLOYED"
  // },
  // {
  //   id: "INC-1091",
  //   region: "Odisha",
  //   site: "Kendrapara / Rajnagar",
  //   time: "14:18 IST",
  //   section: "OPS",
  //   severity: "HIGH",
  //   title: "SDRF Water Rescue Mission - Kendrapara Lowlands",
  //   details: "14 villagers stranded on elevated rooftop near Rajnagar creek. High-water evacuation initiated using mechanized dinghies.",
  //   location: "Rajnagar, Kendrapara [20.5732° N, 86.8522° E]",
  //   lat: 20.5732,
  //   lng: 86.8522,
  //   status: "IN PROGRESS"
  // },
  {
    id: "INC-1090",
    region: "Odisha",
    site: "Bhadrak / Dhamra",
    time: "14:05 IST",
    section: "LOGISTICS",
    severity: "MEDIUM",
    title: "Relief Stockpile Staging - Bhadrak Airbase",
    details: "12,000 ready-to-eat meal packets, 25,000 halogen water purification tablets, and 4 mobile diesel generators delivered via IAF An-32.",
    location: "Bhadrak Transit Depot [21.0543° N, 86.5186° E]",
    lat: 21.0543,
    lng: 86.5186,
    status: "STAGED"
  },
  {
    id: "INC-1089",
    region: "Odisha",
    site: "Kendrapara / Rajnagar",
    time: "13:50 IST",
    section: "IMD",
    severity: "HIGH",
    title: "Doppler Radar Alert - Peak Wind Gusts Recorded",
    details: "Doppler Weather Radar Paradip recorded sustained core winds at 115 km/h with gusts exceeding 135 km/h moving North-Northwest.",
    location: "Paradip Coastline [20.2644° N, 86.6687° E]",
    lat: 20.2644,
    lng: 86.6687,
    status: "ACTIVE RADAR"
  },
  // {
  //   id: "INC-1088",
  //   region: "Odisha",
  //   site: "Bhadrak / Dhamra",
  //   time: "13:35 IST",
  //   section: "PLANNING",
  //   severity: "INFO",
  //   title: "Operational Period 2 IAP Signed",
  //   details: "Incident Action Plan for Operational Period 18:00–06:00 approved by State Incident Commander Shri R. Mohanty, IAS.",
  //   location: "State EOC Bhubaneswar [20.2961° N, 85.8245° E]",
  //   lat: 20.2961,
  //   lng: 85.8245,
  //   status: "APPROVED"
  // },
  // {
  //   id: "INC-1087",
  //   region: "Odisha",
  //   site: "Kendrapara / Rajnagar",
  //   time: "13:12 IST",
  //   section: "COMMS",
  //   severity: "CRITICAL",
  //   title: "CAP-SACHET Emergency Cell Broadcast Dispatched",
  //   details: "Cell broadcast siren alert & multi-lingual SMS sent to 1.8M subscribers across coastal sectors with instruction to seek shelter immediately.",
  //   location: "Coastal Telco Towers (Geo-targeted)",
  //   lat: 20.65,
  //   lng: 86.85,
  //   status: "BROADCAST COMPLETE"
  // },
  // {
  //   id: "INC-1086",
  //   region: "West Bengal",
  //   site: "Kolkata / Sunderbans",
  //   time: "12:58 IST",
  //   section: "OPS",
  //   severity: "HIGH",
  //   title: "Sunderbans Embankment Breach - Gosaba Block",
  //   details: "60m earthen embankment breached along the Bidya river at Gosaba. WBDMA Quick Response Team with NDRF 02 Bn deployed 4 country boats for ring-bund sandbagging.",
  //   location: "Gosaba, South 24 Parganas [22.1653° N, 88.8021° E]",
  //   lat: 22.1653,
  //   lng: 88.8021,
  //   status: "RESPONSE DEPLOYED"
  // },
  // {
  //   id: "INC-1085",
  //   region: "West Bengal",
  //   site: "Kolkata / Sunderbans",
  //   time: "12:40 IST",
  //   section: "LOGISTICS",
  //   severity: "MEDIUM",
  //   title: "Kolkata Urban Waterlogging - Ballygunge Sector",
  //   details: "KMC deployed 18 portable pumps after 96mm rainfall in 3 hours. Two uprooted trees cleared from AJC Bose Road by the Disaster Management Group.",
  //   location: "Ballygunge, Kolkata [22.5226° N, 88.3639° E]",
  //   lat: 22.5226,
  //   lng: 88.3639,
  //   status: "IN PROGRESS"
  // }
];

export const fleetAssets = [
  { id: "NDRF-IRB-101", name: "Inflatable Rescue Boat 01", type: "Water Rescue", unit: "NDRF 03 Bn", status: "DEPLOYED", loc: "Dhamra Port Jetty", crew: 6, battery: "94%", lat: 20.78, lng: 86.94, region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "NDRF-IRB-102", name: "Inflatable Rescue Boat 02", type: "Water Rescue", unit: "NDRF 03 Bn", status: "DEPLOYED", loc: "Kendrapara Creek", crew: 6, battery: "88%", lat: 20.58, lng: 86.83, region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "NDRF-HWV-04", name: "High-Water Rescue Truck", type: "Heavy Vehicle", unit: "SDRF Odisha", status: "DEPLOYED", loc: "Bhadrak Route 16", crew: 4, fuel: "78%", lat: 21.06, lng: 86.50, region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "DRONE-RECON-ALPHA", name: "Surveillance Hexacopter Alpha", type: "UAV Drone", unit: "Coast Guard Air Recon", status: "AIRBORNE", loc: "Paradip Outer Anchorage", crew: 2, battery: "82%", lat: 20.27, lng: 86.70, region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "ICG-ALH-08", name: "Advanced Light Helicopter MK-III", type: "Aviation", unit: "Indian Coast Guard", status: "AVAILABLE", loc: "Bhubaneswar Airfield", crew: 4, fuel: "95%", lat: 20.24, lng: 85.81, region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "NDRF-BOAT-09", name: "Deep Water Dinghy 09", type: "Water Rescue", unit: "NDRF 02 Bn", status: "OUT_OF_SERVICE", loc: "Cuttack Maintenance Bay", crew: 0, reason: "Propeller fouled with debris", lat: 20.46, lng: 85.88, region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "DEOC-GEN-02", name: "50kVA Mobile Generator Unit", type: "Heavy Vehicle", unit: "State Disaster Logistics", status: "AVAILABLE", loc: "Balasore Collectorate", crew: 2, fuel: "100%", lat: 21.49, lng: 86.92, region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "WB-IRB-21", name: "Inflatable Rescue Boat 21", type: "Water Rescue", unit: "NDRF 02 Bn", status: "DEPLOYED", loc: "Sagar Island Ferry Ghat", crew: 6, battery: "91%", lat: 21.65, lng: 88.05, region: "West Bengal", site: "Kolkata / Sunderbans" },
  // { id: "WB-HWV-07", name: "High-Water Rescue Truck 07", type: "Heavy Vehicle", unit: "SDRF West Bengal", status: "AVAILABLE", loc: "Namkhana Block HQ", crew: 4, fuel: "86%", lat: 21.76, lng: 88.23, region: "West Bengal", site: "Kolkata / Sunderbans" }
];

export const shelters = [
  { id: "MCS-01", name: "MCS Balasore Central High School", capacity: 500, occupied: 460, status: "NEAR FULL", lat: 21.4934, lng: 86.9135, medical: "Doctor On-Duty", foodRations: "48h Stored", region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "MCS-02", name: "MCS Kendrapara Cyclone Shelter", capacity: 300, occupied: 285, status: "CRITICAL", lat: 20.5028, lng: 86.4227, medical: "Nurse Station Active", foodRations: "72h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "MCS-03", name: "MCS Puri Seafront Multi-Purpose Shelter", capacity: 200, occupied: 184, status: "NEAR FULL", lat: 19.8135, lng: 85.8312, medical: "Paramedic Unit", foodRations: "36h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-04", name: "MCS Bhadrak Government College", capacity: 400, occupied: 120, status: "AVAILABLE", lat: 21.0543, lng: 86.5186, medical: "Doctor On-Duty", foodRations: "96h Stored", region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "MCS-05", name: "MCS Paradip Port Community Center", capacity: 350, occupied: 340, status: "CRITICAL", lat: 20.2644, lng: 86.6687, medical: "SDRF Medical Team", foodRations: "24h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-06", name: "MCS Gosaba Sunderbans Cyclone Shelter", capacity: 450, occupied: 412, status: "NEAR FULL", lat: 22.1653, lng: 88.8021, medical: "Nurse Station Active", foodRations: "60h Stored", region: "West Bengal", site: "Kolkata / Sunderbans" },
  // { id: "MCS-07", name: "MCS Namkhana Coastal Flood Shelter", capacity: 300, occupied: 96, status: "AVAILABLE", lat: 21.7597, lng: 88.2296, medical: "Paramedic Unit", foodRations: "72h Stored", region: "West Bengal", site: "Kolkata / Sunderbans" },
  // { id: "MCS-08", name: "MCS Dhamra Port Evacuation Complex", capacity: 600, occupied: 540, status: "NEAR FULL", lat: 20.7885, lng: 86.9580, medical: "Doctor & Emergency O2", foodRations: "96h Stored", region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "MCS-09", name: "MCS Rajnagar Multipurpose Cyclone Shelter", capacity: 350, occupied: 290, status: "NEAR FULL", lat: 20.5732, lng: 86.8522, medical: "Medical Camp Active", foodRations: "48h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-10", name: "MCS Chandbali Riverine Flood Shelter", capacity: 250, occupied: 90, status: "AVAILABLE", lat: 20.7761, lng: 86.7420, medical: "Nurse On-Duty", foodRations: "72h Stored", region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "MCS-11", name: "MCS Basudevpur Block Cyclone Center", capacity: 300, occupied: 110, status: "AVAILABLE", lat: 21.1410, lng: 86.7520, medical: "First Aid Station", foodRations: "48h Stored", region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "MCS-12", name: "MCS Aul Flood Safe Staging Camp", capacity: 400, occupied: 380, status: "CRITICAL", lat: 20.6680, lng: 86.6430, medical: "Doctor On-Duty", foodRations: "36h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-13", name: "MCS Sagar Island South Embankment Center", capacity: 500, occupied: 310, status: "AVAILABLE", lat: 21.6420, lng: 88.0850, medical: "SDRF Paramedic", foodRations: "60h Stored", region: "West Bengal", site: "Kolkata / Sunderbans" },
  // { id: "MCS-14", name: "MCS Kakdwip Marine Flood Shelter", capacity: 350, occupied: 145, status: "AVAILABLE", lat: 21.8750, lng: 88.1880, medical: "Doctor & Pharmacy", foodRations: "84h Stored", region: "West Bengal", site: "Kolkata / Sunderbans" },
  // { id: "MCS-15", name: "MCS Digha Coastal Multi-Purpose Shelter", capacity: 450, occupied: 410, status: "NEAR FULL", lat: 21.6260, lng: 87.5070, medical: "Medical Station", foodRations: "72h Stored", region: "West Bengal", site: "Kolkata / Sunderbans" },
  // { id: "MCS-16", name: "MCS Guwahati Central Flood Relief Shelter", capacity: 600, occupied: 220, status: "AVAILABLE", lat: 26.1850, lng: 91.7480, medical: "Full Medical Bay", foodRations: "120h Stored", region: "Assam", site: "Guwahati / Brahmaputra" },
  // { id: "MCS-17", name: "MCS Kaziranga High-Ground Evac Camp", capacity: 300, occupied: 275, status: "NEAR FULL", lat: 26.5780, lng: 93.1710, medical: "Doctor & Vet Unit", foodRations: "48h Stored", region: "Assam", site: "Kaziranga / Golaghat" },
  // { id: "MCS-18", name: "MCS Joshimath GLOF Safe Staging Base", capacity: 250, occupied: 80, status: "AVAILABLE", lat: 30.5560, lng: 79.5670, medical: "High-Altitude Trauma Kit", foodRations: "96h Stored", region: "Uttarakhand", site: "Chamoli / Joshimath" },
  // { id: "MCS-19", name: "MCS Chooralmala Landslide Relief Center", capacity: 350, occupied: 310, status: "CRITICAL", lat: 11.5280, lng: 76.1380, medical: "Disaster Medical Team", foodRations: "48h Stored", region: "Kerala", site: "Wayanad / Meppadi" },
  // { id: "MCS-20", name: "MCS Jagatsinghpur Coastal Relief Hub", capacity: 450, occupied: 260, status: "AVAILABLE", lat: 20.2550, lng: 86.1710, medical: "Doctor On-Duty", foodRations: "72h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-21", name: "MCS Erasama Flood Refuge Center", capacity: 550, occupied: 495, status: "NEAR FULL", lat: 20.1100, lng: 86.3350, medical: "SDRF Medical Team", foodRations: "48h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "MCS-22", name: "MCS Jajpur Road Community Shelter", capacity: 300, occupied: 145, status: "AVAILABLE", lat: 20.8650, lng: 86.3310, medical: "Nurse Station Active", foodRations: "96h Stored", region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "MCS-23", name: "MCS Cuttack Municipal Cyclone Complex", capacity: 700, occupied: 420, status: "AVAILABLE", lat: 20.4625, lng: 85.8828, medical: "Full Medical Bay", foodRations: "120h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-24", name: "MCS Bhubaneswar SOC Evacuation Hub", capacity: 500, occupied: 350, status: "AVAILABLE", lat: 20.2961, lng: 85.8245, medical: "Doctor & Emergency O2", foodRations: "84h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-25", name: "MCS Marshaghai Block Cyclone Shelter", capacity: 350, occupied: 95, status: "AVAILABLE", lat: 20.4520, lng: 86.7230, medical: "First Aid Station", foodRations: "48h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-26", name: "MCS Pattamundai Riverbank Refuge", capacity: 400, occupied: 375, status: "NEAR FULL", lat: 20.5810, lng: 86.5740, medical: "Paramedic Unit", foodRations: "36h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-27", name: "MCS Tirtol Coastal Community Center", capacity: 350, occupied: 120, status: "AVAILABLE", lat: 20.1950, lng: 86.5430, medical: "Doctor On-Duty", foodRations: "72h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-28", name: "MCS Mahakalapada Mangrove High Shelter", capacity: 450, occupied: 410, status: "NEAR FULL", lat: 20.4210, lng: 86.6850, medical: "SDRF Paramedic Bay", foodRations: "60h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" },
  // { id: "MCS-29", name: "MCS Chandipur Beach Defense Shelter", capacity: 300, occupied: 110, status: "AVAILABLE", lat: 21.4670, lng: 87.0140, medical: "Military Paramedics", foodRations: "96h Stored", region: "Odisha", site: "Bhadrak / Dhamra" },
  // { id: "MCS-30", name: "MCS Konark Marine Drive Evac Center", capacity: 400, occupied: 230, status: "AVAILABLE", lat: 19.8870, lng: 86.0940, medical: "Doctor & Pharmacy", foodRations: "72h Stored", region: "Odisha", site: "Kendrapara / Rajnagar" }
];

export const radioChannels = [
  { id: "CH-01", name: "Command Net (National / State)", freq: "155.475 MHz", users: 28, signal: "99%", activeSpeaker: "State IC Mohanty (OSDMA)", status: "SECURE ENCRYPTED" },
  { id: "CH-02", name: "NDRF Tactical Ops Net", freq: "154.280 MHz", users: 64, signal: "94%", activeSpeaker: "03 Bn Bravo Lead (Dhamra)", status: "HIGH TRAFFIC" },
  { id: "CH-03", name: "Logistics & Relief Net", freq: "153.860 MHz", users: 22, signal: "98%", activeSpeaker: "Bhadrak Transit Depot", status: "STANDBY" },
  { id: "CH-04", name: "Coast Guard Maritime Net", freq: "156.800 MHz", users: 16, signal: "100%", activeSpeaker: "ICG Hovercraft 02", status: "ACTIVE SAR" },
  { id: "CH-05", name: "Aapda Mitra Volunteer Net", freq: "148.550 MHz", users: 112, signal: "92%", activeSpeaker: "Kendrapara Block Lead", status: "CIVIL CHANNEL" }
];

export const volunteerSquads = [
  { id: "VOL-SQ-01", name: "Dhamra Coastal Aapda Mitra Squad", members: 45, skills: "Water Rescue & First Aid", deployedAt: "Dhamra Cyclone Shelter", lead: "Ramesh Jena", region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "VOL-SQ-02", name: "Bhadrak Relief Distribution Squad", members: 60, skills: "Food Staging & Ham Radio", deployedAt: "Bhadrak Transit Depot", lead: "Priyanka Das", region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "VOL-SQ-03", name: "Kendrapara Creek Recon Squad", members: 30, skills: "Boat Handling & Tree Clearing", deployedAt: "Rajnagar High School", lead: "Manas Barik", region: "Odisha", site: "Kendrapara / Rajnagar" }
];

export const rumorDebunking = [
  {
    id: "RUMOR-01",
    region: "Odisha",
    site: "Bhadrak / Dhamra",
    claim: "Dhamra drinking water treatment plant contaminated by sea water backflow.",
    status: "DEBUNKED",
    clarification: "Public Health Engineering Dept confirms water treatment plant is operating safely on backup power. Reverse osmosis filtration fully active.",
    verifiedBy: "State PIO & Health Dept",
    timestamp: "14:10 IST"
  },
  {
    id: "RUMOR-02",
    region: "Odisha",
    site: "Kendrapara / Rajnagar",
    claim: "Shelter Kendrapara is turning away incoming evacuees.",
    status: "MONITORING",
    clarification: "Shelter is at 95% capacity. State Transport buses are routing overflow families to Bhadrak College MCS (30% occupied).",
    verifiedBy: "District Collector Office",
    timestamp: "13:55 IST"
  },
  {
    id: "RUMOR-03",
    region: "Odisha",
    site: "Bhadrak / Dhamra",
    claim: "National Highway 16 completely closed due to culvert collapse at Soro.",
    status: "FALSE / CLARIFIED",
    clarification: "NH-16 is open for emergency vehicles. Tree-clearing SDRF squads cleared fallen banyan tree on left lane at 13:40 IST.",
    verifiedBy: "NHAI & Coastal Police",
    timestamp: "13:45 IST"
  }
];

export const mutualAidRequests = [
  { id: "MA-01", agency: "Kendrapara District EOC", resource: "High-Water Rescue Trucks", qty: 3, priority: "CRITICAL", status: "APPROVED", requestedAt: "12:40 IST", approvedBy: "State EOC Duty Officer", region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "MA-02", agency: "OSDMA Bhadrak Cell", resource: "Mobile 50kVA Diesel Generators", qty: 4, priority: "HIGH", status: "PENDING", requestedAt: "13:05 IST", approvedBy: null, region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "MA-03", agency: "Indian Coast Guard Zone (East)", resource: "ALH Helicopters", qty: 1, priority: "HIGH", status: "PENDING", requestedAt: "13:20 IST", approvedBy: null, region: "West Bengal", site: "Kolkata / Sunderbans" },
  { id: "MA-04", agency: "Cuttack Fire & Emergency Services", resource: "Deep Water Dinghies", qty: 2, priority: "MODERATE", status: "DENIED", requestedAt: "11:55 IST", approvedBy: "State EOC Duty Officer", region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "MA-05", agency: "IAF Bhubaneswar Station", resource: "Mutual Aid Helicopter Fleet", qty: 2, priority: "CRITICAL", status: "SCHEDULED", requestedAt: "10:30 IST", approvedBy: "NDMA Liaison", region: "Odisha", site: "Bhadrak / Dhamra" }
];

export const volunteerPool = [
  { id: "AM-VOL-101", name: "Suresh Nayak", skill: "Water Rescue & First Aid", location: "Dhamra", status: "ASSIGNED", squad: "Dhamra Coastal Aapda Mitra Squad", region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "AM-VOL-102", name: "Lalita Patra", skill: "Ham Radio Operator", location: "Bhadrak", status: "ASSIGNED", squad: "Bhadrak Relief Distribution Squad", region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "AM-VOL-103", name: "Ajay Mallick", skill: "Boat Handling", location: "Kendrapara", status: "ASSIGNED", squad: "Kendrapara Creek Recon Squad", region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "AM-VOL-104", name: "Snehalata Swain", skill: "Field Nursing", location: "Balasore", status: "AWAITING_ASSIGNMENT", squad: null, region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "AM-VOL-105", name: "Biswajit Rout", skill: "Chainsaw / Tree Clearing", location: "Soro", status: "AWAITING_ASSIGNMENT", squad: null, region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "AM-VOL-106", name: "Debasmita Sahoo", skill: "Shelter Management", location: "Puri", status: "REGISTERED", squad: null, region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "AM-VOL-107", name: "Manoj Behera", skill: "Logistics & Ham Radio", location: "Paradip", status: "REGISTERED", squad: null, region: "Odisha", site: "Kendrapara / Rajnagar" }
];

export const damageAssessments = [
  {
    id: "DA-101",
    region: "Odisha",
    site: "Bhadrak / Dhamra",
    sector: "Dhamra Fishing Harbor",
    type: "Structural / Coastal",
    severity: "SEVERE",
    damage: "300m secondary jetty seawall displaced. 4 fishing trawlers damaged. No casualties.",
    reportedBy: "NDRF Drone Recon Alpha",
    time: "14:15 IST",
    lat: 20.79,
    lng: 86.96
  },
  {
    id: "DA-102",
    region: "Odisha",
    site: "Bhadrak / Dhamra",
    sector: "Bhadrak Rural Sub-division",
    type: "Power Infrastructure",
    severity: "CRITICAL",
    damage: "132kV Substation yard inundated with 1.2m water. Sector 7 feeder tripped. 34,200 connections offline.",
    reportedBy: "OPTCL Grid Telemetry",
    time: "13:45 IST",
    lat: 21.05,
    lng: 86.52
  },
  {
    id: "DA-103",
    region: "Odisha",
    site: "Kendrapara / Rajnagar",
    sector: "Rajnagar Creek Basin",
    type: "Inundation / Agricultural",
    severity: "MODERATE",
    damage: "Saline water ingress across 450 hectares of paddy lowlands. Embankment sandbagging ongoing.",
    reportedBy: "Aapda Mitra Team 04",
    time: "13:20 IST",
    lat: 20.57,
    lng: 86.85
  }
];

export const icsCommandTree = {
  incidentCommander: { name: "Shri R. Mohanty, IAS", role: "State Incident Commander", agency: "SDMA Odisha / MHA", phone: "+91-94370-11223", assigned: true },
  safetyOfficer: { name: "Dr. K. S. Nayak", role: "Safety Officer", agency: "Fire & Health Services", phone: "+91-98610-44556", assigned: true },
  pio: { name: "Smt. Ananya Sen", role: "Public Information Officer (PIO)", agency: "Dept of I&PR", phone: "+91-94380-77889", assigned: true },
  liaisonOfficer: { name: "Col. V. Raghavan", role: "Liaison Officer", agency: "Armed Forces / Coast Guard", phone: "+91-97770-99001", assigned: true },
  sections: [
    {
      id: "sec-ops",
      name: "Operations Section",
      chief: "DIG NDRF S. K. Verma",
      agency: "NDRF HQ",
      tasksCount: 24,
      tasksCompleted: 19,
      branches: [
        { id: "b-sar", name: "Search & Rescue Branch", lead: "Commandant 03 Bn", assigned: true },
        { id: "b-evac", name: "Evacuation Branch", lead: "SP Coastal Police", assigned: true },
        { id: "b-air", name: "Air Operations Branch", lead: "[VACANT] UNASSIGNED", assigned: false }
      ]
    },
    {
      id: "sec-plan",
      name: "Planning Section",
      chief: "Dr. P. C. Dash",
      agency: "OSDMA",
      tasksCount: 12,
      tasksCompleted: 11,
      branches: [
        { id: "b-sit", name: "Situation Unit", lead: "IMD Lead Meteorologist", assigned: true },
        { id: "b-gis", name: "GIS Spatial Unit", lead: "ISRO Bhuvan Team", assigned: true },
        { id: "b-demob", name: "Demobilization Unit", lead: "Admin Lead", assigned: true }
      ]
    },
    {
      id: "sec-log",
      name: "Logistics Section",
      chief: "Shri Alok Mishra",
      agency: "Food & Civil Supplies",
      tasksCount: 18,
      tasksCompleted: 12,
      branches: [
        { id: "b-supply", name: "Supply & Rations", lead: "Civil Supplies Officer", assigned: true },
        { id: "b-transport", name: "Transport Fleet", lead: "State Transport Lead", assigned: true },
        { id: "b-staging", name: "Staging Area Balasore", lead: "[VACANT] UNASSIGNED", assigned: false }
      ]
    },
    {
      id: "sec-fin",
      name: "Finance & Admin",
      chief: "Smt. M. Tripathy",
      agency: "Finance Dept (SDRF)",
      tasksCount: 8,
      tasksCompleted: 6,
      branches: [
        { id: "b-procure", name: "Emergency Procurement", lead: "Treasury Lead", assigned: true },
        { id: "b-claims", name: "Relief Compensation", lead: "Revenue Officer", assigned: true }
      ]
    }
  ]
};

export const icsTasksList = [
  { id: "TSK-01", section: "Operations", task: "Evacuate 14 stranded families from Satbhaya rooftop", assignee: "NDRF 03 Bn Team Bravo", due: "15:00 IST", completed: true, region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "TSK-02", section: "Operations", task: "Stage 6 high-water rescue trucks on NH-16 Soro junction", assignee: "SDRF Route 16 Lead", due: "15:30 IST", completed: true, region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "TSK-03", section: "Operations", task: "Complete aerial FLIR survey of Dhamra port breach", assignee: "Coast Guard Drone Alpha", due: "16:00 IST", completed: false, region: "Odisha", site: "Bhadrak / Dhamra" },
  { id: "TSK-04", section: "Logistics", task: "Dispatch 4 mobile 50kVA diesel generators to District Hospital", assignee: "State Fleet Logistics", due: "15:15 IST", completed: true, region: "West Bengal", site: "Kolkata / Sunderbans" },
  { id: "TSK-05", section: "Logistics", task: "Transfer 5,000 food packets to Kendrapara MCS from Bhadrak depot", assignee: "Civil Supplies Transport", due: "16:30 IST", completed: false, region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "TSK-06", section: "Planning", task: "Generate flood inundation forecast polygon for high-tide peak (20:00 IST)", assignee: "ISRO Bhuvan Spatial Team", due: "16:00 IST", completed: true, region: "Odisha", site: "Kendrapara / Rajnagar" },
  { id: "TSK-07", section: "Finance", task: "Release emergency SDRF tranche ₹5 Crore for fuel & provisions", assignee: "SDRF Treasury Officer", due: "17:00 IST", completed: true, region: "Odisha", site: "Bhadrak / Dhamra" }
];

export const exerciseScenario = {
  name: "EXERCISE OPERATION SAGAR SURAKSHA 2026",
  type: "SUPER CYCLONE & RIVERINE INUNDATION DRILL",
  location: "Odisha & West Bengal Coastal Belt",
  simSpeed: 1,
  currentTimeSec: 6320,
  totalTimeSec: 21600,
  injects: [
    { timeOffset: 0, timeCode: "H+00:00", title: "Cyclone Enters Coastal Waters", status: "EXECUTED", target: "All Sections", mechanism: "IMD Bulletin #01", executed: true },
    { timeOffset: 1800, timeCode: "H+00:30", title: "Baitarani River Siphon Gate Failure", status: "EXECUTED", target: "Operations", mechanism: "District Collector Phone Call", executed: true },
    { timeOffset: 4500, timeCode: "H+01:15", title: "Power Substation 132kV Flooded (Bhadrak)", status: "EXECUTED", target: "Logistics", mechanism: "State Grid Telemetry", executed: true },
    { timeOffset: 6300, timeCode: "H+01:45", title: "Hospital Oxygen Generator Failure", status: "JUST FIRED", target: "Planning & Logistics", mechanism: "Simulated SOS Siren", executed: true },
    { timeOffset: 9000, timeCode: "H+02:30", title: "National Highway 16 Inundated near Soro", status: "UPCOMING", target: "Operations", mechanism: "Drone Recon Video", executed: false },
    { timeOffset: 11700, timeCode: "H+03:15", title: "Secondary Chemical Fuel Leak Reported near Paradip", status: "UPCOMING", target: "Command / Safety", mechanism: "Coast Guard Advisory", executed: false },
    { timeOffset: 14400, timeCode: "H+04:00", title: "Mutual Aid IAF Helicopter Fleet Arrives", status: "SCHEDULED", target: "Logistics", mechanism: "Air Traffic Radio", executed: false }
  ],
  traineeMatrix: [
    { name: "Trainee DM A. Roy", role: "Incident Commander", score: "94%", tasks: "28/30", cert: "ICS-400 Certified", status: "EXCELLENT" },
    { name: "Trainee SP V. Sharma", role: "Ops Section Chief", score: "88%", tasks: "22/25", cert: "ICS-300 Certified", status: "GOOD" },
    { name: "Trainee Logistics Officer N. Patra", role: "Logistics Chief", score: "74%", tasks: "14/19", cert: "ICS-200 Active", status: "NEEDS REVIEW" },
    { name: "Trainee PIO K. Bannerjee", role: "Public Info Officer", score: "92%", tasks: "12/13", cert: "CAP-SACHET Certified", status: "EXCELLENT" }
  ]
};

// =========================================================================
// TACTICAL GIS GEOJSON DISASTER RISK & FLOOD INUNDATION DATASETS
// =========================================================================

export const cycloneDanaInundationGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "SURGE-Z1",
        name: "Extreme Storm Surge (+3.5m Inundation)",
        severity: "EXTREME",
        depth: "3.5m - 4.2m",
        color: "#DC2626",
        fillColor: "#DC2626",
        fillOpacity: 0.38,
        description: "Direct coastal breach zone across Dhamra Port, Satbhaya, and Rajnagar mangrove belt. Mandatory evacuation enforced."
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [86.88, 20.88],
            [87.05, 20.82],
            [87.02, 20.58],
            [86.92, 20.50],
            [86.80, 20.60],
            [86.88, 20.88]
          ]
        ]
      }
    },
    {
      type: "Feature",
      properties: {
        id: "SURGE-Z2",
        name: "High Riverine Flood Inundation (+2.0m)",
        severity: "HIGH",
        depth: "1.8m - 2.5m",
        color: "#EA580C",
        fillColor: "#EA580C",
        fillOpacity: 0.28,
        description: "Baitarani & Brahmani estuarine backflow zone. Low-lying agricultural paddies and rural hamlets inundated."
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [86.68, 21.02],
            [86.88, 20.88],
            [86.80, 20.60],
            [86.55, 20.58],
            [86.50, 20.80],
            [86.68, 21.02]
          ]
        ]
      }
    },
    {
      type: "Feature",
      properties: {
        id: "SURGE-Z3",
        name: "Moderate Tidal Swell Advisory (+1.0m)",
        severity: "MODERATE",
        depth: "0.8m - 1.2m",
        color: "#EAB308",
        fillColor: "#EAB308",
        fillOpacity: 0.18,
        description: "Coastal buffer zone prone to high spring-tide waterlogging and drainage impedance."
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [86.45, 21.18],
            [86.80, 21.10],
            [87.10, 20.75],
            [87.00, 20.40],
            [86.40, 20.42],
            [86.35, 20.85],
            [86.45, 21.18]
          ]
        ]
      }
    }
  ]
};

export const assamFloodsGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "ASSAM-Z1",
        name: "Brahmaputra Active Riverine Breach Zone",
        severity: "CRITICAL",
        depth: "2.8m Above Danger Mark",
        color: "#0284C7",
        fillColor: "#0284C7",
        fillOpacity: 0.35,
        description: "Submergence across Morigaon, Nagaon, and Kaziranga southern flood plains."
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [92.50, 26.35],
            [93.45, 26.65],
            [93.65, 26.50],
            [92.80, 26.15],
            [92.50, 26.35]
          ]
        ]
      }
    },
    {
      type: "Feature",
      properties: {
        id: "ASSAM-Z2",
        name: "Majuli Island Lowland Inundation Zone",
        severity: "HIGH",
        depth: "1.5m - 2.2m",
        color: "#06B6D4",
        fillColor: "#06B6D4",
        fillOpacity: 0.25,
        description: "Erosion hotspot and river island embankment breach sector."
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [94.00, 26.90],
            [94.35, 27.05],
            [94.40, 26.85],
            [94.05, 26.75],
            [94.00, 26.90]
          ]
        ]
      }
    }
  ]
};

export const chamoliGlofGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "GLOF-Z1",
        name: "Rishiganga - Dhauliganga Flash Surge Corridor",
        severity: "EXTREME",
        depth: "High Velocity Debris Wave",
        color: "#DC2626",
        fillColor: "#DC2626",
        fillOpacity: 0.40,
        description: "Glacial lake outburst flood torrent path downstream of Nanda Devi sanctuary."
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [79.50, 30.58],
            [79.62, 30.56],
            [79.72, 30.48],
            [79.65, 30.44],
            [79.52, 30.52],
            [79.50, 30.58]
          ]
        ]
      }
    }
  ]
};

export const wayanadLandslideGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "LANDSLIDE-Z1",
        name: "Chooralmala - Meppadi Debris Flow Runout Corridor",
        severity: "EXTREME",
        depth: "Slope Failure & Heavy Siltation",
        color: "#B91C1C",
        fillColor: "#B91C1C",
        fillOpacity: 0.42,
        description: "High hazard debris torrent chute across tea plantations and river bridge nexus."
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [76.10, 11.54],
            [76.16, 11.55],
            [76.18, 11.49],
            [76.12, 11.48],
            [76.10, 11.54]
          ]
        ]
      }
    }
  ]
};
