const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const API_KEY = process.env.BITESHIP_TOKEN;

// ==========================
// START
// ==========================

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot Tracking SiCepat aktif.\n\n" +
    "Kirim nomor resi SiCepat."
  );
});

// ==========================
// SENSOR NAMA
// ==========================

function sensorNama(nama) {
  if (!nama || nama === "-") return "-";

  nama = String(nama).trim();

  if (nama.length <= 2) {
    return nama.charAt(0) + "***";
  }

  return nama.substring(0, 2) + "***";
}

// ==========================
// TRACKING
// ==========================

bot.on("message:text", async (ctx) => {

  const resi = ctx.message.text.trim();

  if (resi.startsWith("/")) return;

  if (!/^[A-Za-z0-9]+$/.test(resi)) {
    return ctx.reply("❌ Kirim nomor resi saja.");
  }

  await ctx.reply("🔎 Mengecek resi...");

  try {

    // ==========================
    // PUBLIC TRACKING
    // ==========================

    const trackingUrl =
      "https://api.biteship.com/v1/trackings/" +
      encodeURIComponent(resi) +
      "/couriers/sicepat";

    const response = await fetch(trackingUrl, {
      method: "GET",
      headers: {
        "Authorization": API_KEY,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    console.log("========== TRACKING ==========");
    console.log(JSON.stringify(data, null, 2));
    console.log("==============================");

    if (!response.ok) {
      return ctx.reply(
        "❌ Gagal cek resi.\n\n" +
        "HTTP: " + response.status + "\n" +
        "Pesan: " +
        (data.message || "Tidak tersedia")
      );
    }

    // ==========================
    // RESI
    // ==========================

    const nomorResi =
      data.waybill_id ||
      resi;

    // ==========================
    // KURIR
    // ==========================

    const courier =
      data.courier?.company ||
      "SiCepat";

    // ==========================
    // SERVICE
    // ==========================

    const service =
      data.courier?.type ||
      data.courier?.service ||
      data.service ||
      data.history?.[0]?.service_type ||
      "-";

    // ==========================
    // PENERIMA
    // ==========================

    const nama =
      data.destination?.contact_name ||
      data.receiver?.name ||
      data.recipient ||
      "-";

    const namaSensor =
      sensorNama(nama);

    // ==========================
    // STATUS
    // ==========================

    const status =
      data.status ||
      data.tracking_status ||
      "-";

    // ==========================
    // PEMBAYARAN
    // ==========================

    let pembayaran = "Tidak diketahui";

    /*
      Jangan menebak COD dari status paket.

      Hanya baca kalau API benar-benar
      memberikan informasi pembayaran.
    */

    const paymentType =
      data.payment_type ||
      data.payment?.type ||
      data.payment?.payment_type ||
      null;

    if (paymentType === "cod") {

      pembayaran = "COD";

    } else if (
      paymentType === "prepaid" ||
      paymentType === "postpaid"
    ) {

      pembayaran = "NON-COD";
    }

    // ==========================
    // HASIL
    // ==========================

    let pesan =
      "📦 HASIL PAKET\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      "📮 Resi: " + nomorResi + "\n" +
      "🚚 Kurir: " + courier + "\n" +
      "📋 Service: " + service + "\n" +
      "👤 Penerima: " + namaSensor + "\n" +
      "💰 Pembayaran: " + pembayaran + "\n" +
      "📊 Status: " + status +
      "\n━━━━━━━━━━━━━━━━━━";

    await ctx.reply(pesan);

  } catch (error) {

    console.error(
      "ERROR:",
      error
    );

    await ctx.reply(
      "❌ Terjadi kesalahan.\n\n" +
      error.message
    );
  }
});

// ==========================
// ERROR BOT
// ==========================

bot.catch((error) => {
  console.error(
    "BOT ERROR:",
    error.error
  );
});

// ==========================
// START BOT
// ==========================

bot.start({
  onStart: (info) => {
    console.log(
      "🤖 BOT AKTIF: @" + info.username
    );
  }
});
