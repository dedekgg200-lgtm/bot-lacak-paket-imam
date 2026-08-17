const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

// Chat yang sedang menunggu nomor resi
const waitingResi = new Set();

// =====================================================
// TELEGRAM
// =====================================================

async function telegram(method, body = {}) {
  if (!TELEGRAM_TOKEN) {
    throw new Error("TELEGRAM_TOKEN belum diset.");
  }

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

  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      `Telegram HTTP ${response.status}: ${JSON.stringify(json)}`
    );
  }

  return json;
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
  if (!BINDERBYTE_API_KEY) {
    throw new Error("BINDERBYTE_API_KEY belum diset.");
  }

  const params = new URLSearchParams({
    api_key: BINDERBYTE_API_KEY,
    courier: "sicepat",
    awb: awb
  });

  const url =
    `https://api.binderbyte.com/v1/track?${params.toString()}`;

  const response = await fetch(url);

  let json;

  try {
    json = await response.json();
  } catch (error) {
    throw new Error(
      `Respons BinderByte bukan JSON. HTTP ${response.status}`
    );
  }

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
// NILAI FIELD
// =====================================================

function clean(value, fallback = "") {
  if (
    value === undefined ||
    value === null ||
    typeof value === "object"
  ) {
    return fallback;
  }

  const result = String(value).trim();

  return result || fallback;
}

// =====================================================
// SERVICE COD / NONCOD
// =====================================================
//
// BinderByte:
// data.summary.service
//
// Jangan menebak COD dari nominal, deskripsi history,
// atau field lain. Hanya gunakan nilai service dari API.
// =====================================================

function getService(data) {
  const service = clean(
    data?.summary?.service
  ).toUpperCase();

  if (!service) {
    return "DATA TIDAK TERSEDIA";
  }

  // Normalisasi beberapa kemungkinan penulisan API
  if (
    service === "NONCOD" ||
    service === "NON-COD" ||
    service === "NON COD"
  ) {
    return "NON-COD";
  }

  if (service === "COD") {
    return "COD";
  }

  // Kalau BinderByte mengirim service lain,
  // tampilkan apa adanya dan jangan memaksakan COD.
  return service;
}

// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(data, inputAwb) {
  const summary = data?.summary || {};
  const detail = data?.detail || {};

  const history = Array.isArray(data?.history)
    ? data.history
    : [];

  // -----------------------------------------------
  // DATA UTAMA DARI SUMMARY
  // -----------------------------------------------

  const awb = clean(
    summary.awb,
    inputAwb
  );

  const courier = clean(
    summary.courier,
    "SiCepat Express"
  );

  const service = getService(data);

  const status = clean(
    summary.status,
    "DATA TIDAK TERSEDIA"
  );

  // -----------------------------------------------
  // DETAIL
  // -----------------------------------------------

  const shipper = clean(
    detail.shipper,
    "DATA TIDAK TERSEDIA"
  );

  const receiver = clean(
    detail.receiver,
    "DATA TIDAK TERSEDIA"
  );

  const origin = clean(
    detail.origin,
    "DATA TIDAK TERSEDIA"
  );

  const destination = clean(
    detail.destination,
    "DATA TIDAK TERSEDIA"
  );

  // -----------------------------------------------
  // HASIL
  // -----------------------------------------------

  let text = "";

  text += "📦 EXPEDISI SICEPAT\n";
  text += `└ ${courier}\n\n`;

  text += "📩 RESI\n";
  text += `├ Service : ${service}\n`;
  text += `└ No Resi : ${awb}\n\n`;

  text += "📮 STATUS TERBARU\n";
  text += `└ ${status}\n\n`;

  text += "🚀 PENGIRIM\n";
  text += `├ ${shipper}\n`;
  text += `└ ${origin}\n\n`;

  text += "🚩 PENERIMA\n";
  text += `├ ${receiver}\n`;
  text += `└ ${destination}\n\n`;

  text += "📍 RIWAYAT PENGIRIMAN\n";

  if (history.length === 0) {
    text += "└ DATA RIWAYAT TIDAK TERSEDIA\n";
  } else {
    history.forEach((item, index) => {
      const date = clean(
        item?.date || item?.datetime,
        "Tanggal tidak tersedia"
      );

      const desc = clean(
        item?.desc || item?.description,
        "Keterangan tidak tersedia"
      );

      const location = clean(
        item?.location,
        "Lokasi tidak tersedia"
      );

      text += `\n${index + 1}. ${date}\n`;
      text += `├ ${desc}\n`;
      text += `└ 📍 ${location}\n`;
    });
  }

  return text;
}

// =====================================================
// PROSES RESI
// =====================================================

async function prosesResi(chatId, awb) {
  awb = String(awb || "")
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
    const response = await cekResiSiCepat(awb);
    const result = response.json;

    // -----------------------------------------------
    // VALIDASI RESPONS BINDERBYTE
    // -----------------------------------------------

    if (
      response.httpStatus !== 200 ||
      !result ||
      Number(result.status) !== 200
    ) {
      await sendMessage(
        chatId,
        "❌ Gagal mengambil data tracking.\n\n" +
        `Resi : ${awb}\n` +
        `Status API : ${
          result?.status ?? response.httpStatus
        }\n` +
        `Pesan : ${
          result?.message ||
          "Silakan periksa nomor resi dan coba lagi."
        }`,
        menuUtama()
      );

      return;
    }

    if (
      !result.data ||
      typeof result.data !== "object"
    ) {
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
      "❌ Terjadi kesalahan saat mengambil data tracking.\n\n" +
      `${error.message || "Silakan coba lagi."}`,
      menuUtama()
    );
  }
}

// =====================================================
// TELEGRAM POLLING
// =====================================================

let offset = 0;
let pollingRunning = false;

async function pollingTelegram() {
  if (pollingRunning) {
    return;
  }

  pollingRunning = true;

  try {
    const response = await telegram(
      "getUpdates",
      {
        offset: offset,
        timeout: 30,
        allowed_updates: ["message"]
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

      // ---------------------------------------------
      // START
      // ---------------------------------------------

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

      // ---------------------------------------------
      // TOMBOL CEK RESI
      // ---------------------------------------------

      if (text === "🔎 Cek Resi SiCepat") {
        waitingResi.add(chatId);

        await sendMessage(
          chatId,
          "📩 Silakan kirim nomor resi SiCepat.\n\n" +
          "Contoh:\n" +
          "004646985892\n\n" +
          "Kirim nomor resi saja.",
          menuUtama()
        );

        continue;
      }

      // ---------------------------------------------
      // USER SEDANG MENUNGGU RESI
      // ---------------------------------------------

      if (waitingResi.has(chatId)) {
        waitingResi.delete(chatId);

        await prosesResi(
          chatId,
          text
        );

        continue;
      }

      // ---------------------------------------------
      // /LACAK MASIH DIDUKUNG
      // ---------------------------------------------

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
      error.message || error
    );
  } finally {
    pollingRunning = false;
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
  } else {
    console.error(
      "Environment variable belum lengkap."
    );
  }
});
