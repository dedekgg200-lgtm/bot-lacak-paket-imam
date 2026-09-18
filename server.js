const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

// =====================================================
// ID TELEGRAM YANG DIIZINKAN
// Diambil dari Railway:
// ADMIN_TELEGRAM_ID=123456789,987654321
// =====================================================

const ADMIN_TELEGRAM_IDS = process.env.ADMIN_TELEGRAM_ID
  ? process.env.ADMIN_TELEGRAM_ID
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];


// =====================================================
// MENYIMPAN PILIHAN KURIR SEMENTARA
// =====================================================

const waitingResi = new Map();

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
// MENU UTAMA
// =====================================================

function menuUtama() {

  return {
    keyboard: [
      [
        {
          text: "🔎 Cek Resi SiCepat"
        }
      ],
      [
        {
          text: "🔎 Cek Resi ID Express"
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
// CEK RESI BINDERBYTE
// =====================================================

async function cekResi(awb, courier) {

  if (!BINDERBYTE_API_KEY) {
    throw new Error("BINDERBYTE_API_KEY belum tersedia.");
  }

  const params = new URLSearchParams({
    api_key: BINDERBYTE_API_KEY,
    courier: courier,
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

function formatTracking(
  data,
  inputAwb,
  courierName
) {

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
    courierName
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

  text += `📦 EXPEDISI ${courierName.toUpperCase()}\n`;
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
// PROSES SATU RESI
// =====================================================

async function prosesSatuResi(
  chatId,
  awb,
  courierCode,
  courierName
) {

  awb = String(awb || "")
    .replace(/\s+/g, "")
    .trim();

  if (!awb) {
    return;
  }

  await sendMessage(
    chatId,
    `🔎 Mengecek resi ${courierName}:\n${awb}\n\nMohon tunggu...`
  );

  try {

    const response =
      await cekResi(
        awb,
        courierCode
      );

    const result =
      response.json;

    if (
      response.httpStatus !== 200 ||
      !result ||
      Number(result.status) !== 200
    ) {

      await sendMessage(
        chatId,

        "❌ Gagal mengambil data tracking.\n\n" +
        `Resi : ${awb}\n` +
        `Ekspedisi : ${courierName}\n` +
        `Pesan : ${
          result?.message ||
          "Resi tidak ditemukan."
        }`
      );

      return;
    }

    if (
      !result.data ||
      typeof result.data !== "object"
    ) {

      await sendMessage(
        chatId,
        `❌ Data resi ${awb} tidak ditemukan.`
      );

      return;
    }

    const hasil =
      formatTracking(
        result.data,
        awb,
        courierName
      );

    await sendMessage(
      chatId,
      hasil
    );

  } catch (error) {

    console.error(
      "TRACKING ERROR:",
      error.message || error
    );

    await sendMessage(
      chatId,
      `❌ Gagal mengecek resi ${awb}.\n\nSilakan coba lagi.`
    );
  }

}


// =====================================================
// PROSES BANYAK RESI
// =====================================================

async function prosesBanyakResi(
  chatId,
  text,
  courierCode,
  courierName
) {

  const resiList = text
    .split(/\r?\n/)
    .map((item) =>
      item.replace(/[\s,]+/g, "").trim()
    )
    .filter((item) =>
      item.length > 0
    );

  const unik = [
    ...new Set(resiList)
  ];

  if (unik.length > 50) {

    await sendMessage(
      chatId,
      "❌ Maksimal 50 resi sekali kirim."
    );

    return;
  }

  for (const resi of unik) {

    await prosesSatuResi(
      chatId,
      resi,
      courierCode,
      courierName
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 1000)
    );
  }

  await sendMessage(
    chatId,
    "✅ Semua resi selesai dicek.",
    menuUtama()
  );
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


      // =================================================
      // CEK ID TELEGRAM
      // =================================================

      const userId =
        String(message.from?.id || "");

      if (
        ADMIN_TELEGRAM_IDS.length === 0
      ) {

        console.error(
          "❌ ADMIN_TELEGRAM_ID belum diatur di Railway."
        );

        continue;
      }

      if (
        !ADMIN_TELEGRAM_IDS.includes(userId)
      ) {

        console.log(
          "❌ AKSES DITOLAK - Telegram ID:",
          userId
        );

        await sendMessage(
          message.chat.id,
          "❌ Maaf, bot ini hanya dapat digunakan oleh admin."
        );

        continue;
      }


      // =================================================
      // USER DIIZINKAN
      // =================================================

      const chatId =
        message.chat.id;

      const text =
        message.text.trim();

      console.log(
        "PESAN TELEGRAM:",
        userId,
        text
      );


      // =================================================
      // START
      // =================================================

      if (text === "/start") {

        waitingResi.delete(chatId);

        await sendMessage(
          chatId,

          "👋 Selamat datang.\n\n" +
          "Silakan pilih ekspedisi yang ingin dicek.\n\n" +
          "💡 Bisa mengirim 1 resi atau beberapa resi sekaligus.",

          menuUtama()
        );

        continue;
      }


      // =================================================
      // SICEPAT
      // =================================================

      if (
        text === "🔎 Cek Resi SiCepat"
      ) {

        waitingResi.set(
          chatId,
          {
            courierCode: "sicepat",
            courierName: "SiCepat Express"
          }
        );

        await sendMessage(
          chatId,

          "📩 Silakan kirim nomor resi SiCepat.\n\n" +
          "Bisa 1 resi atau banyak resi.\n\n" +
          "Maksimal 50 resi.",

          menuUtama()
        );

        continue;
      }


      // =================================================
      // ID EXPRESS
      // =================================================

      if (
        text === "🔎 Cek Resi ID Express"
      ) {

        waitingResi.set(
          chatId,
          {
            courierCode: "ide",
            courierName: "ID Express"
          }
        );

        await sendMessage(
          chatId,

          "📩 Silakan kirim nomor resi ID Express.\n\n" +
          "Bisa 1 resi atau banyak resi.\n\n" +
          "Contoh:\n" +
          "TKP8029020074\n\n" +
          "Maksimal 50 resi.",

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

        const pilihan =
          waitingResi.get(chatId);

        waitingResi.delete(chatId);

        await prosesBanyakResi(
          chatId,
          text,
          pilihan.courierCode,
          pilihan.courierName
        );

        continue;
      }


      // =================================================
      // /LACAK SICEPAT
      // =================================================

      if (
        text
          .toLowerCase()
          .startsWith("/lacak")
      ) {

        const resiText =
          text
            .substring(6)
            .trim();

        if (!resiText) {

          await sendMessage(
            chatId,
            "❌ Silakan pilih ekspedisi dari tombol menu.",
            menuUtama()
          );

          continue;
        }

        await prosesBanyakResi(
          chatId,
          resiText,
          "sicepat",
          "SiCepat Express"
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
        "Bot Tracking SiCepat dan ID Express aktif"
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

    console.log(
      "ADMIN_TELEGRAM_ID:",
      ADMIN_TELEGRAM_IDS.length > 0
        ? `${ADMIN_TELEGRAM_IDS.length} ID TERDAFTAR`
        : "TIDAK ADA"
    );

    if (
      TELEGRAM_TOKEN &&
      BINDERBYTE_API_KEY &&
      ADMIN_TELEGRAM_IDS.length > 0
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
