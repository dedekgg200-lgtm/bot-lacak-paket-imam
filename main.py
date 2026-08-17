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
BINDERBYTE_API_KEY = os.getenv("BINDERBYTE_API_KEY")

API_URL = "https://api.binderbyte.com/v1/track"

if not TELEGRAM_TOKEN:
    raise ValueError("TELEGRAM_TOKEN belum diisi di Railway")

if not BINDERBYTE_API_KEY:
    raise ValueError("BINDERBYTE_API_KEY belum diisi di Railway")

bot = telebot.TeleBot(TELEGRAM_TOKEN)


# =========================================================
# SENSOR NOMOR HP
# =========================================================

def sensor_nomor_hp(nomor):

    if not nomor:
        return "Tidak tersedia"

    nomor = str(nomor).strip()

    # Hanya simpan angka
    nomor = re.sub(r"[^0-9+]", "", nomor)

    if not nomor:
        return "Tidak tersedia"

    # Kalau terlalu pendek, jangan dipaksakan
    if len(nomor) <= 6:
        return nomor

    # Contoh:
    # 081234567890
    # menjadi:
    # 0812******90

    return (
        nomor[:4]
        + ("*" * (len(nomor) - 6))
        + nomor[-2:]
    )


# =========================================================
# AMBIL FIELD
# =========================================================

def ambil_field(data, daftar_field):

    if not isinstance(data, dict):
        return None

    for field in daftar_field:

        value = data.get(field)

        if value is not None:
            value = str(value).strip()

            if value:
                return value

    return None


# =========================================================
# NOMOR HP
# =========================================================

def ambil_nomor_hp(data):

    summary = data.get("summary", {})
    detail = data.get("detail", {})

    daftar_field = [
        "receiver_phone",
        "receiver_phone_number",
        "phone",
        "phone_number"
    ]

    nomor = ambil_field(
        detail,
        daftar_field
    )

    if not nomor:
        nomor = ambil_field(
            summary,
            daftar_field
        )

    if not nomor:
        return "Tidak tersedia"

    return sensor_nomor_hp(nomor)


# =========================================================
# STATUS PEMBAYARAN
# =========================================================

def status_pembayaran(data):

    summary = data.get("summary", {})
    detail = data.get("detail", {})

    sumber = []

    if isinstance(summary, dict):
        sumber.append(summary)

    if isinstance(detail, dict):
        sumber.append(detail)

    daftar_field = [
        "payment_status",
        "payment_state",
        "payment",
        "payment_method",
        "payment_type",
        "cod_status",
        "cod",
        "is_cod"
    ]

    for bagian in sumber:

        for field in daftar_field:

            value = bagian.get(field)

            if value is None:
                continue

            text = str(value).strip()

            if not text:
                continue

            lower = text.lower()

            # Sudah dibayar
            if any(kata in lower for kata in [
                "paid",
                "dibayar",
                "sudah bayar",
                "sudah dibayar",
                "lunas",
                "settled"
            ]):
                return "✅ SUDAH DIBAYAR"

            # Menunggu pembayaran / COD
            if any(kata in lower for kata in [
                "cod",
                "unpaid",
                "belum bayar",
                "belum dibayar",
                "menunggu pembayaran",
                "pending payment",
                "waiting payment"
            ]):
                return "⚠️ MENUNGGU PEMBAYARAN"

            # Boolean
            if field in ["cod", "is_cod"]:

                if lower in ["true", "1", "yes"]:
                    return "⚠️ MENUNGGU PEMBAYARAN"

                if lower in ["false", "0", "no"]:
                    return "✅ SUDAH DIBAYAR"

    return "⚪ DATA PEMBAYARAN TIDAK TERSEDIA"


# =========================================================
# ISI PAKET
# =========================================================

