const { Bot } = require("grammy");
const axios = require("axios");

// Mengambil Token Telegram dan API Key Biteship dengan aman dari Railway Variables
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const BITESHIP_API_KEY = process.env.BITESHIP_TOKEN;

// Pesan awal ketika Anda mengetik /start di bot Telegram
bot.command("start", (ctx) => {
    ctx.reply("👋 *Halo Bos!* Bot pelacak siap digunakan.\n\nKirimkan nomor ID Order / Nomor Resi dari Biteship Anda untuk memantau paket SiCepat COD & bukti POD.", { parse_mode: "Markdown" });
});

// Logika utama saat Anda mengirimkan nomor resi/order ke bot
bot.on("message:text", async (ctx) => {
    const orderId = ctx.message.text.trim();
    
    // Notifikasi awal agar Anda tahu bot sedang bekerja
    await ctx.reply("🔍 _Sedang menghubungkan ke server Biteship, mohon tunggu..._", { parse_mode: "Markdown" });

    try {
        // Mengambil data dari API Tracking Biteship
        const response = await axios.get(`https://biteship.com{orderId}`, {
            headers: {
                "Authorization": `Bearer ${BITESHIP_API_KEY}`,
                "Content-Type": "application/json"
            }
        });

        const trackingData = response.data;

        // --- 1. SUSUN DATA KORIDOR UTAMA PAKET ---
        let pesan = `📦 *DETAIL PELACAKAN PAKET*\n`;
        pesan += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        pesan += `🆔 *ID Order/Resi* : \`${trackingData.id}\`\n`;
        pesan += `🚚 *Ekspedisi*       : ${trackingData.courier.company.toUpperCase()} (${trackingData.courier.type.toUpperCase()})\n`;
        pesan += `🚨 *Status Paket*   : *${trackingData.status.toUpperCase()}*\n\n`;

        // --- 2. CEK STATUS PAKET COD ATAU BUKAN ---
        if (trackingData.cash_on_delivery !== null) {
            pesan += `💰 *INFORMASI PAKET COD:*\n`;
            pesan += `• *Total Tagihan* : Rp ${trackingData.cash_on_delivery.amount.toLocaleString('id-ID')}\n`;
            pesan += `• *Biaya Admin*  : Rp ${trackingData.cash_on_delivery.fee.toLocaleString('id-ID')}\n`;
            pesan += `• *Status Uang*  : *${trackingData.cash_on_delivery.status.toUpperCase()}*\n\n`;
        } else {
            pesan += `ℹ️ *Jenis Paket* : Non-COD (Sudah Lunas)\n\n`;
        }

        // --- 3. TAMPILKAN BUKTI PENERIMAAN (POD) TANPA SENSOR ---
        if (trackingData.status === "delivered" && trackingData.proof_of_delivery) {
            pesan += `📸 *BUKTI PENERIMAAN (POD):*\n`;
            // Nama penerima ditampilkan penuh dan asli dari kurir lapangan tanpa disensor
            pesan += `• *Nama Penerima* : *${trackingData.proof_of_delivery.receiver_name}*\n`;
            pesan += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            
            // Kirim teks detailnya terlebih dahulu
            await ctx.reply(pesan, { parse_mode: "Markdown" });

            // Jika kurir SiCepat melampirkan foto rumah/paket, bot langsung mengirimkan fotonya
            if (trackingData.proof_of_delivery.photo_url) {
                await ctx.replyWithPhoto(trackingData.proof_of_delivery.photo_url, {
                    caption: "📷 Foto Asli Bukti Penyerahan Paket dari Kurir"
                });
            }
        } else {
            // Jika status paket belum delivered (masih di jalan)
            pesan += `⚠️ _Catatan: Nama penerima dan foto bukti POD akan muncul otomatis setelah paket sukses diterima (DELIVERED)._\n`;
            pesan += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            await ctx.reply(pesan, { parse_mode: "Markdown" });
        }

    } catch (error) {
        console.error("Error API Biteship:", error.message);
        ctx.reply("❌ *Gagal Melacak Resi!*\n\nPastikan data berikut benar:\n1. ID Order valid.\n2. Akun Biteship Anda tidak diblokir.\n3. Token API di Railway sudah sesuai.", { parse_mode: "Markdown" });
    }
});

// Menyalakan bot secara konstan di Railway
bot.start();
console.log("Bot pelacak internal Biteship aktif!");
  
