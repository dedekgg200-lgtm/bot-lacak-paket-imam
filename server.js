const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

// Menyimpan chat yang sedang menunggu nomor resi
const waitingResi = new Set();

// Telegram offset supaya update tidak diproses berulang
let telegramOffset = 0;


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
// KIRIM PESAN
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
// CEK API BINDERYBYTE
// ======================================================

async function cekResiSiCepat(resi) {

    const url =
        "https://api.binderbyte.com/v1/track" +
        "?api_key=" + encodeURIComponent(BINDERBYTE_API_KEY) +
        "&courier=sicepat" +
        "&awb=" + encodeURIComponent(resi);

    console.log("CEK RESI:", resi);

    const response = await fetch(url);

    const result = await response.json();

    console.log("STATUS HTTP:", response.status);
    console.log(
        "STATUS API:",
        result?.status
    );

    return {
        httpStatus: response.status,
        result: result
    };
}


// ======================================================
// AMBIL SERVICE COD / NONCOD
// ======================================================
//
// Kita hanya menampilkan COD/NONCOD kalau API memang
// memberikan nilai tersebut.
// Tidak boleh menebak.
// ======================================================

function ambilService(data) {

    const kemungkinan = [
        data?.summary?.service,
        data?.detail?.service,
        data?.service
    ];

    for (const value of kemungkinan) {

        if (!value) continue;

        const service = String(value).trim().toUpperCase();

        if (service === "COD") {
            return "COD";
        }

        if (service === "NONCOD") {
            return "NONCOD";
        }

        if (service.includes("NONCOD")) {
            return "NONCOD";
        }

        if (service.includes("COD")) {
            return "COD";
        }
    }

    return "DATA TIDAK TERSEDIA";
}


// ======================================================
// FORMAT TRACKING
// ======================================================

function formatTracking(data, resi) {

    const summary = data?.summary || {};
    const detail = data?.detail || {};

    const history = Array.isArray(data?.history)
        ? data.history
        : [];

    const nomorResi =
        summary.awb ||
        resi;

    const kurir =
        summary.courier ||
        "SiCepat Express";

    const status =
        summary.status ||
        "DATA TIDAK TERSEDIA";

    const service =
        ambilService(data);


    const pengirim =
        detail.shipper ||
        "DATA TIDAK TERSEDIA";

    const asal =
        detail.origin ||
        "DATA TIDAK TERSEDIA";

    const penerima =
        detail.receiver ||
        "DATA TIDAK TERSEDIA";

    const tujuan =
        detail.destination ||
        "DATA TIDAK TERSEDIA";


    let text = "";

    text += "📦 EXPEDISI SICEPAT\n";
    text += "└ " + kurir + "\n\n";


    text += "📩 RESI\n";
    text += "├ Service : " + service + "\n";
    text += "└ No Resi : " + nomorResi + "\n\n";


    text += "📮 STATUS TERBARU\n";
    text += "└ Status : " + status + "\n\n";


    text += "🚀 PENGIRIM\n";
    text += "├ " + pengirim + "\n";
    text += "└ " + asal + "\n\n";


    text += "🚩 PENERIMA\n";
    text += "├ " + penerima + "\n";
    text += "└ " + tujuan + "\n\n";


    text += "📍 RIWAYAT PENGIRIMAN\n";
    text += "━━━━━━━━━━━━━━━━━━\n";


    if (history.length === 0) {

        text += "\nData riwayat tidak tersedia.";

    } else {

        history.forEach((item, index) => {

            const tanggal =
                item.date ||
                item.datetime ||
                item.time ||
                "-";

            const keterangan =
                item.desc ||
                item.description ||
                item.status ||
                "Tidak ada keterangan";

            const lokasi =
                item.location ||
                item.city ||
                "";

            text += "\n";
            text += (index + 1) + ". " + tanggal + "\n";
            text += "└ " + keterangan + "\n";

            if (lokasi) {
                text += "  📍 " + lokasi + "\n";
            }
        });
    }


    return text;
}


// ======================================================
// PROSES RESI
// ======================================================

