const { Bot, Keyboard } = require("grammy");
const axios = require("axios");
const express = require("express");

const bot = new Bot(process.env.TELEGRAM_TOKEN);

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot Tracking BinderByte aktif");
});

app.listen(PORT, () => {
  console.log("Server berjalan di port " + PORT);
});

// ==========================
// SENSOR NAMA
// ==========================

function sensorNama(nama) {
  if (!nama) return "-";

  nama = String(nama).trim();

  if (nama.length <= 2) {
    return nama.substring(0, 1) + "***";
  }

  return nama.substring(0, 2) + "***";
}

// ==========================
// FORMAT STATUS
// ==========================

function formatStatus(status) {
  if (!status) return "DATA TIDAK TERSEDIA";

  return String(status)
    .replace(/_/g, " ")
    .toUpperCase();
}

// ==========================
// START
// ==========================

const keyboard = new Keyboard()
  .text("🔎 Cek Resi SiCepat")
  .resized();

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Bot Tracking SiCepat aktif.\n\n" +
    "Tekan tombol di bawah lalu kirim nomor resi.",
    {
      reply_markup: keyboard
    }
  );
});

// ==========================
// TOMBOL CEK RESI
// ==========================

bot.hears("🔎 Cek Resi SiCepat", async (ctx) => {
  await ctx.reply("Silakan kirim nomor resi SiCepat.");
});

// ==========================
// CEK RESI
// ==========================

bot.on("message:text", async (ctx) => {

  const resi = ctx.message.text.trim();

  if (resi === "🔎 Cek Resi SiCepat") return;

  if (resi.startsWith("/")) return;

  if (!/^[A-Za-z0-9]+$/.test(resi)) {
    await ctx.reply(
      "❌ Nomor resi tidak valid.\n\n" +
      "Kirim nomor resi SiCepat saja."
    );
    return;
  }

  await ctx.reply("🔎 Sedang melacak resi...\nMohon tunggu.");

  try {

    const response = await axios.get(
      "https://api.binderbyte.com/v1/track",
      {
        params: {
          api_key: process.env.BINDERBYTE_API_KEY,
          courier: "sicepat",
          awb: resi
        },
        timeout: 20000
      }
    );

    const data = response.data;

    console.log(
      "BINDERBYTE RESPONSE:",
      JSON.stringify(data, null, 2)
    );

    if (
      !data ||
      data.status !== 200 ||
      !data.data
    ) {
      await ctx.reply(
        "❌ Resi tidak ditemukan.\n\n" +
        "Pastikan nomor resi benar."
      );
      return;
    }

    const tracking = data.data;

    const summary = tracking.summary || {};
    const detail = tracking.detail || {};
    const history = tracking.history || [];

    // ==========================
    // DATA
    // ==========================

    const service =
      summary.service ||
      "DATA TIDAK TERSEDIA";

    const status =
      summary.status ||
      tracking.status ||
      "DATA TIDAK TERSEDIA";

    const pengirim =
      detail.shipper ||
      detail.sender ||
      "-";

    const kotaPengirim =
      detail.origin ||
      detail.shipper_address ||
      "-";

    const penerima =
      detail.receiver ||
      detail.recipient ||
      "-";

    const kotaPenerima =
      detail.destination ||
      detail.receiver_address ||
      "-";

    // ==========================
    // PESAN
    // ==========================

    let pesan =
`📦 EXPEDISI SICEPAT
└ SiCepat Express

📩 Resi
├ Service : ${service}
└ No Resi : ${resi}

📮 Status
└ Status : ${formatStatus(status)}

🚀 Pengirim
├ ${pengirim}
└ ${kotaPengirim}

🚩 Penerima
├ ${sensorNama(penerima)}
└ ${kotaPenerima}

⏩ POD Detail`;

    // ==========================
    // RIWAYAT
    // ==========================

    if (Array.isArray(history) && history.length > 0) {

      for (const item of history) {

        const desc =
          item.desc ||
          item.description ||
          item.status ||
          "UPDATE PAKET";

        const waktu =
          item.date ||
          item.updated_at ||
          item.time ||
          "-";

        pesan +=
          "\n\n✅ " +
          String(desc).toUpperCase() +
          "\n└ " +
          waktu;
      }

    } else {

      pesan +=
        "\n\n❌ RIWAYAT TIDAK TERSEDIA";
    }

    // ==========================
    // KIRIM
    // ==========================

    await ctx.reply(pesan);

  } catch (error) {

    console.error(
      "ERROR BINDERBYTE:",
      error.response?.data || error.message
    );

    await ctx.reply(
      "❌ Gagal mengambil data resi.\n\n" +
      "Silakan coba lagi."
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
      "🤖 BOT AKTIF: @" +
      info.username
    );
  }
});
