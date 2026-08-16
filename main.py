import telebot
import requests
from bs4 import BeautifulSoup
import re

# === TOKEN SUDAH DIMASUKKAN ===
TOKEN_TELEGRAM = "8868907979:AAEEZ25MkU2ViOkwEDfAoMztGlTAPAmkxvo"

bot = telebot.TeleBot(TOKEN_TELEGRAM)

@bot.message_handler(commands=['start'])
def mulai_pesan(pesan):
    bot.reply_to(pesan, """✅ Halo! Kirimkan NOMOR RESI SiCepat kamu, saya akan lacak langsung!

📋 Contoh: JP0123456789012
⚠️ Hanya untuk resi SiCepat (awalan JP atau SC)
📦 Tampil: Jenis Layanan (COD/Non-COD), Nama Penerima, Alamat, Riwayat
❌ Jika belum terdaftar: akan diberitahu RESI TIDAK DITEMUKAN""")

@bot.message_handler(func=lambda pesan: True)
def lacak_paket(pesan):
    resi = pesan.text.strip().upper()

    # Cek format resi SiCepat
    if not re.match(r'^(JP|SC)\d+', resi):
        bot.reply_to(pesan, "⚠️ Maaf, sepertinya bukan nomor resi SiCepat!\nResi SiCepat biasanya diawali: JP... atau SC...")
        return

    bot.reply_to(pesan, f"🔍 Sedang melacak: {resi}\nMohon tunggu sebentar...")

    try:
        # Ambil data langsung dari situs resmi SiCepat
        url = f"https://www.sicepat.com/checkAwb/{resi}"
        kepala = {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.sicepat.com/checkAwb"
        }
        respons = requests.get(url, headers=kepala, timeout=30)

        if respons.status_code != 200:
            bot.reply_to(pesan, "⚠️ Server SiCepat sedang sibuk. Coba lagi sebentar ya.")
            return

        isi = BeautifulSoup(respons.text, "html.parser")
        semua_teks = isi.get_text()

        # === CEK APAKAH RESI TERDAFTAR ===
        if re.search(r'Belum ditemukan|Tidak ditemukan|No Data|Data tidak ada|AWB Not Found', semua_teks, re.IGNORECASE) or len(semua_teks.strip()) < 100:
            bot.reply_to(pesan, f"""⚠️ RESI TIDAK DITEMUKAN!

Nomor resi: {resi}

Kemungkinan penyebab:
❌ Nomor resi salah atau belum terdaftar di sistem SiCepat
⏳ Paket baru dikirim, tunggu 1-2 hari
📝 Cek kembali penulisan nomor resi

Silakan coba lagi nanti.""")
            return

        # Ambil data
        jenis_layanan = "ℹ️ Belum teridentifikasi"
        nama_penerima = "Tidak tersedia"
        alamat_penerima = "Tidak tersedia"
        status = "Sedang diproses"

        # Cari Jenis Layanan & COD
        if re.search(r'COD', semua_teks.upper()):
            jenis_layanan = "⚠️ COD — HARUS DIBAYAR SAAT SAMPAI!"
        elif re.search(r'BEST', semua_teks.upper()):
            jenis_layanan = "✅ SiCepat BEST — SUDAH DIBAYAR"
        elif re.search(r'REG', semua_teks.upper()):
            jenis_layanan = "✅ SiCepat REG — SUDAH DIBAYAR"
        elif re.search(r'HALU', semua_teks.upper()):
            jenis_layanan = "✅ SiCepat HALU — SUDAH DIBAYAR"

        # Cari Nama Penerima
        cocok_penerima = re.search(r'Penerima[:\s]+([^\n\r]+)', semua_teks)
        if cocok_penerima and cocok_penerima.group(1).strip():
            nama_penerima = cocok_penerima.group(1).strip()

        # Cari Alamat
        cocok_alamat = re.search(r'Alamat Tujuan[:\s]+([^\n\r]+)', semua_teks)
        if cocok_alamat and cocok_alamat.group(1).strip():
            alamat_penerima = cocok_alamat.group(1).strip()

        # Cari Status Terakhir
        cocok_status = re.search(r'Status[:\s]+([^\n\r]+)', semua_teks)
        if cocok_status and cocok_status.group(1).strip():
            status = cocok_status.group(1).strip()

        # Susun balasan
        balasan = f"""📦 HASIL PELACAKAN: {resi}
━━━━━━━━━━━━━━━━━━━━━
📋 Jenis: {jenis_layanan}
👤 Penerima: {nama_penerima}
📍 Alamat: {alamat_penerima}
✅ Status: {status}

💡 Kirim resi lain untuk lacak berikutnya."""

        bot.reply_to(pesan, balasan)

    except Exception as e:
        bot.reply_to(pesan, f"⚠️ Terjadi kesalahan: {str(e)}\nCoba lagi sebentar ya.")

# JALANKAN BOT
if __name__ == "__main__":
    print("✅ Bot SiCepat sedang berjalan...")
    bot.infinity_polling()
        
