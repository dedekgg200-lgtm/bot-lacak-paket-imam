import os
import re
import time
import requests
import telebot
from telebot import types

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
BINDERBYTE_API_KEY = os.getenv("BINDERBYTE_API_KEY")

API_URL = "https://api.binderbyte.com/v1/track"

if not TELEGRAM_TOKEN:
    raise ValueError("TELEGRAM_TOKEN belum diisi di Railway")

if not BINDERBYTE_API_KEY:
    raise ValueError("BINDERBYTE_API_KEY belum diisi di Railway")

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
        "Bisa kirim beberapa resi sekaligus."
    )


# =========================================================
# AMBIL FIELD
# =========================================================

def ambil(data, *fields):

    if not isinstance(data, dict):
        return None

    for field in fields:

        value = data.get(field)

        if value is not None:

            text = str(value).strip()

            if text:
                return value

    return None


# =========================================================
# FORMAT RUPIAH
# =========================================================

def rupiah(value):

    if value is None:
        return None

    try:

        angka = float(value)

        if angka <= 0:
            return None

        return (
            "Rp"
            + f"{angka:,.0f}".replace(",", ".")
        )

    except Exception:

        return None


# =========================================================
# CARI COD + NOMINAL
# =========================================================

def cari_data_pembayaran(data):

    cod = None
    nominal = None

    def scan(obj):

        nonlocal cod
        nonlocal nominal

        if isinstance(obj, dict):

            for key, value in obj.items():

                nama = str(key).lower()

                # -----------------------------------------
                # FIELD COD
                # -----------------------------------------

                if any(x in nama for x in [
                    "cod",
                    "cash_on_delivery",
                    "cashondelivery"
                ]):

                    if value is not None:

                        teks = str(value).strip().upper()

                        if teks in [
                            "COD",
                            "TRUE",
                            "YES",
                            "YA",
                            "1"
                        ]:

                            cod = True

                            if isinstance(
                                value,
                                (int, float)
                            ) and value > 1:

                                nominal = value

                        elif teks in [
                            "NONCOD",
                            "NON-COD",
                            "NON COD",
                            "FALSE",
                            "NO",
                            "TIDAK",
                            "0"
                        ]:

                            cod = False

                        elif isinstance(
                            value,
                            (int, float)
                        ):

                            if value > 0:

                                cod = True
                                nominal = value

                # -----------------------------------------
                # FIELD NOMINAL
                # -----------------------------------------

                if any(x in nama for x in [
                    "cod_amount",
                    "cash_on_delivery_amount",
                    "cashondelivery_amount"
                ]):

                    try:

                        angka = float(value)

                        if angka > 0:

                            nominal = angka
                            cod = True

                    except Exception:
                        pass

                if isinstance(
                    value,
                    (dict, list)
                ):

                    scan(value)

        elif isinstance(obj, list):

            for item in obj:
                scan(item)

    scan(data)

    return cod, nominal


# =========================================================
# FORMAT PEMBAYARAN
# =========================================================

def format_pembayaran(data):

    cod, nominal = cari_data_pembayaran(data)

    if cod is True:

        if nominal:

            return (
                "COD : YA\n"
                f"Nilai COD : {rupiah(nominal)}"
            )

        return "COD : YA"

    if cod is False:

        return "COD : TIDAK"

    return "COD : TIDAK TERSEDIA"


# =========================================================
# FORMAT STATUS
# =========================================================

def format_status(status):

    if not status:
        return "Tidak tersedia"

    status = str(status).strip()

    lower = status.lower()

    if any(x in lower for x in [
        "delivered",
        "received",
        "diterima"
    ]):

        return "✅ SUDAH DITERIMA"

    return status


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
            item.get("date")
            or item.get("datetime")
            or item.get("updated_at")
            or "-"
        )

        desc = (
            item.get("desc")
            or item.get("description")
            or item.get("note")
            or item.get("status")
            or "-"
        )

        lokasi = (
            item.get("location")
            or ""
        )

        baris = (
            f"• {tanggal}\n"
            f"  {desc}"
        )

        if lokasi:
            baris += (
                f"\n  📍 {lokasi}"
            )

        hasil.append(baris)

    if not hasil:
        return "Tidak tersedia"

    return "\n".join(hasil)


# =========================================================
# TRACKING
# =========================================================

