import os
import re
import time
import requests
import telebot
from telebot import types

# ==============================
# CONFIG
# ==============================

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
BINDERBYTE_API_KEY = os.getenv("BINDERBYTE_API_KEY")

API_URL = "https://api.binderbyte.com/v1/track"

if not TELEGRAM_TOKEN:
    raise ValueError("TELEGRAM_TOKEN belum diisi di Railway")

if not BINDERBYTE_API_KEY:
    raise ValueError("BINDERBYTE_API_KEY belum diisi di Railway")

bot = telebot.TeleBot(TELEGRAM_TOKEN)

# Menyimpan pilihan ekspedisi user
user_courier = {}


# ==============================
# MENU EKSPEDISI
# ==============================

def menu_ekspedisi():
    keyboard = types.InlineKeyboardMarkup(row_width=2)

    keyboard.add(
        types.InlineKeyboardButton(
            "🔎 Cari Resi SiCepat",
            callback_data="sicepat"
        ),
        types.InlineKeyboardButton(
            "🔎 Cari Resi Ninja",
            callback_data="ninja"
        )
    )

    return keyboard


# ==============================
# START
# ==============================

@bot.message_handler(commands=["start"])
def start(message):
    bot.send_message(
        message.chat.id,
        "👋 Halo! Selamat datang di Bot Tracking Paket.\n\n"
        "Silakan pilih ekspedisi yang ingin dilacak:",
        reply_markup=menu_ekspedisi()
    )


# ==============================
# PILIH EKSPEDISI
# ==============================

@bot.callback_query_handler(func=lambda call: call.data in ["sicepat", "ninja"])
def pilih_ekspedisi(call):

    chat_id = call.message.chat.id

    user_courier[chat_id] = call.data

    nama = "SiCepat" if call.data == "sicepat" else "Ninja"

    bot.answer_callback_query(call.id)

    bot.send_message(
        chat_id,
        f"✍️ Masukkan nomor resi {nama}.\n\n"
        "Bisa 1 sampai maksimal 50 resi.\n"
        "Pisahkan dengan enter, spasi, atau koma.\n\n"
        "Contoh:\n"
        "2937051252\n"
        "2937051253"
    )


# ==============================
# AMBIL NILAI
# ==============================

def get_value(data, keys):

    if not isinstance(data, dict):
        return None

    for key in keys:
        value = data.get(key)

        if value is not None and str(value).strip():
            return str(value).strip()

    return None


# ==============================
# PEMBAYARAN
# ==============================

def cek_pembayaran(data):

    """
    Pembayaran hanya berdasarkan data yang
    benar-benar dikirim oleh API.

    Tidak menebak berdasarkan harga, layanan,
    atau nomor resi.
    """

    candidates = []

    if isinstance(data, dict):

        for bagian in [
            data.get("summary", {}),
            data.get("detail", {})
        ]:

            if isinstance(bagian, dict):

                for key in [
                    "payment",
                    "payment_status",
                    "payment_type",
                    "payment_method",
                    "cod",
                    "cod_status",
                    "is_cod"
                ]:

                    if key in bagian:
                        candidates.append(bagian[key])

    for value in candidates:

        if value is None:
            continue

        text = str(value).strip().lower()

        # COD
        if text in [
            "cod",
            "true",
            "1",
            "yes",
            "cash on delivery"
        ]:
            return "⚠️ COD"

        # NON COD
        if text in [
            "non cod",
            "non-cod",
            "noncod",
            "false",
            "0",
            "no",
            "prepaid"
        ]:
            return "✅ NON COD"

        # Status pembayaran yang jelas
        if "menunggu" in text and "bayar" in text:
            return "⏳ MENUNGGU PEMBAYARAN"

        if "belum" in text and "bayar" in text:
            return "⏳ MENUNGGU PEMBAYARAN"

        if "sudah" in text and "bayar" in text:
            return "✅ SUDAH DIBAYAR"

        if "paid" in text:
            return "✅ SUDAH DIBAYAR"

        if "unpaid" in text:
            return "⏳ MENUNGGU PEMBAYARAN"

    return "⚪ DATA TIDAK TERSEDIA"


# ==============================
# STATUS PAKET
# ==============================

def format_status(status):

    if not status:
        return "⚪ DATA TIDAK TERSEDIA"

    text = str(status).lower()

    kata_diterima = [
        "delivered",
        "received",
        "diterima",
        "sudah diterima",
        "completed"
    ]

    for kata in kata_diterima:

        if kata in text:
            return "✅ SUDAH DITERIMA"

    return f"📦 BELUM DITERIMA\n{text}"


# ==============================
# ISI PAKET
# ==============================

