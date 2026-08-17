const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BITESHIP_API_KEY = process.env.BITESHIP_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!BITESHIP_API_KEY) {
  console.error("BITESHIP_API_KEY belum diatur.");
}

if (!TELEGRAM_TOKEN) {
  console.error("TELEGRAM_TOKEN belum diatur.");
}

const BITESHIP_URL = "https://api.biteship.com";
const TELEGRAM_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

let lastUpdateId = 0;

// ===============================
// Biteship API
// ===============================
async function biteship(path) {
  const response = await fetch(`${BITESHIP_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: BITESHIP_API_KEY,
      "Content-Type": "application/json"
    }
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return {
    status: response.status,
    data
  };
}

// ===============================
// Telegram API
// ===============================
async function telegram(method, body = {}) {
  const response = await fetch(`${TELEGRAM_URL}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return await response.json();
}

async function sendMessage(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: text
  });
}

// ===============================
// Format tracking
// ===============================
function formatTracking(data) {
  if (!data) {
    return "Data tracking tidak ditemukan.";
  }

  const courier = data.courier?.company || "-";
  const waybill = data.waybill_id || "-";
  const status = data.status || "-";

  let message =
`📦 HASIL LACAK PAKET

Kurir : ${courier.toUpperCase()}
Resi  : ${waybill}
Status: ${status}`;

  if (data.history && data.history.length > 0) {
    message += "\n\nRiwayat terakhir:";

    const history = data.history.slice(-5).reverse();

    for (const item of history) {
      message += `\n\n• ${item.status || "-"}\n${item.note || ""}`;
    }
  }

  if (data.link) {
    message += `\n\n🔗 Tracking:\n${data.link}`;
  }

  return message;
}

// ===============================
// Pesan bantuan
// ===============================
async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  if (!text) return;

  if (text === "/start") {
    await sendMessage(
      chatId,
`👋 Halo!

Bot Lacak Paket siap digunakan.

Untuk melacak paket, kirim dengan format:

/lacak jne RESI

Contoh:
/lacak jne 0123456789

Ganti "jne" dengan kode kurir dan masukkan nomor resi.`
    );

    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
`Cara menggunakan:

/lacak jne NOMOR_RESI

Contoh:
/lacak jne 0123456789`
    );

    return;
  }

  if (text.toLowerCase().startsWith("/lacak")) {
    const parts = text.split(/\s+/);

    if (parts.length < 3) {
      await sendMessage(
        chatId,
`Format salah.

Gunakan:

/lacak jne NOMOR_RESI

Contoh:
/lacak jne 0123456789`
      );

      return;
    }

    const courier = parts[1].toLowerCase();
    const waybill = parts.slice(2).join("").trim();

    await sendMessage(
      chatId,
      `🔎 Sedang mengecek resi ${waybill}...`
    );

    try {
      // Public Tracking API Biteship
      const result = await biteship(
        `/v1/trackings/${encodeURIComponent(waybill)}/couriers/${encodeURIComponent(courier)}`
      );

      if (result.status >= 200 && result.status < 300) {
        await sendMessage(
          chatId,
          formatTracking(result.data)
        );
      } else {
        console.error("Biteship error:", result.status, result.data);

        await sendMessage(
          chatId,
`❌ Paket tidak ditemukan.

Kurir : ${courier.toUpperCase()}
Resi  : ${waybill}

Pastikan nama kurir dan nomor resi sudah benar.`
        );
      }
    } catch (error) {
      console.error("Tracking error:", error);

      await sendMessage(
        chatId,
        "❌ Terjadi kesalahan saat menghubungi Biteship."
      );
    }

    return;
  }

  await sendMessage(
    chatId,
`Perintah tidak dikenali.

Gunakan:

/start

atau:

/lacak jne NOMOR_RESI`
  );
}

// ===============================
// Polling Telegram
// ===============================
async function startTelegramBot() {
  console.log("Bot Telegram mulai berjalan...");

  try {
    await telegram("deleteWebhook", {
      drop_pending_updates: true
    });
  } catch (error) {
    console.error("Gagal menghapus webhook:", error.message);
  }

  while (true) {
    try {
      const result = await telegram("getUpdates", {
        offset: lastUpdateId + 1,
        timeout: 30
      });

      if (!result.ok) {
        console.error("Telegram error:", result);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      for (const update of result.result) {
        lastUpdateId = update.update_id;

        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (error) {
      console.error("Polling error:", error.message);

      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// ===============================
// Server
// ===============================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Bot Lacak Paket aktif"
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    telegram: !!TELEGRAM_TOKEN,
    biteship: !!BITESHIP_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

startTelegramBot();
