const { Bot } = require("grammy");

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const API_KEY = process.env.BITESHIP_TOKEN;

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

  // Abaikan command
  if (resi.startsWith("/")) {
    return;
  }

  // Validasi
  if (!/^[A-Za-z0-9]+$/.test(resi)) {
    await ctx.reply(
      "❌ Nomor resi tidak valid.\n\n" +
      "Kirim nomor resi SiCepat saja."
    );
    return;
  }

  await ctx.reply(
    "🔎 Sedang mengecek resi...\nMohon tunggu."
  );

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

    // Simpan response di Railway Logs
    console.log("================================");
    console.log("RESI:", resi);
    console.log("HTTP:", response.status);
    console.log(JSON.stringify(data, null, 2));
    console.log("================================");

    // ==========================
    // JIKA API ERROR
    // ==========================

    if (!response.ok) {

      await ctx.reply(
        "❌ Biteship menolak permintaan.\n\n" +
        "HTTP: " + response.status + "\n" +
        "Pesan: " +
        (data.message || "Tracking tidak tersedia.")
      );

      return;
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

    if (nama && nama !== "-") {

      if (nama.length <= 3) {
        namaSensor = nama.substring(0, 1) + "***";
      } else {
        namaSensor =
          nama.substring(0, 2) + "***";
      }
    }

    // ==========================
    // PESAN UTAMA
    // ==========================

    let pesan =
      "📦 HASIL TRACKING\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      "📮 Resi: " + nomorResi + "\n" +
      "🚚 Kurir: " + kurir + "\n" +
      "👤 Penerima: " + namaSensor + "\n" +
      "📊 Status: " + status;

    // ==========================
    // COD
    // ==========================

    const cod =
      data.cash_on_delivery ||
      data.cod ||
      data.payment?.cod;

    if (cod) {

      pesan +=
        "\n\n💰 COD: YA";

      if (cod.amount != null) {

        pesan +=
          "\n💵 Nominal: Rp " +
          Number(cod.amount).toLocaleString("id-ID");
      }

      if (cod.status) {

        pesan +=
          "\n💳 Status COD: " +
          cod.status;
      }

    } else {

      pesan +=
        "\n\n💰 COD: Tidak tersedia di response API";
    }

    // ==========================
    // RIWAYAT
    // ==========================

    const history =
      data.history ||
      data.courier?.history ||
      [];

    if (Array.isArray(history) && history.length > 0) {

      pesan +=
        "\n\n📋 RIWAYAT TRACKING";

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

    if (!podImage && data.proof_of_delivery?.photo_url) {

      podImage =
        data.proof_of_delivery.photo_url;
    }

    if (podImage) {

      pesan +=
        "\n\n📸 POD: Tersedia";

    } else {

      pesan +=
        "\n\n📸 POD: Belum tersedia";
    }

    pesan +=
      "\n━━━━━━━━━━━━━━━━━━";

    // ==========================
    // KIRIM HASIL
    // ==========================

    await ctx.reply(pesan);

    // ==========================
    // KIRIM FOTO POD JIKA ADA
    // ==========================

    if (podImage) {

      try {

        await ctx.replyWithPhoto(podImage, {
          caption: "📸 Bukti Pengiriman (POD)"
        });

      } catch (fotoError) {

        console.error(
          "Gagal mengirim foto POD:",
          fotoError.message
        );
      }
    }

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
// JALANKAN BOT
// ==========================

bot.start({
  onStart: (info) => {

    console.log(
      "🤖 BOT AKTIF: @" +
      info.username
    );

  }
});
