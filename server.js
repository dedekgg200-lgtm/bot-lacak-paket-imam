const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const BITESHIP_API_KEY = process.env.BITESHIP_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!BITESHIP_API_KEY) {
  console.error("BITESHIP_API_KEY belum diisi di Railway.");
}

if (!TELEGRAM_TOKEN) {
  console.error("TELEGRAM_TOKEN belum diisi di Railway.");
}

// ================================
// Biteship - Tracking SiCepat
// ================================
async function lacakSiCepat(resi) {
  const url =
    `https://api.biteship.com/v1/trackings/${encodeURIComponent(resi)}/couriers/sicepat`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": BITESHIP_API_KEY,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();

  return {
    status: response.status,
    data
  };
}

// ================================
// Telegram
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

  return response.json();
}

async function kirimPesan(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: text
  });
}

// ================================
// Format hasil tracking
// ================================
function formatTracking(data, resi) {
  if (!data || data.success === false) {
    return (
      `❌ Resi SiCepat tidak ditemukan.\n\n` +
      `Nomor resi: ${resi}\n\n` +
      `Pastikan nomor resi sudah benar.`
    );
  }

  const courier = data.courier || {};
  const history = Array.isArray(data.history) ? data.history : [];

  let pesan =
    `📦 TRACKING SICEPAT\n\n` +
    `Resi: ${data.waybill_id || resi}\n` +
    `Kurir: ${courier.company || "SiCepat"}\n` +
    `Status: ${data.status || "-"}\n`;

  if (data.origin?.address) {
    pesan += `Asal: ${data.origin.address}\n`;
  }

  if (data.destination?.address) {
    pesan += `Tujuan: ${data.destination.address}\n`;
  }

  if (history.length > 0) {
    pesan += `\n📍 RIWAYAT:\n`;

    history.slice(0, 8).forEach((item) => {
      const tanggal = item.updated_at || item.date || "";
      const deskripsi =
        item.note ||
        item.description ||
        item.status ||
        "Update pengiriman";

      pesan += `\n${tanggal}\n${deskripsi}\n`;
    });
  }

  return pesan;
}

// ================================
// Proses pesan Telegram
// ================================
async function prosesPesan(message) {
  if (!message || !message.chat) return;

  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  if (text === "/start") {
    await kirimPesan(
      chatId,
      `Halo 👋\n\nBot ini digunakan untuk melacak paket SiCepat.\n\n` +
      `Gunakan perintah:\n\n` +
      `/lacak NOMOR_RESI\n\n` +
      `Contoh:\n` +
      `/lacak 004646985893`
    );

    return;
  }

  if (text.startsWith("/lacak")) {
    const bagian = text.split(/\s+/);
    const resi = bagian[1];

    if (!resi) {
      await kirimPesan(
        chatId,
        `Masukkan nomor resi SiCepat.\n\n` +
        `Contoh:\n` +
        `/lacak 004646985893`
      );

      return;
    }

    await kirimPesan(
      chatId,
      `🔎 Sedang mengecek resi SiCepat:\n${resi}\n\nMohon tunggu...`
    );

    try {
      const result = await lacakSiCepat(resi);

      console.log("Biteship response:", result);

      if (result.status >= 200 && result.status < 300) {
        const pesan = formatTracking(result.data, resi);
        await kirimPesan(chatId, pesan);
      } else {
        await kirimPesan(
          chatId,
          `❌ Gagal mengambil data tracking.\n\n` +
          `Nomor resi: ${resi}\n` +
          `Status API: ${result.status}\n\n` +
          `${result.data?.message || "Silakan coba lagi."}`
        );
      }
    } catch (error) {
      console.error("ERROR TRACKING:", error);

      await kirimPesan(
        chatId,
        `❌ Terjadi kesalahan saat mengecek resi.\n\n` +
        `Silakan coba lagi beberapa saat lagi.`
      );
    }

    return;
  }

  await kirimPesan(
    chatId,
    `Perintah tidak dikenali.\n\n` +
    `Gunakan:\n` +
    `/start\n\n` +
    `atau:\n` +
    `/lacak NOMOR_RESI`
  );
}

// ================================
// Telegram Long Polling
// ================================
let offset = 0;

async function pollingTelegram() {
  while (true) {
    try {
      const result = await telegram("getUpdates", {
        offset: offset,
        timeout: 30
      });

      if (!result.ok) {
        console.error("Telegram error:", result);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      for (const update of result.result) {
        offset = update.update_id + 1;

        try {
          await prosesPesan(update.message);
        } catch (error) {
          console.error("ERROR PROSES TELEGRAM:", error);
        }
      }
    } catch (error) {
      console.error("Polling error:", error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// ================================
// Test server
// ================================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Bot Tracking SiCepat aktif"
  });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);

  if (BITESHIP_API_KEY && TELEGRAM_TOKEN) {
    console.log("Biteship API: OK");
    console.log("Telegram Token: OK");
    console.log("Bot SiCepat mulai berjalan...");

    pollingTelegram();
  } else {
    console.error(
      "Bot tidak dijalankan karena BITESHIP_API_KEY atau TELEGRAM_TOKEN belum ada."
    );
  }
});
