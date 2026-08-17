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

# Menyimpan ekspedisi yang dipilih pengguna
user_courier = {}


# ==================================================
# MENU
# ==================================================

def menu_ekspedisi():

    keyboard = types.InlineKeyboardMarkup(row_width=2)

    keyboard.add(
        types.InlineKeyboardButton(
            "🔎 Cari Resi SiCepat",
            callback_data="courier_sicepat"
        ),
        types.InlineKeyboardButton(
            "🔎 Cari Resi Ninja",
            callback_data="courier_ninja"
        )
    )

    return keyboard


# ==================================================
# START
# ==================================================

@bot.message_handler(commands=["start"])
def start(message):

    bot.send_message(
        message.chat.id,
        "👋 Halo! Selamat datang di Bot Tracking Paket.\n\n"
        "Silakan pilih ekspedisi yang ingin dilacak:",
        reply_markup=menu_ekspedisi()
    )


# ==================================================
# PILIH EKSPEDISI
# ==================================================

@bot.callback_query_handler(
    func=lambda call: call.data in [
        "courier_sicepat",
        "courier_ninja"
    ]
)
def pilih_ekspedisi(call):

    chat_id = call.message.chat.id

    if call.data == "courier_sicepat":

        user_courier[chat_id] = "sicepat"
        nama = "SiCepat"

    else:

        user_courier[chat_id] = "ninja"
        nama = "Ninja"

    bot.answer_callback_query(call.id)

    bot.send_message(
        chat_id,
        f"✍️ Kirim nomor resi {nama}.\n\n"
        "Bisa 1 sampai maksimal 50 resi sekaligus.\n"
        "Pisahkan dengan enter, spasi, atau koma.\n\n"
        "Contoh:\n"
        "2937051252\n"
        "2937051253"
    )


# ==================================================
# SENSOR NOMOR HP
# ==================================================

def sensor_nomor_hp(nomor):

    if not nomor:
        return "Tidak tersedia"

    nomor = str(nomor).strip()

    # Hanya angka
    nomor = re.sub(r"\D", "", nomor)

    if not nomor:
        return "Tidak tersedia"

    if len(nomor) <= 6:
        return "*" * len(nomor)

    # Contoh:
    # 081234567890
    # menjadi:
    # 0812******90

    jumlah_bintang = len(nomor) - 6

    return (
        nomor[:4]
        + ("*" * jumlah_bintang)
        + nomor[-2:]
    )


# ==================================================
# AMBIL FIELD
# ==================================================

def ambil_field(data, fields):

    if not isinstance(data, dict):
        return None

    for field in fields:

        value = data.get(field)

        if value is not None and str(value).strip() != "":
            return str(value).strip()

    return None


# ==================================================
# NOMOR HP
# ==================================================

def ambil_nomor_hp(data):

    summary = data.get("summary", {})
    detail = data.get("detail", {})

    nomor = None

    if isinstance(detail, dict):

        nomor = (
            detail.get("receiver_phone")
            or detail.get("receiver_phone_number")
            or detail.get("phone")
            or detail.get("phone_number")
        )

    if not nomor and isinstance(summary, dict):

        nomor = (
            summary.get("receiver_phone")
            or summary.get("receiver_phone_number")
            or summary.get("phone")
            or summary.get("phone_number")
        )

    return sensor_nomor_hp(nomor)


# ==================================================
# STATUS PEMBAYARAN
# ==================================================

def status_pembayaran(data):

    """
    Tidak menebak status pembayaran.

    Hanya membaca informasi pembayaran yang
    benar-benar diberikan API.
    """

    summary = data.get("summary", {})
    detail = data.get("detail", {})

    sumber = []

    if isinstance(summary, dict):
        sumber.append(summary)

    if isinstance(detail, dict):
        sumber.append(detail)

    fields = [
        "payment_status",
        "payment_state",
        "payment",
        "payment_method",
        "payment_type",
        "cod_status"
    ]

    for bagian in sumber:

        for field in fields:

            value = bagian.get(field)

            if value is None:
                continue

            text = str(value).strip().lower()

            if not text:
                continue

            # Sudah dibayar
            if text in [
                "paid",
                "sudah dibayar",
                "sudah bayar",
                "dibayar",
                "lunas",
                "settled"
            ]:
                return "✅ SUDAH DIBAYAR"

            # Belum dibayar
            if text in [
                "unpaid",
                "belum dibayar",
                "belum bayar",
                "menunggu pembayaran",
                "pending",
                "waiting payment",
                "waiting for payment"
            ]:
                return "⏳ MENUNGGU PEMBAYARAN"

            if "menunggu pembayaran" in text:
                return "⏳ MENUNGGU PEMBAYARAN"

            if "belum dibayar" in text:
                return "⏳ MENUNGGU PEMBAYARAN"

            if "sudah dibayar" in text:
                return "✅ SUDAH DIBAYAR"

            if "paid" in text:
                return "✅ SUDAH DIBAYAR"

    return "⚪ DATA TIDAK TERSEDIA"


