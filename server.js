const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

const BINDERBYTE_URL = "https://api.binderbyte.com/v1/track";

let offset = 0;

// ======================================================
// TELEGRAM
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

  return response.json();
}

async function kirimPesan(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: text
  });
}

// ======================================================
// BINDERBYTE - SICEPAT
// ======================================================

async function lacakSiCepat(resi) {

  const url = new URL(BINDERBYTE_URL);

  url.searchParams.set(
    "api_key",
    BINDERBYTE_API_KEY
  );

  url.searchParams.set(
    "courier",
    "sicepat"
  );

  url.searchParams.set(
    "awb",
    resi
  );

  const response = await fetch(url);

  const data = await response.json();

  console.log(
    "BINDERBYTE:",
    response.status,
    JSON.stringify(data)
  );

  return {
    status: response.status,
    data: data
  };
}

// ======================================================
// FORMAT HASIL
// ======================================================

function formatTracking(data, resi) {

  if (!data) {
    return `❌ Data resi tidak tersedia.\n\nResi: ${resi}`;
  }

  if (data.status !== 200) {

    return (
      `❌ RESI TIDAK DITEMUKAN\n\n` +
      `Ekspedisi : SiCepat\n` +
      `Resi : ${resi}\n\n` +
      `${data.message || "Silakan periksa kembali nomor resi."}`
    );
  }

  const summary = data.data?.summary || {};
  const detail = data.data?.detail || {};
  const history = data.data?.history || [];

  let hasil =
`📦 TRACKING SICEPAT
━━━━━━━━━━━━━━━━

🔢 Resi
└ ${summary.awb || resi}

🚚 Kurir
└ ${summary.courier || "SiCepat"}

📮 Status
└ ${summary.status || "Tidak tersedia"}

📅 Tanggal
└ ${summary.date || "Tidak tersedia"}

👤 Pengirim
└ ${summary.shipper || detail.shipper || "Tidak tersedia"}

👤 Penerima
└ ${summary.receiver || detail.receiver || "Tidak tersedia"}`;

  // ====================================================
  // COD
  // ====================================================

  const amount =
    summary.amount ||
    detail.amount ||
    data.data?.amount ||
    0;

  if (amount && Number(amount) > 0) {

    hasil +=
`\n\n💰 PEMBAYARAN
└ COD : YA
└ Nominal : Rp${Number(amount).toLocaleString("id-ID")}`;

  } else {

    hasil +=
`\n\n💰 PEMBAYARAN
└ COD : DATA TIDAK TERSEDIA`;
  }

  // ====================================================
  // RIWAYAT
  // ====================================================

  if (Array.isArray(history) && history.length > 0) {

    hasil +=
`\n\n📍 RIWAYAT PENGIRIMAN
━━━━━━━━━━━━━━━━`;

    history.slice(0, 10).forEach((item) => {

      hasil +=
`\n\n• ${item.date || item.updated_at || ""}
${item.desc || item.description || item.note || item.status || ""}`;

    });
  }

  return hasil;
}

// ======================================================
// PROSES TELEGRAM
// ======================================================

async function prosesPesan(message) {

  if (!message || !message.chat) {
    return;
  }

  const chatId = message.chat.id;

  const text =
    (message.text || "").trim();

  // ====================================================
  // START
  // ====================================================

  if (text === "/start") {

    await kirimPesan(
      chatId,
`📦 BOT TRACKING SICEPAT

Halo!

Kirim nomor resi SiCepat untuk melakukan pengecekan.

Contoh:

004646985893

atau:

/lacak 004646985893`
    );

    return;
  }

  // ====================================================
  // LACAK COMMAND
  // ====================================================

  let resi = "";

  if (text.toLowerCase().startsWith("/lacak")) {

    const bagian =
      text.split(/\s+/);

    resi = bagian[1] || "";

  } else {

    // Kalau user langsung mengirim nomor resi
    const cocok =
      text.match(/\b\d{10,15}\b/);

    if (cocok) {
      resi = cocok[0];
    }
  }

  // ====================================================
  // VALIDASI RESI
  // ====================================================

  if (!resi) {

    await kirimPesan(
      chatId,
`❌ Nomor resi tidak ditemukan.

Kirim nomor resi SiCepat.

Contoh:

004646985893`
    );

    return;
  }

  // ====================================================
  // PROSES
  // ====================================================

  await kirimPesan(
    chatId,
    `🔎 Mengecek resi SiCepat...\n\n${resi}`
  );

  try {

    const result =
      await lacakSiCepat(resi);

    const hasil =
      formatTracking(
        result.data,
        resi
      );

    await kirimPesan(
      chatId,
      hasil
    );

  } catch (error) {

    console.error(
      "ERROR:",
      error
    );

    await kirimPesan(
      chatId,
`❌ Gagal terhubung ke BinderByte.

Silakan coba lagi.`
    );
  }
}

// ======================================================
// POLLING TELEGRAM
// ======================================================

async function pollingTelegram() {

  console.log(
    "🤖 BOT TELEGRAM SICEPAT BERJALAN"
  );

  while (true) {

    try {

      const result =
        await telegram(
          "getUpdates",
          {
            offset: offset,
            timeout: 30
          }
        );

      if (!result.ok) {

        console.error(
          "TELEGRAM ERROR:",
          result
        );

        await new Promise(
          resolve =>
            setTimeout(resolve, 5000)
        );

        continue;
      }

      for (
        const update of result.result
      ) {

        offset =
          update.update_id + 1;

        if (update.message) {

          await prosesPesan(
            update.message
          );
        }
      }

    } catch (error) {

      console.error(
        "POLLING ERROR:",
        error
      );

      await new Promise(
        resolve =>
          setTimeout(resolve, 5000)
      );
    }
  }
}

// ======================================================
// SERVER
// ======================================================

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "Bot Tracking SiCepat aktif"
  });

});

app.get("/health", (req, res) => {

  res.json({
    success: true,
    telegram: !!TELEGRAM_TOKEN,
    binderbyte: !!BINDERBYTE_API_KEY
  });

});

app.listen(PORT, () => {

  console.log(
    `Server berjalan di port ${PORT}`
  );

  console.log(
    "Telegram:",
    TELEGRAM_TOKEN
      ? "OK"
      : "TIDAK ADA"
  );

  console.log(
    "BinderByte:",
    BINDERBYTE_API_KEY
      ? "OK"
      : "TIDAK ADA"
  );

  if (
    TELEGRAM_TOKEN &&
    BINDERBYTE_API_KEY
  ) {

    pollingTelegram();

  }

});
