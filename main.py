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
        "Contoh:\n"
        "005244878857\n\n"
        "Bisa kirim beberapa resi sekaligus."
    )


# =========================================================
# PEMBAYARAN
# =========================================================

def status_pembayaran(data):

    """
    Tidak menebak COD/NONCOD.
    Hanya menampilkan data pembayaran jika
    memang dikirim oleh API.
    """

    ditemukan = []

    def cari(obj):

        if isinstance(obj, dict):

            for key, value in obj.items():

                nama = str(key).lower()

                if any(x in nama for x in [
                    "payment",
                    "cod"
                ]):

                    if value is not None:

                        teks = str(value).strip()

                        if teks:

                            ditemukan.append(
                                teks.upper()
                            )

                if isinstance(
                    value,
                    (dict, list)
                ):

                    cari(value)

        elif isinstance(obj, list):

            for item in obj:

                cari(item)

    cari(data)

    for nilai in ditemukan:

        if (
            "NONCOD" in nilai
            or "NON-COD" in nilai
            or "NON COD" in nilai
        ):

            return "NONCOD"

    for nilai in ditemukan:

        if re.search(
            r"\bCOD\b",
            nilai
        ):

            return "COD"

    return "DATA PEMBAYARAN TIDAK TERSEDIA"


# =========================================================
# FORMAT STATUS
# =========================================================

def format_status(status):

    if not status:

        return "Tidak tersedia"

    status = str(status).strip()

    return status


# =========================================================
# FORMAT RIWAYAT
# =========================================================

def format_riwayat(history):

    if not isinstance(
        history,
        list
    ):

        return "Tidak tersedia"

    if not history:

        return "Tidak tersedia"

    hasil = []

    for item in history[:10]:

        if not isinstance(
            item,
            dict
        ):

            continue

        tanggal = (
            item.get("updated_at")
            or item.get("date")
            or "-"
        )

        catatan = (
            item.get("note")
            or item.get("description")
            or "-"
        )

        status = (
            item.get("status")
            or "-"
        )

        hasil.append(
            f"• {tanggal}\n"
            f"  {catatan}\n"
            f"  Status: {status}"
        )

    if not hasil:

        return "Tidak tersedia"

    return "\n\n".join(hasil)


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
            "BITESHIP:",
            resi,
            response.status_code
        )

        # -------------------------------------------------
        # ERROR HTTP
        # -------------------------------------------------

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
                f"🔢 Resi : {resi}\n\n"
                f"❌ {pesan}\n"
                f"HTTP : {response.status_code}"
            )

        # -------------------------------------------------
        # JSON
        # -------------------------------------------------

        data = response.json()

        if not isinstance(
            data,
            dict
        ):

            return (
                "❌ DATA API TIDAK VALID\n\n"
                f"Resi : {resi}"
            )

        if data.get("success") is False:

            return (
                "❌ RESI TIDAK DITEMUKAN\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}"
            )

        # -------------------------------------------------
        # DATA
        # -------------------------------------------------

        origin = (
            data.get("origin")
            or {}
        )

        destination = (
            data.get("destination")
            or {}
        )

        history = (
            data.get("history")
            or []
        )

        courier = (
            data.get("courier")
            or {}
        )

        if not isinstance(
            origin,
            dict
        ):

            origin = {}

        if not isinstance(
            destination,
            dict
        ):

            destination = {}

        if not isinstance(
            courier,
            dict
        ):

            courier = {}

        # -------------------------------------------------
        # RESI
        # -------------------------------------------------

        nomor_resi = (
            data.get("waybill_id")
            or resi
        )

        # -------------------------------------------------
        # EKSPEDISI
        # -------------------------------------------------

        ekspedisi = (
            courier.get("company")
            or "sicepat"
        )

        # -------------------------------------------------
        # SERVICE
        # -------------------------------------------------

        service = "Tidak tersedia"

        if isinstance(
            history,
            list
        ):

            for item in history:

                if not isinstance(
                    item,
                    dict
                ):

                    continue

                nilai = (
                    item.get("service_type")
                )

                if nilai:

                    service = str(
                        nilai
                    )

                    break

        # -------------------------------------------------
        # STATUS
        # -------------------------------------------------

        status = (
            data.get("status")
            or "Tidak tersedia"
        )

        # -------------------------------------------------
        # PENGIRIM
        # -------------------------------------------------

        pengirim = (
            origin.get("contact_name")
            or "Tidak tersedia"
        )

        asal = (
            origin.get("address")
            or "Tidak tersedia"
        )

        # -------------------------------------------------
        # PENERIMA
        # -------------------------------------------------

        penerima = (
            destination.get("contact_name")
            or "Tidak tersedia"
        )

        tujuan = (
            destination.get("address")
            or "Tidak tersedia"
        )

        # -------------------------------------------------
        # PEMBAYARAN
        # -------------------------------------------------

        pembayaran = status_pembayaran(
            data
        )

        # -------------------------------------------------
        # HASIL
        # -------------------------------------------------

        hasil = (

            "📦 EXPEDISI SICEPAT\n"
            "└ SiCepat Express\n\n"

            "📩 RESI\n"
            f"├ Service : {service}\n"
            f"└ No Resi : {nomor_resi}\n\n"

            "📮 STATUS\n"
            f"└ {format_status(status)}\n\n"

            "🚀 PENGIRIM\n"
            f"├ {pengirim}\n"
            f"└ {asal}\n\n"

            "🚩 PENERIMA\n"
            f"├ {penerima}\n"
            f"└ {tujuan}\n\n"

            "💰 PEMBAYARAN\n"
            f"└ {pembayaran}\n\n"

            "⏩ POD / RIWAYAT\n"
            "━━━━━━━━━━━━━━━━\n"
            f"{format_riwayat(history)}"
        )

        return hasil

    except requests.exceptions.Timeout:

        return (
            "⚠️ REQUEST TIMEOUT\n"
            "━━━━━━━━━━━━━━━━\n\n"
            f"Resi : {resi}"
        )

    except requests.exceptions.RequestException as error:

        print(
            "REQUEST ERROR:",
            error
        )

        return (
            "⚠️ GAGAL TERHUBUNG KE BITESHIP\n"
            "━━━━━━━━━━━━━━━━\n\n"
            f"Resi : {resi}"
        )

    except Exception as error:

        print(
            "ERROR:",
            error
        )

        return (
            "⚠️ TERJADI KESALAHAN\n"
            "━━━━━━━━━━━━━━━━\n\n"
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

    # Nomor resi 10-15 digit
    resi_list = re.findall(
        r"\b\d{10,15}\b",
        teks
    )

    # Hilangkan duplikat
    resi_list = list(
        dict.fromkeys(
            resi_list
        )
    )

    if not resi_list:

        bot.send_message(
            chat_id,
            "⚠️ Nomor resi tidak ditemukan.\n\n"
            "Contoh:\n"
            "005244878857"
        )

        return

    # Maksimal 50
    if len(resi_list) > 50:

        bot.send_message(
            chat_id,
            "⚠️ Maksimal 50 resi sekali cek."
        )

        return

    bot.send_message(
        chat_id,
        f"🔎 Mulai mengecek "
        f"{len(resi_list)} resi SiCepat.\n\n"
        "⏳ Mohon tunggu..."
    )

    for resi in resi_list:

        print(
            "Cek resi:",
            resi
        )

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
        f"✅ Selesai mengecek "
        f"{len(resi_list)} resi.",
        reply_markup=menu_ekspedisi()
    )


# =========================================================
# START BOT
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