async function prosesResi(chatId, resi) {

    await sendMessage(
        chatId,
        "🔎 Sedang mengecek resi SiCepat:\n" +
        resi +
        "\n\nMohon tunggu..."
    );


    try {

        const hasil = await cekResiSiCepat(resi);

        const api = hasil.result;


        // API gagal
        if (
            hasil.httpStatus !== 200 ||
            !api ||
            api.status !== 200 ||
            !api.data
        ) {

            console.error(
                "API TRACKING GAGAL:",
                JSON.stringify(api)
            );

            await sendMessage(
                chatId,
                "❌ Gagal mengambil data tracking.\n\n" +
                "Nomor resi: " + resi + "\n" +
                "Status API: " +
                (api?.status || hasil.httpStatus) +
                "\n\n" +
                "Pesan: " +
                (api?.message || "Data tidak tersedia.")
            );

            await sendMessage(
                chatId,
                "Silakan coba lagi.",
                menuUtama()
            );

            return;
        }


        // Tracking berhasil
        const hasilText =
            formatTracking(api.data, resi);


        await sendMessage(
            chatId,
            hasilText,
            menuUtama()
        );


    } catch (error) {

        console.error(
            "ERROR TRACKING:",
            error
        );

        await sendMessage(
            chatId,
            "❌ Terjadi kesalahan saat mengambil data tracking.\n\n" +
            "Silakan coba lagi."
        );

        await sendMessage(
            chatId,
            "Menu utama:",
            menuUtama()
        );
    }
}


// ======================================================
// PROSES PESAN TELEGRAM
// ======================================================

async function handleMessage(message) {

    if (!message || !message.chat) {
        return;
    }

    const chatId = message.chat.id;

    const text =
        typeof message.text === "string"
            ? message.text.trim()
            : "";


    if (!text) {
        return;
    }


    // ==================================================
    // /start
    // ==================================================

    if (text === "/start") {

        waitingResi.delete(chatId);

        await sendMessage(
            chatId,
            "👋 Selamat datang.\n\n" +
            "Silakan pilih menu untuk mengecek resi SiCepat.",
            menuUtama()
        );

        return;
    }


    // ==================================================
    // TOMBOL CEK RESI
    // ==================================================

    if (text === "🔎 Cek Resi SiCepat") {

        waitingResi.add(chatId);

        await sendMessage(
            chatId,
            "📦 Silakan kirim nomor resi SiCepat.\n\n" +
            "Contoh:\n" +
            "004646985892"
        );

        return;
    }


    // ==================================================
    // USER SEDANG MENUNGGU RESI
    // ==================================================

    if (waitingResi.has(chatId)) {

        const resi =
            text.replace(/[^a-zA-Z0-9]/g, "");


        if (
            resi.length < 8 ||
            resi.length > 30
        ) {

            await sendMessage(
                chatId,
                "❌ Nomor resi tidak terlihat valid.\n\n" +
                "Silakan kirim nomor resi SiCepat yang benar."
            );

            return;
        }


        waitingResi.delete(chatId);

        await prosesResi(
            chatId,
            resi
        );

        return;
    }


    // ==================================================
    // USER LANGSUNG KIRIM RESI
    // TANPA MENEKAN TOMBOL
    // ==================================================

    const kemungkinanResi =
        text.replace(/[^a-zA-Z0-9]/g, "");


    if (
        kemungkinanResi.length >= 8 &&
        kemungkinanResi.length <= 30
    ) {

        await prosesResi(
            chatId,
            kemungkinanResi
        );

        return;
    }


    // ==================================================
    // PESAN TIDAK DIKENALI
    // ==================================================

    await sendMessage(
        chatId,
        "Silakan tekan tombol 🔎 Cek Resi SiCepat.",
        menuUtama()
    );
}


// ======================================================
// POLLING TELEGRAM
// ======================================================

async function pollingTelegram() {

    try {

        const result =
            await telegram(
                "getUpdates",
                {
                    offset: telegramOffset,
                    timeout: 0,
                    allowed_updates: ["message"]
                }
            );


        if (
            !result ||
            !result.ok ||
            !Array.isArray(result.result)
        ) {
            return;
        }


        for (const update of result.result) {

            telegramOffset =
                update.update_id + 1;


            if (update.message) {

                await handleMessage(
                    update.message
                );
            }
        }


    } catch (error) {

        console.error(
            "TELEGRAM POLLING ERROR:",
            error
        );
    }
}


// ======================================================
// SERVER RAILWAY
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
        telegram:
            !!TELEGRAM_TOKEN,
        binderbyte:
            !!BINDERBYTE_API_KEY
    });
});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {

    console.log(
        "===================================="
    );

    console.log(
        "BOT TRACKING SICEPAT"
    );

    console.log(
        "===================================="
    );

    console.log(
        "Server aktif di port:",
        PORT
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
            "Telegram polling aktif."
        );

        setInterval(
            pollingTelegram,
            1500
        );

    } else {

        console.error(
            "❌ Variable Railway belum lengkap."
        );
    }
});
