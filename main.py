import os
import re
import time
import requests
import telebot
from telebot import types

# =========================================================
# CONFIG
# =========================================================

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
BITESHIP_API_KEY = os.getenv("BITESHIP_API_KEY")

BASE_URL = "https://api.biteship.com"

if not TELEGRAM_TOKEN:
    raise ValueError("TELEGRAM_TOKEN belum diisi di Railway")

if not BITESHIP_API_KEY:
    raise ValueError("BITESHIP_API_KEY belum diisi di Railway")

bot = telebot.TeleBot(TELEGRAM_TOKEN)

user_courier = {}


# =========================================================
# MENU
# =========================================================

def menu_ekspedisi():
    keyboard = types.InlineKeyboardMarkup(row_width=1)

    keyboard.add(
        types.InlineKeyboardButton(
            "🔎 Cari Resi SiCepat",
            callback_data="courier_sicepat"
        )
    )

    return keyboard


# =========================================================
# START
# =========================================================

@bot.message_handler(commands=["start"])
def start(message):

    bot.send_message(
        message.chat.id,
        "📦 Halo! Selamat datang di Bot Tracking Paket.\n\n"
        "Silakan pilih ekspedisi:",
        reply_markup=menu_ekspedisi()
    )


# =========================================================
# PILIH SICEPAT
# =========================================================

@bot.callback_query_handler(
    func=lambda call: call.data == "courier_sicepat"
)
def pilih_sicepat(call):

    chat_id = call.message.chat.id

    user_courier[chat_id] = "sicepat"

    bot.answer_callback_query(call.id)

    bot.send_message(
        chat_id,
        "🔎 Silakan kirim nomor resi SiCepat.\n\n"
        "Bisa kirim 1 sampai 50 resi sekaligus."
    )


# =========================================================
# STATUS PEMBAYARAN
# =========================================================

def status_pembayaran(data):

    ditemukan = []

    def cari(obj):

        if isinstance(obj, dict):

            for key, value in obj.items():

                nama = str(key).lower()

                teks = ""

                if value is not None:
                    teks = str(value).strip().upper()

                if teks and any(x in nama for x in [
                    "cod",
                    "payment"
                ]):

                    ditemukan.append(teks)

                if isinstance(value, (dict, list)):
                    cari(value)

        elif isinstance(obj, list):

            for item in obj:
                cari(item)

    cari(data)

    # NONCOD diperiksa lebih dahulu
    for nilai in ditemukan:

        if (
            "NONCOD" in nilai
            or "NON-COD" in nilai
            or "NON COD" in nilai
        ):

            return "NONCOD — SUDAH DIBAYAR"

    # COD
    for nilai in ditemukan:

        if re.search(r"\bCOD\b", nilai):

            return "COD — MENUNGGU PEMBAYARAN"

    # Sudah dibayar
    for nilai in ditemukan:

        if any(x in nilai for x in [
            "PAID",
            "SUDAH DIBAYAR",
            "SUDAH BAYAR",
            "LUNAS",
            "SETTLED"
        ]):

            return "SUDAH DIBAYAR"

    # Belum dibayar
    for nilai in ditemukan:

        if any(x in nilai for x in [
            "UNPAID",
            "BELUM DIBAYAR",
            "BELUM BAYAR",
            "MENUNGGU PEMBAYARAN",
            "WAITING PAYMENT",
            "PENDING PAYMENT"
        ]):

            return "MENUNGGU PEMBAYARAN"

    return "DATA PEMBAYARAN TIDAK TERSEDIA"


# =========================================================
# FORMAT RIWAYAT
# =========================================================

def format_riwayat(history):

    if not isinstance(history, list):
        return "Tidak tersedia"

    if not history:
        return "Tidak tersedia"

    hasil = []

    for item in history[:10]:

        if not isinstance(item, dict):
            continue

        tanggal = (
            item.get("updated_at")
            or item.get("created_at")
            or "-"
        )

        status = (
            item.get("status")
            or "-"
        )

        catatan = (
            item.get("note")
            or item.get("description")
            or "-"
        )

        hasil.append(
            f"• {tanggal}\n"
            f"  {catatan}\n"
            f"  Status: {status}"
        )

    if not hasil:
        return "Tidak tersedia"

    return "\n".join(hasil)


# =========================================================
# TRACKING SICEPAT
# =========================================================

