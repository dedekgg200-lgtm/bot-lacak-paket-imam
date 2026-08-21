const { Bot } = require("grammy");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BITESHIP_TOKEN = process.env.BITESHIP_TOKEN;

if (!TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN belum diisi");
}

if (!BITESHIP_TOKEN) {
  throw new Error("BITESHIP_TOKEN belum diisi");
}

const bot = new Bot(TELEGRAM_TOKEN);

app.get("/", (req, res) => {
  res.send("Bot aktif");
});

app.listen(PORT, () => {
  console.log("SERVER AKTIF");
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot tracking aktif.\n\n" +
    "Kirim seperti ini:\n" +
    "sicepat 004646985892"
  );
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return;

  const [courier, resi] = text.split(/\s+/);

  if (!courier || !resi) {
    return ctx.reply(
      "❌ Format salah.\n\n" +
      "Contoh:\n" +
      "sicepat 004646985892"
    );
  }

  await ctx.reply("🔎 Mengecek resi...");

  try {
    const url =
      "https://api.biteship.com/v1/trackings/" +
      encodeURIComponent(resi) +
      "/couriers/" +
      encodeURIComponent(courier.toLowerCase());

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${BITESHIP_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    console.log("BITESHIP:", JSON.stringify(data));

    if (!response.ok) {
      return ctx.reply(
        "❌ Gagal cek resi.\n\n" +
        "HTTP: " + response.status + "\n" +
        "Resi: " + resi
      );
    }

    const d = data.data || {};
    const summary = d.summary || {};

    const nomor =
      summary.awb ||
      d.waybill_id ||
      d.waybill ||
      resi;

    const kurir =
      summary.courier ||
      d.courier ||
      courier;

    const service =
      summary.service ||
      d.service ||
      "-";

    const status =
      summary.status ||
      d.status ||
      "-";

    const penerima =
      d.received?.recipient ||
      d.recipient ||
      d.receiver?.name ||
      "-";

    let pesan =
      "📦 TRACKING PAKET\n\n" +
      "📮 Resi : " + nomor + "\n" +
      "🚚 Kurir : " + kurir + "\n" +
      "📋 Service : " + service + "\n" +
      "👤 Penerima : " + penerima + "\n" +
      "📊 Status : " + status;

    // COD hanya ditampilkan jika API benar-benar mengirim datanya
    const cod = d.cash_on_delivery || d.cod;

    if (cod) {
      pesan += "\n💰 Pembayaran : COD";

      if (cod.amount != null) {
        pesan +=
          "\n💵 Nominal : Rp " +
          Number(cod.amount).toLocaleString("id-ID");
      }
    } else {
      pesan += "\n💰 Pembayaran : NON-COD / DATA COD TIDAK TERSEDIA";
    }

    await ctx.reply(pesan);

  } catch (error) {
    console.error("ERROR:", error);

    await ctx.reply(
      "❌ Terjadi error saat menghubungi Biteship.\n\n" +
      error.message
    );
  }
});

bot.catch((err) => {
  console.error("TELEGRAM ERROR:", err.error);
});

bot.start();

console.log("BOT TELEGRAM AKTIF");
