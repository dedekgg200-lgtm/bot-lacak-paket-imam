const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

if (!TELEGRAM_TOKEN) {
  console.error("TELEGRAM_TOKEN belum diisi.");
}

if (!BINDERBYTE_API_KEY) {
  console.error("BINDERBYTE_API_KEY belum diisi.");
}

// ================================
// TELEGRAM API
// ================================

async function telegram(method, body = {}) {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  return await response.json();
}

// ================================
// BINDERBYTE - CEK RESI SICEPAT
// ================================

async function cekResiSiCepat(awb) {
  const url =
    "https://api.binderbyte.com/v1/track" +
    `?api_key=${encodeURIComponent(BINDERBYTE_API_KEY)}` +
    `&courier=sicepat` +
    `&awb=${encodeURIComponent(awb)}`;

  const response = await fetch(url);
  const result = await response.json();

  return {
    httpStatus: response.status,
    result
  };
}

// ================================
// FORMAT TRACKING
// ================================

function formatTracking(data, awb) {
  const summary = data.summary || {};
  const detail = data.detail || {};
  const history = Array.isArray(data.history) ? data.history : [];

  // Ambil SERVICE langsung dari BinderByte
  const serviceRaw = String(summary.service || "").trim();

  let service;

  if (serviceRaw.toUpperCase() === "COD") {
    service = "COD";
  } else if (
    serviceRaw.toUpperCase() === "NONCOD" ||
    serviceRaw.toUpperCase() === "NON-COD" ||
    serviceRaw.toUpperCase() === "NON COD"
  ) {
    service = "NON-COD";
  } else if (serviceRaw) {
    service = serviceRaw;
  } else {
    service = "DATA TIDAK TERSEDIA";
  }

  const status = summary.status || "DATA TIDAK TERSEDIA";

  const courier = summary.courier || "SiCepat Express";

  const shipper = detail.shipper || "DATA TIDAK TERSEDIA";
  const receiver = detail.receiver || "DATA TIDAK TERSEDIA";

  const origin = detail.origin || "DATA TIDAK TERSEDIA";
  const destination = detail.destination || "DATA TIDAK TERSEDIA";

  let message = "";

  message += "📦 EXPEDISI SICEPAT\n";
  message += `└ ${courier}\n\n`;

  message += "📩 Resi\n";
  message += `├ Service : ${service}\n`;
  message += `└ No Resi : ${awb}\n\n`;

  message += "📮 Status\n";
  message += `└ Status : ${status}\n\n`;

  message += "🚀 Pengirim\n";
  message += `├ ${shipper}\n`;
  message += `└ ${origin}\n\n`;

  message += "🚩 Penerima\n";
  message += `├ ${receiver}\n`;
  message += `└ ${destination}\n\n`;

  message += "📍 RIWAYAT PENGIRIMAN\n";

  if (history.length === 0) {
    message += "└ DATA RIWAYAT TIDAK TERSEDIA\n";
  } else {
    for (const item of history) {
      const tanggal = item.date || "Tanggal tidak tersedia";
      const keterangan = item.desc || "Keterangan tidak tersedia";

      message += `\n✅ ${keterangan}\n`;
      message += `└ ${tanggal}\n`;
    }
  }

  return message;
}

// ================================
// PERINTAH /START
// ================================

async function handleStart(chatId) {
  const text =
    "📦 BOT TRACKING SICEPAT\n\n" +
    "Gunakan perintah:\n\n" +
    "/lacak NOMOR_RESI\n\n" +
    "Contoh:\n" +
    "/lacak 004646985892";

  await telegram("sendMessage", {
    chat_id: chatId,
    text
  });
}

// ================================
// PROSES CEK RESI
// ================================

async function handleLacak(chatId, awb) {
  if (!awb) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text:
        "Masukkan nomor resi SiCepat.\n\n" +
        "Contoh:\n" +
        "/lacak 004646985892"
    });

    return;
  }

  awb = awb.replace(/\s+/g, "").trim();

  await telegram("sendMessage", {
    chat_id: chatId,
    text:
      "🔎 Sedang mengecek resi SiCepat:\n" +
      `${awb}\n\n` +
      "Mohon tunggu..."
  });

  try {
    const response = await cekResiSiCepat(awb);
    const result = response.result;

    if (
      response.httpStatus !== 200 ||
      !result ||
      Number(result.status) !== 200
    ) {
      await telegram("sendMessage", {
        chat_id: chatId,
        text:
          "❌ Gagal mengambil data tracking.\n\n" +
          `Nomor resi: ${awb}\n` +
          `Status API: ${result?.status || response.httpStatus}\n\n` +
          `${result?.message || "Silakan coba lagi."}`
      });

      return;
    }

    if (!result.data) {
      await telegram("sendMessage", {
        chat_id: chatId,
        text:
          "❌ Data tracking tidak ditemukan.\n\n" +
          `Nomor resi: ${awb}`
      });

      return;
    }

    const text = formatTracking(result.data, awb);

    await telegram("sendMessage", {
      chat_id: chatId,
      text
    });

  } catch (error) {
    console.error("ERROR TRACKING:", error);

    await telegram("sendMessage", {
      chat_id: chatId,
      text:
        "❌ Terjadi kesalahan saat mengambil data.\n\n" +
        "Silakan coba lagi."
    });
  }
}

// ================================
// TELEGRAM POLLING
// ================================

let offset = 0;

async function pollingTelegram() {
  try {
    const response = await telegram("getUpdates", {
      offset,
      timeout: 30
    });

    if (!response.ok || !Array.isArray(response.result)) {
      return;
    }

    for (const update of response.result) {
      offset = update.update_id + 1;

      if (!update.message || !update.message.text) {
        continue;
      }

      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === "/start") {
        await handleStart(chatId);
        continue;
      }

      if (text.toLowerCase().startsWith("/lacak")) {
        const parts = text.split(/\s+/);
        const awb = parts.slice(1).join("");

        await handleLacak(chatId, awb);
        continue;
      }
    }

  } catch (error) {
    console.error("TELEGRAM POLLING ERROR:", error);
  }
}

// ================================
// SERVER RAILWAY
// ================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Bot Tracking SiCepat aktif"
  });
});

app.listen(PORT, () => {
  console.log(`Server aktif di port ${PORT}`);

  if (TELEGRAM_TOKEN && BINDERBYTE_API_KEY) {
    console.log("TELEGRAM_TOKEN tersedia");
    console.log("BINDERBYTE_API_KEY tersedia");

    pollingTelegram();

    setInterval(() => {
      pollingTelegram();
    }, 1000);
  }
});
