from typing import Dict, List, Any, Union

VIEWS = ['login', 'landing', 'command', 'ics', 'logistics', 'simulation', 'reports', 'field', 'escalation']

NAV: Dict[str, List[str]] = {
    'T1': ['landing', 'command', 'ics', 'logistics', 'simulation', 'reports', 'escalation'],
    'T2': ['landing', 'command', 'ics', 'logistics', 'simulation', 'reports', 'escalation'],
    'T3': ['landing', 'command', 'ics', 'logistics', 'simulation', 'reports', 'escalation'],
    'T4': ['landing', 'command', 'logistics', 'simulation', 'field', 'escalation'],
    'T5': ['landing'],
}

DEFAULT_VIEW: Dict[str, str] = {
    'T1': 'command',
    'T2': 'command',
    'T3': 'command',
    'T4': 'command',
    'T5': 'landing'
}

ACTIONS: Dict[str, Any] = {
    'transmit_sachet':    {'live': ['T1', 'T2'], 'exercise': ['T1', 'T2', 'T3', 'T4']},
    'preview_alert':      ['T1', 'T2', 'T3', 'T4'],
    'add_rumor':          ['T1', 'T2'],
    'sign_iap':           ['T1'],
    'issue_declaration':  ['T1'],
    'approve_funds':      ['T1'],
    'add_incident':       ['T1', 'T2', 'T3', 'T4'],
    'verify_incident':    ['T2'],
    'drop_pin':           ['T1', 'T2', 'T3'],
    'add_damage':         ['T1', 'T2', 'T3', 'T4'],
    'export_iap':         ['T1', 'T2', 'T3'],
    'add_asset':          ['T2'],
    'request_asset':      ['T3'],
    'declare_danger_zone':{'live': ['T1', 'T2'], 'exercise': ['T1', 'T2', 'T3']},
    'add_shelter':        ['T1', 'T2', 'T3'],
    'add_mutual_aid':     ['T2'],
    'assign_squad':       ['T2', 'T3'],
    'add_volunteer':      ['T2', 'T3'],
    'ptt_broadcast':      ['T1', 'T2', 'T3', 'T4', 'T5'],
    'approve_escalation': ['T1', 'T2'],
    'approve_mutual_aid': ['T1', 'T2'],
    'submit_escalation':  ['T2', 'T3', 'T4', 'T5'],
    'run_simulation':     ['T1', 'T2'],
    'manual_inject':      ['T1', 'T2'],
    'reset_baseline':     ['T1', 'T2'],
    'add_cap':            ['T1', 'T2'],
    'print_aar':          ['T1', 'T2', 'T3'],
    'view_audit':         ['T1', 'T2', 'T3', 'T4', 'T5'],
}

BUTTON_ACTION: Dict[str, str] = {
    'transmit-sachet-btn':    'transmit_sachet',
    'quick-alert-btn':        'transmit_sachet',
    'preview-alert-btn':      'preview_alert',
    'add-rumor-btn':          'add_rumor',
    'sign-iap-btn':           'sign_iap',
    'export-iap-btn':         'export_iap',
    'add-incident-btn':       'add_incident',
    'drop-pin-tool-btn':      'drop_pin',
    'add-damage-btn':         'add_damage',
    'add-asset-btn':          'add_asset',
    'request-asset-btn':      'request_asset',
    'add-shelter-btn':        'add_shelter',
    'add-mutual-aid-btn':     'add_mutual_aid',
    'add-volunteer-btn':      'add_volunteer',
    'ptt-broadcast-btn':      'ptt_broadcast',
    'fire-manual-inject-btn': 'manual_inject',
    'dep-reset-btn':          'reset_baseline',
    'sim-btn-play':           'run_simulation',
    'sim-btn-pause':          'run_simulation',
    'sim-btn-ff':             'run_simulation',
    'sim-btn-rewind':         'run_simulation',
    'add-cap-btn':            'add_cap',
    'print-aar-btn':          'print_aar',
}

CHANNELS: Dict[str, List[str]] = {
    'T1': ['CH-01', 'CH-02', 'CH-03', 'CH-04', 'CH-05'],
    'T2': ['CH-01', 'CH-02', 'CH-03', 'CH-04', 'CH-05'],
    'T3': ['CH-02', 'CH-03', 'CH-04'],
    'T4': ['CH-02', 'CH-04'],
    'T5': ['CH-05'],
}

def allowed_views(role: str) -> List[str]:
    return NAV.get(role, [])

def channels_for(role: str) -> List[str]:
    return CHANNELS.get(role, [])

def default_view_for(role: str) -> str:
    return DEFAULT_VIEW.get(role, 'landing')

def action_perms(role: str) -> Dict[str, Dict[str, bool]]:
    out = {}
    for name, rule in ACTIONS.items():
        if isinstance(rule, list):
            out[name] = {'live': role in rule, 'exercise': role in rule}
        else:
            out[name] = {'live': role in rule['live'], 'exercise': role in rule['exercise']}
    return out

def button_perms(role: str) -> Dict[str, Dict[str, bool]]:
    actions = action_perms(role)
    out = {}
    for btn_id, action in BUTTON_ACTION.items():
        out[btn_id] = actions.get(action, {'live': False, 'exercise': False})
    return out

def can_act(role: str, action: str, mode: str = 'LIVE') -> bool:
    cell = action_perms(role).get(action)
    if not cell:
        return False
    return cell['exercise'] if str(mode).upper() == 'EXERCISE' else cell['live']
