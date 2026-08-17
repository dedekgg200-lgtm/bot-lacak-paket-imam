const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

// Menyimpan chat yang sedang menunggu nomor resi
const waitingResi = new Set();

// =====================================================
// TELEGRAM
// =====================================================

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

async function sendMessage(chatId, text, keyboard = null) {
  const body = {
    chat_id: chatId,
    text: text
  };

  if (keyboard) {
    body.reply_markup = keyboard;
  }

  return telegram("sendMessage", body);
}

// =====================================================
// MENU UTAMA
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
    resize_keyboard: true,
    persistent: true
  };
}

// =====================================================
// BINDERBYTE
// =====================================================

async function cekResiSiCepat(awb) {
  const url =
    "https://api.binderbyte.com/v1/track" +
    "?api_key=" +
    encodeURIComponent(BINDERBYTE_API_KEY) +
    "&courier=sicepat" +
    "&awb=" +
    encodeURIComponent(awb);

  const response = await fetch(url);
  const json = await response.json();

  console.log(
    "BINDERBYTE RESPONSE:",
    JSON.stringify(json, null, 2)
  );

  return {
    httpStatus: response.status,
    json
  };
}

// =====================================================
// BACA FIELD DENGAN LEBIH AMAN
// =====================================================

function getValue(obj, keys) {
  if (!obj || typeof obj !== "object") {
    return "";
  }

  for (const key of keys) {
    if (
      obj[key] !== undefined &&
      obj[key] !== null &&
      String(obj[key]).trim() !== ""
    ) {
      return String(obj[key]).trim();
    }
  }

  return "";
}

// Cari field secara rekursif kalau struktur API berubah
function findField(obj, wantedKeys) {
  if (!obj || typeof obj !== "object") {
    return "";
  }

  for (const key of Object.keys(obj)) {
    if (
      wantedKeys
        .map(k => k.toLowerCase())
        .includes(key.toLowerCase())
    ) {
      const value = obj[key];

      if (
        value !== undefined &&
        value !== null &&
        typeof value !== "object" &&
        String(value).trim() !== ""
      ) {
        return String(value).trim();
      }
    }
  }

  for (const key of Object.keys(obj)) {
    if (obj[key] && typeof obj[key] === "object") {
      const result = findField(
        obj[key],
        wantedKeys
      );

      if (result) {
        return result;
      }
    }
  }

  return "";
}

// =====================================================
// COD / NONCOD
// =====================================================

function getService(data) {
  const summary = data?.summary || {};

  let service = getValue(summary, [
    "service",
    "Service"
  ]);

  if (!service) {
    service = findField(data, [
      "service"
    ]);
  }

  service = service
    .toUpperCase()
    .replace(/\s+/g, "");

  if (service === "COD") {
    return "COD";
  }

  if (
    service === "NONCOD" ||
    service === "NON-COD"
  ) {
    return "NON-COD";
  }

  return "DATA TIDAK TERSEDIA";
}

// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(data, awb) {
  const summary = data?.summary || {};
  const detail = data?.detail || {};

  const history = Array.isArray(data?.history)
    ? data.history
    : [];

  // SERVICE
  const service = getService(data);

  // STATUS
  let status = getValue(summary, [
    "status",
    "Status"
  ]);

  if (!status) {
    status = findField(data, [
      "status"
    ]);
  }

  // COURIER
  let courier = getValue(summary, [
    "courier",
    "Courier"
  ]);

  if (!courier) {
    courier = "SiCepat Express";
  }

  // PENGIRIM
  let shipper = getValue(detail, [
    "shipper",
    "Shipper"
  ]);

  if (!shipper) {
    shipper = findField(data, [
      "shipper"
    ]);
  }

  // PENERIMA
  let receiver = getValue(detail, [
    "receiver",
    "Receiver"
  ]);

  if (!receiver) {
    receiver = findField(data, [
      "receiver"
    ]);
  }

  // ASAL
  let origin = getValue(detail, [
    "origin",
    "Origin"
  ]);

  if (!origin) {
    origin = findField(data, [
      "origin"
    ]);
  }

  // TUJUAN
  let destination = getValue(detail, [
    "destination",
    "Destination"
  ]);

  if (!destination) {
    destination = findField(data, [
      "destination"
    ]);
  }

  if (!shipper) {
    shipper = "DATA TIDAK TERSEDIA";
  }

  if (!receiver) {
    receiver = "DATA TIDAK TERSEDIA";
  }

  if (!origin) {
    origin = "DATA TIDAK TERSEDIA";
  }

  if (!destination) {
    destination = "DATA TIDAK TERSEDIA";
  }

  if (!status) {
    status = "DATA TIDAK TERSEDIA";
  }

  // ===================================================
  // HASIL
  // ===================================================

  let text = "";

  text += "📦 EXPEDISI SICEPAT\n";
  text += `└ ${courier}\n\n`;

  text += "📩 Resi\n";
  text += `├ Service : ${service}\n`;
  text += `└ No Resi : ${awb}\n\n`;

  text += "📮 Status\n";
  text += `└ Status : ${status}\n\n`;

  text += "🚀 Pengirim\n";
  text += `├ ${shipper}\n`;
  text += `└ ${origin}\n\n`;

  text += "🚩 Penerima\n";
  text += `├ ${receiver}\n`;
  text += `└ ${destination}\n\n`;

  text += "📍 RIWAYAT PENGIRIMAN\n";

  if (history.length === 0) {
    text += "└ DATA RIWAYAT TIDAK TERSEDIA\n";
  } else {
    for (const item of history) {
      const desc =
        item?.desc ||
        item?.description ||
        "Keterangan tidak tersedia";

      const date =
        item?.date ||
        item?.datetime ||
        "Tanggal tidak tersedia";

      text += `\n✅ ${desc}\n`;
      text += `└ ${date}\n`;
    }
  }

  return text;
}

