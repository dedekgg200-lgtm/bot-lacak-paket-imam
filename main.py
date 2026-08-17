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

if not TELEGRAM_TOKEN:
    raise ValueError("TELEGRAM_TOKEN belum diisi di Railway")

if not BINDERBYTE_API_KEY:
    raise ValueError("BINDERBYTE_API_KEY belum diisi di Railway")

bot = telebot.TeleBot(TELEGRAM_TOKEN)

API_URL = "https://api.binderbyte.com/v1/track"

# Menyimpan pilihan ekspedisi setiap pengguna
user_courier = {}


# ==========================================
# MENU EKSPEDISI
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

    keyboard.add(
        tombol_sicepat,
        tombol_ninja
    )

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
# TOMBOL EKSPEDISI
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

        user_courier[chat_id] = "sicepat"
        nama = "SiCepat"

    else:

        user_courier[chat_id] = "ninja"
        nama = "Ninja"

    bot.answer_callback_query(call.id)

    bot.send_message(
        chat_id,
        f"✍️ Silakan kirim nomor resi {nama}.\n\n"
        "Bisa 1 sampai 50 resi sekaligus.\n\n"
        "Contoh:\n"
        "2937051252\n"
        "2937051253\n"
        "2937051254"
    )


# ==========================================
# CARI NILAI FIELD
# ==========================================

def cari_field(data, nama_field):

    if not isinstance(data, dict):
        return None

    # Cek langsung
    for key in nama_field:

        if key in data:

            value = data[key]

            if value is not None and str(value).strip() != "":
                return str(value).strip()

    # Cek nested dictionary
    for value in data.values():

        if isinstance(value, dict):

            hasil = cari_field(
                value,
                nama_field
            )

            if hasil:
                return hasil

    return None


# ==========================================
# DATA COD
# ==========================================

def cek_pembayaran(data):

    # Field yang mungkin diberikan API
    field_cod = [
        "cod",
        "is_cod",
        "cod_status",
        "payment",
        "payment_type",
        "payment_method",
        "payment_status"
    ]

    nilai = cari_field(
        data,
        field_cod
    )

    if nilai is None:
        return "Tidak tersedia"

    nilai = nilai.strip().lower()

    # COD
    if nilai in [
        "true",
        "1",
        "yes",
        "ya",
        "cod",
        "cash on delivery"
    ]:
        return "⚠️ COD"

    # NON COD
    if nilai in [
        "false",
        "0",
        "no",
        "tidak",
        "non cod",
        "non-cod",
        "noncod"
    ]:
        return "✅ NON COD"

    # Jika API mengirim kalimat
    if "non" in nilai and "cod" in nilai:
        return "✅ NON COD"

    if "cod" in nilai:
        return "⚠️ COD"

    return "Tidak tersedia"


# ==========================================
# STATUS DITERIMA / BELUM
# ==========================================

def format_status(status):

    if not status:
        return "Tidak tersedia"

    teks = str(status).lower()

    kata_diterima = [
        "delivered",
        "received",
        "diterima",
        "sudah diterima",
        "terkirim",
        "selesai"
    ]

    for kata in kata_diterima:

        if kata in teks:
            return "✅ SUDAH DITERIMA"

    return f"📦 BELUM DITERIMA\n{status}"


# ==========================================
# AMBIL RIWAYAT TERAKHIR
# ==========================================

def ambil_update_terakhir(history):

    if not isinstance(history, list) or len(history) == 0:
        return {
            "kurir": "Tidak tersedia",
            "lokasi": "Tidak tersedia",
            "status": "Tidak tersedia",
            "waktu": "Tidak tersedia"
        }

    # Biasanya BinderByte mengirim update terbaru
    # pada posisi pertama.
    item = history[0]

    if not isinstance(item, dict):
        return {
            "kurir": "Tidak tersedia",
            "lokasi": "Tidak tersedia",
            "status": "Tidak tersedia",
            "waktu": "Tidak tersedia"
        }

    kurir = cari_field(
        item,
        ["courier", "kurir"]
    ) or "Tidak tersedia"

    lokasi = cari_field(
        item,
        ["location", "lokasi"]
    ) or "Tidak tersedia"

    status = cari_field(
        item,
        ["desc", "description", "status"]
    ) or "Tidak tersedia"

    waktu = cari_field(
        item,
        ["date", "time", "datetime"]
    ) or "Tidak tersedia"

    return {
        "kurir": kurir,
        "lokasi": lokasi,
        "status": status,
        "waktu": waktu
    }


# ==========================================
# FORMAT RIWAYAT
# ==========================================

def format_riwayat(history):

    if not isinstance(history, list) or len(history) == 0:

        return "Tidak ada riwayat."

    teks = ""

    # Maksimal 10 update agar pesan tidak terlalu panjang
    for item in history[:10]:

        if not isinstance(item, dict):
            continue

        tanggal = cari_field(
            item,
            ["date", "time", "datetime"]
        ) or "-"

        lokasi = cari_field(
            item,
            ["location", "lokasi"]
        ) or "-"

        keterangan = cari_field(
            item,
            ["desc", "description", "status"]
        ) or "-"

        teks += (
            f"\n🕐 {tanggal}\n"
            f"📍 {lokasi}\n"
            f"   {keterangan}\n"
        )

    if not teks:
        return "Tidak ada riwayat."

    return teks


