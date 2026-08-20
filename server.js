const express = require("express");
const { Bot } = require("grammy");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BITESHIP_TOKEN = process.env.BITESHIP_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN belum diisi di Railway Variables.");
}

if (!BITESHIP_TOKEN) {
  console.error("❌ BITESHIP_TOKEN belum diisi di Railway Variables.");
}

const bot = new Bot(TELEGRAM_BOT_TOKEN);

// =====================================================
// MENU
// =====================================================

function menuUtama() {
  return {
    keyboard: [
      [
        {
          text: "🔎 Cek Resi SiCepat"
        }
      ]
    ],
    resize_keyboard: true
  };
}

// =====================================================
// START
// =====================================================

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Selamat datang!\n\n" +
    "Bot Tracking SiCepat siap digunakan.\n\n" +
    "Silakan tekan tombol di bawah.",
    {
      reply_markup: menuUtama()
    }
  );
});

// =====================================================
// BERSIHKAN RESI
// =====================================================

function ambilResi(text) {
  return String(text || "")
    .split(/[\n,\s]+/)
    .map(x => x.trim())
    .filter(x => x.length >= 8 && x.length <= 30);
}

// =====================================================
// ESCAPE TELEGRAM
// =====================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// =====================================================
// REQUEST BITESHIP
// =====================================================

async function cekResiBiteship(resi) {

  const url =
    "https://api.biteship.com/v1/trackings/" +
    encodeURIComponent(resi) +
    "/couriers/sicepat";

  console.log("🔎 Cek Biteship:", resi);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": BITESHIP_TOKEN,
      "Content-Type": "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  console.log(
    "BITESHIP RESPONSE:",
    JSON.stringify(data, null, 2)
  );

  return {
    status: response.status,
    data
  };
}

// =====================================================
// AMBIL NILAI
// =====================================================

