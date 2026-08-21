const { Bot } = require("grammy");
const express = require("express");

const app = express();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BITESHIP_TOKEN = process.env.BITESHIP_TOKEN;

const bot = new Bot(TOKEN);

app.get("/", (req, res) => {
  res.send("Bot aktif");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server aktif di port " + PORT);
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot Tracking SiCepat aktif.\n\n" +
    "Kirim nomor resi SiCepat.\n\n" +
    "Contoh:\n004648099109"
  );
});

bot.on("message:text", async (ctx) => {

  const resi = ctx.message.text.trim();

  if (resi.startsWith("/")) return;

  if (!/^[A-Za-z0-9]+$/.test(resi)) {
    await ctx.reply(
      "❌ Nomor resi tidak valid.\n\n" +
      "Kirim nomor resi saja."
    );
    return;
  }

  await ctx.reply("🔎 Sedang mengecek resi...\nMohon tunggu.");

  try {

    const url =
      "https://api.biteship.com/v1/trackings/" +
      encodeURIComponent(resi) +
      "/couriers/sicepat";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + BITESHIP_TOKEN,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    console.log("STATUS API:", response.status);
    console.log(JSON.stringify(data, null, 2));

    if (!response.ok) {

      await ctx.reply(
        "❌ Biteship menolak tracking.\n\n" +
        "HTTP: " + response.status + "\n" +
        "Pesan: " +
        (data.message || "Tracking tidak ditemukan.")
      );

      return;
    }

    let pesan =
      "📦 HASIL TRACKING\n\n" +
      "📮 Resi: " +
      (data.waybill_id || resi) +
      "\n" +
      "🚚 Kurir: " +
      (data.courier?.company || "SiCepat") +
      "\n" +
      "👤 Penerima: " +
      (data.destination?.contact_name || "-") +
      "\n" +
      "📌 Status: " +
      (data.status || "-");

    if (Array.isArray(data.history)) {

      pesan += "\n\n📋 RIWAYAT TRACKING";

      for (const item of data.history.slice(0, 10)) {

        pesan +=
          "\n\n" +
          "📅 " + (item.updated_at || "-") +
          "\n" +
          "📌 " + (item.status || "-") +
          "\n" +
          "📝 " + (item.note || "-");
      }
    }

    await ctx.reply(pesan);

  } catch (error) {

    console.error(error);

    await ctx.reply(
      "❌ Terjadi kesalahan.\n\n" +
      error.message
    );
  }
});

bot.catch((err) => {
  console.error("BOT ERROR:", err);
});

bot.start();

console.log("Telegram bot berjalan.");