# ==================================================
# ISI PAKET
# ==================================================

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
        "product_name"
    ]

    for bagian in sumber:

        for field in fields:

            value = bagian.get(field)

            if value is None:
                continue

            text = str(value).strip()

            if text:
                return text

    return "Tidak tersedia"


# ==================================================
# STATUS PAKET
# ==================================================

def format_status(status):

    if not status:
        return "⚪ DATA TIDAK TERSEDIA"

    text = str(status).strip()
    lower = text.lower()

    kata_diterima = [
        "delivered",
        "received",
        "diterima",
        "sudah diterima",
        "completed"
    ]

    for kata in kata_diterima:

        if kata in lower:
            return "✅ SUDAH DITERIMA"

    return f"📦 BELUM DITERIMA\n{text}"


# ==================================================
# RIWAYAT
# ==================================================

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
            or item.get("time")
            or "-"
        )

        lokasi = (
            item.get("location")
            or "-"
        )

        keterangan = (
            item.get("desc")
            or item.get("description")
            or item.get("status")
            or "-"
        )

        hasil.append(
            f"• {tanggal}\n"
            f"  {keterangan}\n"
            f"  📍 {lokasi}"
        )

    if not hasil:
        return "Tidak tersedia"

    return "\n".join(hasil)


# ==================================================
# TRACKING
# ==================================================

def lacak_resi(resi, courier):

    try:

        params = {
            "api_key": BINDERBYTE_API_KEY,
            "courier": courier,
            "awb": resi
        }

        response = requests.get(
            API_URL,
            params=params,
            timeout=30
        )

        print("================================")
        print("RESI:", resi)
        print("COURIER:", courier)
        print("HTTP:", response.status_code)
        print("RESPONSE:", response.text[:2000])
        print("================================")

        if response.status_code == 401:

            return (
                "❌ API KEY TIDAK VALID\n\n"
                f"🔢 Resi: {resi}"
            )

        if response.status_code != 200:

            return (
                "❌ GAGAL MENGECEK RESI\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi: {resi}\n"
                f"HTTP: {response.status_code}"
            )

        try:

            result = response.json()

        except Exception:

            return (
                "❌ RESPONSE API TIDAK VALID\n\n"
                f"🔢 Resi: {resi}"
            )

        if result.get("status") != 200:

            pesan = result.get(
                "message",
                "Resi tidak ditemukan"
            )

            return (
                "❌ RESI TIDAK DITEMUKAN\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n\n"
                f"⚠️ {pesan}"
            )

        data = result.get("data", {})

        if not isinstance(data, dict):

            return (
                "❌ DATA RESI TIDAK TERSEDIA\n\n"
                f"🔢 Resi: {resi}"
            )

        summary = data.get("summary", {})
        detail = data.get("detail", {})
        history = data.get("history", [])

        if not isinstance(summary, dict):
            summary = {}

        if not isinstance(detail, dict):
            detail = {}

        # ------------------------------
        # RESI
        # ------------------------------

        nomor_resi = (
            summary.get("awb")
            or resi
        )

        # ------------------------------
        # PENERIMA
        # ------------------------------

        penerima = (
            detail.get("receiver")
            or detail.get("receiver_name")
            or summary.get("receiver")
            or summary.get("receiver_name")
            or "Tidak tersedia"
        )

        # ------------------------------
        # PENGIRIM
        # ------------------------------

        pengirim = (
            detail.get("shipper")
            or detail.get("shipper_name")
            or summary.get("shipper")
            or summary.get("shipper_name")
            or "Tidak tersedia"
        )

        # ------------------------------
        # ALAMAT
        # ------------------------------

        alamat = (
            detail.get("destination")
            or detail.get("destination_address")
            or detail.get("receiver_address")
            or detail.get("address")
            or summary.get("destination")
            or "Tidak tersedia"
        )

        # ------------------------------
        # NOMOR HP
        # ------------------------------

        nomor_hp = ambil_nomor_hp(data)

        # ------------------------------
        # ISI PAKET
        # ------------------------------

        barang = isi_paket(data)

        # ------------------------------
        # STATUS
        # ------------------------------

        status_asli = (
            summary.get("status")
            or detail.get("status")
            or "Tidak tersedia"
        )

        status = format_status(status_asli)

        # ------------------------------
        # PEMBAYARAN
        # ------------------------------

        pembayaran = status_pembayaran(data)

        # ------------------------------
        # LAYANAN
        # ------------------------------

        layanan = (
            summary.get("service")
            or detail.get("service")
            or "Tidak tersedia"
        )

        # ------------------------------
        # TANGGAL
        # ------------------------------

        tanggal = (
            summary.get("date")
            or detail.get("date")
            or "Tidak tersedia"
        )

        # ------------------------------
        # EKSPEDISI
        # ------------------------------

        if courier == "sicepat":
            nama_ekspedisi = "SICEPAT"
        else:
            nama_ekspedisi = "NINJA"

        # ------------------------------
        # RIWAYAT
        # ------------------------------

        riwayat = format_riwayat(history)

        # ------------------------------
        # HASIL
        # ------------------------------

        return (
            f"📦 TRACKING {nama_ekspedisi}\n"
            f"━━━━━━━━━━━━━━━━\n\n"

            f"🔢 Resi       : {nomor_resi}\n"
            f"👤 Penerima   : {penerima}\n"
            f"📱 No. HP     : {nomor_hp}\n"
            f"📤 Pengirim   : {pengirim}\n"
            f"🏠 Alamat     : {alamat}\n\n"

            f"📦 Isi Paket  : {barang}\n"
            f"💰 Pembayaran : {pembayaran}\n"
            f"📌 Status     : {status}\n"
            f"📋 Layanan    : {layanan}\n"
            f"📅 Tanggal    : {tanggal}\n\n"

            f"🚚 RIWAYAT\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"{riwayat}"
        )

    except requests.exceptions.Timeout:

        return (
            "⏱️ SERVER TIMEOUT\n"
            "━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}\n\n"
            "Server terlalu lama merespons."
        )

    except requests.exceptions.RequestException:

        return (
            "❌ GAGAL TERHUBUNG KE SERVER\n"
            "━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}"
        )

    except Exception as error:

        print("ERROR:", error)

        return (
            "❌ TERJADI KESALAHAN\n"
            "━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}\n\n"
            f"{str(error)[:150]}"
        )