# ==========================================
# TRACKING SATU RESI
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

        print("================================")
        print("RESI:", resi)
        print("COURIER:", courier)
        print("HTTP:", response.status_code)
        print("RESPONSE:", response.text[:2000])
        print("================================")

        # ==========================================
        # ERROR HTTP
        # ==========================================

        if response.status_code != 200:

            return (
                "❌ GAGAL CEK RESI\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi: {resi}\n"
                f"⚠️ HTTP: {response.status_code}"
            )

        # ==========================================
        # JSON
        # ==========================================

        try:

            api_data = response.json()

        except ValueError:

            return (
                "❌ RESPONS API TIDAK VALID\n\n"
                f"🔢 Resi: {resi}"
            )

        # ==========================================
        # RESI TIDAK DITEMUKAN
        # ==========================================

        if api_data.get("status") != 200:

            pesan = api_data.get(
                "message",
                "Resi tidak ditemukan"
            )

            return (
                "❌ RESI TIDAK DITEMUKAN\n"
                "━━━━━━━━━━━━━━━━\n\n"
                f"🔢 Resi: {resi}\n\n"
                f"⚠️ {pesan}\n\n"
                "Silakan periksa kembali nomor resi."
            )

        # ==========================================
        # DATA
        # ==========================================

        data = api_data.get(
            "data",
            {}
        )

        if not isinstance(data, dict):
            data = {}

        summary = data.get(
            "summary",
            {}
        )

        detail = data.get(
            "detail",
            {}
        )

        history = data.get(
            "history",
            []
        )

        if not isinstance(summary, dict):
            summary = {}

        if not isinstance(detail, dict):
            detail = {}

        # ==========================================
        # RESI
        # ==========================================

        nomor_resi = (
            summary.get("awb")
            or resi
        )

        # ==========================================
        # EKSPEDISI
        # ==========================================

        if courier == "sicepat":

            nama_ekspedisi = "SiCepat"

        elif courier == "ninja":

            nama_ekspedisi = "Ninja"

        else:

            nama_ekspedisi = courier

        # ==========================================
        # LAYANAN
        # ==========================================

        layanan = (
            summary.get("service")
            or "Tidak tersedia"
        )

        # ==========================================
        # STATUS
        # ==========================================

        status_asli = (
            summary.get("status")
            or "Tidak tersedia"
        )

        status = format_status(
            status_asli
        )

        # ==========================================
        # PENGIRIM
        # ==========================================

        pengirim = (
            detail.get("shipper")
            or summary.get("shipper")
            or "Tidak tersedia"
        )

        # ==========================================
        # PENERIMA
        # ==========================================

        penerima = (
            detail.get("receiver")
            or summary.get("receiver")
            or "Tidak tersedia"
        )

        # ==========================================
        # NOMOR HP
        # ==========================================

        nomor_hp = cari_field(
            detail,
            [
                "receiver_phone",
                "receiver_phone_number",
                "phone",
                "phone_number",
                "receiver_telp",
                "telp"
            ]
        )

        if not nomor_hp:
            nomor_hp = cari_field(
                summary,
                [
                    "receiver_phone",
                    "receiver_phone_number",
                    "phone",
                    "phone_number"
                ]
            )

        if not nomor_hp:
            nomor_hp = "Tidak tersedia"

        # ==========================================
        # ALAMAT
        # ==========================================

        alamat = (
            detail.get("destination")
            or detail.get("address")
            or summary.get("destination")
            or "Tidak tersedia"
        )

        # ==========================================
        # ASAL
        # ==========================================

        asal = (
            detail.get("origin")
            or summary.get("origin")
            or "Tidak tersedia"
        )

        # ==========================================
        # ISI PAKET
        # ==========================================

        isi_paket = cari_field(
            detail,
            [
                "content",
                "contents",
                "item",
                "items",
                "package",
                "package_content",
                "goods",
                "goods_name",
                "product",
                "product_name",
                "description"
            ]
        )

        if not isi_paket:

            isi_paket = cari_field(
                summary,
                [
                    "content",
                    "contents",
                    "item",
                    "package",
                    "goods",
                    "goods_name",
                    "product",
                    "product_name"
                ]
            )

        if not isi_paket:
            isi_paket = "Tidak tersedia"

        # ==========================================
        # COD / NON COD
        # ==========================================

        pembayaran = cek_pembayaran(
            data
        )

        # ==========================================
        # BERAT
        # ==========================================

        berat = (
            summary.get("weight")
            or detail.get("weight")
            or "Tidak tersedia"
        )

        # ==========================================
        # NILAI
        # ==========================================

        nilai = (
            summary.get("amount")
            or detail.get("amount")
            or "Tidak tersedia"
        )

        # ==========================================
        # UPDATE TERAKHIR
        # ==========================================

        update = ambil_update_terakhir(
            history
        )

        # ==========================================
        # RIWAYAT
        # ==========================================

        riwayat = format_riwayat(
            history
        )

        # ==========================================
        # HASIL AKHIR
        # ==========================================

        hasil = (
            f"📦 TRACKING {nama_ekspedisi.upper()}\n"
            f"━━━━━━━━━━━━━━━━\n\n"

            f"🔢 Resi       : {nomor_resi}\n"
            f"👤 Penerima   : {penerima}\n"
            f"📱 No. HP     : {nomor_hp}\n"
            f"📤 Pengirim   : {pengirim}\n"
            f"🏠 Alamat     : {alamat}\n\n"

            f"📦 Isi Paket  : {isi_paket}\n"
            f"💰 Pembayaran : {pembayaran}\n"
            f"📌 Status     : {status}\n"
            f"📋 Layanan    : {layanan}\n"
            f"📍 Asal       : {asal}\n"
            f"⚖️ Berat      : {berat}\n"
            f"💵 Nilai      : {nilai}\n\n"

            f"🚚 UPDATE TERAKHIR\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"├ Kurir   : {update['kurir']}\n"
            f"├ Lokasi  : {update['lokasi']}\n"
            f"├ Status  : {update['status']}\n"
            f"└ Waktu   : {update['waktu']}\n\n"

            f"🚚 RIWAYAT\n"
            f"━━━━━━━━━━━━━━━━"
            f"{riwayat}"
        )

        return hasil

    # ==========================================
    # ERROR REQUEST
    # ==========================================

    except requests.exceptions.Timeout:

        return (
            "⏱️ REQUEST TIMEOUT\n"
            "━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}\n\n"
            "Server tracking terlalu lama merespons."
        )

    except requests.exceptions.RequestException as error:

        print(
            "REQUEST ERROR:",
            str(error)
        )

        return (
            "❌ GAGAL TERHUBUNG KE SERVER\n"
            "━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}\n\n"
            "Silakan coba lagi."
        )

    except Exception as error:

        print(
            "ERROR:",
            str(error)
        )

        return (
            "❌ TERJADI KESALAHAN\n"
            "━━━━━━━━━━━━━━━━\n\n"
            f"🔢 Resi: {resi}\n\n"
            f"Error: {str(error)[:150]}"
        )