function nilai(obj, ...keys) {

  for (const key of keys) {

    const value = obj?.[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(data, resi) {

  const root = data || {};

  const tracking =
    Array.isArray(root.tracking)
      ? root.tracking
      : Array.isArray(root.history)
        ? root.history
        : [];

  const courier =
    nilai(
      root,
      "courier",
      "courier_name"
    ) || "SiCepat";

  const waybill =
    nilai(
      root,
      "waybill",
      "awb",
      "tracking_number"
    ) || resi;

  const status =
    nilai(
      root,
      "status",
      "current_status"
    ) || "DATA TIDAK TERSEDIA";

  const service =
    nilai(
      root,
      "service",
      "service_type"
    );

  const sender =
    nilai(
      root,
      "sender",
      "shipper"
    );

  const receiver =
    nilai(
      root,
      "recipient",
      "receiver"
    );

  const origin =
    nilai(
      root,
      "from",
      "origin"
    );

  const destination =
    nilai(
      root,
      "to",
      "destination"
    );

  let text = "";

  text += "📦 <b>EXPEDISI SICEPAT</b>\n";
  text += `└ ${escapeHtml(courier)}\n\n`;

  text += "📩 <b>RESI</b>\n";
  text += `├ No Resi : <code>${escapeHtml(waybill)}</code>\n`;

  if (service) {
    text += `└ Service : ${escapeHtml(service)}\n`;
  }

  text += "\n";

  text += "📮 <b>STATUS</b>\n";
  text += `└ ${escapeHtml(status)}\n\n`;

  if (sender || origin) {

    text += "🚀 <b>PENGIRIM</b>\n";

    if (sender) {
      text += `├ ${escapeHtml(sender)}\n`;
    }

    if (origin) {
      text += `└ ${escapeHtml(origin)}\n`;
    }

    text += "\n";
  }

  if (receiver || destination) {

    text += "🚩 <b>PENERIMA</b>\n";

    if (receiver) {
      text += `├ ${escapeHtml(receiver)}\n`;
    }

    if (destination) {
      text += `└ ${escapeHtml(destination)}\n`;
    }

    text += "\n";
  }

  text += "📍 <b>RIWAYAT PENGIRIMAN</b>\n";

  if (tracking.length === 0) {

    text += "└ Data riwayat tidak tersedia.\n";

  } else {

    tracking.forEach((item, index) => {

      const date =
        nilai(
          item,
          "date",
          "datetime",
          "time"
        ) || "-";

      const desc =
        nilai(
          item,
          "desc",
          "description",
          "status"
        ) || "-";

      const location =
        nilai(
          item,
          "location",
          "city"
        );

      text += `\n<b>${index + 1}. ${escapeHtml(date)}</b>\n`;
      text += `└ ${escapeHtml(desc)}\n`;

      if (location) {
        text += `└ 📍 ${escapeHtml(location)}\n`;
      }
    });
  }

  return text;
}

// =====================================================
// PROSES SATU RESI
// =====================================================

async function prosesSatuResi(ctx, resi) {

  try {

    const hasil =
      await cekResiBiteship(resi);

    if (hasil.status === 401) {

      await ctx.reply(
        "❌ API Biteship menolak autentikasi.\n\n" +
        "Periksa BITESHIP_TOKEN di Railway Variables."
      );

      return;
    }

    if (hasil.status === 404) {

      await ctx.reply(
        `❌ Resi tidak ditemukan di Biteship.\n\n` +
        `Resi: ${resi}`
      );

      return;
    }

    if (hasil.status < 200 || hasil.status >= 300) {

      await ctx.reply(
        `❌ Gagal mengambil data resi.\n\n` +
        `Resi: ${resi}\n` +
        `HTTP: ${hasil.status}`
      );

      return;
    }

    const data = hasil.data?.data || hasil.data;

    const pesan =
      formatTracking(data, resi);

    await ctx.reply(
      pesan,
      {
        parse_mode: "HTML",
        reply_markup: menuUtama()
      }
    );

  } catch (error) {

    console.error(
      "ERROR TRACKING:",
      error
    );

    await ctx.reply(
      "❌ Terjadi kesalahan saat menghubungi Biteship."
    );
  }
}

// =====================================================
// TOMBOL CEK RESI
// =====================================================

bot.hears(
  "🔎 Cek Resi SiCepat",
  async (ctx) => {

    await ctx.reply(
      "📦 <b>CEK RESI SICEPAT</b>\n\n" +
      "Kirim nomor resi.\n\n" +
      "Bisa satu resi:\n" +
      "<code>004646985892</code>\n\n" +
      "Atau beberapa resi sekaligus:\n" +
      "<code>004646985892\n004646985893\n004646985894</code>",
      {
        parse_mode: "HTML",
        reply_markup: menuUtama()
      }
    );
  }
);

// =====================================================
// TERIMA RESI
// =====================================================

bot.on(
  "message:text",
  async (ctx) => {

    const text =
      ctx.message.text.trim();

    if (
      text === "/start" ||
      text === "🔎 Cek Resi SiCepat"
    ) {
      return;
    }

    const resiList =
      ambilResi(text);

    if (resiList.length === 0) {

      await ctx.reply(
        "❌ Nomor resi tidak terbaca.\n\n" +
        "Silakan kirim nomor resi SiCepat.",
        {
          reply_markup: menuUtama()
        }
      );

      return;
    }

    await ctx.reply(
      `🔎 Mengecek ${resiList.length} resi...\n\nMohon tunggu.`
    );

    for (const resi of resiList) {

      await prosesSatuResi(
        ctx,
        resi
      );

      // jeda kecil agar request tidak terlalu rapat
      await new Promise(
        resolve =>
          setTimeout(resolve, 500)
      );
    }
  }
);

// =====================================================
// ERROR BOT
// =====================================================

bot.catch((error) => {

  console.error(
    "GRAMMY ERROR:",
    error.error
  );
});

// =====================================================
// SERVER RAILWAY
// =====================================================

app.get("/", (req, res) => {

  res.json({
    status: "online",
    bot: "Telegram SiCepat Tracking Biteship",
    telegram:
      TELEGRAM_BOT_TOKEN
        ? "configured"
        : "missing",
    biteship:
      BITESHIP_TOKEN
        ? "configured"
        : "missing"
  });
});

// =====================================================
// START SERVER + BOT
// =====================================================

app.listen(
  PORT,
  async () => {

    console.log(
      `✅ Server aktif di port ${PORT}`
    );

    console.log(
      "TELEGRAM_BOT_TOKEN:",
      TELEGRAM_BOT_TOKEN
        ? "ADA"
        : "TIDAK ADA"
    );

    console.log(
      "BITESHIP_TOKEN:",
      BITESHIP_TOKEN
        ? "ADA"
        : "TIDAK ADA"
    );

    if (
      !TELEGRAM_BOT_TOKEN ||
      !BITESHIP_TOKEN
    ) {

      console.error(
        "❌ Environment Variables belum lengkap."
      );

      return;
    }

    try {

      await bot.start();

      console.log(
        "🤖 Bot Telegram berhasil dijalankan."
      );

    } catch (error) {

      console.error(
        "❌ Gagal menjalankan bot:",
        error
      );
    }
  }
);
