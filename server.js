const { Bot } = require("grammy");
const axios = require("axios");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BITESHIP_TOKEN = process.env.BITESHIP_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN belum diisi");
  process.exit(1);
}

if (!BITESHIP_TOKEN) {
  console.error("BITESHIP_TOKEN belum diisi");
  process.exit(1);
}

const bot = new Bot(TELEGRAM_TOKEN);

// ==========================
// START
// ==========================
bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot Tracking SiCepat aktif.\n\n" +
    "Kirim nomor resi SiCepat saja.\n\n" +
    "Contoh:\n004648099109"
  );
});

// ==========================
// TOMBOL CEK RESI
// ==========================
bot.hears("🔎 Cek Resi SiCepat", async (ctx) => {
  await ctx.reply("Silakan kirim nomor resi SiCepat.");
});

// ==========================
// TRACKING RESI
// ==========================
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  // Abaikan command
  if (text.startsWith("/")) return;

  // Abaikan tombol
  if (text === "🔎 Cek Resi SiCepat") return;

  // Validasi nomor resi
  if (!/^[A-Za-z0-9]+$/.test(text)) {
    await ctx.reply(
      "❌ Nomor resi tidak valid.\n\nKirim nomor resi SiCepat saja."
    );
    return;
  }

  const resi = text;

  await ctx.reply(
    "🔎 Sedang mengecek resi...\nMohon tunggu."
  );

  try {
    const url =
      `https://api.biteship.com/v1/trackings/${encodeURIComponent(resi)}/couriers/sicepat`;

    const response = await axios.get(url, {
      headers: {
        Authorization: BITESHIP_TOKEN,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });

    const data = response.data;

    console.log("HASIL BITESHIP:");
    console.log(JSON.stringify(data, null, 2));

    // ==========================
    // DATA DASAR
    // ==========================
    const waybill =
      data.waybill_id ||
      data.id ||
      resi;

    const courier =
      data.courier?.company ||
      "SiCepat";

    const receiver =
      data.destination?.contact_name ||
      "-";

    const status =
      data.status ||
      "-";

    // ==========================
    // HASIL
    // ==========================
    let pesan =
      "📦 HASIL TRACKING\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      `📮 Resi: ${waybill}\n` +
      `🚚 Kurir: ${courier}\n` +
      `👤 Penerima: ${receiver}\n` +
      `📌 Status: ${status}\n`;

    // ==========================
    // RIWAYAT
    // ==========================
    if (Array.isArray(data.history) && data.history.length > 0) {
      pesan += "\n📋 RIWAYAT:\n";

      data.history.slice(0, 10).forEach((item) => {
        const waktu = item.updated_at || "-";
        const statusHistory = item.status || "-";
        const catatan = item.note || "";

        pesan += `\n• ${waktu}\n`;
        pesan += `  ${statusHistory}`;

        if (catatan) {
          pesan += ` - ${catatan}`;
        }
      });
    }

    pesan += "\n\n━━━━━━━━━━━━━━━━━━";
    pesan += "\nData diambil dari Biteship.";

    // PENTING:
    // Tidak menggunakan Markdown / MarkdownV2
    await ctx.reply(pesan);

  } catch (error) {

    console.error("ERROR BITESHIP:");

    if (error.response) {
      console.error("HTTP:", error.response.status);
      console.error(
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error(error.message);
    }

    let pesanError =
      "❌ Gagal mengambil tracking Biteship.\n\n";

    if (error.response) {
      pesanError += `HTTP: ${error.response.status}\n`;

      if (error.response.data?.message) {
        pesanError +=
          `Pesan: ${error.response.data.message}`;
      } else {
        pesanError +=
          "Biteship menolak atau gagal memproses permintaan.";
      }

    } else {
      pesanError +=
        "Tidak dapat terhubung ke server Biteship.";
    }

    // Tanpa Markdown supaya tidak muncul
    // error "can't parse entities"
    await ctx.reply(pesanError);
  }
});

// ==========================
// SERVER RAILWAY
// ==========================
app.get("/", (req, res) => {
  res.send("Bot Tracking SiCepat aktif.");
});

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

// ==========================
// JALANKAN BOT
// ==========================
bot.start();

console.log("Bot Telegram Tracking SiCepat aktif.");
