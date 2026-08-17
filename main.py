import telebot
import requests
import re

TOKEN_TELEGRAM = "8868907979:AAEEZ25MkU2ViOkwEDfAoMztGlTAPAmkxvo"
API_KEY = "sk_ujo6h6tupknlns78z4gjd2lzbxlywwr2zqwue4o9w6o3t6zfjwd66381nps9akib"

bot = telebot.TeleBot(TOKEN_TELEGRAM)

@bot.message_handler(commands=['start'])
def mulai(pesan):
    bot.reply_to(pesan, """✅ Halo! Kirim nomor resi paket!
Bisa lacak J&T, SiCepat, JNE, dll — Nama Penerima LENGKAP muncul!""")

def lacak_paket(resi):
    try:
        url = "https://api.binderbyte.com/v1/track"
        params = {"api_key": API_KEY, "awb": resi}
        res = requests.get(url, params=params, timeout=30)

        if res.status_code != 200:
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Sedang gangguan, coba sebentar lagi"""

        data = res.json()

        if data.get("status") != 200 or not data.get("data"):
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
❌ RESI TIDAK DITEMUKAN
Nomor resi salah atau belum terdaftar."""

        d = data["data"]
        ekspedisi = d.get("courier", "-")
        pengirim = d.get("shipper_name", "-")
        penerima = d.get("receiver_name", "-")
        alamat = d.get("destination", "-")
        status = d.get("status", "-")
        tanggal = d.get("date", "-")
        layanan = d.get("service", "-")
        nilai = d.get("price", "-")

        jenis = "✅ SUDAH DIBAYAR"
        if "COD" in str(layanan).upper() or "COD" in str(status).upper():
            jenis = f"⚠️ COD — HARUS DIBAYAR! Rp{nilai}"

        riwayat = d.get("history", [])
        lokasi_terakhir = "-"
        if riwayat:
            lokasi_terakhir = riwayat[-1].get("location", "-")

        return f"""📦 HASIL PELACAKAN: {resi}
━━━━━━━━━━━━━━━━━━━━━
🏢 EKSPEDISI: {ekspedisi}
📋 LAYANAN: {layanan}
📋 {jenis}
📤 PENGIRIM: {pengirim}
👤 PENERIMA: {penerima}
📍 TUJUAN: {alamat}
✅ STATUS: {status}
📍 LOKASI TERAKHIR: {lokasi_terakhir}
📅 TANGGAL: {tanggal}"""

    except Exception as e:
        return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Kesalahan: {str(e)[:50]}"""


@bot.message_handler(func=lambda m: True)
def balas(pesan):
    teks = pesan.text.strip()
    resi_list = re.findall(r'[A-Z]{0,2}\d{8,}', teks.upper())

    if not resi_list:
        bot.reply_to(pesan, "⚠️ Kirim nomor resi yang benar!")
        return

    for resi in resi_list:
        bot.reply_to(pesan, f"🔍 Sedang melacak: {resi}\nMohon tunggu sebentar...")
        hasil = lacak_paket(resi)
        bot.reply_to(pesan, hasil)

if __name__ == "__main__":
    print("✅ Bot Pelacakan BinderByte — Sedang berjalan...")
    bot.infinity_polling() 
