import os
import json
import hmac
import hashlib
import asyncio
import aiohttp
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

API_BASE = os.getenv('API_BASE_URL', 'http://localhost:8787')
BOT_SECRET = os.getenv('BOT_SECRET', '')

async def call_api(method: str, endpoint: str, data: dict = None, files: dict = None, user_id: int = None, username: str = None, first_name: str = None):
    url = f"{API_BASE}{endpoint}"
    headers = {}
    init_data = build_init_data(user_id, username, first_name)
    headers['X-Telegram-Init-Data'] = init_data

    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        if files:
            form = aiohttp.FormData()
            for k, v in files.items():
                form.add_field(k, v)
            if data:
                for k, v in data.items():
                    form.add_field(k, v)
            async with session.post(url, data=form, headers=headers) as resp:
                return await resp.json()
        elif data:
            headers['Content-Type'] = 'application/json'
            async with session.post(url, json=data, headers=headers) as resp:
                return await resp.json()
        else:
            async with session.get(url, headers=headers) as resp:
                return await resp.json()

async def upload_file(file_path: str, user_id: int, username: str, first_name: str):
    filename = Path(file_path).name
    with open(file_path, 'rb') as f:
        file_content = f.read()

    url = f"{API_BASE}/files/upload"
    headers = {}
    headers['X-Telegram-Init-Data'] = build_init_data(user_id, username, first_name)

    form = aiohttp.FormData()
    form.add_field('file', file_content, filename=filename, content_type='application/octet-stream')

    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(url, data=form, headers=headers) as resp:
            return await resp.json()

async def list_files(user_id: int, username: str, first_name: str, limit: int = 20, offset: int = 0):
    url = f"{API_BASE}/files?limit={limit}&offset={offset}"
    headers = {}
    headers['X-Telegram-Init-Data'] = build_init_data(user_id, username, first_name)

    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, headers=headers) as resp:
            return await resp.json()

async def fetch_inbox(user_id: int, username: str, first_name: str, limit: int = 10):
    url = f"{API_BASE}/mail/inbox?limit={limit}"
    headers = {}
    headers['X-Telegram-Init-Data'] = build_init_data(user_id, username, first_name)

    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, headers=headers) as resp:
            return await resp.json()

async def disconnect_mail(user_id: int, username: str, first_name: str):
    url = f"{API_BASE}/mail/disconnect"
    headers = {}
    headers['X-Telegram-Init-Data'] = build_init_data(user_id, username, first_name)

    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.delete(url, headers=headers) as resp:
            return await resp.json()

async def delete_file(slug: str, user_id: int, username: str, first_name: str):
    url = f"{API_BASE}/files/{slug}"
    headers = {}
    headers['X-Telegram-Init-Data'] = build_init_data(user_id, username, first_name)

    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.delete(url, headers=headers) as resp:
            return await resp.json()

def build_init_data(user_id: int, username: str | None, first_name: str) -> str:
    import time
    import urllib.parse
    auth_date = str(int(time.time()))
    user_data = {
        'id': user_id,
        'username': username or '',
        'first_name': first_name or '',
    }
    user_json = json.dumps(user_data, separators=(',', ':'))
    encoded_user = urllib.parse.quote(user_json)
    params_list = [("auth_date", auth_date), ("user", user_json)]
    params_list.sort(key=lambda x: x[0])
    data_check_string = "\n".join(f"{k}={v}" for k, v in params_list)

    secret_key = hmac.new(
        b"WebAppData",
        BOT_SECRET.encode(),
        hashlib.sha256
    ).digest()

    hash_val = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return f"auth_date={auth_date}&user={encoded_user}&hash={hash_val}"