// =====================================================
// PROSES RESI
// =====================================================

async function prosesResi(chatId, awb) {
  awb = String(awb)
    .replace(/\s+/g, "")
    .trim();

  if (!awb) {
    await sendMessage(
      chatId,
      "❌ Nomor resi belum dikirim.",
      menuUtama()
    );
    return;
  }

  await sendMessage(
    chatId,
    `🔎 Sedang mengecek resi SiCepat:\n${awb}\n\nMohon tunggu...`
  );

  try {
    const response =
      await cekResiSiCepat(awb);

    const result = response.json;

    if (
      response.httpStatus !== 200 ||
      !result ||
      Number(result.status) !== 200
    ) {
      await sendMessage(
        chatId,
        "❌ Gagal mengambil data tracking.\n\n" +
        `Resi : ${awb}\n` +
        `Status API : ${result?.status || response.httpStatus}\n` +
        `Pesan : ${result?.message || "Silakan coba lagi."}`,
        menuUtama()
      );

      return;
    }

    if (!result.data) {
      await sendMessage(
        chatId,
        "❌ Data resi tidak ditemukan.",
        menuUtama()
      );

      return;
    }

    const hasil = formatTracking(
      result.data,
      awb
    );

    await sendMessage(
      chatId,
      hasil,
      menuUtama()
    );

  } catch (error) {
    console.error(
      "TRACKING ERROR:",
      error
    );

    await sendMessage(
      chatId,
      "❌ Terjadi kesalahan saat mengambil data.\n\n" +
      "Silakan coba lagi.",
      menuUtama()
    );
  }
}

// =====================================================
// TELEGRAM POLLING
// =====================================================

let offset = 0;

async function pollingTelegram() {
  try {
    const response = await telegram(
      "getUpdates",
      {
        offset: offset,
        timeout: 30
      }
    );

    if (
      !response.ok ||
      !Array.isArray(response.result)
    ) {
      return;
    }

    for (const update of response.result) {
      offset = update.update_id + 1;

      const message = update.message;

      if (!message || !message.text) {
        continue;
      }

      const chatId = message.chat.id;
      const text = message.text.trim();

      // START
      if (text === "/start") {
        waitingResi.delete(chatId);

        await sendMessage(
          chatId,
          "👋 Selamat datang.\n\n" +
          "Silakan tekan tombol di bawah untuk cek resi SiCepat.",
          menuUtama()
        );

        continue;
      }

      // TOMBOL CEK RESI
      if (
        text === "🔎 Cek Resi SiCepat"
      ) {
        waitingResi.add(chatId);

        await sendMessage(
          chatId,
          "📩 Silakan kirim nomor resi SiCepat.\n\n" +
          "Contoh:\n" +
          "004646985892\n\n" +
          "Tidak perlu mengetik /lacak.",
          menuUtama()
        );

        continue;
      }

      // USER SEDANG DIMINTA RESI
      if (waitingResi.has(chatId)) {
        waitingResi.delete(chatId);

        await prosesResi(
          chatId,
          text
        );

        continue;
      }

      // TETAP MENDUKUNG /LACAK
      if (
        text.toLowerCase().startsWith("/lacak")
      ) {
        const parts = text.split(/\s+/);

        const awb = parts
          .slice(1)
          .join("");

        await prosesResi(
          chatId,
          awb
        );

        continue;
      }
    }

  } catch (error) {
    console.error(
      "POLLING ERROR:",
      error
    );
  }
}

// =====================================================
// SERVER RAILWAY
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Bot Tracking SiCepat aktif"
  });
});

app.listen(PORT, () => {
  console.log(
    `Server aktif di port ${PORT}`
  );

  console.log(
    "TELEGRAM_TOKEN:",
    TELEGRAM_TOKEN ? "ADA" : "TIDAK ADA"
  );

  console.log(
    "BINDERBYTE_API_KEY:",
    BINDERBYTE_API_KEY
      ? "ADA"
      : "TIDAK ADA"
  );

  if (
    TELEGRAM_TOKEN &&
    BINDERBYTE_API_KEY
  ) {
    pollingTelegram();

    setInterval(
      pollingTelegram,
      1000
    );
  }
});
