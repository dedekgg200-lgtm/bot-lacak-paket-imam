const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const BINDERBYTE_API = "https://api.binderbyte.com/v1/track";

// Menyimpan chat yang sedang menunggu nomor resi
const waitingResi = new Set();


// =====================================================
// TELEGRAM REQUEST
// =====================================================

async function telegram(method, body = {}) {
    const response = await fetch(`${TELEGRAM_API}/${method}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    return await response.json();
}


// =====================================================
// KIRIM PESAN
// =====================================================

async function sendMessage(chatId, text, keyboard = null) {
    const body = {
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
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
// NORMALISASI NOMOR RESI
// =====================================================

function bersihkanResi(text) {
    return text
        .replace(/[^\dA-Za-z]/g, "")
        .trim();
}


// =====================================================
// CEK APAKAH DATA PEMBAYARAN TERSEDIA
// =====================================================

function deteksiPembayaran(summary) {
    if (!summary) {
        return "DATA TIDAK TERSEDIA";
    }

    const service = String(summary.service || "").toUpperCase();
    const amount = summary.amount;

    /*
     * JANGAN menganggap service "REG", "BEST", dll
     * sebagai COD/NONCOD.
     *
     * Hanya tandai COD jika API benar-benar memberikan
     * informasi yang jelas.
     */

    if (
        service.includes("COD") ||
        service.includes("CASH ON DELIVERY")
    ) {
        return "COD";
    }

    /*
     * Beberapa API bisa memberikan informasi pembayaran
     * melalui field amount.
     *
     * Tetapi jika amount kosong/null/0, kita tidak boleh
     * langsung menyimpulkan NONCOD.
     */

    if (
        typeof amount === "string" &&
        amount.trim() !== ""
    ) {
        return `COD / NOMINAL: ${amount}`;
    }

    if (
        typeof amount === "number" &&
        amount > 0
    ) {
        return `COD / NOMINAL: ${amount}`;
    }

    return "DATA TIDAK TERSEDIA";
}


// =====================================================
// FORMAT RUPIAH
// =====================================================

function formatRupiah(value) {
    if (value === null || value === undefined || value === "") {
        return "";
    }

    const number = Number(String(value).replace(/[^\d]/g, ""));

    if (!Number.isFinite(number) || number <= 0) {
        return String(value);
    }

    return new Intl.NumberFormat("id-ID").format(number);
}


// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(data, resi) {
    const summary = data.summary || {};
    const detail = data.detail || {};
    const history = Array.isArray(data.history)
        ? data.history
        : [];

    const pembayaran = deteksiPembayaran(summary);

    let text = "";

    text += "📦 <b>TRACKING SICEPAT</b>\n";
    text += "━━━━━━━━━━━━━━━━━━━━\n\n";

    text += "📨 <b>RESI</b>\n";
    text += `└ No Resi : <code>${escapeHtml(summary.awb || resi)}</code>\n`;
    text += `└ Service : ${escapeHtml(summary.service || "DATA TIDAK TERSEDIA")}\n\n`;

    text += "🚩 <b>STATUS TERBARU</b>\n";
    text += `└ ${escapeHtml(summary.status || "DATA TIDAK TERSEDIA")}\n\n`;

    text += "🚀 <b>PENGIRIM</b>\n";
    text += `└ ${escapeHtml(detail.shipper || "DATA TIDAK TERSEDIA")}\n\n`;

    text += "🏁 <b>PENERIMA</b>\n";
    text += `└ ${escapeHtml(detail.receiver || "DATA TIDAK TERSEDIA")}\n\n`;

    text += "📍 <b>RUTE</b>\n";
    text += `└ Asal : ${escapeHtml(detail.origin || "DATA TIDAK TERSEDIA")}\n`;
    text += `└ Tujuan : ${escapeHtml(detail.destination || "DATA TIDAK TERSEDIA")}\n\n`;

    text += "💰 <b>PEMBAYARAN</b>\n";
    text += `└ ${escapeHtml(pembayaran)}\n`;

    if (summary.amount !== undefined && summary.amount !== null && summary.amount !== "") {
        text += `└ Nominal : Rp${escapeHtml(formatRupiah(summary.amount))}\n`;
    }

    text += "\n";

    text += "📅 <b>TANGGAL</b>\n";
    text += `└ ${escapeHtml(summary.date || "DATA TIDAK TERSEDIA")}\n\n`;

    text += "📌 <b>RIWAYAT PENGIRIMAN</b>\n";

    if (history.length === 0) {
        text += "└ Data riwayat tidak tersedia\n";
    } else {
        history.forEach((item, index) => {
            text += `\n<b>${index + 1}. ${escapeHtml(item.date || "-")}</b>\n`;
            text += `└ ${escapeHtml(item.desc || "-")}\n`;

            if (item.location) {
                text += `└ 📍 ${escapeHtml(item.location)}\n`;
            }
        });
    }

    return text;
}


// =====================================================
// ESCAPE HTML TELEGRAM
// =====================================================

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


// =====================================================
// CEK RESI BINDerBYTE
// =====================================================

async function cekResiSiCepat(resi) {
    const url =
        `${BINDERBYTE_API}` +
        `?api_key=${encodeURIComponent(BINDERBYTE_API_KEY)}` +
        `&courier=sicepat` +
        `&awb=${encodeURIComponent(resi)}`;

    const response = await fetch(url);

    const result = await response.json();

    return result;
}


// =====================================================
// PROSES RESI
// =====================================================

async function prosesResi(chatId, resi) {
    await sendMessage(
        chatId,
        `🔎 Sedang mengecek resi SiCepat:\n<code>${escapeHtml(resi)}</code>\n\nMohon tunggu...`
    );

    try {
        const result = await cekResiSiCepat(resi);

        console.log(
            "HASIL BINDERBYTE:",
            JSON.stringify(result, null, 2)
        );

        if (!result) {
            await sendMessage(
                chatId,
                "❌ Tidak mendapatkan respons dari BinderByte.",
                menuUtama()
            );
            return;
        }

        if (Number(result.status) !== 200) {
            await sendMessage(
                chatId,
                `❌ <b>RESI TIDAK DAPAT DICEK</b>\n\n${escapeHtml(result.message || "Data tidak tersedia")}`,
                menuUtama()
            );
            return;
        }

        if (!result.data || !result.data.summary) {
            await sendMessage(
                chatId,
                "❌ Data resi tidak ditemukan.",
                menuUtama()
            );
            return;
        }

        const summary = result.data.summary;

        if (!summary.awb) {
            await sendMessage(
                chatId,
                "❌ Resi tidak ditemukan atau data resi tidak lengkap.",
                menuUtama()
            );
            return;
        }

        const pesan = formatTracking(
            result.data,
            resi
        );

        await sendMessage(
            chatId,
            pesan,
            menuUtama()
        );

    } catch (error) {

        console.error(
            "ERROR CEK RESI:",
            error
        );

        await sendMessage(
            chatId,
            "❌ Terjadi kesalahan saat menghubungi server tracking.\n\nSilakan coba lagi beberapa saat.",
            menuUtama()
        );
    }
}


// =====================================================
// POLLING TELEGRAM
// =====================================================

let offset = 0;

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

        const result = await telegram(
            "getUpdates",
            {
                offset: offset,
                timeout: 30,
                allowed_updates: ["message"]
            }
        );

        if (!result.ok) {
            console.error(
                "Telegram error:",
                result
            );

            return;
        }

        for (const update of result.result) {

            offset = update.update_id + 1;

            if (!update.message) {
                continue;
            }

            const chatId = update.message.chat.id;
            const text = String(
                update.message.text || ""
            ).trim();

            // ==========================================
            // START
            // ==========================================

            if (text === "/start") {

                waitingResi.delete(chatId);

                await sendMessage(
                    chatId,
                    "👋 <b>Selamat datang!</b>\n\nSilakan pilih menu di bawah untuk melakukan pengecekan resi SiCepat.",
                    menuUtama()
                );

                continue;
            }


            // ==========================================
            // TOMBOL CEK RESI
            // ==========================================

            if (
                text === "🔎 Cek Resi SiCepat" ||
                text === "/cekresi"
            ) {

                waitingResi.add(chatId);

                await sendMessage(
                    chatId,
                    "📦 <b>CEK RESI SICEPAT</b>\n\nSilakan kirim nomor resi SiCepat kamu.\n\nContoh:\n<code>004646985892</code>",
                    menuUtama()
                );

                continue;
            }


            // ==========================================
            // USER MENGIRIM RESI
            // ==========================================

            if (waitingResi.has(chatId)) {

                const resi = bersihkanResi(text);

                if (!resi) {
                    await sendMessage(
                        chatId,
                        "❌ Nomor resi tidak terbaca.\n\nSilakan kirim nomor resi yang benar."
                    );

                    continue;
                }

                waitingResi.delete(chatId);

                await prosesResi(
                    chatId,
                    resi
                );

                continue;
            }


            // ==========================================
            // JIKA USER LANGSUNG KIRIM RESI
            // ==========================================

            const kemungkinanResi =
                bersihkanResi(text);

            if (
                /^[0-9A-Za-z]{8,30}$/.test(
                    kemungkinanResi
                )
            ) {

                await prosesResi(
                    chatId,
                    kemungkinanResi
                );

                continue;
            }

            await sendMessage(
                chatId,
                "Silakan tekan tombol <b>🔎 Cek Resi SiCepat</b> terlebih dahulu.",
                menuUtama()
            );
        }

    } catch (error) {

        console.error(
            "TELEGRAM POLLING ERROR:",
            error
        );
    }
}


// =====================================================
// SERVER RAILWAY
// =====================================================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        bot: "Telegram SiCepat Tracking",
        binderbyte: BINDERBYTE_API_KEY
            ? "configured"
            : "not configured"
    });
});


app.listen(PORT, () => {

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

    pollingTelegram();

    setInterval(
        pollingTelegram,
        1000
    );
});
