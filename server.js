const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const API_KEY = process.env.BITESHIP_TOKEN);

// ==========================
// START
// ==========================

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot Tracking SiCepat aktif.\n\n" +
    "Silakan kirim nomor resi SiCepat.\n\n" +
    "Contoh:\n004648099109"
  );
});

// ==========================
// TRACKING
// ==========================

bot.on("message:text", async (ctx) => {
  const resi = ctx.message.text.trim();

  if (resi.startsWith("/")) return;

  if (!/^[A-Za-z0-9]+$/.test(resi)) {
    return ctx.reply(
      "❌ Nomor resi tidak valid.\n\n" +
      "Kirim nomor resi SiCepat saja."
    );
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
        Authorization: API_KEY,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    console.log("========== Biteship ==========");
    console.log("RESI:", resi);
    console.log("HTTP:", response.status);
    console.log(JSON.stringify(data, null, 2));
    console.log("==============================");

    if (!response.ok) {
      return ctx.reply(
        "❌ Biteship menolak permintaan.\n\n" +
        "HTTP: " + response.status + "\n" +
        "Pesan: " +
        (data.message || "Tracking tidak tersedia.")
      );
    }

    // ==========================
    // DATA UTAMA
    // ==========================

    const nomorResi =
      data.waybill_id ||
      data.courier?.waybill_id ||
      resi;

    const kurir =
      data.courier?.company ||
      "SiCepat";

    const status =
      data.status ||
      data.tracking_status ||
      "-";

    // ==========================
    // NAMA PENERIMA
    // ==========================

    const nama =
      data.destination?.contact_name ||
      data.receiver?.name ||
      data.recipient ||
      "-";

    let namaSensor = "***";

    if (nama !== "-" && nama.length > 0) {
      namaSensor =
        nama.length <= 3
          ? nama.substring(0, 1) + "***"
          : nama.substring(0, 2) + "***";
    }

    // ==========================
    // HASIL AWAL
    // ==========================

    let pesan =
      "📦 HASIL TRACKING\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      "📮 Resi: " + nomorResi + "\n" +
      "🚚 Kurir: " + kurir + "\n" +
      "👤 Penerima: " + namaSensor + "\n" +
      "📊 Status: " + status;

    // ==========================
    // PEMBAYARAN
    // ==========================

    const paymentType =
      data.payment_type ||
      data.payment?.type ||
      data.payment?.payment_type ||
      null;

    console.log("PAYMENT TYPE:", paymentType);

    if (paymentType === "cod") {

      pesan += "\n\n💰 Pembayaran: COD";

      const nominal =
        data.cod?.amount ||
        data.cash_on_delivery?.amount ||
        data.payment?.amount ||
        null;

      if (nominal) {
        pesan +=
          "\n💵 Nominal: Rp " +
          Number(nominal).toLocaleString("id-ID");
      }

      if (status === "delivered") {
        pesan += "\n💳 Status: Sudah diterima";
      } else if (status === "rejected") {
        pesan += "\n💳 Status: Ditolak/retur";
      } else {
        pesan += "\n💳 Status: Belum selesai";
      }

    } else if (
      paymentType === "prepaid" ||
      paymentType === "postpaid"
    ) {

      pesan += "\n\n💰 Pembayaran: NON-COD";

      if (paymentType === "prepaid") {
        pesan += "\n💳 Status: Sudah dibayar";
      }

    } else {

      // Jangan menebak kalau Biteship tidak memberikan
      // informasi jenis pembayaran.
      pesan +=
        "\n\n💰 Pembayaran: Tidak diketahui";
    }

    // ==========================
    // RIWAYAT TRACKING
    // ==========================

    const history =
      data.history ||
      data.courier?.history ||
      [];

    if (Array.isArray(history) && history.length > 0) {

      pesan += "\n\n📋 RIWAYAT TRACKING";

      for (const item of history.slice(0, 10)) {

        pesan +=
          "\n\n📅 " +
          (item.updated_at || "-");

        pesan +=
          "\n📊 " +
          (item.status || "-");

        if (item.note) {
          pesan +=
            "\n📝 " +
            item.note;
        }
      }
    }

    // ==========================
    // POD
    // ==========================

    let podImage = null;

    if (Array.isArray(history)) {

      for (const item of history) {

        if (
          Array.isArray(item.proof_of_delivery_images) &&
          item.proof_of_delivery_images.length > 0
        ) {
          podImage =
            item.proof_of_delivery_images[0];
          break;
        }
      }
    }

    if (
      !podImage &&
      data.proof_of_delivery?.photo_url
    ) {
      podImage =
        data.proof_of_delivery.photo_url;
    }

    if (podImage) {
      pesan += "\n\n📸 POD: Tersedia";
    } else {
      pesan += "\n\n📸 POD: Belum tersedia";
    }

    pesan +=
      "\n━━━━━━━━━━━━━━━━━━";

    // ==========================
    // KIRIM HASIL
    // ==========================

    await ctx.reply(pesan);

    // ==========================
    // KIRIM FOTO POD
    // ==========================

    if (podImage) {

      try {

        await ctx.replyWithPhoto(podImage, {
          caption: "📸 Bukti Pengiriman (POD)"
        });

      } catch (error) {

        console.error(
          "Gagal mengirim POD:",
          error.message
        );
      }
    }

  } catch (error) {

    console.error("ERROR:", error);

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
  console.error("BOT ERROR:", error.error);
});

// ==========================
// JALANKAN BOT
// ==========================

bot.start({
  onStart: (info) => {
    console.log(
      "🤖 BOT AKTIF: @" + info.username
    );
  }
});
