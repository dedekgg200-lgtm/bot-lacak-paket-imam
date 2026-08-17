import os
import re
import time
import requests
import telebot
from telebot import types

# ==========================================
# CONFIG
# ==========================================

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
BINDERBYTE_API_KEY = os.getenv("BINDERBYTE_API_KEY")

API_URL = "https://api.binderbyte.com/v1/track"

if not TELEGRAM_TOKEN:
    raise ValueError("TELEGRAM_TOKEN belum diisi di Railway")

if not BINDERBYTE_API_KEY:
    raise ValueError("BINDERBYTE_API_KEY belum diisi di Railway")

bot = telebot.TeleBot(TELEGRAM_TOKEN)

# Menyimpan pilihan ekspedisi setiap user
user_courier = {}


# ==========================================
# MENU
# ==========================================

def menu_ekspedisi():
    keyboard = types.InlineKeyboardMarkup(row_width=2)

    tombol_sicepat = types.InlineKeyboardButton(
        "🔎 Cari Resi SiCepat",
        callback_data="courier_sicepat"
    )

    tombol_ninja = types.InlineKeyboardButton(
        "🔎 Cari Resi Ninja",
        callback_data="courier_ninja"
    )

    keyboard.add(tombol_sicepat, tombol_ninja)

    return keyboard


# ==========================================
# START
# ==========================================

@bot.message_handler(commands=["start"])
def start(message):

    bot.send_message(
        message.chat.id,
        "👋 Halo! Selamat datang di Bot Tracking Paket.\n\n"
        "Silakan pilih ekspedisi yang ingin dilacak:",
        reply_markup=menu_ekspedisi()
    )


# ==========================================
# PILIH EKSPEDISI
# ==========================================

@bot.callback_query_handler(
    func=lambda call: call.data in [
        "courier_sicepat",
        "courier_ninja"
    ]
)
def pilih_ekspedisi(call):

    chat_id = call.message.chat.id

    if call.data == "courier_sicepat":
        courier = "sicepat"
        nama = "SiCepat"

    else:
        courier = "ninja"
        nama = "Ninja"

    user_courier[chat_id] = courier

    bot.answer_callback_query(call.id)

    bot.send_message(
        chat_id,
        f"✍️ Silakan kirim nomor resi {nama}.\n\n"
        "Bisa 1 sampai maksimal 50 resi sekaligus.\n"
        "Pisahkan dengan enter, spasi, koma, atau baris baru.\n\n"
        "Contoh:\n"
        "2937051252\n"
        "2937051253\n"
        "2937051254"
    )


# ==========================================
# CARI FIELD DARI RESPONSE API
# ==========================================

def cari_field(data, nama_field):

    if not isinstance(data, dict):
        return None

    # Cek langsung
    for key, value in data.items():

        if key.lower() in nama_field:

            if value is not None and str(value).strip() != "":
                return str(value).strip()

    # Cek dictionary di dalam dictionary
    for value in data.values():

        if isinstance(value, dict):

            hasil = cari_field(value, nama_field)

            if hasil:
                return hasil

    # Cek list
    for value in data.values():

        if isinstance(value, list):

            for item in value:

                if isinstance(item, dict):

                    hasil = cari_field(item, nama_field)

                    if hasil:
                        return hasil

    return None


# ==========================================
# CEK COD / NON COD
# ==========================================

def cek_pembayaran(data):

    field_cod = [
        "cod",
        "is_cod",
        "cod_status",
        "payment_status",
        "payment_method",
        "payment_type",
        "transaction_type"
    ]

    nilai = cari_field(data, field_cod)

    if not nilai:
        return "⚪ TIDAK TERSEDIA"

    teks = nilai.lower().strip()

    # COD
    if teks in [
        "true",
        "1",
        "yes",
        "ya",
        "cod",
        "cash on delivery",
        "cash_on_delivery"
    ]:
        return "⚠️ COD"

    if "cash on delivery" in teks:
        return "⚠️ COD"

    if teks == "cod":
        return "⚠️ COD"

    # NON COD
    if teks in [
        "false",
        "0",
        "no",
        "tidak",
        "non cod",
        "non-cod",
        "noncod",
        "prepaid"
    ]:
        return "✅ NON COD"

    if "non cod" in teks or "non-cod" in teks:
        return "✅ NON COD"

    return "⚪ " + nilai


