import telebot
import requests
from bs4 import BeautifulSoup
import re

# === TOKEN SUDAH DIMASUKKAN ===
TOKEN_TELEGRAM = "8868907979:AAEEZ25MkU2ViOkwEDfAoMztGlTAPAmkxvo"

bot = telebot.TeleBot(TOKEN_TELEGRAM)

@bot.message_handler(commands=['start'])
def mulai_pesan(pesan):
    bot.reply_to(pesan, """✅ Halo! Kirimkan NOMOR RESI J&T — BEBAS! Mau 1 atau banyak sekaligus!

📋 Format Resi J&T: awalan JZ... atau JT...
📋 Cara kirim banyak resi:
   JZ0123456789012
   JT9876543210987

📦 Yang tampil:
   ✅ Nama Penerima
   ✅ Status COD / Sudah Dibayar
   ✅ Status Paket & Tanggal
   ❌ Belum terdaftar → RESI TIDAK DITEMUKAN""")


def lacak_jnt(resi):
    url = f"https://www.jet.co.id/track/{resi}"
    kepala = {"User-Agent": "Mozilla/5.0"}
    try:
        respons = requests.get(url, headers=kepala, timeout=25)
        if respons.status_code != 200:
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Server J&T sedang sibuk"""

        isi = BeautifulSoup(respons.text, "html.parser")
        semua_teks = isi.get_text()

        # Cek resi terdaftar atau tidak
        if re.search(r'Not Found|Tidak Ditemukan|No Data|Tidak ditemukan', semua_teks, re.IGNORECASE) or len(semua_teks.strip()) < 150:
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
❌ RESI TIDAK DITEMUKAN
Nomor resi belum terdaftar atau salah."""

        # Cek COD atau Sudah Dibayar
        if re.search(r'COD', semua_teks.upper()):
            jenis = "⚠️ STATUS: COD — HARUS DIBAYAR SAAT SAMPAI!"
        else:
            jenis = "✅ STATUS: SUDAH DIBAYAR"

        # Ambil Nama Penerima
        nama_penerima = "Tidak tersedia"
        cocok_nama = re.search(r'Penerima[:\s\n]+([^\n\r]{3,})', semua_teks, re.IGNORECASE)
        if cocok_nama and cocok_nama.group(1).strip():
            nama_penerima = cocok_nama.group(1).strip()

        # Ambil Alamat
        alamat = "Tidak tersedia"
        cocok_alamat = re.search(r'Alamat Tujuan|Tujuan[:\s\n]+([^\n\r]{10,})', semua_teks, re.IGNORECASE)
        if cocok_alamat and cocok_alamat.group(1).strip():
            alamat = cocok_alamat.group(1).strip()[:80]

        # Ambil Status Terakhir
        status = "Sedang diproses"
        cocok_status = re.search(r'Status|Keterangan[:\s\n]+([^\n\r]+)', semua_teks, re.IGNORECASE)
        if cocok_status and cocok_status.group(1).strip():
            status = cocok_status.group(1).strip()

        # Ambil Tanggal
        tanggal = "-"
        cocok_tanggal = re.search(r'(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})', semua_teks)
        if cocok_tanggal:
            tanggal = cocok_tanggal.group(1)

        return f"""📦 HASIL PELACAKAN: {resi}
━━━━━━━━━━━━━━━━━━━━━
🏢 EKSPEDISI: J&T EXPRESS
📋 {jenis}
👤 NAMA PENERIMA: {nama_penerima}
📍 ALAMAT TUJUAN: {alamat}
✅ STATUS PAKET: {status}
📅 TANGGAL: {tanggal}"""

    except Exception as e:
        return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Terjadi kesalahan: {str(e)[:40]}"""


@bot.message_handler(func=lambda pesan: True)
def proses_pesan(pesan):
    teks = pesan.text.strip()
    daftar_resi = re.findall(r'(?:JZ|JT)\d+', teks.upper())

    if not daftar_resi:
        bot.reply_to(pesan, """⚠️ Tidak menemukan nomor resi J&T!

Resi J&T biasanya diawali: JZ... atau JT...
Kirim resi-nya ya! Bisa 1 atau banyak sekaligus!""")
        return

    if len(daftar_resi) == 1:
        bot.reply_to(pesan, f"🔍 Sedang melacak: {daftar_resi[0]}\nMohon tunggu sebentar...")
    else:
        bot.reply_to(pesan, f"🔍 Sedang melacak {len(daftar_resi)} nomor resi...\nMohon tunggu sebentar...")

    for resi in daftar_resi:
        hasil = lacak_jnt(resi)
        bot.reply_to(pesan, hasil)


# JALANKAN BOT
if __name__ == "__main__":
    print("✅ Bot J&T Sedang berjalan...")
    bot.infinity_polling()
    