# ==========================================
# AMBIL BANYAK RESI
# ==========================================

def ambil_semua_resi(teks):

    # Pisahkan berdasarkan spasi, enter, koma,
    # titik koma, atau slash
    kandidat = re.split(
        r"[\s,;\/]+",
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

        # Panjang resi umum
        if 8 <= len(item) <= 30:

            if item not in hasil:
                hasil.append(item)

    return hasil


# ==========================================
# TERIMA RESI
# ==========================================

@bot.message_handler(
    func=lambda message: True
)
def terima_resi(message):

    chat_id = message.chat.id

    # ==========================================
    # BELUM PILIH EKSPEDISI
    # ==========================================

    if chat_id not in user_courier:

        bot.send_message(
            chat_id,
            "⚠️ Pilih ekspedisi terlebih dahulu:",
            reply_markup=menu_ekspedisi()
        )

        return

    courier = user_courier[
        chat_id
    ]

    # ==========================================
    # AMBIL RESI
    # ==========================================

    resi_list = ambil_semua_resi(
        message.text
    )

    # ==========================================
    # TIDAK ADA RESI
    # ==========================================

    if not resi_list:

        bot.send_message(
            chat_id,
            "⚠️ Nomor resi tidak ditemukan.\n\n"
            "Silakan kirim nomor resi yang benar."
        )

        return

    # ==========================================
    # MAKSIMAL 50
    # ==========================================

    if len(resi_list) > 50:

        bot.send_message(
            chat_id,
            f"⚠️ Maksimal 50 resi sekali cek.\n\n"
            f"Kamu mengirim {len(resi_list)} resi.\n"
            "Silakan kirim maksimal 50 resi."
        )

        return

    # ==========================================
    # NAMA EKSPEDISI
    # ==========================================

    if courier == "sicepat":

        nama_ekspedisi = "SiCepat"

    else:

        nama_ekspedisi = "Ninja"

    # ==========================================
    # INFO
    # ==========================================

    bot.send_message(
        chat_id,
        f"🔍 Mulai mengecek {len(resi_list)} resi "
        f"{nama_ekspedisi}.\n\n"
        "⏳ Mohon tunggu..."
    )

    # ==========================================
    # PROSES SATU PER SATU
    # ==========================================

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
                str(error)
            )

            bot.send_message(
                chat_id,
                f"⚠️ Gagal mengirim hasil untuk {resi}."
            )

        # Jeda kecil agar tidak terlalu cepat
        # mengirim banyak request/pesan
        time.sleep(0.3)

    # ==========================================
    # SELESAI
    # ==========================================

    bot.send_message(
        chat_id,
        f"✅ Selesai mengecek "
        f"{len(resi_list)} resi {nama_ekspedisi}.\n\n"
        "Pilih ekspedisi lagi jika ingin melakukan "
        "peng