def lacak_resi(resi):

    try:

        params = {
            "api_key": BINDERBYTE_API_KEY,
            "courier": "sicepat",
            "awb": resi
        }

        response = requests.get(
            API_URL,
            params=params,
            timeout=30
        )

        print(
            "BINDERBYTE:",
            resi,
            response.status_code
        )

        if response.status_code != 200:

            return (
                "📦 TRACKING SICEPAT\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n"
                "❌ Server tracking bermasalah."
            )

        data_api = response.json()

        if data_api.get("status") != 200:

            return (
                "📦 TRACKING SICEPAT\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n"
                "❌ Resi tidak ditemukan."
            )

        data = data_api.get("data")

        if not isinstance(data, dict):

            return (
                "📦 TRACKING SICEPAT\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n"
                "❌ Data tidak tersedia."
            )

        # =================================================
        # DATA UTAMA
        # =================================================

        summary = data.get(
            "summary",
            {}
        )

        detail = data.get(
            "detail",
            {}
        )

        history = (
            data.get("history")
            or data.get("histories")
            or []
        )

        if not isinstance(summary, dict):
            summary = {}

        if not isinstance(detail, dict):
            detail = {}

        # =================================================
        # FIELD
        # =================================================

        service = (
            ambil(
                summary,
                "service",
                "service_name",
                "shipment_type"
            )
            or "Tidak tersedia"
        )

        nomor_resi = (
            ambil(
                summary,
                "awb",
                "waybill",
                "tracking_number"
            )
            or resi
        )

        status = (
            ambil(
                summary,
                "status"
            )
            or "Tidak tersedia"
        )

        tanggal = (
            ambil(
                summary,
                "date",
                "datetime"
            )
            or "Tidak tersedia"
        )

        pengirim = (
            ambil(
                summary,
                "shipper_name",
                "sender_name",
                "shipper"
            )
            or ambil(
                detail,
                "shipper_name",
                "sender_name",
                "shipper"
            )
            or "Tidak tersedia"
        )

        penerima = (
            ambil(
                summary,
                "receiver_name",
                "recipient_name",
                "receiver"
            )
            or ambil(
                detail,
                "receiver_name",
                "recipient_name",
                "receiver"
            )
            or "Tidak tersedia"
        )

        asal = (
            ambil(
                summary,
                "origin"
            )
            or ambil(
                detail,
                "origin"
            )
            or "Tidak tersedia"
        )

        tujuan = (
            ambil(
                summary,
                "destination"
            )
            or ambil(
                detail,
                "destination"
            )
            or "Tidak tersedia"
        )

        pembayaran = format_pembayaran(
            data
        )

        # =================================================
        # HASIL
        # =================================================

        hasil = (

            "📦 EXPEDISI SICEPAT\n"
            "└ SiCepat Express\n\n"

            "📩 Resi\n"
            f"├ Service : {service}\n"
            f"└ No Resi : {nomor_resi}\n\n"

            "📮 Status\n"
            f"└ Status : {format_status(status)}\n\n"

            "🚀 Pengirim\n"
            f"├ {pengirim}\n"
            f"└ {asal}\n\n"

            "🚩 Penerima\n"
            f"├ {penerima}\n"
            f"└ {tujuan}\n\n"

            "💰 Pembayaran\n"
            f"└ {pembayaran}\n\n"

            "📅 Tanggal\n"
            f"└ {tanggal}\n\n"

            "⏩ POD Detail\n"
            "━━━━━━━━━━━━━━━━\n"
            f"{format_riwayat(history)}"
        )

        return hasil

    except requests.exceptions.Timeout:

        return (
            "⚠️ REQUEST TIMEOUT\n"
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

    resi_list = list(
        dict.fromkeys(
            resi_list
        )
    )

    if not resi_list:

        bot.send_message(
            chat_id,
            "⚠️ Nomor resi tidak ditemukan."
        )

        return

    if len(resi_list) > 50:

        bot.send_message(
            chat_id,
            "⚠️ Maksimal 50 resi sekali cek."
        )

        return

    bot.send_message(
        chat_id,
        f"🔎 Mengecek {len(resi_list)} "
        "resi SiCepat...\n\n"
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
# RUN
# =========================================================

if __name__ == "__main__":

    print(
        "=============================="
    )

    print(
        "📦 BOT TRACKING SICEPAT"
    )

    print(
        "🚚 PROVIDER: BINDERBYTE"
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
