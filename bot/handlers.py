import os
import time
import tempfile
from pathlib import Path
from telegram import Update
from telegram.ext import ContextTypes

from utils import get_main_menu, get_file_actions, format_file_size, format_timestamp, get_mail_menu
from api_client import list_files, upload_file, delete_file, fetch_inbox, disconnect_mail

MAX_FILE_SIZE = 10 * 1024 * 1024

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await update.message.reply_text(
        f"📦 *PaperLink Storage*\n\n"
        f"Send me any file and I'll upload it, give you a shareable link.\n\n"
        f"Max file size: *10MB*\n"
        f"Free, fast, simple.\n\n"
        f"_Or use the menu below to manage your files._",
        parse_mode='Markdown',
        reply_markup=get_main_menu()
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "*📖 How to use:*\n\n"
        "• *Send a file/photo/video* → I'll upload it and give you a link\n"
        "• `/files` → See your recent uploads\n"
        "• `/delete <slug>` → Delete a file\n"
        "• Tap *My Files* → Browse your uploads\n\n"
        "_Links are public by default._",
        parse_mode='Markdown',
        reply_markup=get_main_menu()
    )

async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    doc = update.message.document

    if doc.file_size > MAX_FILE_SIZE:
        await update.message.reply_text(
            f"❌ File too large. Max *10MB*. Your file is {format_file_size(doc.file_size)}.",
            parse_mode='Markdown'
        )
        return

    await update.message.reply_text("📤 Uploading...")
    status_msg = update.message.reply_text("⏳ 0%")

    try:
        temp_path = await doc.get_file().download(dest=tempfile.NamedTemporaryFile(delete=False))
        result = await upload_file(temp_path.name, user.id, user.username, user.first_name)
        os.unlink(temp_path.name)

        if 'error' in result:
            await status_msg.edit_text(f"❌ Upload failed: {result['error']}")
            return

        slug = result['slug']
        url = result['url']
        size = result['size']
        original = result['original_name']

        app_url = os.getenv('APP_URL', 'https://paperlink.app')
        keyboard = get_file_actions(slug, original)

        await status_msg.edit_text(
            f"✅ *Uploaded!*\n\n"
            f"📄 {original}\n"
            f"📦 {format_file_size(size)}\n\n"
            f"🔗 {url}",
            parse_mode='Markdown',
            reply_markup=keyboard
        )

    except Exception as e:
        await status_msg.edit_text(f"❌ Upload failed: {str(e)}")

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    photo = update.message.photo[-1]

    if photo.file_size > MAX_FILE_SIZE:
        await update.message.reply_text(
            f"❌ File too large. Max *10MB*. Your file is {format_file_size(photo.file_size)}.",
            parse_mode='Markdown'
        )
        return

    await update.message.reply_text("📤 Uploading...")
    status_msg = update.message.reply_text("⏳ 0%")

    try:
        temp_path = await photo.get_file().download(dest=tempfile.NamedTemporaryFile(delete=False))
        ext = Path(temp_path.name).suffix or '.jpg'
        filename = f"photo_{int(time.time())}{ext}"
        os.rename(temp_path.name, temp_path.name + ext)

        result = await upload_file(temp_path.name + ext, user.id, user.username, user.first_name)
        os.unlink(temp_path.name + ext)

        if 'error' in result:
            await status_msg.edit_text(f"❌ Upload failed: {result['error']}")
            return

        slug = result['slug']
        url = result['url']
        size = result['size']
        original = result['original_name']

        keyboard = get_file_actions(slug, original)

        await status_msg.edit_text(
            f"✅ *Uploaded!*\n\n"
            f"📷 Photo\n"
            f"📦 {format_file_size(size)}\n\n"
            f"🔗 {url}",
            parse_mode='Markdown',
            reply_markup=keyboard
        )

    except Exception as e:
        await status_msg.edit_text(f"❌ Upload failed: {str(e)}")

