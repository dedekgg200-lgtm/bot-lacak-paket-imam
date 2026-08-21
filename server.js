const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const API_KEY = process.env.BITESHIP_TOKEN;

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot aktif.\n\nKirim nomor resi SiCepat."
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
    // =================================
    // 1. CEK PUBLIC TRACKING
    // =================================

    const trackingUrl =
      "https://api.biteship.com/v1/trackings/" +
      encodeURIComponent(resi) +
      "/couriers/sicepat";

    const trackingResponse = await fetch(trackingUrl, {
      method: "GET",
      headers: {
        "Authorization": API_KEY,
        "Content-Type": "application/json"
      }
    });

    const tracking = await trackingResponse.json();

    console.log(
      "TRACKING:",
      JSON.stringify(tracking, null, 2)
    );

    if (!trackingResponse.ok) {
      return ctx.reply(
        "❌ Gagal cek resi.\n\n" +
        "HTTP: " +
        trackingResponse.status +
        "\n" +
        "Pesan: " +
        (tracking.message || "Tidak tersedia")
      );
    }

    // =================================
    // 2. SERVICE
    // =================================

    const service =
      tracking.service ||
      tracking.courier?.type ||
      tracking.history?.[0]?.service_type ||
      "SiCepat";

    // =================================
    // 3. CARI ORDER ID
    // =================================

    const orderId =
      tracking.order_id ||
      tracking.orderId ||
      null;

    let pembayaran = "Tidak diketahui";

    // =================================
    // 4. JIKA ADA ORDER ID,
    //    CEK DETAIL ORDER
    // =================================

    if (orderId) {

      console.log(
        "ORDER ID DITEMUKAN:",
        orderId
      );

      const orderUrl =
        "https://api.biteship.com/v1/orders/" +
        encodeURIComponent(orderId);

      const orderResponse = await fetch(orderUrl, {
        method: "GET",
        headers: {
          "Authorization": API_KEY,
          "Content-Type": "application/json"
        }
      });

      const order = await orderResponse.json();

      console.log(
        "ORDER RESPONSE:",
        JSON.stringify(order, null, 2)
      );

      if (orderResponse.ok) {

        const cod =
          order.destination?.cash_on_delivery ||
          order.cash_on_delivery ||
          null;

        if (cod) {
          pembayaran = "COD";
        } else {
          pembayaran = "NON-COD";
        }
      }
    }

    // =================================
    // 5. HASIL
    // =================================

    await ctx.reply(
      "📦 HASIL PAKET\n\n" +
      "📮 Resi: " +
      resi +
      "\n" +
      "🚚 Service: " +
      service +
      "\n" +
      "💰 Pembayaran: " +
      pembayaran
    );

  } catch (error) {

    console.error(
      "ERROR:",
      error
    );

    await ctx.reply(
      "❌ Terjadi error.\n\n" +
      error.message
    );
  }
});

bot.catch((error) => {
  console.error(
    "BOT ERROR:",
    error.error
  );
});

bot.start({
  onStart: (info) => {
    console.log(
      "🤖 BOT AKTIF: @" +
      info.username
    );
  }
});
