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
    raise ValueError("TELEGRAM_TOKEN belum diisi")

if not BINDERBYTE_API_KEY:
    raise ValueError("BINDERBYTE_API_KEY belum diisi")

bot = telebot.TeleBot(TELEGRAM_TOKEN)

# Menyimpan pilihan ekspedisi tiap pengguna
user_courier = {}


# =========================================================
# MENU
# =========================================================

def menu_ekspedisi():
    keyboard = types.InlineKeyboardMarkup(row_width=2)

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
        "Bisa kirim beberapa resi sekaligus.\n"
        "Contoh:\n"
        "004646985892\n"
        "004647000094"
    )


# =========================================================
# AMBIL FIELD DARI API
# =========================================================

def ambil_field(data, *nama_field):

    if not isinstance(data, dict):
        return None

    for field in nama_field:

        value = data.get(field)

        if value is not None:
            value = str(value).strip()

            if value:
                return value

    return None


# =========================================================
# SENSOR NOMOR HP
# =========================================================

def sensor_nomor_hp(nomor):

    if not nomor:
        return "Tidak tersedia"

    nomor = str(nomor).strip()

    # Hapus spasi, tanda kurung, strip, dll
    nomor_bersih = re.sub(r"[^0-9+]", "", nomor)

    if len(nomor_bersih) <= 6:
        return nomor_bersih

    # Tampilkan sebagian awal dan akhir
    jumlah_bintang = len(nomor_bersih) - 6

    return (
        nomor_bersih[:4]
        + ("*" * jumlah_bintang)
        + nomor_bersih[-2:]
    )


# =========================================================
# AMBIL NOMOR HP
# =========================================================

def ambil_nomor_hp(data):

    summary = data.get("summary", {})
    detail = data.get("detail", {})

    kandidat = []

    if isinstance(summary, dict):
        kandidat.extend([
            summary.get("receiver_phone"),
            summary.get("receiver_phone_number"),
            summary.get("phone"),
            summary.get("phone_number"),
        ])

    if isinstance(detail, dict):
        kandidat.extend([
            detail.get("receiver_phone"),
            detail.get("receiver_phone_number"),
            detail.get("phone"),
            detail.get("phone_number"),
        ])

    for nomor in kandidat:

        if nomor:
            return sensor_nomor_hp(nomor)

    return "Tidak tersedia"


# =========================================================
# STATUS PEMBAYARAN
# =========================================================

def status_pembayaran(data):

    """
    TIDAK MENEBak.

    Hanya menampilkan COD / NONCOD kalau memang
    ada informasi tersebut dari API.
    """

    summary = data.get("summary", {})
    detail = data.get("detail", {})

    sumber = []

    if isinstance(summary, dict):
        sumber.append(summary)

    if isinstance(detail, dict):
        sumber.append(detail)

    field_pembayaran = [
        "service",
        "payment_status",
        "payment_state",
        "payment",
        "payment_method",
        "payment_type",
        "cod_status",
        "cod",
    ]

    for bagian in sumber:

        for field in field_pembayaran:

            value = bagian.get(field)

            if value is None:
                continue

            text = str(value).strip()

            if not text:
                continue

            upper = text.upper()

            # API jelas menyebut NONCOD
            if "NONCOD" in upper or "NON-COD" in upper:
                return "NONCOD"

            # API jelas menyebut COD
            if upper == "COD" or "COD" in upper:
                return "COD"

    return "DATA PEMBAYARAN TIDAK TERSEDIA"


# =========================================================
# ISI PAKET
# =========================================================

def isi_paket(data):

    summary = data.get("summary", {})
    detail = data.get("detail", {})

    sumber = []

    if isinstance(summary, dict):
        sumber.append(summary)

    if isinstance(detail, dict):
        sumber.append(detail)

    fields = [
        "content",
        "contents",
        "item",
        "item_name",
        "goods",
        "goods_name",
        "package_content",
        "product",
        "product_name",
    ]

    for bagian in sumber:

        for field in fields:

            value = bagian.get(field)

            if value is not None:

                text = str(value).strip()

                if text:
                    return text

    return "Tidak tersedia"


# =========================================================
# FORMAT STATUS
# =========================================================

def format_status(status):

    if not status:
        return "📦 DATA TIDAK TERSEDIA"

    text = str(status).strip()

    lower = text.lower()

    kata_diterima = [
        "delivered",
        "received",
        "diterima",
        "sudah diterima",
        "completed",
    ]

    for kata in kata_diterima:

        if kata in lower:
            return "✅ SUDAH DITERIMA"

    return f"📦 {text}"


# =========================================================
# RIWAYAT
# =========================================================

def format_riwayat(history):

    if not isinstance(history, list):
        return "Tidak tersedia"

    if not history:
        return "Tidak tersedia"

    hasil = []

    # Maksimal 10 riwayat terbaru
    for item in history[:10]:

        if not isinstance(item, dict):
            continue

        tanggal = (
            item.get("date")
            or item.get("datetime")
            or item.get("time")
            or ""
        )

        desc = (
            item.get("desc")
            or item.get("description")
            or item.get("status")
            or "-"
        )

        lokasi = (
            item.get("location")
            or ""
        )

        baris = f"• {tanggal}\n  {desc}"

        if lokasi:
            baris += f"\n  📍 {lokasi}"

        hasil.append(baris)

    if not hasil:
        return "Tidak tersedia"

    return "\n".join(hasil)