def isi_paket(data):

    summary = data.get("summary", {})
    detail = data.get("detail", {})

    daftar_field = [
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

    isi = ambil_field(
        detail,
        daftar_field
    )

    if not isi:
        isi = ambil_field(
            summary,
            daftar_field
        )

    if not isi:
        return "Tidak tersedia"

    return isi


# =========================================================
# STATUS PAKET
# =========================================================

def format_status(status):

    if not status:
        return "📦 BELUM DITERIMA"

    text = str(status).strip()
    lower = text.lower()

    kata_selesai = [
        "delivered",
        "received",
        "diterima",
        "sudah diterima",
        "completed",
        "selesai"
    ]

    for kata in kata_selesai:

        if kata in lower:
            return "✅ SUDAH DITERIMA"

    return f"📦 BELUM DITERIMA\n{text}"


# =========================================================
# RIWAYAT
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


# =========================================================
# LACAK SICEPAT
# =========================================================

def lacak_sicepat(resi):

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
                f"⚠️ RESI : {resi}\n"
                "━━━━━━━━━━━━━━━━\n"
                "Server tracking sedang bermasalah."
            )

        try:
            hasil_api = response.json()

        except Exception:

            return (
                f"⚠️ RESI : {resi}\n"
                "━━━━━━━━━━━━━━━━\n"
                "Respons API tidak dapat dibaca."
            )

        # RESI TIDAK ADA
        if (
            hasil_api.get("status") != 200
            or not hasil_api.get("data")
        ):

            return (
                f"❌ RESI TIDAK DITEMUKAN\n"
                "━━━━━━━━━━━━━━━━\n"
                f"🔢 Resi : {resi}"
            )

        data = hasil_api.get("data", {})

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

        # =================================================
        # DATA UTAMA
        # =================================================

        penerima = (
            detail.get("receiver")
            or summary.get("receiver")
            or "Tidak tersedia"
        )

        pengirim = (
            detail.get("shipper")
            or summary.get("shipper")
            or "Tidak tersedia"
        )

        alamat = (
            detail.get("destination")
            or summary.get("destination")
            or "Tidak tersedia"
        )

        status_api = (
            summary.get("status")
            or detail.get("status")
            or ""
        )

        tanggal = (
            summary.get("date")
            or detail.get("date")
            or "Tidak tersedia"
        )

        layanan = (
            summary.get("service")
            or detail.get("service")
            or "Tidak tersedia"
        )

        nomor_hp = ambil_nomor_hp(data)

        pembayaran = status_pembayaran(data)

        paket = isi_paket(data)

        status = format_status(
            status_api
        )

        riwayat = format_riwayat(
            history
        )

        # =================================================
        # HASIL
        # =================================================

        return (
            "📦 TRACKING SICEPAT\n"
            "━━━━━━━━━━━━━━━━\n\n"

            f"🔢 Resi       : {resi}\n"
            f"👤 Penerima   : {penerima}\n"
            f"📱 No. HP     : {nomor_hp}\n"
            f"📤 Pengirim   : {pengirim}\n"
            f"🏠 Alamat     : {alamat}\n\n"

            f"📦 Isi Paket  : {paket}\n"
            f"💰 Pembayaran : {pembayaran}\n"
            f"📌 Status     : {status}\n"
            f"🚚 Layanan    : {layanan}\n"
            f"📅 Tanggal    : {tanggal}\n\n"

            "🚚 RIWAYAT\n"
            "━━━━━━━━━━━━━━━━\n"
            f"{riwayat}"
        )

    except requests.exceptions.Timeout:

        return (
            f"⚠️ RESI : {resi}\n"
            "━━━━━━━━━━━━━━━━\n"
            "Server terlalu lama merespons."
        )

    except requests.exceptions.RequestException:

        return (
            f"⚠️ RESI : {resi}\n"
            "━━━━━━━━━━━━━━━━\n"
            "Gagal terhubung ke server."
        )

    except Exception as error:

        print(
            "ERROR:",
            error
        )

        return (
            f"⚠️ RESI : {resi}\n"
            "━━━━━━━━━━━━━━━━\n"
            "Terjadi kesalahan saat mengambil data."
        )


# =========================================================
# AMBIL RESI
# =========================================================

def ambil_semua_resi(teks):

    if not teks:
        return []

    kandidat = re.split(
        r"[\s,;]+",
        teks.upper().strip()
    )

    hasil = []

    for item in kandidat:

        item = item.strip()

        if not item:
            continue

        item = re.sub(
            r"[^A-Z0-9]",
            "",
            item
        )

        # Harus mempunyai angka
        if not re.search(
            r"\d",
            item
        ):
            continue

        # Panjang resi
        if not (
            8 <= len(item) <= 30
        ):
            continue

        if item not in hasil:
            hasil.append(item)

    return hasil


# =========================================================
# TERIMA RESI
# =========================================================

@bot.message_handler(
    func=lambda message: True
)
def terima_resi(message):

    teks = message.text or ""

    resi_list = ambil_semua_resi(
        teks
    )

    if not resi_list:

        bot.send_message(
            message.chat.id,
            "⚠️ Nomor resi tidak ditemukan.\n\n"
            "Silakan kirim nomor resi SiCepat."
        )

        return

    # Maksimal 50
    if len(resi_list) > 50:

        bot.send_message(
            message.chat.id,
            f"⚠️ Maksimal 50 resi sekali cek.\n\n"
            f"Kamu mengirim {len(resi_list)} resi."
        )

        return

    chat_id = message.chat.id

    bot.send_message(
        chat_id,
        f"🔎 Mulai mengecek "
        f"{len(resi_list)} resi SiCepat.\n\n"
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

        hasil = lacak_sicepat(
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
        f"{len(resi_list)} resi SiCepat."
    )


# =========================================================
# JALANKAN BOT
# =========================================================

if __name__ == "__main__":

    print("==============================")
    print("📦 BOT TRACKING SICEPAT")
    print("✅ BOT BERJALAN")
    print("==============================")

    bot.infinity_polling(
        skip_pending=True,
        timeout=30,
        long_polling_timeout=30
        )
