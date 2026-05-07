import os
import logging
from dotenv import load_dotenv

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)

from handlers import (
    start, help_command, handle_document, handle_photo,
    list_files_command, delete_file_command, button_handler,
)

load_dotenv()

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

def main():
    token = os.getenv('BOT_TOKEN')
    if not token:
        print('❌ BOT_TOKEN not found in .env')
        return

    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler('start', start))
    app.add_handler(CommandHandler('help', help_command))
    app.add_handler(CommandHandler('files', list_files_command))
    app.add_handler(CommandHandler('delete', delete_file_command))
    app.add_handler(CallbackQueryHandler(button_handler))

    doc_handler = MessageHandler(
        filters.Document.ALL & ~filters.COMMAND,
        handle_document
    )
    app.add_handler(doc_handler)

    photo_handler = MessageHandler(
        filters.PHOTO & ~filters.COMMAND,
        handle_photo
    )
    app.add_handler(photo_handler)

    print('📦 PaperLink Storage Bot — Running')
    app.run_polling()

if __name__ == '__main__':
    main()