# ==================================================
# AMBIL MAKSIMAL 50 RESI
# ==================================================

def ambil_semua_resi(teks):

    kandidat = re.split(
        r"[\s,;]+",
        teks.upper().strip()
    )

    hasil = []

    for item in kandidat:

        item = re.sub(
            r"[^A-Z0-9]",
            "",
            item
        )

        if 8 <= len(item) <= 30:

            if item not in hasil:
                hasil.append(item)

    return hasil


# ==================================================
# TERIMA RESI
# ==================================================

@bot.message_handler(func=lambda message: True)
def terima_resi(message):

    chat_id = message.chat.id

    if chat_id not in user_courier:

        bot.send_message(
            chat_id,
            "⚠️ Pilih ekspedisi terlebih dahulu:",
            reply_markup=menu_ekspedisi()
        )

        return

    courier = user_courier[chat_id]

    resi_list = ambil_semua_resi(
        message.text or ""
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
            f"⚠️ Maksimal 50 resi sekali cek.\n\n"
            f"Kamu mengirim {len(resi_list)} resi."
        )

        return

    nama = (
        "SiCepat"
        if courier == "sicepat"
        else "Ninja"
    )

    bot.send_message(
        chat_id,
        f"🔍 Mulai mengecek {len(resi_list)} resi {nama}.\n\n"
        "⏳ Mohon tunggu..."
    )

    for nomor, resi in enumerate(
        resi_list,
        start=1
    ):

        print(
            f"Cek {nomor}/{len(resi_list)}: {resi}"
        )

        hasil = lacak_resi(
            resi,
            courier
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


# ==================================================
# JALANKAN BOT
# ==================================================

if __name__ == "__main__":

    print("==============================")
    print("📦 BOT TRACKING SICEPAT + NINJA")
    print("🤖 BOT BERJALAN")
    print("==============================")

    bot.infinity_polling(
        skip_pending=True,
        timeout=30,
        long_polling_timeout=30
    )
