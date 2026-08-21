const { Bot } = require("grammy");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BITESHIP_TOKEN = process.env.BITESHIP_TOKEN;

if (!TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN belum diisi");
}

if (!BITESHIP_TOKEN) {
  throw new Error("BITESHIP_TOKEN belum diisi");
}

const bot = new Bot(TOKEN);

// ===============================
// START
// ===============================

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot Tracking SiCepat aktif.\n\n" +
    "Silakan kirim nomor resi SiCepat.\n\n" +
    "Contoh:\n" +
    "004648099109"
  );
});

// ===============================
// CEK RESI
// ===============================

bot.on("message:text", async (ctx) => {

  const resi = ctx.message.text.trim();

  // Abaikan perintah
  if (resi.startsWith("/")) {
    return;
  }

  // Validasi nomor resi
  if (!/^[0-9A-Za-z]{8,30}$/.test(resi)) {
    await ctx.reply(
      "❌ Nomor resi tidak valid.\n\n" +
      "Kirim nomor resi SiCepat saja."
    );
    return;
  }

  await ctx.reply("🔎 Sedang mengecek resi...\nMohon tunggu.");

  try {

    const url =
      "https://api.biteship.com/v1/trackings/" +
      encodeURIComponent(resi) +
      "/couriers/sicepat";

    console.log("CEK RESI:", resi);
    console.log("URL:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${BITESHIP_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    const result = await response.json();

    console.log(
      "BITESHIP RESPONSE:",
      JSON.stringify(result, null, 2)
    );

    // ===============================
    // ERROR API
    // ===============================

    if (!response.ok) {

      if (response.status === 401) {
        await ctx.reply(
          "❌ API Biteship tidak menerima token.\n\n" +
          "Periksa BITESHIP_TOKEN di Railway."
        );
        return;
      }

      if (response.status === 404) {
        await ctx.reply(
          "❌ Resi tidak ditemukan di Biteship.\n\n" +
          "Resi: " + resi
        );
        return;
      }

      await ctx.reply(
        "❌ API Biteship mengalami masalah.\n\n" +
        "HTTP: " + response.status
      );

      return;
    }

    // ===============================
    // DATA
    // ===============================

    const data = result.data || {};

    const summary = data.summary || {};

    const nomorResi =
      summary.awb ||
      data.waybill ||
      data.waybill_id ||
      resi;

    const status =
      summary.status ||
      data.status ||
      "DATA TIDAK TERSEDIA";

    const service =
      summary.service ||
      data.service ||
      "DATA TIDAK TERSEDIA";

    const penerima =
      data.recipient ||
      data.receiver?.name ||
      data.received?.recipient ||
      "DATA TIDAK TERSEDIA";

    const kurir =
      summary.courier ||
      data.courier ||
      "SiCepat";

    // ===============================
    // COD
    // ===============================

    const cod =
      data.cash_on_delivery ||
      data.cod ||
      null;

    let pembayaran;

    if (cod) {

      pembayaran = "💰 COD";

      const nominal =
        cod.amount ??
        cod.value ??
        cod.nominal;

      if (
        nominal !== undefined &&
        nominal !== null
      ) {
        pembayaran +=
          "\n💵 Nominal : Rp " +
          Number(nominal).toLocaleString("id-ID");
      }

    } else {

      pembayaran =
        "💳 COD : DATA TIDAK TERSEDIA";
    }

    // ===============================
    // HASIL
    // ===============================

    let pesan = "";

    pesan += "📦 <b>TRACKING SICEPAT</b>\n";
    pesan += "━━━━━━━━━━━━━━━━━━\n\n";

    pesan +=
      "📮 <b>Resi</b>\n" +
      "└ <code>" +
      nomorResi +
      "</code>\n\n";

    pesan +=
      "👤 <b>Penerima</b>\n" +
      "└ " +
      penerima +
      "\n\n";

    pesan +=
      "🚚 <b>Kurir</b>\n" +
      "└ " +
      kurir +
      "\n\n";

    pesan +=
      "📋 <b>Service</b>\n" +
      "└ " +
      service +
      "\n\n";

    pesan +=
      "📊 <b>Status</b>\n" +
      "└ " +
      status +
      "\n\n";

    pesan += pembayaran;

    await ctx.reply(
      pesan,
      {
        parse_mode: "HTML"
      }
    );

  } catch (error) {

    console.error(
      "ERROR:",
      error
    );

    await ctx.reply(
      "❌ Terjadi kesalahan saat menghubungi API Biteship."
    );
  }
});

// ===============================
// ERROR TELEGRAM
// ===============================

bot.catch((error) => {
  console.error(
    "TELEGRAM ERROR:",
    error.error
  );
});

// ===============================
// JALANKAN BOT
// ===============================

bot.start({
  onStart: (info) => {
    console.log(
      "🤖 BOT AKTIF: @" +
      info.username
    );
  }
});
