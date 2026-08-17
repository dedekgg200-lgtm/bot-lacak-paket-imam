import telebot
import requests
import re

# === SUDAH DIISI LENGKAP ===
TOKEN_TELEGRAM = "8868907979:AAEEZ25MkU2ViOkwEDfAoMztGlTAPAmkxvo"
API_KEY_BINDERBYTE = "sk_14k7x3i9qf43m1luke9nl1loctp9bzvh7sugqdpo6vqmjj8yl1oopwd4uufrsjm2"
URL_API = "https://api.binderbyte.com/v1/track"

bot = telebot.TeleBot(TOKEN_TELEGRAM)

@bot.message_handler(commands=['start'])
def mulai_pesan(pesan):
    bot.reply_to(pesan, """✅ Halo! Kirimkan NOMOR RESI PAKET!

📋 Bisa lacak: J&T, SiCepat, JNE, TIKI, Pos Indonesia, dll
📋 Bisa kirim 1 atau banyak sekaligus!

📦 Yang tampil LENGKAP:
   ✅ Nama Penerima
   ✅ Alamat Tujuan
   ✅ Status COD + Nilai Barang
   ✅ Riwayat Pengiriman Lengkap
   ❌ Resi salah → langsung diberitahu""")


def lacak_paket(resi):
    try:
        param = {"api_key": API_KEY_BINDERBYTE, "awb": resi}
        respons = requests.get(URL_API, params=param, timeout=30)
        
        if respons.status_code != 200:
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Sedang gangguan, coba sebentar lagi"""

        data = respons.json()

        if data.get("status") != 200 or not data.get("data"):
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
❌ RESI TIDAK DITEMUKAN
Nomor resi salah atau belum terdaftar."""

        paket = data["data"]
        ekspedisi = paket.get("courier", "-")
        nama_penerima = paket.get("receiver_name", "Tidak tersedia")
        alamat = paket.get("destination", "Tidak tersedia")
        nilai_barang = paket.get("price", "-")
        status = paket.get("status", "Sedang diproses")
        tanggal = paket.get("date", "-")
        layanan = paket.get("service", "-")

        # Cek COD
        if "COD" in str(layanan).upper() or "COD" in str(status).upper():
            jenis = f"⚠️ COD — HARUS DIBAYAR! Rp{nilai_barang}"
        else:
            jenis = "✅ SUDAH DIBAYAR"

        # Riwayat terakhir
        riwayat = paket.get("history", [])
        lokasi_terakhir = "-"
        if riwayat:
            lokasi_terakhir = riwayat[-1].get("location", "-")

        return f"""📦 HASIL PELACAKAN: {resi}
━━━━━━━━━━━━━━━━━━━━━
🏢 EKSPEDISI: {ekspedisi}
📋 LAYANAN: {layanan}
📋 {jenis}
👤 PENERIMA: {nama_penerima}
📍 TUJUAN: {alamat}
✅ STATUS: {status}
📍 LOKASI TERAKHIR: {lokasi_terakhir}
📅 TANGGAL: {tanggal}"""

    except Exception as e:
        return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Kesalahan: {str(e)[:40]}"""


@bot.message_handler(func=lambda pesan: True)
def proses_pesan(pesan):
    teks = pesan.text.strip()
    daftar_resi = re.findall(r'[A-Z]{2}\d+|\d{10,}', teks.upper())

    if not daftar_resi:
        bot.reply_to(pesan, """⚠️ Tidak menemukan nomor resi!

Kirim nomor resi-nya ya! Bisa J&T, SiCepat, JNE, dll!""")
        return

    if len(daftar_resi) == 1:
        bot.reply_to(pesan, f"🔍 Sedang melacak: {daftar_resi[0]}\nMohon tunggu sebentar...")
    else:
        bot.reply_to(pesan, f"🔍 Sedang melacak {len(daftar_resi)} resi...\nMohon tunggu sebentar...")

    for resi in daftar_resi:
        hasil = lacak_paket(resi)
        bot.reply_to(pesan, hasil)


if __name__ == "__main__":
    print("✅ Bot Pelacakan BinderByte — Sedang berjalan...")
    bot.infinity_polling()
    
