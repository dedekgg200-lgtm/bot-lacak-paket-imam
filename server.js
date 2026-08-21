const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const API_KEY = process.env.BITESHIP_TOKEN;

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot aktif.\n\n" +
    "Kirim nomor resi SiCepat."
  );
});

bot.on("message:text", async (ctx) => {
  const resi = ctx.message.text.trim();

  if (resi.startsWith("/")) return;

  if (!/^[A-Za-z0-9]+$/.test(resi)) {
    return ctx.reply("❌ Kirim nomor resi saja.");
  }

  await ctx.reply("🔎 Mengecek resi...");

  try {
    const url =
      "https://api.biteship.com/v1/trackings/" +
      encodeURIComponent(resi) +
      "/couriers/sicepat";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": API_KEY,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    console.log("HTTP:", response.status);
    console.log("RESPONSE:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      return ctx.reply(
        "❌ Gagal cek resi.\n\n" +
        "HTTP: " + response.status + "\n" +
        "Pesan: " + (data.message || "Tidak tersedia")
      );
    }

    // SERVICE
    const service =
      data.service ||
      data.courier?.type ||
      data.courier?.service ||
      "-";

    // PEMBAYARAN
    const paymentType =
      data.payment_type ||
      data.payment?.type ||
      data.payment?.payment_type ||
      null;

    let pembayaran = "Tidak diketahui";

    if (paymentType === "cod") {
      pembayaran = "COD";
    } else if (
      paymentType === "prepaid" ||
      paymentType === "postpaid"
    ) {
      pembayaran = "NON-COD";
    }

    await ctx.reply(
      "📦 HASIL PAKET\n\n" +
      "📮 Resi: " + resi + "\n" +
      "🚚 Service: " + service + "\n" +
      "💰 Pembayaran: " + pembayaran
    );

  } catch (error) {

    console.error("ERROR:", error);

    await ctx.reply(
      "❌ Error koneksi\n\n" +
      error.message
    );
  }
});

bot.catch((error) => {
  console.error("BOT ERROR:", error.error);
});

bot.start({
  onStart: (info) => {
    console.log("🤖 BOT AKTIF: @" + info.username);
  }
});
