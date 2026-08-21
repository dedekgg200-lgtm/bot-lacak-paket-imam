const { Bot } = require("grammy");
const axios = require("axios");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const BITESHIP_TOKEN = process.env.BITESHIP_TOKEN;

app.get("/", (req, res) => {
  res.send("Bot tracking aktif");
});

app.listen(PORT, () => {
  console.log("Server aktif di port " + PORT);
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    "📦 Bot Tracking siap.\n\n" +
    "Kirim:\n" +
    "sicepat 004646985892\n\n" +
    "Contoh:\n" +
    "jne 012345678901234"
  );
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return;

  const data = text.split(/\s+/);

  if (data.length < 2) {
    return ctx.reply(
      "❌ Format salah.\n\n" +
      "Gunakan:\n" +
      "sicepat NOMOR_RESI"
    );
  }

  const courier = data[0].toLowerCase();
  const resi = data[1];

  await cekResi(ctx, courier, resi);
});

async function cekResi(ctx, courier, resi) {
  await ctx.reply("🔎 Mengecek resi...");

  try {
    const url =
      `https://api.biteship.com/v1/trackings/` +
      `${encodeURIComponent(resi)}/couriers/` +
      `${encodeURIComponent(courier)}`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${BITESHIP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });

    const data = response.data;

    console.log(JSON.stringify(data, null, 2));

    const summary = data.data?.summary || {};
    const tracking = data.data?.tracking || [];

    const nomorResi =
      summary.awb ||
      data.data?.waybill_id ||
      resi;

    const nama =
      data.data?.recipient ||
      data.data?.receiver?.name ||
      data.data?.destination?.name ||
      "-";

    const kurir =
      summary.courier ||
      data.data?.courier ||
      courier;

    const service =
      summary.service ||
      data.data?.service ||
      "-";

    const status =
      summary.status ||
      data.data?.status ||
      "-";

    let pembayaran = "";

    // Hanya tampilkan COD jika API benar-benar memberikan data COD
    const cod =
      data.data?.cash_on_delivery ||
      data.data?.cod ||
      null;

    if (cod) {
      const nominal =
        cod.amount ??
        cod.value ??
        null;

      pembayaran = "💰 COD";

      if (nominal !== null) {
        pembayaran +=
          `\n💵 Nominal: Rp ${Number(nominal).toLocaleString("id-ID")}`;
      }
    } else {
      pembayaran = "💳 NON-COD";
    }

    let pesan =
      `📦 *HASIL TRACKING*\n` +
      `━━━━━━━━━━━━━━\n` +
      `📮 Resi: \`${nomorResi}\`\n` +
      `👤 Penerima: ${nama}\n` +
      `🚚 Kurir: ${kurir}\n` +
      `📋 Service: ${service}\n` +
      `${pembayaran}\n` +
      `📊 Status: *${status}*`;

    // Ambil update terakhir kalau tersedia
    if (tracking.length > 0) {
      const terakhir = tracking[0];

      const keterangan =
        terakhir.description ||
        terakhir.desc ||
        terakhir.status ||
        "";

      if (keterangan) {
        pesan += `\n\n📍 Update:\n${keterangan}`;
      }
    }

    await ctx.reply(pesan, {
      parse_mode: "Markdown"
    });

  } catch (error) {
    console.error(
      "ERROR:",
      error.response?.data || error.message
    );

    if (error.response?.status === 401) {
      return ctx.reply(
        "❌ API Biteship ditolak.\n\n" +
        "Periksa BITESHIP_TOKEN di Railway."
      );
    }

    if (error.response?.status === 404) {
      return ctx.reply(
        "❌ Resi tidak ditemukan.\n\n" +
        "Pastikan nomor resi dan nama kurir benar."
      );
    }

    await ctx.reply(
      "❌ Gagal cek resi.\n\n" +
      "Resi: " + resi +
      "\nKurir: " + courier
    );
  }
}

bot.catch((err) => {
  console.error("Telegram Error:", err.error);
});

bot.start();

console.log("🤖 Bot Telegram aktif");
