from typing import Optional
from ..models.user import User

def determine_target_tier(origin_role: str) -> str:
    """
    Structured 2-way escalation routing rule:
      T5 (Volunteer)           -> T3 (District Coordinator only)
      T4 (Frontline Strike)    -> T2 (State Strategist direct tactical line)
      T3 (Coordinator)         -> T2 (State Strategist)
      T2 (Strategist)          -> T1 (National Command Authority)
    """
    if origin_role == 'T5':
        return 'T3'
    elif origin_role == 'T4':
        return 'T2'
    elif origin_role == 'T3':
        return 'T2'
    elif origin_role == 'T2':
        return 'T1'
    return 'T1'