# ==========================================
# FORMAT STATUS
# ==========================================

def format_status(status):

    if not status:
        return "⚪ TIDAK TERSEDIA"

    teks = str(status).lower()

    diterima = [
        "delivered",
        "received",
        "diterima",
        "sudah diterima",
        "selesai",
        "completed"
    ]

    for kata in diterima:

        if kata in teks:
            return "✅ SUDAH DITERIMA"

    return f"📦 BELUM DITERIMA\n{status}"


# ==========================================
# AMBIL RIWAYAT
# ==========================================

def format_riwayat(history):

    if not isinstance(history, list) or len(history) == 0:
        return "Tidak tersedia"

    hasil = []

    # Batasi agar pesan Telegram tidak terlalu panjang
    for item in history[:15]:

        if not isinstance(item, dict):
            continue

        tanggal = (
            item.get("date")
            or item.get("datetime")
            or item.get("time")
            or "-"
        )

        keterangan = (
            item.get("desc")
            or item.get("description")
            or item.get("status")
            or "-"
        )

        lokasi = (
            item.get("location")
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


# ==========================================
# TRACKING 1 RESI
# ==========================================

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

        print("HTTP:", response.status_code)
        print("RESPONSE:", response.text[:1000])

        if response.status_code == 401:
            return (
                f"❌ GAGAL AKSES API\n\n"
                f"Resi: {resi}\n\n"
                "API Key BinderByte tidak valid atau belum aktif."
            )

        if response.status_code != 200:
            return (
                f"❌ GAGAL TERHUBUNG\n\n"
                f"Resi: {resi}\n"
                f"Kode HTTP: {response.status_code}"
            )

        try:
            data = response.json()
        except Exception:
            return (
                f"❌ RESPONSE API TIDAK VALID\n\n"
                f"Resi: {resi}"
            )

        # Status API
        if data.get("status") != 200:

            pesan = data.get(
                "message",
                "Resi tidak ditemukan"
            )

            return (
                f"❌ RESI TIDAK DITEMUKAN\n"
                f"━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi : {resi}\n"
                f"📢 {pesan}"
            )

        detail = data.get("data", {})

        if not detail:
            return (
                f"❌ DATA RESI TIDAK DITEMUKAN\n\n"
                f"🔢 Resi : {resi}"
            )

        # Nama ekspedisi
        if courier == "sicepat":
            nama_ekspedisi = "SiCepat"
        else:
            nama_ekspedisi = "Ninja"

        # ==========================
        # AMBIL DATA
        # ==========================

        penerima = cari_field(
            detail,
            [
                "receiver",
                "receiver_name",
                "consignee",
                "recipient",
                "recipient_name",
                "penerima"
            ]
        ) or "Tidak tersedia dari API"

        pengirim = cari_field(
            detail,
            [
                "shipper",
                "shipper_name",
                "sender",
                "sender_name",
                "pengirim"
            ]
        ) or "Tidak tersedia dari API"

        nomor_hp = cari_field(
            detail,
            [
                "receiver_phone",
                "recipient_phone",
                "phone",
                "phone_number",
                "telephone",
                "telp",
                "mobile"
            ]
        ) or "Tidak tersedia dari API"

        alamat = cari_field(
            detail,
            [
                "destination",
                "destination_address",
                "receiver_address",
                "address",
                "alamat",
                "origin"
            ]
        ) or "Tidak tersedia dari API"

        isi_paket = cari_field(
            detail,
            [
                "item",
                "item_name",
                "goods",
                "goods_name",
                "package",
                "package_content",
                "content",
                "description",
                "desc",
                "product",
                "product_name"
            ]
        ) or "Tidak tersedia dari API"

        status_asli = cari_field(
            detail,
            [
                "status",
                "current_status"
            ]
        ) or "Tidak tersedia"

        tanggal = cari_field(
            detail,
            [
                "date",
                "tanggal"
            ]
        ) or "Tidak tersedia"

        layanan = cari_field(
            detail,
            [
                "service",
                "service_type",
                "layanan"
            ]
        ) or "Tidak tersedia"

        history = detail.get("history", [])

        pembayaran = cek_pembayaran(detail)

        status = format_status(status_asli)

        riwayat = format_riwayat(history)

        # ==========================
        # HASIL
        # ==========================

        hasil = (
            f"📦 TRACKING {nama_ekspedisi.upper()}\n"
            f"━━━━━━━━━━━━━━━━\n\n"

            f"🔢 Resi       : {resi}\n"
            f"👤 Penerima   : {penerima}\n"
            f"📱 No. HP     : {nomor_hp}\n"
            f"📤 Pengirim   : {pengirim}\n"
            f"🏠 Alamat     : {alamat}\n\n"

            f"📦 Isi Paket  : {isi_paket}\n"
            f"💰 Pembayaran : {pembayaran}\n"
            f"📌 Status     : {status}\n"
            f"📅 Tanggal    : {tanggal}\n"
            f"🚚 Layanan    : {layanan}\n\n"

            f"🚚 RIWAYAT\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"{riwayat}"
        )

        return hasil

    except requests.exceptions.Timeout:

        return (
            f"⏱️ REQUEST TIMEOUT\n"
            f"━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}\n\n"
            "Server terlalu lama merespons. "
            "Silakan coba lagi."
        )

    except requests.exceptions.RequestException as error:

        print("REQUEST ERROR:", error)

        return (
            f"❌ GAGAL TERHUBUNG KE SERVER\n"
            f"━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}\n"
            "Silakan coba lagi."
        )

    except Exception as error:

        print("ERROR:", error)

        return (
            f"❌ TERJADI KESALAHAN\n"
            f"━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}\n"
            f"Error: {str(error)[:150]}"
        )


# ==========================================
# AMBIL BANYAK RESI
# ==========================================

def ambil_semua_resi(teks):

    # Pisahkan berdasarkan spasi, koma, enter, titik koma
    kandidat = re.split(
        r"[\s,;]+",
        teks.upper().strip()
    )

    hasil = []

    for item in kandidat:

        item = item.strip()

        if not item:
            continue

        # Hanya huruf dan angka
        item = re.sub(
            r"[^A-Z0-9]",
            "",
            item
        )

        # Panjang resi
        if 8 <= len(item) <= 30:

            if item not in hasil:
                hasil.append(item)

    return hasil


# ==========================================
# TERIMA RESI
# ==========================================

@bot.message_handler(func=lambda message: True)
def terima_resi(message):

    chat_id = message.chat.id

    # Pastikan user sudah memilih ekspedisi
    if chat_id not in user_courier:

        bot.send_message(
            chat_id,
            "⚠️ Pilih ekspedisi terlebih dahulu:",
            reply_markup=menu_ekspedisi()
        )

        return

    courier = user_courier[chat_id]

    if courier == "sicepat":
        nama_ekspedisi = "SiCepat"
    else:
        nama_ekspedisi = "Ninja"

    resi_list = ambil_semua_resi(
        message.text or ""
    )

    # Tidak ada resi
    if not resi_list:

        bot.send_message(
            chat_id,
            "⚠️ Nomor resi tidak ditemukan.\n\n"
            "Silakan kirim nomor resi yang benar."
        )

        return

    # Maksimal 50 resi
    if len(resi_list) > 50:

        bot.send_message(
            chat_id,
            f"⚠️ Maksimal 50 resi sekali cek.\n\n"
            f"Kamu mengirim {len(resi_list)} resi.\n"
            "Silakan kirim maksimal 50 resi."
        )

        return

    bot.send_message(
        chat_id,
        f"🔎 Mulai mengecek {len(resi_list)} resi {nama_ekspedisi}.\n\n"
        "⏳ Mohon tunggu..."
    )

    # Proses satu per satu
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

            bot.send_message(
                chat_id,
                f"⚠️ Gagal mengirim hasil untuk {resi}"
            )

        # Jeda supaya tidak terlalu cepat
        time.sleep(0.5)

    bot.send_message(
        chat_id,
        "✅ Selesai mengecek semua resi.\n\n"
        "Kalau ingin cek ekspedisi lain, "
        "gunakan tombol di bawah:",
        reply_markup=menu_ekspedisi()
    )


# ==========================================
# JALANKAN BOT
# ==========================================

if __name__ == "__main__":

    print("==============================")
    print("📦 BOT TRACKING PAKET")
    print("🤖 Telegram Bot sedang berjalan")
    print("==============================")

    bot.infinity_polling(
        skip_pending=True,
        timeout=30,
        long_polling_timeout=30
    )
