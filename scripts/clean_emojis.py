import re

# Comprehensive emoji replacement dictionary (keeping ONLY India Flag 🇮🇳)
EMOJI_REPLACEMENTS = {
    "🏛️": "NDMA",
    "🛡️": "SEC",
    "🌊": "OD",
    "🌿": "WB",
    "⚓": "BHD",
    "🛶": "KND",
    "🚤": "NDRF",
    "🛟": "SAR",
    "🤝": "VOL",
    "🩹": "MED",
    "🙋": "[REG]",
    "🚨": "[ALERT]",
    "📡": "[COMMS]",
    "📊": "[METRICS]",
    "📋": "[LOG]",
    "📦": "[SUPPLIES]",
    "🎯": "[TARGET]",
    "🗺️": "[MAP]",
    "👤": "OFFICER",
    "⚡": "ACTIVE",
    "✔": "DONE",
    "◀": "<",
    "▶": ">",
    "🔴": "[CRITICAL]",
    "🟢": "[ONLINE]",
    "🟡": "[ELEVATED]",
    "🟠": "[WARNING]",
    "⚠️": "[WARNING]",
    "✅": "[VERIFIED]",
    "🔥": "[SURGE]",
    "🔊": "AUDIO ON",
    "🔇": "MUTED",
    "🚑": "[AMB]",
    "🚒": "[FIRE]",
    "🚁": "[HELI]",
    "🚢": "[BOAT]",
    "🏥": "[HOSP]",
    "⛺": "[SHELTER]",
    "🍞": "[FOOD]",
    "💧": "[WATER]",
    "📶": "[NET]",
    "🔍": "[SEARCH]",
    "⚙️": "[CONFIG]",
    "🛠️": "[TOOLS]",
    "⏱️": "[TIME]",
    "📈": "[TREND]",
    "🔒": "[SECURE]",
    "🔓": "[OPEN]",
    "🔑": "[KEY]",
    "📝": "[FORM]",
    "✉️": "[MSG]",
    "💬": "[CHAT]",
    "📞": "[CALL]",
    "📢": "[BROADCAST]",
    "🛑": "[STOP]",
    "⏳": "[PENDING]"
}

def clean_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    for emoji, repl in EMOJI_REPLACEMENTS.items():
        content = content.replace(emoji, repl)

    # General regex for any other emoji except 🇮🇳 (\U0001F1EE\U0001F1F3)
    def filter_emoji(match):
        ch = match.group(0)
        if ch == '🇮🇳':
            return ch
        # Common arrows or punctuation we want to keep
        if ch in ['•', '●', '—', '–', '→', '←', '↑', '↓', '★', '☆', '▶', '◀']:
            return ch
        return ''

    # Emoji regex pattern
    emoji_pattern = re.compile(
        r'[\U0001F300-\U0001F5FF\U0001F600-\U0001F64F\U0001F680-\U0001F6FF'
        r'\U0001F700-\U0001F77F\U0001F780-\U0001F7FF\U0001F800-\U0001F8FF'
        r'\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF'
        r'\U00002600-\U000026FF\U00002700-\U000027BF]'
    )
    
    content = emoji_pattern.sub(filter_emoji, content)

    if content != original:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Cleaned emojis in: {file_path}")
    else:
        print(f"No changes needed in: {file_path}")

target_files = [
    r"c:\Users\bindr\SIH_83\index.html",
    r"c:\Users\bindr\SIH_83\src\data.js",
    r"c:\Users\bindr\SIH_83\src\main.js",
    r"c:\Users\bindr\SIH_83\src\auth.js",
    r"c:\Users\bindr\SIH_83\backend\app\models\user.py",
    r"c:\Users\bindr\SIH_83\backend\app\seed\seed_data.py",
    r"c:\Users\bindr\SIH_83\server\src\db\roster.js",
    r"c:\Users\bindr\SIH_83\server\src\config\nav.js"
]

for tf in target_files:
    try:
        clean_file(tf)
    except Exception as e:
        print(f"Error cleaning {tf}: {e}")
