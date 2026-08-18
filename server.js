const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

let offset = 0;

// ======================================================
// TELEGRAM API
// ======================================================

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

// ======================================================
// KIRIM PESAN TELEGRAM
// ======================================================

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

// ======================================================
// MENU UTAMA
// ======================================================

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

// ======================================================
// FORMAT RUPIAH
// ======================================================

function rupiah(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return String(value);
  }

  if (number === 0) {
    return "Rp0";
  }

  return "Rp" + number.toLocaleString("id-ID");
}

// ======================================================
// AMBIL NILAI DENGAN AMAN
// ======================================================

function safe(value, fallback = "Data tidak tersedia") {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return fallback;
  }

  return String(value);
}

// ======================================================
// CEK RESI SICEPAT KE BINDERBYTE
// ======================================================

async function cekResiSiCepat(awb) {
  const url =
    "https://api.binderbyte.com/v1/track?" +
    new URLSearchParams({
      api_key: BINDERBYTE_API_KEY,
      courier: "sicepat",
      awb: awb
    });

  const response = await fetch(url);

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("Respons API bukan JSON.");
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return data;
}

// ======================================================
// FORMAT HASIL TRACKING
// ======================================================

function formatTracking(data, awb) {
  // BinderByte biasanya menggunakan result sebagai data utama.
  const result = data.result || data.data || data;

  const summary = result.summary || {};

  const detail = result.detail || {};

  const history = Array.isArray(result.history)
    ? result.history
    : [];

  // ----------------------------------------------------
  // SERVICE / COD
  // ----------------------------------------------------

  const serviceRaw =
    summary.service ??
    detail.service ??
    result.service ??
    null;

  let service = "DATA TIDAK TERSEDIA";

  if (serviceRaw) {
    service = String(serviceRaw).toUpperCase();
  }

  // ----------------------------------------------------
  // STATUS
  // ----------------------------------------------------

  const status =
    summary.status ??
    result.status ??
    detail.status ??
    "DATA TIDAK TERSEDIA";

  // ----------------------------------------------------
  // TANGGAL
  // ----------------------------------------------------

  const date =
    summary.date ??
    result.date ??
    "DATA TIDAK TERSEDIA";

  // ----------------------------------------------------
  // PENGIRIM
  // ----------------------------------------------------

  const sender =
    summary.sender ??
    detail.shipper ??
    detail.sender ??
    result.sender ??
    "DATA TIDAK TERSEDIA";

  // ----------------------------------------------------
  // PENERIMA
  // ----------------------------------------------------

  const receiver =
    summary.receiver ??
    detail.receiver ??
    result.receiver ??
    "DATA TIDAK TERSEDIA";

  // ----------------------------------------------------
  // ASAL
  // ----------------------------------------------------

  const origin =
    summary.origin ??
    detail.origin ??
    result.origin ??
    "DATA TIDAK TERSEDIA";

  // ----------------------------------------------------
  // TUJUAN
  // ----------------------------------------------------

  const destination =
    summary.destination ??
    detail.destination ??
    result.destination ??
    "DATA TIDAK TERSEDIA";

  // ----------------------------------------------------
  // DESKRIPSI / ISI
  // ----------------------------------------------------

  const description =
    summary.desc ??
    detail.desc ??
    result.desc ??
    "DATA TIDAK TERSEDIA";

  // ----------------------------------------------------
  // JUMLAH COD
  // ----------------------------------------------------

  const amount =
    summary.amount ??
    detail.amount ??
    result.amount ??
    null;

  let pembayaran = service;

  // Jangan pernah mengubah NONCOD menjadi COD.
  // Jika service tidak tersedia, tampilkan data tidak tersedia.
  if (!serviceRaw) {
    pembayaran = "DATA TIDAK TERSEDIA";
  }

  let jumlahCOD = "";

  if (service === "COD" && amount !== null) {
    const nominal = rupiah(amount);

    if (nominal) {
      jumlahCOD = `\n├ Nilai COD : ${nominal}`;
    }
  }

  // ----------------------------------------------------
  // RIWAYAT
  // ----------------------------------------------------

  let riwayat = "";

  if (history.length > 0) {
    riwayat = history
      .map((item, index) => {
        const waktu =
          item.date ??
          item.time ??
          item.updated_at ??
          "Tanggal tidak tersedia";

        const statusHistory =
          item.desc ??
          item.description ??
          item.status ??
          "Status tidak tersedia";

        const location =
          item.location ??
          item.city ??
          "";

        let bagian = `${index + 1}. ${statusHistory}\n└ ${waktu}`;

        if (location) {
          bagian += `\n└ 📍 ${location}`;
        }

        return bagian;
      })
      .join("\n\n");
  } else {
    riwayat = "Data riwayat tidak tersedia.";
  }

  // ----------------------------------------------------
  // HASIL AKHIR
  // ----------------------------------------------------

  return (
    `📦 *TRACKING SICEPAT*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +

    `📩 *RESI*\n` +
    `├ Service : ${service}\n` +
    `└ No Resi : ${safe(awb)}\n\n` +

    `📮 *STATUS TERBARU*\n` +
    `└ ${safe(status)}\n\n` +

    `📅 *TANGGAL*\n` +
    `└ ${safe(date)}\n\n` +

    `🚀 *PENGIRIM*\n` +
    `└ ${safe(sender)}\n\n` +

    `🚩 *PENERIMA*\n` +
    `└ ${safe(receiver)}\n\n` +

    `📍 *RUTE*\n` +
    `├ Asal : ${safe(origin)}\n` +
    `└ Tujuan : ${safe(destination)}\n\n` +

    `💰 *PEMBAYARAN*\n` +
    `├ ${pembayaran}${jumlahCOD}\n\n` +

    `📝 *KETERANGAN*\n` +
    `└ ${safe(description)}\n\n` +

    `📌 *RIWAYAT PENGIRIMAN*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    riwayat
  );
}

