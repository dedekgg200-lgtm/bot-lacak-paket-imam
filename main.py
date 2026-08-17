import os
import re
import requests
import telebot

# ==============================
# CONFIG
# ==============================

TOKEN_TELEGRAM = os.getenv("TELEGRAM_TOKEN")
API_KEY = os.getenv("BINDERBYTE_API_KEY")

if not TOKEN_TELEGRAM:
    raise ValueError("TELEGRAM_TOKEN belum diisi di Railway")

if not API_KEY:
    raise ValueError("BINDERBYTE_API_KEY belum diisi di Railway")

bot = telebot.TeleBot(TOKEN_TELEGRAM)


# ==============================
# START
# ==============================

@bot.message_handler(commands=["start"])
def mulai(message):
    bot.reply_to(
        message,
        "📦 BOT TRACKING J&T\n\n"
        "Kirim nomor resi J&T untuk mengecek paket.\n\n"
        "Contoh:\n"
        "JZ3030099005"
    )


# ==============================
# TRACKING BINDERBYTE
# ==============================

def lacak_paket(resi):

    url = "https://api.binderbyte.com/v1/track"

    params = {
        "api_key": API_KEY,
        "courier": "Sicepat",
        "awb": resi
    }

    try:

        response = requests.get(
            url,
            params=params,
            timeout=30
        )

        print("HTTP:", response.status_code)
        print("RESPONSE:", response.text[:1000])

        # ==============================
        # HTTP ERROR
        # ==============================

        if response.status_code != 200:

            return (
                f"❌ GAGAL CEK RESI\n\n"
                f"📦 Resi: {resi}\n"
                f"⚠️ HTTP: {response.status_code}\n\n"
                f"Silakan coba lagi."
            )

        # ==============================
        # JSON
        # ==============================

        data = response.json()

        if data.get("status") != 200:

            return (
                f"❌ RESI TIDAK DITEMUKAN\n\n"
                f"📦 Resi: {resi}\n"
                f"⚠️ {data.get('message', 'Data tidak tersedia')}"
            )

        result = data.get("data", {})

        # ==============================
        # SUMMARY
        # ==============================

        summary = result.get("summary", {})

        awb = summary.get("awb", resi)
        courier = summary.get("courier", "J&T Express")
        service = summary.get("service", "-")
        status = summary.get("status", "-")
        date = summary.get("date", "-")
        description = summary.get("desc", "-")
        amount = summary.get("amount", "-")
        weight = summary.get("weight", "-")

        # ==============================
        # DETAIL
        # ==============================

        detail = result.get("detail", {})

        origin = detail.get("origin", "-")
        destination = detail.get("destination", "-")
        shipper = detail.get("shipper", "-")
        receiver = detail.get("receiver", "-")

        # ==============================
        # HISTORY
        # ==============================

        history = result.get("history", [])

        riwayat = ""

        for item in history[:10]:

            tanggal = item.get("date", "-")
            keterangan = item.get("desc", "-")
            lokasi = item.get("location", "-")

            riwayat += (
                f"\n🕐 {tanggal}\n"
                f"📍 {lokasi}\n"
                f"   {keterangan}\n"
            )

        if not riwayat:

            riwayat = "\nBelum ada riwayat perjalanan."

        # ==============================
        # HASIL
        # ==============================

        hasil = (
            f"📦 HASIL TRACKING J&T\n"
            f"━━━━━━━━━━━━━━━━━━\n\n"

            f"🔢 RESI\n"
            f"{awb}\n\n"

            f"🏢 EKSPEDISI\n"
            f"{courier}\n\n"

            f"📋 LAYANAN\n"
            f"{service}\n\n"

            f"📌 STATUS\n"
            f"{status}\n\n"

            f"📅 TANGGAL\n"
            f"{date}\n\n"

            f"📤 PENGIRIM\n"
            f"{shipper}\n\n"

            f"👤 PENERIMA\n"
            f"{receiver}\n\n"

            f"📍 ASAL\n"
            f"{origin}\n\n"

            f"🎯 TUJUAN\n"
            f"{destination}\n\n"

            f"⚖️ BERAT\n"
            f"{weight}\n\n"

            f"💰 NILAI\n"
            f"{amount}\n\n"

            f"📝 KETERANGAN\n"
            f"{description}\n\n"

            f"🚚 RIWAYAT PERJALANAN\n"
            f"━━━━━━━━━━━━━━━━━━"
            f"{riwayat}"
        )

        return hasil

    # ==============================
    # ERROR
    # ==============================

    except requests.exceptions.Timeout:

        return (
            f"⏱️ SERVER TERLALU LAMA MERESPONS\n\n"
            f"📦 Resi: {resi}\n\n"
            f"Silakan coba lagi."
        )

    except requests.exceptions.RequestException as error:

        print("REQUEST ERROR:", error)

        return (
            f"❌ GAGAL TERHUBUNG KE SERVER\n\n"
            f"📦 Resi: {resi}\n\n"
            f"Silakan coba lagi."
        )

    except Exception as error:

        print("ERROR:", error)

        return (
            f"❌ TERJADI KESALAHAN\n\n"
            f"📦 Resi: {resi}\n\n"
            f"Silakan coba lagi."
        )


# ==============================
# PESAN RESI
# ==============================

@bot.message_handler(func=lambda message: True)
def balas(message):

    teks = message.text.strip().upper()

    # Ambil nomor resi dari pesan
    resi = re.sub(r"[^A-Z0-9]", "", teks)

    # Validasi panjang
    if len(resi) < 8 or len(resi) > 30:

        bot.reply_to(
            message,
            "⚠️ Nomor resi tidak valid.\n\n"
            "Kirim nomor resi J&T.\n\n"
            "Contoh:\n"
            "JZ3030099005"
        )

        return

    # Pesan loading
    loading = bot.reply_to(
        message,
        f"🔍 Sedang mengecek resi...\n\n"
        f"📦 {resi}\n\n"
        f"⏳ Mohon tunggu..."
    )

    # Tracking
    hasil = lacak_paket(resi)

    # Ganti pesan loading dengan hasil
    try:

        bot.edit_message_text(
            hasil,
            chat_id=message.chat.id,
            message_id=loading.message_id
        )

    except Exception:

        bot.reply_to(
            message,
            hasil
        )


# ==============================
# START BOT
# ==============================

print("================================")
print("📦 BOT TRACKING J&T")
print("🤖 Telegram Bot sedang berjalan")
print("================================")

bot.infinity_polling(
    skip_pending=True,
    timeout=30,
    long_polling_timeout=30
        )