# =========================================================
# LACAK RESI
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

        if response.status_code != 200:

            return (
                f"📦 TRACKING SICEPAT\n"
                f"━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n\n"
                f"⚠️ Server tracking sedang bermasalah.\n"
                f"Coba lagi beberapa saat."
            )

        data_api = response.json()

        if data_api.get("status") != 200:

            message = data_api.get(
                "message",
                "Resi tidak ditemukan"
            )

            return (
                f"📦 TRACKING SICEPAT\n"
                f"━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n"
                f"❌ {message}"
            )

        data = data_api.get("data")

        if not isinstance(data, dict):

            return (
                f"📦 TRACKING SICEPAT\n"
                f"━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n"
                f"❌ DATA RESI TIDAK TERSEDIA"
            )

        # -------------------------------------------------
        # DATA UTAMA
        # -------------------------------------------------

        summary = data.get("summary", {})
        detail = data.get("detail", {})

        if not isinstance(summary, dict):
            summary = {}

        if not isinstance(detail, dict):
            detail = {}

        ekspedisi = (
            ambil_field(
                summary,
                "courier",
                "courier_name",
                "expedition"
            )
            or "SiCepat Express"
        )

        service = (
            ambil_field(
                summary,
                "service",
                "service_name",
                "shipment_type"
            )
            or "Tidak tersedia"
        )

        pengirim = (
            ambil_field(
                summary,
                "shipper_name",
                "sender_name",
                "shipper"
            )
            or ambil_field(
                detail,
                "shipper_name",
                "sender_name",
                "shipper"
            )
            or "Tidak tersedia"
        )

        penerima = (
            ambil_field(
                summary,
                "receiver_name",
                "recipient_name",
                "receiver"
            )
            or ambil_field(
                detail,
                "receiver_name",
                "recipient_name",
                "receiver"
            )
            or "Tidak tersedia"
        )

        asal = (
            ambil_field(
                summary,
                "origin"
            )
            or ambil_field(
                detail,
                "origin"
            )
            or "Tidak tersedia"
        )

        tujuan = (
            ambil_field(
                summary,
                "destination"
            )
            or ambil_field(
                detail,
                "destination"
            )
            or "Tidak tersedia"
        )

        status_asli = (
            ambil_field(
                summary,
                "status"
            )
            or ambil_field(
                detail,
                "status"
            )
            or "Tidak tersedia"
        )

        tanggal = (
            ambil_field(
                summary,
                "date",
                "datetime"
            )
            or ambil_field(
                detail,
                "date",
                "datetime"
            )
            or "Tidak tersedia"
        )

        nomor_hp = ambil_nomor_hp(data)

        pembayaran = status_pembayaran(data)

        paket = isi_paket(data)

        history = (
            data.get("history")
            or data.get("histories")
            or []
        )

        riwayat = format_riwayat(history)

        # -------------------------------------------------
        # HASIL
        # -------------------------------------------------

        hasil = (
            "📦 EXPEDISI SICEPAT\n"
            "└ SiCepat Express\n\n"

            "📩 Resi\n"
            f"├ Service : {service}\n"
            f"└ No Resi : {resi}\n\n"

            "📮 Status\n"
            f"└ Status : {status_asli}\n\n"

            "🚀 Pengirim\n"
            f"├ {pengirim}\n"
            f"└ {asal}\n\n"

            "🚩 Penerima\n"
            f"├ {penerima}\n"
            f"└ {tujuan}\n\n"

            "📱 No. HP\n"
            f"└ {nomor_hp}\n\n"

            "📦 Isi Paket\n"
            f"└ {paket}\n\n"

            "💰 Pembayaran\n"
            f"└ {pembayaran}\n\n"

            "📌 Status\n"
            f"└ {format_status(status_asli)}\n\n"

            "⏩ POD / RIWAYAT\n"
            "━━━━━━━━━━━━━━━━\n"
            f"{riwayat}"
        )

        return hasil

    except requests.exceptions.Timeout:

        return (
            f"📦 TRACKING SICEPAT\n"
            f"━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi : {resi}\n\n"
            f"⚠️ REQUEST TIMEOUT.\n"
            f"Server terlalu lama merespons."
        )

    except Exception as error:

        print("ERROR:", error)

        return (
            f"📦 TRACKING SICEPAT\n"
            f"━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi : {resi}\n\n"
            f"⚠️ Terjadi kesalahan saat mengambil data."
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

    # Resi SiCepat biasanya berupa angka.
    # Bisa juga dikirim beberapa sekaligus.
    resi_list = re.findall(
        r"\b\d{10,15}\b",
        teks
    )

    # Hilangkan duplikat
    resi_list = list(dict.fromkeys(resi_list))

    if not resi_list:

        bot.send_message(
            chat_id,
            "⚠️ Nomor resi tidak ditemukan.\n\n"
            "Contoh:\n"
            "004646985892"
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
        f"🔎 Mulai mengecek {len(resi_list)} resi SiCepat.\n\n"
        "⏳ Mohon tunggu..."
    )

    for resi in resi_list:

        print("Cek resi:", resi)

        hasil = lacak_resi(resi)

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

    print("==============================")
    print("📦 BOT TRACKING SICEPAT")
    print("🤖 BOT BERJALAN")
    print("==============================")

    bot.infinity_polling(
        skip_pending=True,
        timeout=30,
        long_polling_timeout=30
    )