// ======================================================
// VALIDASI NOMOR RESI
// ======================================================

function validasiResi(text) {
  if (!text) return null;

  // Hilangkan spasi, strip, dan karakter selain huruf/angka
  const awb = text
    .trim()
    .replace(/[\s-]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");

  if (awb.length < 6 || awb.length > 30) {
    return null;
  }

  return awb;
}

// ======================================================
// PROSES PESAN
// ======================================================

async function prosesPesan(message) {
  if (!message || !message.chat) {
    return;
  }

  const chatId = message.chat.id;
  const text = message.text ? message.text.trim() : "";

  if (!text) {
    return;
  }

  // ----------------------------------------------------
  // START
  // ----------------------------------------------------

  if (
    text === "/start" ||
    text.toLowerCase() === "start"
  ) {
    await sendMessage(
      chatId,
      "👋 Selamat datang!\n\n" +
      "Silakan tekan tombol *🔎 Cek Resi SiCepat*, " +
      "kemudian kirim nomor resi SiCepat.",
      menuUtama()
    );

    return;
  }

  // ----------------------------------------------------
  // TOMBOL CEK RESI
  // ----------------------------------------------------

  if (text === "🔎 Cek Resi SiCepat") {
    await sendMessage(
      chatId,
      "📦 Silakan kirim nomor resi SiCepat.\n\n" +
      "Contoh:\n" +
      "004646985892",
      menuUtama()
    );

    return;
  }

  // ----------------------------------------------------
  // PERINTAH /LACAK
  // ----------------------------------------------------

  let awb = null;

  if (text.toLowerCase().startsWith("/lacak")) {
    const bagian = text.split(/\s+/);

    if (bagian.length >= 2) {
      awb = validasiResi(bagian[1]);
    } else {
      await sendMessage(
        chatId,
        "❗ Format salah.\n\n" +
        "Gunakan:\n" +
        "/lacak NOMOR_RESI"
      );

      return;
    }
  } else {
    // --------------------------------------------------
    // NOMOR RESI LANGSUNG
    // --------------------------------------------------

    awb = validasiResi(text);
  }

  if (!awb) {
    await sendMessage(
      chatId,
      "❗ Nomor resi tidak dikenali.\n\n" +
      "Silakan kirim nomor resi SiCepat saja.",
      menuUtama()
    );

    return;
  }

  // ----------------------------------------------------
  // PROSES TRACKING
  // ----------------------------------------------------

  await sendMessage(
    chatId,
    `🔎 Sedang mengecek resi SiCepat:\n${awb}\n\nMohon tunggu...`
  );

  try {
    const data = await cekResiSiCepat(awb);

    // BinderByte biasanya memiliki status_code/status
    // tertentu. Jika API secara eksplisit mengembalikan
    // error, jangan dianggap sebagai data tracking.
    if (
      data &&
      data.status &&
      String(data.status).toLowerCase() !== "200" &&
      data.result === undefined &&
      data.data === undefined
    ) {
      const pesanAPI =
        data.message ||
        data.msg ||
        "API tidak mengembalikan data tracking.";

      await sendMessage(
        chatId,
        `❌ Gagal mengambil data tracking.\n\n` +
        `Resi: ${awb}\n` +
        `Pesan API: ${pesanAPI}`
      );

      return;
    }

    const hasil = formatTracking(data, awb);

    await sendMessage(
      chatId,
      hasil,
      menuUtama()
    );

  } catch (error) {
    console.error("ERROR TRACKING:", error);

    await sendMessage(
      chatId,
      `❌ Gagal mengambil data tracking.\n\n` +
      `Nomor resi: ${awb}\n\n` +
      `Silakan coba lagi.`
    );
  }
}

// ======================================================
// POLLING TELEGRAM
// ======================================================

async function pollingTelegram() {
  if (!TELEGRAM_TOKEN) {
    console.error("❌ TELEGRAM_TOKEN belum diisi.");
    return;
  }

  if (!BINDERBYTE_API_KEY) {
    console.error("❌ BINDERBYTE_API_KEY belum diisi.");
    return;
  }

  try {
    const data = await telegram("getUpdates", {
      offset: offset,
      timeout: 25,
      allowed_updates: ["message"]
    });

    if (!data.ok) {
      console.error("Telegram API error:", data);
      return;
    }

    for (const update of data.result || []) {
      offset = update.update_id + 1;

      try {
        await prosesPesan(update.message);
      } catch (error) {
        console.error("ERROR PROSES PESAN:", error);
      }
    }

  } catch (error) {
    console.error("TELEGRAM POLLING ERROR:", error);
  }
}

// ======================================================
// SERVER RAILWAY
// ======================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Bot tracking SiCepat aktif",
    courier: "SiCepat",
    api: "BinderByte"
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    telegram: TELEGRAM_TOKEN ? "ADA" : "TIDAK ADA",
    binderbyte: BINDERBYTE_API_KEY ? "ADA" : "TIDAK ADA"
  });
});

app.listen(PORT, () => {
  console.log(`Server aktif di port ${PORT}`);

  console.log(
    "TELEGRAM_TOKEN:",
    TELEGRAM_TOKEN ? "ADA" : "TIDAK ADA"
  );

  console.log(
    "BINDERBYTE_API_KEY:",
    BINDERBYTE_API_KEY ? "ADA" : "TIDAK ADA"
  );

  if (TELEGRAM_TOKEN && BINDERBYTE_API_KEY) {
    pollingTelegram();

    setInterval(() => {
      pollingTelegram();
    }, 1000);
  }
});
