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


# ==================================================
# MENU PILIH EKSPEDISI
# ==================================================
def menu_ekspedisi():
    keyboard = types.InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        types.InlineKeyboardButton("🔎 SiCepat", callback_data="courier_sicepat"),
        types.InlineKeyboardButton("🔎 J&T", callback_data="courier_jnt"),
        types.InlineKeyboardButton("🔎 Ninja", callback_data="courier_ninja")
    )
    return keyboard


# ==================================================
# START
# ==================================================
@bot.message_handler(commands=["start"])
def start(message):
    bot.send_message(
        message.chat.id,
        "👋 Halo! Bot Tracking Paket\n\n"
        "Silakan pilih ekspedisi:",
        reply_markup=menu_ekspedisi()
    )


# ==================================================
# PILIH EKSPEDISI
# ==================================================
@bot.callback_query_handler(func=lambda call: call.data.startswith("courier_"))
def pilih_ekspedisi(call):
    chat_id = call.message.chat.id
    if call.data == "courier_sicepat":
        user_courier[chat_id] = "sicepat"
        nama = "SiCepat"
    elif call.data == "courier_jnt":
        user_courier[chat_id] = "jnt"
        nama = "J&T"
    else:
        user_courier[chat_id] = "ninja"
        nama = "Ninja"

    bot.answer_callback_query(call.id)
    bot.send_message(chat_id,
        f"✍️ Kirim nomor resi {nama}\n"
        "Bisa 1–50 resi sekaligus, pisahkan dengan enter/spasi")


# ==================================================
# SENSOR NOMOR HP
# ==================================================
def sensor_nomor_hp(nomor):
    if not nomor: return "Tidak tersedia"
    nomor = re.sub(r"\D", "", str(nomor).strip())
    if len(nomor) <= 6:
        return "*" * len(nomor)
    return nomor[:4] + ("*" * (len(nomor) - 6)) + nomor[-2:]


# ==================================================
# ✅ BACA STATUS COD/NONCOD — LANGSUNG DARI LAYANAN
# ==================================================
def baca_status_pembayaran(data):
    summary = data.get("summary", {})
    detail = data.get("detail", {})

    # 🔍 AMBIL NAMA LAYANAN — INI KUNCI UTAMANYA!
    layanan = str(
        summary.get("service")
        or detail.get("service")
        or ""
    ).upper().strip()

    # ✅ LANGSUNG BACA TULISAN DI NAMA LAYANAN
    if "NONCOD" in layanan or "NON-COD" in layanan or "NON COD" in layanan:
        return "✅ NON-COD — SUDAH DIBAYAR"
    if "COD" in layanan:
        return "⚠️ COD — HARUS DIBAYAR DI TEMPAT!"

    # Kalau tidak ada tulisan COD, cek nama layanan umum
    if layanan in ["REG", "BEST", "EZ", "STANDARD", "EXPRESS", "REGULER"]:
        return "✅ NON-COD — SUDAH DIBAYAR"

    # Cek dari field pembayaran sebagai cadangan
    sumber = [summary, detail]
    for bagian in sumber:
        if not isinstance(bagian, dict): continue
        status = str(bagian.get("payment_status") or bagian.get("cod_status") or "").lower()
        if "paid" in status or "lunas" in status:
            return "✅ SUDAH DIBAYAR"
        if "unpaid" in status or "belum" in status or "pending" in status:
            return "⚠️ BELUM DIBAYAR"

    return f"⚪ DARI LAYANAN: {layanan}"


# ==================================================
# FORMAT STATUS & RIWAYAT
# ==================================================
def format_status(status):
    if not status: return "⚪ TIDAK ADA DATA"
    s = str(status).lower()
    if any(k in s for k in ["delivered", "diterima", "received", "completed"]):
        return "✅ SUDAH DITERIMA"
    return f"📦 {status}"

