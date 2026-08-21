const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const API_KEY = process.env.BITESHIP_TOKEN;

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot aktif.\n\n" +
    "Kirim nomor resi SiCepat.\n\n" +
    "Contoh:\n004648099109"
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
        "❌ Biteship Error\n\n" +
        "HTTP: " + response.status + "\n" +
        "Pesan: " +
        (data.message || "Tidak ada pesan")
      );
    }

    const nama =
      data.destination?.contact_name ||
      data.receiver?.name ||
      data.recipient ||
      "-";

    const namaSensor =
      nama.length > 3
        ? nama.substring(0, 2) + "***"
        : "***";

    const status =
      data.status ||
      data.tracking_status ||
      "-";

    await ctx.reply(
      "📦 HASIL TEST\n\n" +
      "📮 Resi: " + resi + "\n" +
      "🚚 Kurir: SiCepat\n" +
      "👤 Penerima: " + namaSensor + "\n" +
      "📊 Status: " + status
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
