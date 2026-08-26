from typing import Dict, Any, List
from datetime import datetime

class SimulationEngine:
    def __init__(self):
        self.mode = "LIVE" # 'LIVE' | 'EXERCISE'
        self.severity = 5
        self.active_injects: List[Dict[str, Any]] = []

    def switch_mode(self, new_mode: str) -> str:
        self.mode = "EXERCISE" if new_mode.upper() == "EXERCISE" else "LIVE"
        return self.mode

    def set_severity(self, severity_level: int) -> int:
        self.severity = max(1, min(10, severity_level))
        return self.severity

    def trigger_inject(self, hazard_type: str, details: str, location: str) -> Dict[str, Any]:
        inject = {
            "id": f"INJ-{len(self.active_injects) + 1:03d}",
            "type": hazard_type,
            "details": details,
            "location": location,
            "timestamp": datetime.utcnow().isoformat(),
            "status": "ACTIVE_SYNTHETIC"
        }
        self.active_injects.append(inject)
        return inject

    def reset_baseline(self):
        self.active_injects = []
        self.severity = 5
        return True

sim_engine = SimulationEngine()
