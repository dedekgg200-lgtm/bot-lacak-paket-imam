const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

const waitingResi = new Set();

let offset = 0;
let pollingRunning = false;


// =====================================================
// TELEGRAM
// =====================================================

async function telegram(method, body = {}) {

  if (!TELEGRAM_TOKEN) {
    throw new Error("TELEGRAM_TOKEN belum tersedia.");
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


// =====================================================
// KIRIM PESAN
// =====================================================

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
    resize_keyboard: true,
    persistent: true
  };
}


// =====================================================
// CLEAN VALUE
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
// BINDERBYTE
// =====================================================

async function cekResiSiCepat(awb) {

  if (!BINDERBYTE_API_KEY) {
    throw new Error("BINDERBYTE_API_KEY belum tersedia.");
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
  } catch {
    throw new Error(
      `Respons BinderByte tidak valid. HTTP ${response.status}`
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
// SERVICE
// =====================================================

function getService(data) {

  const rawService = clean(
    data?.summary?.service
  );

  if (!rawService) {
    return "DATA TIDAK TERSEDIA";
  }

  return rawService;
}


// =====================================================
// STATUS
// =====================================================

function getStatus(data) {

  const summary = data?.summary || {};

  const history = Array.isArray(data?.history)
    ? data.history
    : [];

  let status = clean(summary.status);

  if (status) {
    return status;
  }

  if (history.length > 0) {

    const latest = history[0];

    status = clean(
      latest?.status ||
      latest?.Status
    );

    if (status) {
      return status;
    }

    status = clean(
      latest?.desc ||
      latest?.description
    );

    if (status) {
      return status;
    }
  }

  return "STATUS TIDAK TERSEDIA";
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

  const awb = clean(
    summary.awb,
    inputAwb
  );

  const courier = clean(
    summary.courier,
    "SiCepat Express"
  );

  const service = getService(data);
  const status = getStatus(data);

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

  text += "⏩ POD Detail\n";

  if (history.length === 0) {

    text += "└ DATA RIWAYAT TIDAK TERSEDIA\n";

  } else {

    history.forEach((item) => {

      const date = clean(
        item?.date ||
        item?.datetime ||
        item?.updated_at,
        "Tanggal tidak tersedia"
      );

      const desc = clean(
        item?.desc ||
        item?.description ||
        item?.note,
        "Keterangan tidak tersedia"
      );

      text += `\n✅ ${desc}\n`;
      text += `└ ${date}\n`;

      if (item?.location) {
        text += `└ 📍 ${item.location}\n`;
      }
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

    const response =
      await cekResiSiCepat(awb);

    const result =
      response.json;

    console.log(
      "HASIL API:",
      JSON.stringify(result, null, 2)
    );

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
          "Silakan coba lagi."
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

    const hasil =
      formatTracking(
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
      error.message || error
    );

    await sendMessage(
      chatId,

      "❌ Terjadi kesalahan saat mengambil data tracking.\n\n" +
      "Silakan coba lagi.",

      menuUtama()
    );
  }
}


// =====================================================
// TELEGRAM POLLING
// =====================================================

async function pollingTelegram() {

  if (pollingRunning) {
    return;
  }

  pollingRunning = true;

  try {

    const response =
      await telegram(
        "getUpdates",
        {
          offset: offset,
          timeout: 30,
          allowed_updates: [
            "message"
          ]
        }
      );

    if (
      !response.ok ||
      !Array.isArray(response.result)
    ) {
      return;
    }

    for (
      const update
      of response.result
    ) {

      offset =
        update.update_id + 1;

      const message =
        update.message;

      if (
        !message ||
        !message.text
      ) {
        continue;
      }

      const chatId =
        message.chat.id;

      const text =
        message.text.trim();

      console.log(
        "PESAN TELEGRAM:",
        chatId,
        text
      );


      // =================================================
      // START
      // =================================================

      if (
        text === "/start"
      ) {

        waitingResi.delete(
          chatId
        );

        await sendMessage(
          chatId,

          "👋 Selamat datang.\n\n" +
          "Silakan tekan tombol di bawah untuk cek resi SiCepat.",

          menuUtama()
        );

        continue;
      }


      // =================================================
      // TOMBOL CEK RESI
      // =================================================

      if (
        text === "🔎 Cek Resi SiCepat"
      ) {

        waitingResi.add(
          chatId
        );

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


      // =================================================
      // MENUNGGU RESI
      // =================================================

      if (
        waitingResi.has(chatId)
      ) {

        waitingResi.delete(
          chatId
        );

        await prosesResi(
          chatId,
          text
        );

        continue;
      }


      // =================================================
      // /LACAK
      // =================================================

      if (
        text
          .toLowerCase()
          .startsWith("/lacak")
      ) {

        const parts =
          text.split(/\s+/);

        const awb =
          parts
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
// SERVER
// =====================================================

app.get(
  "/",
  (req, res) => {

    res.json({

      success: true,

      message:
        "Bot Tracking SiCepat aktif"
    });
  }
);


// =====================================================
// JALANKAN SERVER
// =====================================================

app.listen(
  PORT,
  () => {

    console.log(
      `Server aktif di port ${PORT}`
    );

    console.log(
      "TELEGRAM_TOKEN:",
      TELEGRAM_TOKEN
        ? "ADA"
        : "TIDAK ADA"
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

      console.log(
        "Memulai Telegram polling..."
      );

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
  }
);
