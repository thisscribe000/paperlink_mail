import os
import json
import hashlib
import hmac
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BOT_SECRET = os.getenv('BOT_SECRET', '')

def get_main_menu():
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📤 Upload File", callback_data="upload")],
        [InlineKeyboardButton("📁 My Files", callback_data="myfiles")],
        [InlineKeyboardButton("📊 Storage", callback_data="storage")],
        [InlineKeyboardButton("⚙️ Settings", callback_data="settings")],
    ])

def get_file_actions(slug: str, filename: str):
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    app_url = os.getenv('APP_URL', 'https://paperlink.app')
    file_url = f"{app_url}/f/{slug}"
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔗 Copy Link", callback_data=f"copy_{slug}")],
        [InlineKeyboardButton("🗑️ Delete", callback_data=f"delete_{slug}")],
        [InlineKeyboardButton("🌐 Open", url=file_url)],
    ])

def format_file_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f}MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f}GB"

def format_timestamp(ts: int) -> str:
    from datetime import datetime
    dt = datetime.fromtimestamp(ts)
    now = datetime.now()
    diff = now - dt
    if diff.days > 30:
        return dt.strftime('%b %d, %Y')
    elif diff.days > 0:
        return f"{diff.days}d ago"
    elif diff.seconds > 3600:
        return f"{diff.seconds // 3600}h ago"
    elif diff.seconds > 60:
        return f"{diff.seconds // 60}m ago"
    else:
        return "just now"