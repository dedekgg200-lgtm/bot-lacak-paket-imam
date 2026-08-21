const { Bot, Keyboard } = require("grammy");
const axios = require("axios");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const BITESHIP_TOKEN = process.env.BITESHIP_TOKEN;

const keyboard = new Keyboard()
  .text("🔎 Cek Resi SiCepat")
  .resized();

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot Tracking SiCepat aktif.\n\n" +
    "Silakan kirim nomor resi SiCepat.\n\n" +
    "Contoh:\n004648099109",
    { reply_markup: keyboard }
  );
});

bot.hears("🔎 Cek Resi SiCepat", async (ctx) => {
  await ctx.reply("Silakan kirim nomor resi SiCepat.");
});

bot.on("message:text", async (ctx) => {
  const resi = ctx.message.text.trim();

  if (
    resi === "🔎 Cek Resi SiCepat" ||
    resi === "/start"
  ) {
    return;
  }

  if (!/^[A-Za-z0-9-]{6,30}$/.test(resi)) {
    return ctx.reply(
      "❌ Nomor resi tidak valid.\n\nKirim nomor resi SiCepat saja."
    );
  }

  if (!BITESHIP_TOKEN) {
    return ctx.reply(
      "❌ BITESHIP_TOKEN belum ditemukan di Railway."
    );
  }

  await ctx.reply("🔎 Sedang mengecek resi...\nMohon tunggu.");

  try {
    const url =
      `https://api.biteship.com/v1/trackings/${encodeURIComponent(resi)}/couriers/sicepat`;

    const response = await axios.get(url, {
      headers: {
        Authorization: BITESHIP_TOKEN,
        "Content-Type": "application/json"
      },
      timeout: 20000
    });

    const data = response.data;

    const penerima =
      data.destination?.contact_name ||
      data.receiver?.name ||
      "-";

    const status =
      data.status ||
      data.tracking_status ||
      data.history?.[data.history.length - 1]?.status ||
      "-";

    const courier =
      data.courier?.company ||
      "SiCepat";

    let pesan =
      `📦 *TRACKING SICEPAT*\n` +
      `━━━━━━━━━━━━━━\n` +
      `📮 *Resi:* ${data.waybill_id || resi}\n` +
      `🚚 *Kurir:* ${courier}\n` +
      `📊 *Status:* ${status}\n` +
      `👤 *Penerima:* ${penerima}\n`;

    // Tampilkan COD hanya kalau API benar-benar memberikan datanya
    if (data.cash_on_delivery) {
      const amount =
        data.cash_on_delivery.amount ??
        data.cash_on_delivery.value;

      if (amount !== undefined) {
        pesan +=
          `💰 *COD:* Rp ${Number(amount).toLocaleString("id-ID")}\n`;
      } else {
        pesan += `💰 *Jenis:* COD\n`;
      }
    } else {
      pesan += `💰 *Jenis:* Non-COD / data COD tidak tersedia\n`;
    }

    pesan += `━━━━━━━━━━━━━━`;

    await ctx.reply(pesan, {
      parse_mode: "Markdown"
    });

    // Riwayat tracking
    if (Array.isArray(data.history) && data.history.length > 0) {
      let riwayat = "📜 *RIWAYAT TRACKING*\n━━━━━━━━━━━━━━\n";

      for (const item of data.history.slice().reverse().slice(0, 10)) {
        riwayat +=
          `• *${item.status || "-"}*\n` +
          `${item.note || "-"}\n` +
          `${item.updated_at || ""}\n\n`;
      }

      await ctx.reply(riwayat, {
        parse_mode: "Markdown"
      });
    }

  } catch (error) {
    console.error(
      "Biteship error:",
      error.response?.data || error.message
    );

    const apiError = error.response?.data;

    if (error.response?.status === 401) {
      return ctx.reply(
        "❌ API Key Biteship ditolak.\n\n" +
        "Periksa BITESHIP_TOKEN di Railway."
      );
    }

    if (error.response?.status === 400) {
      return ctx.reply(
        "❌ Biteship menolak permintaan.\n\n" +
        "Resi mungkin belum terdaftar/aktif di Biteship atau format tracking tidak tersedia."
      );
    }

    await ctx.reply(
      "❌ Gagal mengambil tracking Biteship.\n\n" +
      `HTTP: ${error.response?.status || "-"}\n` +
      `Pesan: ${apiError?.message || error.message}`
    );
  }
});

bot.catch((err) => {
  console.error("BOT ERROR:", err);
});

bot.start();

console.log("🤖 Bot Tracking SiCepat aktif.");