async def list_files_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await update.message.reply_text("📁 Loading your files...")

    try:
        result = await list_files(user.id, user.username, user.first_name)

        if 'error' in result:
            await update.message.reply_text(f"❌ Error: {result['error']}")
            return

        files = result.get('files', [])
        if not files:
            await update.message.reply_text(
                "📭 *No files yet.*\n\nSend me a file to upload!",
                parse_mode='Markdown',
                reply_markup=get_main_menu()
            )
            return

        text = f"📁 *Your Files* ({len(files)})\n\n"
        for f in files:
            ts = format_timestamp(f['created_at'])
            size = format_file_size(f['size'])
            text += f"📄 `{f['slug']}` — {f['original_name']}\n   {size} • {ts}\n\n"

        await update.message.reply_text(text, parse_mode='Markdown', disable_web_page_preview=True, reply_markup=get_main_menu())

    except Exception as e:
        await update.message.reply_text(f"❌ Failed to load files: {str(e)}")

async def delete_file_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage: `/delete <slug>`\n\nFind slugs with `/files`.", parse_mode='Markdown')
        return

    slug = context.args[0]
    user = update.effective_user

    try:
        result = await delete_file(slug, user.id, user.username, user.first_name)
        if 'error' in result:
            await update.message.reply_text(f"❌ {result['error']}")
        else:
            await update.message.reply_text(f"🗑️ Deleted `{slug}`", parse_mode='Markdown')
    except Exception as e:
        await update.message.reply_text(f"❌ Delete failed: {str(e)}")

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    user = query.from_user
    data = query.data or ''

    if data == 'upload':
        await query.edit_message_text(
            "📤 *Send me a file!*\n\nYou can send:\n• Documents\n• Photos\n• Videos\n• Audio files\n\nMax *10MB*. I'll return a shareable link instantly.",
            parse_mode='Markdown',
            reply_markup=get_main_menu()
        )
    elif data == 'inbox':
        await inbox_callback(query, user, context)
    elif data == 'connect':
        app_url = os.getenv('APP_URL', 'https://usepaperlink.site')
        oauth_url = f"{app_url}/mail/connect/{user.id}"
        await query.edit_message_text(
            "📧 *Connect Gmail*\n\n"
            f"[🔗 Click here to authorize]({oauth_url})\n\n"
            "After authorizing, use /inbox to see your emails.",
            parse_mode='Markdown',
            disable_web_page_preview=True,
            reply_markup=get_mail_menu()
        )
    elif data == 'back_main':
        await query.edit_message_text(
            "📦 PaperLink — choose an option:",
            reply_markup=get_main_menu()
        )
    elif data == 'myfiles':
        await list_files_callback(query, user)
    elif data == 'storage':
        await show_storage_callback(query, user)
    elif data == 'settings':
        await query.edit_message_text(
            "⚙️ *Settings*\n\n"
            "🔗 Links are public by default\n"
            "📦 Max file size: 10MB\n\n"
            "_More settings coming soon._",
            parse_mode='Markdown',
            reply_markup=get_main_menu()
        )
    elif data.startswith('copy_'):
        slug = data.replace('copy_', '')
        app_url = os.getenv('APP_URL', 'https://paperlink.app')
        url = f"{app_url}/f/{slug}"
        await context.bot.send_message(
            chat_id=user.id,
            text=f"🔗 *Link copied!*\n\n{url}",
            parse_mode='Markdown'
        )
    elif data.startswith('delete_'):
        slug = data.replace('delete_', '')
        try:
            result = await delete_file(slug, user.id, user.username, user.first_name)
            if 'error' in result:
                await context.bot.send_message(chat_id=user.id, text=f"❌ {result['error']}")
            else:
                await context.bot.send_message(
                    chat_id=user.id,
                    text=f"🗑️ Deleted `{slug}`",
                    parse_mode='Markdown'
                )
        except Exception as e:
            await context.bot.send_message(chat_id=user.id, text=f"❌ Delete failed: {str(e)}")

async def list_files_callback(query, user):
    try:
        result = await list_files(user.id, user.username, user.first_name)
        files = result.get('files', [])
        if not files:
            await query.edit_message_text(
                "📭 *No files yet.*", parse_mode='Markdown', reply_markup=get_main_menu()
            )
            return

        text = f"📁 *Your Files* ({len(files)})\n\n"
        for f in files:
            ts = format_timestamp(f['created_at'])
            size = format_file_size(f['size'])
            text += f"📄 `{f['slug']}`\n   {f['original_name']}\n   {size} • {ts}\n\n"

        await query.edit_message_text(text, parse_mode='Markdown', disable_web_page_preview=True, reply_markup=get_main_menu())
    except Exception as e:
        await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=get_main_menu())