def format_riwayat(history):
    if not isinstance(history, list) or not history:
        return "Tidak tersedia"
    hasil = []
    for item in history[:8]:
        tgl = item.get("date") or item.get("datetime") or "-"
        lok = item.get("location") or "-"
        ket = item.get("desc") or item.get("description") or item.get("status") or "-"
        hasil.append(f"• {tgl}\n  {ket}\n  📍 {lok}")
    return "\n".join(hasil)


# ==================================================
# LACAK RESI
# ==================================================
def lacak_resi(resi, courier):
    try:
        params = {"api_key": BINDERBYTE_API_KEY, "courier": courier, "awb": resi}
        res = requests.get(API_URL, params=params, timeout=30)

        if res.status_code == 401:
            return f"❌ API Key Tidak Valid\nResi: {resi}"
        if res.status_code != 200:
            return f"❌ Gagal Cek\nResi: {resi}\nKode: {res.status_code}"

        hasil = res.json()
        if hasil.get("status") != 200:
            pesan = hasil.get("message", "Resi tidak ditemukan")
            return f"❌ {pesan}\nResi: {resi}"

        data = hasil.get("data", {})
        summary = data.get("summary", {})
        detail = data.get("detail", {})
        history = data.get("history", [])

        # Ambil data
        nomor_resi = summary.get("awb") or resi
        penerima = detail.get("receiver_name") or summary.get("receiver_name") or "Tidak tersedia"
        pengirim = detail.get("shipper_name") or summary.get("shipper_name") or "Tidak tersedia"
        alamat = detail.get("destination") or summary.get("destination") or "Tidak tersedia"
        nomor_hp = sensor_nomor_hp(detail.get("receiver_phone") or summary.get("receiver_phone"))
        layanan = str(summary.get("service") or detail.get("service") or "-").upper()
        tanggal = summary.get("date") or detail.get("date") or "-"
        status_paket = format_status(summary.get("status") or detail.get("status"))
        pembayaran = baca_status_pembayaran(data)  # ✅ BACA COD/NONCOD
        riwayat = format_riwayat(history)

        nama_ekspedisi = {"sicepat": "SICEPAT", "jnt": "J&T", "ninja": "NINJA"}.get(courier, courier.upper())

        return (
            f"📦 {nama_ekspedisi} — {nomor_resi}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 Penerima : {penerima}\n"
            f"📱 No. HP    : {nomor_hp}\n"
            f"📤 Pengirim  : {pengirim}\n"
            f"🏠 Alamat    : {alamat}\n"
            f"📋 Layanan   : {layanan}\n"
            f"💰 Pembayaran: {pembayaran}\n"
            f"📌 Status    : {status_paket}\n"
            f"📅 Tanggal   : {tanggal}\n\n"
            f"🚚 RIWAYAT\n{riwayat}"
        )

    except Exception as e:
        return f"❌ Kesalahan: {str(e)[:100]}\nResi: {resi}"


# ==================================================
# TERIMA RESI DARI PENGGUNA
# ==================================================
def ambil_resi(teks):
    return re.findall(r"[A-Z0-9]{8,30}", re.sub(r"[^A-Z0-9]", "", teks.upper()))

@bot.message_handler(func=lambda m: True)
def proses_pesan(message):
    chat_id = message.chat.id
    if chat_id not in user_courier:
        bot.reply_to(message, "⚠️ Silakan pilih ekspedisi dulu dengan /start")
        return

    resi_list = ambil_resi(message.text)
    if not resi_list:
        bot.reply_to(message, "⚠️ Kirim nomor resi yang benar!")
        return

    courier = user_courier[chat_id]
    for resi in resi_list[:5]:
        bot.send_message(chat_id, f"🔍 Melacak: {resi}")
        hasil = lacak_resi(resi, courier)
        bot.send_message(chat_id, hasil)


if __name__ == "__main__":
    print("✅ Bot Berjalan...")
    bot.infinity_polling()
    