def lacak_resi(resi):

    url = (
        f"{BASE_URL}/v1/trackings/"
        f"{resi}/couriers/sicepat"
    )

    headers = {
        "Authorization": BITESHIP_API_KEY,
        "Content-Type": "application/json"
    }

    try:

        response = requests.get(
            url,
            headers=headers,
            timeout=30
        )

        print(
            "BITESHIP",
            resi,
            response.status_code
        )

        if response.status_code != 200:

            try:

                error_data = response.json()

                pesan = (
                    error_data.get("message")
                    or error_data.get("error")
                    or "Tracking gagal"
                )

            except Exception:

                pesan = "Tracking gagal"

            return (
                "📦 TRACKING SICEPAT\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n"
                f"❌ {pesan}\n"
                f"HTTP : {response.status_code}"
            )

        data = response.json()

        if data.get("success") is False:

            return (
                "❌ RESI TIDAK DITEMUKAN\n"
                "━━━━━━━━━━━━━━━━\n"
                f"🔢 Resi : {resi}"
            )

        origin = data.get("origin") or {}

        destination = data.get(
            "destination"
        ) or {}

        history = data.get(
            "history"
        ) or []

        if not isinstance(origin, dict):
            origin = {}

        if not isinstance(destination, dict):
            destination = {}

        # Service dari history jika tersedia
        service = "Tidak tersedia"

        if isinstance(history, list):

            for item in history:

                if not isinstance(item, dict):
                    continue

                nilai = item.get(
                    "service_type"
                )

                if nilai:

                    service = str(nilai)

                    break

        pembayaran = status_pembayaran(data)

        waybill = (
            data.get("waybill_id")
            or resi
        )

        status = (
            data.get("status")
            or "Tidak tersedia"
        )

        pengirim = (
            origin.get("contact_name")
            or "Tidak tersedia"
        )

        alamat_asal = (
            origin.get("address")
            or "Tidak tersedia"
        )

        penerima = (
            destination.get("contact_name")
            or "Tidak tersedia"
        )

        alamat_tujuan = (
            destination.get("address")
            or "Tidak tersedia"
        )

        hasil = (

            "📦 EXPEDISI SICEPAT\n"
            "└ SiCepat Express\n\n"

            "📩 Resi\n"
            f"├ Service : {service}\n"
            f"└ No Resi : {waybill}\n\n"

            "📮 Status\n"
            f"└ Status : {status}\n\n"

            "🚀 Pengirim\n"
            f"├ {pengirim}\n"
            f"└ {alamat_asal}\n\n"

            "🚩 Penerima\n"
            f"├ {penerima}\n"
            f"└ {alamat_tujuan}\n\n"

            "💰 Pembayaran\n"
            f"└ {pembayaran}\n\n"

            "⏩ POD Detail\n"
            f"{format_riwayat(history)}"
        )

        return hasil

    except requests.exceptions.Timeout:

        return (
            "⚠️ REQUEST TIMEOUT\n"
            f"Resi : {resi}"
        )

    except requests.exceptions.RequestException:

        return (
            "⚠️ GAGAL TERHUBUNG KE BITESHIP\n"
            f"Resi : {resi}"
        )

    except Exception as error:

        print(
            "ERROR:",
            error
        )

        return (
            "⚠️ TERJADI KESALAHAN\n"
            f"Resi : {resi}"
        )


# =========================================================
# TERIMA RESI
# =========================================================

@bot.message_handler(
    func=lambda message: True
)
def terima_resi(message):

    chat_id = message.chat.id

    if chat_id not in user_courier:

        bot.send_message(
            chat_id,
            "⚠️ Pilih ekspedisi terlebih dahulu.",
            reply_markup=menu_ekspedisi()
        )

        return

    teks = message.text or ""

    resi_list = re.findall(
        r"\b\d{10,15}\b",
        teks
    )

    # Hilangkan duplikat
    resi_list = list(
        dict.fromkeys(resi_list)
    )

    if not resi_list:

        bot.send_message(
            chat_id,
            "⚠️ Nomor resi tidak ditemukan."
        )

        return

    # Maksimal 50 resi
    if len(resi_list) > 50:

        bot.send_message(
            chat_id,
            "⚠️ Maksimal 50 resi sekali cek."
        )

        return

    bot.send_message(
        chat_id,
        f"🔎 Mengecek {len(resi_list)} resi SiCepat...\n"
        "⏳ Mohon tunggu."
    )

    for resi in resi_list:

        hasil = lacak_resi(
            resi
        )

        try:

            bot.send_message(
                chat_id,
                hasil
            )

        except Exception as error:

            print(
                "TELEGRAM ERROR:",
                error
            )

        time.sleep(0.5)

    bot.send_message(
        chat_id,
        f"✅ Selesai mengecek {len(resi_list)} resi.",
        reply_markup=menu_ekspedisi()
    )


# =========================================================
# JALANKAN BOT
# =========================================================

if __name__ == "__main__":

    print(
        "=============================="
    )

    print(
        "📦 BOT TRACKING SICEPAT"
    )

    print(
        "🚚 PROVIDER: BITESHIP"
    )

    print(
        "🤖 BOT BERJALAN"
    )

    print(
        "=============================="
    )

    bot.infinity_polling(
        skip_pending=True,
        timeout=30,
        long_polling_timeout=30
              )
