import telebot
import requests

TOKEN_TELEGRAM = "8868907979:AAEEZ25MkU2ViOkwEDfAoMztGlTAPAmkxvo"
API_RAJAONGKIR = "xioUvfUod679017a75bec59bj8r0rgxs"

bot = telebot.TeleBot(TOKEN_TELEGRAM)

@bot.message_handler(commands=['start'])
def mulai_pesan(message):
    bot.reply_to(message, """✅ Halo Imam! Kirimkan NOMOR RESI saja, nanti saya lacak otomatis!
(Dukungan: SiCepat, JNE, J&T, dll.)""")

@bot.message_handler(func=lambda pesan: True)
def lacak_paket(message):
    nomor_resi = message.text.strip().upper()
    
    bot.reply_to(message, f"🔍 Sedang melacak: {nomor_resi}... mohon tunggu sebentar")
    
    url = f"https://api.rajaongkir.com/starter/waybill"
    headers = {"key": API_RAJAONGKIR}
    data = {"waybill": nomor_resi, "courier": "sicepat"}
    
    try:
        hasil = requests.post(url, headers=headers, data=data).json()
        cek = hasil['rajaongkir']['status']
        
        if cek['code'] != 200:
            bot.reply_to(message, "❌ Nomor resi tidak ditemukan! Coba periksa kembali.")
            return
        
        isi = hasil['rajaongkir']['result']
        status = isi['status']
        pengirim = isi['origin']['name']
        penerima = isi['destination']['name']
        cod = isi.get('cod', False)
        riwayat = isi['manifest']

        pesan_balas = f"""📦 NOMOR RESI: {nomor_resi}
🚚 Kurir: SiCepat
📌 Status: {status}
🏠 Dari: {pengirim}
👤 Penerima: {penerima}
💰 Jenis: {'COD' if cod else 'Non-COD (Sudah Dibayar)'}

📜 RIWAYAT PERJALANAN:
"""
        for baris in reversed(riwayat):
            pesan_balas += f"🕒 {baris['manifest_date']} {baris['manifest_time']} → {baris['manifest_description']}\n"

        bot.reply_to(message, pesan_balas)

    except Exception as e:
        bot.reply_to(message, f"⚠️ Terjadi kesalahan: {str(e)}")

print("✅ Bot sedang berjalan... Buka Telegram & kirim nomor resi!")
bot.infinity_polling()