def ambil_isi_paket(data):

    """
    Hanya membaca field yang memang berhubungan
    dengan barang/isi paket.

    Tidak membaca desc/history supaya
    'ITEM HAS BEEN DELIVERED' tidak dianggap
    sebagai nama barang.
    """

    bagian_list = []

    if isinstance(data, dict):

        if isinstance(data.get("summary"), dict):
            bagian_list.append(data["summary"])

        if isinstance(data.get("detail"), dict):
            bagian_list.append(data["detail"])

    field_barang = [
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

    for bagian in bagian_list:

        for field in field_barang:

            value = bagian.get(field)

            if value is not None and str(value).strip():

                text = str(value).strip()

                # Jangan mengambil teks status
                status_words = [
                    "item has been delivered",
                    "package has been delivered",
                    "delivered",
                    "paket dibawa kurir",
                    "paket telah diterima"
                ]

                if text.lower() in status_words:
                    continue

                return text

    return "Tidak tersedia"


# ==============================
# RIWAYAT
# ==============================

def format_riwayat(history):

    if not isinstance(history, list) or not history:
        return "Tidak tersedia"

    hasil = []

    for item in history[:10]:

        if not isinstance(item, dict):
            continue

        tanggal = get_value(
            item,
            ["date", "datetime", "time"]
        ) or "-"

        lokasi = get_value(
            item,
            ["location", "lokasi"]
        ) or "-"

        keterangan = get_value(
            item,
            ["desc", "description", "status"]
        ) or "-"

        hasil.append(
            f"• {tanggal}\n"
            f"  {keterangan}\n"
            f"  📍 {lokasi}"
        )

    if not hasil:
        return "Tidak tersedia"

    return "\n".join(hasil)


# ==============================
# TRACKING
# ==============================

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
                f"Resi: {resi}"
            )

        if response.status_code != 200:

            return (
                "❌ GAGAL MENGECEK RESI\n\n"
                f"Resi: {resi}\n"
                f"HTTP: {response.status_code}"
            )

        try:
            result = response.json()

        except Exception:

            return (
                "❌ RESPONSE API TIDAK VALID\n\n"
                f"Resi: {resi}"
            )

        # ==============================
        # RESI TIDAK DITEMUKAN
        # ==============================

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
                f"🔢 Resi : {resi}"
            )

        summary = data.get("summary", {})
        detail = data.get("detail", {})
        history = data.get("history", [])

        if not isinstance(summary, dict):
            summary = {}

        if not isinstance(detail, dict):
            detail = {}

        # ==============================
        # DATA
        # ==============================

        nomor_resi = (
            summary.get("awb")
            or resi
        )

        penerima = (
            detail.get("receiver")
            or detail.get("receiver_name")
            or summary.get("receiver")
            or "Tidak tersedia"
        )

        pengirim = (
            detail.get("shipper")
            or detail.get("shipper_name")
            or summary.get("shipper")
            or "Tidak tersedia"
        )

        alamat = (
            detail.get("destination")
            or detail.get("destination_address")
            or detail.get("address")
            or "Tidak tersedia"
        )

        layanan = (
            summary.get("service")
            or "Tidak tersedia"
        )

        status_asli = (
            summary.get("status")
            or "Tidak tersedia"
        )

        tanggal = (
            summary.get("date")
            or "Tidak tersedia"
        )

        isi_paket = ambil_isi_paket(data)

        pembayaran = cek_pembayaran(data)

        status = format_status(status_asli)

        riwayat = format_riwayat(history)

        nama_ekspedisi = (
            "SiCepat"
            if courier == "sicepat"
            else "Ninja"
        )

        # ==============================
        # HASIL
        # ==============================

        return (
            f"📦 TRACKING {nama_ekspedisi.upper()}\n"
            f"━━━━━━━━━━━━━━━━\n\n"

            f"🔢 Resi       : {nomor_resi}\n"
            f"👤 Penerima   : {penerima}\n"
            f"📤 Pengirim   : {pengirim}\n"
            f"🏠 Alamat     : {alamat}\n\n"

            f"📦 Isi Paket  : {isi_paket}\n"
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
            "⏱️ SERVER TIMEOUT\n\n"
            f"Resi: {resi}\n"
            "Silakan coba lagi."
        )

    except requests.exceptions.RequestException:

        return (
            "❌ GAGAL TERHUBUNG KE SERVER\n\n"
            f"Resi: {resi}"
        )

    except Exception as error:

        print("ERROR:", error)

        return (
            "❌ TERJADI KESALAHAN\n\n"
            f"Resi: {resi}\n"
            f"{str(error)[:150]}"
        )


# ==============================
# AMBIL BANYAK RESI
# ==============================

def ambil_resi(teks):

    bagian = re.split(
        r"[\s,;]+",
        teks.upper().strip()
    )

    hasil = []

    for item in bagian:

        item = re.sub(
            r"[^A-Z0-9]",
            "",
            item
        )

        if 8 <= len(item) <= 30:

            if item not in hasil:
                hasil.append(item)

    return hasil


# ==============================
# PESAN RESI
# ==============================

@bot.message_handler(func=lambda message: True)
def terima_resi(message):

    chat_id = message.chat.id

    if chat_id not in user_courier:

        bot.send_message(
            chat_id,
            "⚠️ Silakan pilih ekspedisi terlebih dahulu.",
            reply_markup=menu_ekspedisi()
        )

        return

    courier = user_courier[chat_id]

    resi_list = ambil_resi(
        message.text or ""
    )

    if not resi_list:

        bot.send_message(
            chat_id,
            "⚠️ Nomor resi tidak ditemukan.\n\n"
            "Silakan kirim nomor resi yang benar."
        )

        return

    # Maksimal 50
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
        f"🔍 Mengecek {len(resi_list)} resi {nama}...\n\n"
        "⏳ Mohon tunggu."
    )

    # ==============================
    # CEK SATU PER SATU
    # ==============================

    for resi in resi_list:

        hasil = lacak_resi(
            resi,
            courier
        )

        bot.send_message(
            chat_id,
            hasil
        )

        time.sleep(0.5)

    bot.send_message(
        chat_id,
        "✅ Semua resi selesai dicek.\n\n"
        "Pilih ekspedisi untuk pengecekan berikutnya:",
        reply_markup=menu_ekspedisi()
    )


# ==============================
# RUN
# ==============================

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
