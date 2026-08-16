import telebot
import requests
from bs4 import BeautifulSoup
import re

# === TOKEN SUDAH DIMASUKKAN ===
TOKEN_TELEGRAM = "8868907979:AAEEZ25MkU2ViOkwEDfAoMztGlTAPAmkxvo"

bot = telebot.TeleBot(TOKEN_TELEGRAM)

@bot.message_handler(commands=['start'])
def mulai_pesan(pesan):
    bot.reply_to(pesan, """✅ Halo! Kirimkan NOMOR RESI — BEBAS! Mau 1 atau banyak sekaligus!

📋 Format Resi yang didukung:
   SiCepat → awalan JP... atau SC...
   J&T      → awalan JZ... atau JT...

📋 Cara kirim banyak resi:
   Kirim tiap nomor di baris baru, contoh:
   JP0123456789012
   JZ9876543210987
   SC1122334455667

📦 Yang tampil:
   ✅ Terdaftar → Nama, Alamat, Status COD/NON-COD
   ❌ Belum terdaftar → RESI TIDAK DITEMUKAN
   💡 Bebas! Mau banyak atau sedikit, terserah kamu!""")


def lacak_sicepat(resi):
    url = f"https://www.sicepat.com/checkAwb/{resi}"
    kepala = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.sicepat.com/checkAwb"}
    try:
        respons = requests.get(url, headers=kepala, timeout=25)
        if respons.status_code != 200:
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Server SiCepat sedang sibuk"""
        
        isi = BeautifulSoup(respons.text, "html.parser")
        semua_teks = isi.get_text()

        if re.search(r'Belum ditemukan|Tidak ditemukan|No Data|Data tidak ada|AWB Not Found', semua_teks, re.IGNORECASE) or len(semua_teks.strip()) < 100:
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
❌ RESI TIDAK DITEMUKAN
Nomor resi belum terdaftar atau salah."""

        jenis_layanan = "✅ SiCepat — SUDAH DIBAYAR"
        if re.search(r'COD', semua_teks.upper()):
            jenis_layanan = "⚠️ SiCepat — COD, HARUS DIBAYAR SAAT SAMPAI!"
        elif re.search(r'BEST', semua_teks.upper()):
            jenis_layanan = "✅ SiCepat BEST — SUDAH DIBAYAR"
        elif re.search(r'REG', semua_teks.upper()):
            jenis_layanan = "✅ SiCepat REG — SUDAH DIBAYAR"
        elif re.search(r'HALU', semua_teks.upper()):
            jenis_layanan = "✅ SiCepat HALU — SUDAH DIBAYAR"

        nama_penerima = "Tidak tersedia"
        alamat_penerima = "Tidak tersedia"
        status = "Sedang diproses"

        cocok_penerima = re.search(r'Penerima[:\s]+([^\n\r]+)', semua_teks)
        if cocok_penerima and cocok_penerima.group(1).strip():
            nama_penerima = cocok_penerima.group(1).strip()

        cocok_alamat = re.search(r'Alamat Tujuan[:\s]+([^\n\r]+)', semua_teks)
        if cocok_alamat and cocok_alamat.group(1).strip():
            alamat_penerima = cocok_alamat.group(1).strip()

        cocok_status = re.search(r'Status[:\s]+([^\n\r]+)', semua_teks)
        if cocok_status and cocok_status.group(1).strip():
            status = cocok_status.group(1).strip()

        return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
🏢 Ekspedisi: SiCepat
📋 Jenis: {jenis_layanan}
👤 Penerima: {nama_penerima}
📍 Alamat: {alamat_penerima}
✅ Status: {status}"""

    except Exception as e:
        return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Kesalahan: {str(e)[:40]}"""


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

        if re.search(r'Not Found|Tidak Ditemukan|No Data', semua_teks, re.IGNORECASE) or len(semua_teks.strip()) < 150:
            return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
❌ RESI TIDAK DITEMUKAN
Nomor resi belum terdaftar atau salah."""

        jenis_layanan = "✅ J&T — NON-COD (SUDAH DIBAYAR)"
        if re.search(r'COD', semua_teks.upper()):
            jenis_layanan = "⚠️ J&T — COD, HARUS DIBAYAR SAAT SAMPAI!"

        nama_penerima = "Tidak tersedia"
        alamat_penerima = "Tidak tersedia"
        status = "Sedang diproses"
        tanggal = "-"

        cocok_penerima = re.search(r'Penerima[:\s\n]+([^\n\r]{3,})', semua_teks, re.IGNORECASE)
        if cocok_penerima and cocok_penerima.group(1).strip():
            nama_penerima = cocok_penerima.group(1).strip()

        cocok_alamat = re.search(r'Alamat[:\s\n]+([^\n\r]{10,})', semua_teks, re.IGNORECASE)
        if cocok_alamat and cocok_alamat.group(1).strip():
            alamat_penerima = cocok_alamat.group(1).strip()[:80]

        cocok_status = re.search(r'Status[:\s\n]+([^\n\r]+)', semua_teks, re.IGNORECASE)
        if cocok_status and cocok_status.group(1).strip():
            status = cocok_status.group(1).strip()

        cocok_tanggal = re.search(r'(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})', semua_teks)
        if cocok_tanggal:
            tanggal = cocok_tanggal.group(1)

        return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
🏢 Ekspedisi: J&T Express
📋 Jenis: {jenis_layanan}
👤 Penerima: {nama_penerima}
📍 Alamat: {alamat_penerima}
✅ Status: {status}
📅 Tanggal: {tanggal}"""

    except Exception as e:
        return f"""📦 {resi}
━━━━━━━━━━━━━━━━━━━━━
⚠️ Kesalahan: {str(e)[:40]}"""


@bot.message_handler(func=lambda pesan: True)
def proses_pesan(pesan):
    teks = pesan.text.strip()
    daftar_resi = re.findall(r'(?:JP|SC|JZ|JT)\w+', teks.upper())

    if not daftar_resi:
        bot.reply_to(pesan, """⚠️ Tidak menemukan nomor resi!

Format yang didukung:
   SiCepat → awalan JP... atau SC...
   J&T      → awalan JZ... atau JT...

Kirim resi-nya ya! Bisa 1 atau banyak sekaligus!""")
        return

    if len(daftar_resi) == 1:
        bot.reply_to(pesan, f"🔍 Sedang melacak: {daftar_resi[0]}\nMohon tunggu sebentar...")
    else:
        bot.reply_to(pesan, f"🔍 Sedang melacak {len(daftar_resi)} nomor resi...\nMohon tunggu sebentar...")

    hasil_akhir = []
    for resi in daftar_resi:
        if re.match(r'^(JP|SC)\d+', resi):
            hasil = lacak_sicepat(resi)
        elif re.match(r'^(JZ|JT)\d+', resi):
            hasil = lacak_jnt(resi)
        else:
            hasil = f"📦 {resi} — ❌ Tidak dikenali ekspedisinya"
        hasil_akhir.append(hasil)

    for balasan in hasil_akhir:
        bot.reply_to(pesan, balasan)


# JALANKAN BOT
if __name__ == "__main__":
    print("✅ Bot SiCepat + J&T — Bisa Banyak Resi Sekaligus — Sedang berjalan...")
    bot.infinity_polling()
        