async def inbox_callback(query, user, context):
    try:
        result = await fetch_inbox(user.id, user.username, user.first_name)
        if 'error' in result:
            await query.edit_message_text(f"❌ {result['error']}", reply_markup=get_mail_menu())
            return

        emails = result.get('emails', [])
        account = result.get('account', {})

        if not emails:
            await query.edit_message_text("📭 *Inbox is empty!*", parse_mode='Markdown', reply_markup=get_mail_menu())
            return

        text = f"📬 *Inbox* — {account.get('email_address', '')}\n\n"
        for i, email in enumerate(emails[:10], 1):
            sender = email.get('sender_name', email.get('sender_email', 'Unknown'))
            subject = email.get('subject', '(No subject)')
            snippet = email.get('snippet', '')[:60]
            ts = format_timestamp(email.get('timestamp', 0))
            text += f"{i}. *{subject}*\n   👤 {sender} • 🕐 {ts}\n   💬 {snippet}\n\n"

        await query.edit_message_text(text, parse_mode='Markdown', disable_web_page_preview=True, reply_markup=get_mail_menu())
    except Exception as e:
        await query.edit_message_text(f"❌ Error: {str(e)}", reply_markup=get_mail_menu())

async def show_storage_callback(query, user):
    await query.edit_message_text(
        "📊 *Storage Status*\n\n"
        "✅ You're on the **Free** plan\n"
        "📦 *Unlimited* uploads (up to 10MB each)\n\n"
        "_Upgrade coming soon: larger files, private links, analytics._",
        parse_mode='Markdown',
        reply_markup=get_main_menu()
    )

async def connect_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    app_url = os.getenv('APP_URL', 'https://usepaperlink.site')
    oauth_url = f"{app_url}/mail/connect/{user.id}"
    await update.message.reply_text(
        "📧 *Connect Gmail*\n\n"
        "Click the link below to authorize PaperLink to access your Gmail:\n\n"
        f"[🔗 Connect Gmail]({oauth_url})\n\n"
        "You'll be redirected to Google to grant access. "
        "After that, use `/inbox` to see your emails.",
        parse_mode='Markdown',
        disable_web_page_preview=True,
        reply_markup=get_mail_menu()
    )

async def inbox_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await update.message.reply_text("📬 Loading inbox...")

    try:
        result = await fetch_inbox(user.id, user.username, user.first_name)
        if 'error' in result:
            await update.message.reply_text(f"❌ {result['error']}", reply_markup=get_mail_menu())
            return

        emails = result.get('emails', [])
        account = result.get('account', {})

        if not emails:
            await update.message.reply_text(
                "📭 *Inbox is empty!*",
                parse_mode='Markdown',
                reply_markup=get_mail_menu()
            )
            return

        text = f"📬 *Inbox* — {account.get('email_address', '')}\n\n"
        for i, email in enumerate(emails[:10], 1):
            sender = email.get('sender_name', email.get('sender_email', 'Unknown'))
            subject = email.get('subject', '(No subject)')
            snippet = email.get('snippet', '')[:80]
            ts = format_timestamp(email.get('timestamp', 0))
            text += f"{i}. *{subject}*\n   👤 {sender}\n   💬 {snippet}\n   🕐 {ts}\n\n"

        await update.message.reply_text(
            text,
            parse_mode='Markdown',
            disable_web_page_preview=True,
            reply_markup=get_mail_menu()
        )
    except Exception as e:
        await update.message.reply_text(f"❌ Failed to load inbox: {str(e)}", reply_markup=get_mail_menu())

async def disconnect_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    try:
        result = await disconnect_mail(user.id, user.username, user.first_name)
        if 'error' in result:
            await update.message.reply_text(f"❌ {result['error']}")
        else:
            await update.message.reply_text("✅ Disconnected from Gmail.", reply_markup=get_main_menu())
    except Exception as e:
        await update.message.reply_text(f"❌ Failed: {str(e)}")