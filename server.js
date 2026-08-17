const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

const waitingResi = new Set();

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

function formatTracking(data, resi) {
  const summary = data?.summary || {};
  const detail = data?.detail || {};
  const history = Array.isArray(data?.history) ? data.history : [];

  let text = `📦 TRACKING SICEPAT\n`;
  text += `━━━━━━━━━━━━━━━━━━\n\n`;

  text += `📩 RESI\n`;
  text += `├ No Resi : ${summary.awb || resi}\n`;
  text += `├ Service : ${summary.service || "DATA TIDAK TERSEDIA"}\n`;
  text += `└ Status : ${summary.status || "DATA TIDAK TERSEDIA"}\n\n`;

  text += `🚚 KURIR\n`;
  text += `└ ${summary.courier || "SiCepat Express"}\n\n`;

  text += `👤 PENGIRIM\n`;
  text += `├ ${detail.shipper || "DATA TIDAK TERSEDIA"}\n`;
  text += `└ ${detail.origin || "DATA TIDAK TERSEDIA"}\n\n`;

  text += `👤 PENERIMA\n`;
  text += `├ ${detail.receiver || "DATA TIDAK TERSEDIA"}\n`;
  text += `└ ${detail.destination || "DATA TIDAK TERSEDIA"}\n\n`;

  if (summary.amount) {
    text += `💰 PEMBAYARAN\n`;
    text += `└ ${summary.amount}\n\n`;
  }

  text += `📍 RIWAYAT PENGIRIMAN\n`;
  text += `━━━━━━━━━━━━━━━━━━\n`;

  if (history.length === 0) {
    text += `Data riwayat belum tersedia.`;
  } else {
    for (const item of history) {
      text += `\n✅ ${item.desc || "Tidak ada keterangan"}\n`;
      text += `└ ${item.date || "-"}\n`;

      if (item.location) {
        text += `  📍 ${item.location}\n`;
      }
    }
  }

  return text;
}

async function cekResiSiCepat(resi) {
  const url =
    `https://api.binderbyte.com/v1/track` +
    `?api_key=${encodeURIComponent(BINDERBYTE_API_KEY)}` +
    `&courier=sicepat` +
    `&awb=${encodeURIComponent(resi)}`;

  const response = await fetch(url);
  const data = await response.json();

  return {
    httpStatus: response.status,
    data
  };
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  if (!text) return;

  // /start
  if (text === "/start") {
    waitingResi.delete(chatId);

    await sendMessage(
      chatId,
      "Selamat datang.\n\nSilakan pilih menu di bawah untuk mengecek resi SiCepat.",
      menuUtama()
    );

    return;
  }

  // Tombol cek resi
  if (text === "🔎 Cek Resi SiCepat") {
    waitingResi.add(chatId);

    await sendMessage(
      chatId,
      "📦 Silakan kirim nomor resi SiCepat.\n\nContoh:\n004646985892"
    );

    return;
  }

  // Kalau sedang menunggu nomor resi
  if (waitingResi.has(chatId)) {
    const resi = text.replace(/[^a-zA-Z0-9]/g, "");

    if (resi.length < 8) {
      await sendMessage(
        chatId,
        "❌ Nomor resi terlihat tidak valid.\n\nSilakan kirim nomor resi SiCepat yang benar."
      );
      return;
    }

    waitingResi.delete(chatId);

    await sendMessage(
      chatId,
      `🔎 Sedang mengecek resi SiCepat:\n${resi}\n\nMohon tunggu...`
    );

    try {
      const result = await cekResiSiCepat(resi);
      const api = result.data;

      if (
        result.httpStatus !== 200 ||
        !api ||
        api.status !== 200 ||
        !api.data
      ) {
        await sendMessage(
          chatId,
          `❌ Gagal mengambil data tracking.\n\n` +
          `Nomor resi: ${resi}\n` +
          `Status API: ${api?.status || result.httpStatus}\n` +
          `Pesan: ${api?.message || "Data tracking tidak tersedia"}`
        );

        await sendMessage(chatId, "Silakan coba lagi.", menuUtama());
        return;
      }

      const hasil = formatTracking(api.data, resi);

      await sendMessage(chatId, hasil, menuUtama());

    } catch (error) {
      console.error("ERROR TRACKING:", error);

      await sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat menghubungi server tracking.\n\nSilakan coba lagi."
      );

      await sendMessage(chatId, "Menu utama:", menuUtama());
    }

    return;
  }

  // Kalau user langsung kirim resi tanpa menekan tombol
  const kemungkinanResi = text.replace(/[^a-zA-Z0-9]/g, "");

  if (
    kemungkinanResi.length >= 8 &&
    kemungkinanResi.length <= 30
  ) {
    waitingResi.add(chatId);

    // proses lagi sebagai nomor resi
    await handleMessage({
      chat: message.chat,
      text: kemungkinanResi
    });

    return;
  }

  await sendMessage(
    chatId,
    "Silakan pilih menu 🔎 Cek Resi SiCepat.",
    menuUtama()
  );
}

// Ambil update Telegram
async function pollingTelegram() {
  try {
    const result = await telegram("getUpdates", {
      offset: -1,
      timeout: 0
    });

    if (!result.ok || !result.result?.length) {
      return;
    }

    for (const update of result.result) {
      if (update.message) {
        await handleMessage(update.message);
      }
    }
  } catch (error) {
    console.error("POLLING ERROR:", error);
  }
}

// Server Railway
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Bot tracking SiCepat aktif"
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
    setInterval(pollingTelegram, 1500);
    console.log("Telegram polling aktif.");
  } else {
    console.error("Variable Telegram/BinderByte belum lengkap.");
  }
});
