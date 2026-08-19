const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

const TELEGRAM_API =
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const BINDERBYTE_API =
    "https://api.binderbyte.com/v1/track";

let offset = 0;
let sedangPolling = false;

const waitingResi = new Set();


// =====================================================
// TELEGRAM API
// =====================================================

async function telegram(method, body = {}) {

    if (!TELEGRAM_TOKEN) {
        throw new Error("TELEGRAM_TOKEN belum diisi");
    }

    const response = await fetch(
        `${TELEGRAM_API}/${method}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        }
    );

    const data = await response.json();

    console.log(
        `Telegram ${method}:`,
        JSON.stringify(data)
    );

    return data;
}


// =====================================================
// KIRIM PESAN
// =====================================================

async function kirimPesan(chatId, text, keyboard = null) {

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
// BERSIHKAN RESI
// =====================================================

function bersihkanResi(text) {

    return String(text || "")
        .replace(/[^\w]/g, "")
        .trim();
}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


// =====================================================
// NILAI DATA
// =====================================================

function nilai(value, fallback = "DATA TIDAK TERSEDIA") {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    if (typeof value === "object") {
        return fallback;
    }

    return String(value);
}


// =====================================================
// CEK TELEGRAM
// =====================================================

async function cekTelegram() {

    try {

        const result =
            await telegram("getMe");

        if (!result.ok) {

            console.error(
                "❌ TOKEN TELEGRAM BERMASALAH"
            );

            return false;
        }

        console.log(
            "================================="
        );

        console.log(
            "✅ TELEGRAM TERHUBUNG"
        );

        console.log(
            "BOT:",
            result.result.first_name
        );

        console.log(
            "USERNAME:",
            result.result.username
        );

        console.log(
            "================================="
        );

        return true;

    } catch (error) {

        console.error(
            "❌ TELEGRAM ERROR:",
            error.message
        );

        return false;
    }
}


// =====================================================
// HAPUS WEBHOOK
// =====================================================

async function hapusWebhook() {

    try {

        const info =
            await telegram(
                "getWebhookInfo"
            );

        if (
            info.ok &&
            info.result &&
            info.result.url
        ) {

            console.log(
                "Webhook ditemukan:",
                info.result.url
            );

            const result =
                await telegram(
                    "deleteWebhook",
                    {
                        drop_pending_updates: false
                    }
                );

            if (result.ok) {

                console.log(
                    "✅ WEBHOOK DIHAPUS"
                );

            } else {

                console.error(
                    "❌ GAGAL HAPUS WEBHOOK"
                );
            }

        } else {

            console.log(
                "✅ TIDAK ADA WEBHOOK"
            );
        }

    } catch (error) {

        console.error(
            "WEBHOOK ERROR:",
            error.message
        );
    }
}


// =====================================================
// BINDERBYTE
// =====================================================

async function cekBinderByte(resi) {

    if (!BINDERBYTE_API_KEY) {
        throw new Error(
            "BINDERBYTE_API_KEY belum diisi"
        );
    }

    const params =
        new URLSearchParams();

    params.set(
        "api_key",
        BINDERBYTE_API_KEY
    );

    params.set(
        "courier",
        "sicepat"
    );

    params.set(
        "awb",
        resi
    );

    const url =
        `${BINDERBYTE_API}?${params.toString()}`;

    console.log(
        "🔎 CEK BINDERBYTE:",
        resi
    );

    const response =
        await fetch(url);

    const data =
        await response.json();

    console.log(
        "BINDERBYTE:",
        JSON.stringify(
            data,
            null,
            2
        )
    );

    return data;
}


// =====================================================
// DETEKSI PEMBAYARAN
// =====================================================

function deteksiPembayaran(data) {

    const teks =
        JSON.stringify(data)
            .toLowerCase();

    /*
     * Hanya membaca informasi COD/NONCOD
     * jika memang muncul di respons API.
     */

    if (
        teks.includes('"iscod":true') ||
        teks.includes('"iscod": true')
    ) {
        return "COD";
    }

    if (
        teks.includes('"iscod":false') ||
        teks.includes('"iscod": false')
    ) {
        return "NONCOD";
    }

    if (
        teks.includes('"paymentstatus":"cod"') ||
        teks.includes('"paymentstatus": "cod"') ||
        teks.includes('"paymenttype":"cod"') ||
        teks.includes('"paymenttype": "cod"')
    ) {
        return "COD";
    }

    if (
        teks.includes('"paymentstatus":"noncod"') ||
        teks.includes('"paymentstatus": "noncod"') ||
        teks.includes('"paymenttype":"noncod"') ||
        teks.includes('"paymenttype": "noncod"')
    ) {
        return "NONCOD";
    }

    return "DATA TIDAK TERSEDIA";
}


// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(data, inputResi) {

    const summary =
        data.summary || {};

    const detail =
        data.detail || {};

    const history =
        Array.isArray(data.history)
            ? data.history
            : [];

    const awb =
        nilai(
            summary.awb,
            inputResi
        );

    const courier =
        nilai(
            summary.courier,
            "SiCepat"
        );

    const service =
        nilai(
            summary.service
        );

    const status =
        nilai(
            summary.status
        );

    const tanggal =
        nilai(
            summary.date
        );

    const pengirim =
        nilai(
            detail.shipper
        );

    const penerima =
        nilai(
            detail.receiver
        );

    const asal =
        nilai(
            detail.origin
        );

    const tujuan =
        nilai(
            detail.destination
        );

    const pembayaran =
        deteksiPembayaran(data);


    let text = "";

    text +=
        "📦 <b>TRACKING SICEPAT</b>\n";

    text +=
        "━━━━━━━━━━━━━━━━━━━━\n\n";


    text +=
        "📨 <b>RESI</b>\n";

    text +=
        `└ No Resi : <code>${escapeHtml(
            awb
        )}</code>\n`;

    text +=
        `└ Service : ${escapeHtml(
            service
        )}\n\n`;


    text +=
        "🚩 <b>STATUS TERBARU</b>\n";

    text +=
        `└ ${escapeHtml(
            status
        )}\n\n`;


    text +=
        "🚀 <b>PENGIRIM</b>\n";

    text +=
        `└ ${escapeHtml(
            pengirim
        )}\n\n`;


    text +=
        "🏁 <b>PENERIMA</b>\n";

    text +=
        `└ ${escapeHtml(
            penerima
        )}\n\n`;


    text +=
        "📍 <b>RUTE</b>\n";

    text +=
        `└ Asal : ${escapeHtml(
            asal
        )}\n`;

    text +=
        `└ Tujuan : ${escapeHtml(
            tujuan
        )}\n\n`;


    text +=
        "💰 <b>PEMBAYARAN</b>\n";

    text +=
        `└ ${escapeHtml(
            pembayaran
        )}\n\n`;


    text +=
        "📅 <b>TANGGAL</b>\n";

    text +=
        `└ ${escapeHtml(
            tanggal
        )}\n\n`;


    text +=
        "📌 <b>RIWAYAT PENGIRIMAN</b>\n";


    if (history.length === 0) {

        text +=
            "└ Data riwayat tidak tersedia\n";

    } else {

        history.forEach(
            (item, index) => {

                const date =
                    nilai(
                        item.date ||
                        item.datetime,
                        "-"
                    );

                const desc =
                    nilai(
                        item.desc ||
                        item.description,
                        "-"
                    );

                const location =
                    item.location
                        ? String(
                            item.location
                        )
                        : "";

                text +=
                    `\n<b>${index + 1}. ${escapeHtml(
                        date
                    )}</b>\n`;

                text +=
                    `└ ${escapeHtml(
                        desc
                    )}\n`;

                if (location) {

                    text +=
                        `└ 📍 ${escapeHtml(
                            location
                        )}\n`;
                }
            }
        );
    }

    return text;
}


// =====================================================
// PROSES RESI
// =====================================================

async function prosesResi(
    chatId,
    resi
) {

    resi =
        bersihkanResi(resi);

    if (!resi) {

        await kirimPesan(
            chatId,
            "❌ Nomor resi tidak terbaca.",
            menuUtama()
        );

        return;
    }


    await kirimPesan(
        chatId,

        "🔎 Sedang mengecek resi SiCepat:\n" +
        `<code>${escapeHtml(
            resi
        )}</code>\n\n` +
        "Mohon tunggu..."
    );


    try {

        const result =
            await cekBinderByte(
                resi
            );


        if (
            !result ||
            Number(result.status) !== 200
        ) {

            await kirimPesan(
                chatId,

                "❌ <b>RESI TIDAK DAPAT DICEK</b>\n\n" +
                `Resi : <code>${escapeHtml(
                    resi
                )}</code>\n` +
                `Pesan : ${escapeHtml(
                    result?.message ||
                    "Data tidak tersedia"
                )}`,

                menuUtama()
            );

            return;
        }


        if (
            !result.data ||
            !result.data.summary
        ) {

            await kirimPesan(
                chatId,

                "❌ <b>DATA RESI TIDAK DITEMUKAN</b>\n\n" +
                "BinderByte tidak memberikan data tracking.",

                menuUtama()
            );

            return;
        }


        if (
            !result.data.summary.awb
        ) {

            await kirimPesan(
                chatId,

                "❌ <b>RESI TIDAK TERDAFTAR</b>",

                menuUtama()
            );

            return;
        }


        const pesan =
            formatTracking(
                result.data,
                resi
            );


        await kirimPesan(
            chatId,
            pesan,
            menuUtama()
        );

    } catch (error) {

        console.error(
            "❌ TRACKING ERROR:",
            error.message
        );

        await kirimPesan(
            chatId,

            "❌ Terjadi kesalahan saat mengecek resi.\n\n" +
            "Silakan coba lagi.",

            menuUtama()
        );
    }
}


// =====================================================
// PROSES PESAN
// =====================================================

async function prosesPesan(message) {

    if (
        !message ||
        !message.text
    ) {
        return;
    }

    const chatId =
        message.chat.id;

    const text =
        String(
            message.text
        ).trim();


    console.log(
        "📩 PESAN MASUK:",
        chatId,
        text
    );


    // START

    if (
        text === "/start"
    ) {

        waitingResi.delete(
            chatId
        );

        await kirimPesan(
            chatId,

            "👋 <b>Selamat datang!</b>\n\n" +
            "Bot Tracking SiCepat siap digunakan.\n\n" +
            "Silakan tekan tombol di bawah.",

            menuUtama()
        );

        return;
    }


    // TOMBOL

    if (
        text === "🔎 Cek Resi SiCepat"
    ) {

        waitingResi.add(
            chatId
        );

        await kirimPesan(
            chatId,

            "📦 <b>CEK RESI SICEPAT</b>\n\n" +
            "Silakan kirim nomor resi.\n\n" +
            "Contoh:\n" +
            "<code>004646985892</code>",

            menuUtama()
        );

        return;
    }


    // MENUNGGU RESI

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

        return;
    }


    // LANGSUNG KIRIM RESI

    const resi =
        bersihkanResi(text);

    if (
        /^[0-9A-Za-z]{8,30}$/
            .test(resi)
    ) {

        await prosesResi(
            chatId,
            resi
        );

        return;
    }


    await kirimPesan(
        chatId,

        "Silakan tekan tombol " +
        "<b>🔎 Cek Resi SiCepat</b> terlebih dahulu.",

        menuUtama()
    );
}


// =====================================================
// POLLING TELEGRAM
// =====================================================

async function mulaiPolling() {

    if (sedangPolling) {
        return;
    }

    sedangPolling = true;

    console.log(
        "🔄 POLLING TELEGRAM DIMULAI"
    );


    while (true) {

        try {

            const result =
                await telegram(
                    "getUpdates",
                    {
                        offset:
                            offset,

                        timeout:
                            30,

                        limit:
                            100,

                        allowed_updates:
                            ["message"]
                    }
                );


            if (!result.ok) {

                console.error(
                    "❌ GET UPDATES:",
                    result
                );

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            5000
                        )
                );

                continue;
            }


            const updates =
                result.result || [];


            for (
                const update
                of updates
            ) {

                offset =
                    update.update_id + 1;


                try {

                    await prosesPesan(
                        update.message
                    );

                } catch (error) {

                    console.error(
                        "ERROR PESAN:",
                        error.message
                    );
                }
            }

        } catch (error) {

            console.error(
                "❌ POLLING ERROR:",
                error.message
            );

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        5000
                    )
            );
        }
    }
}


// =====================================================
// RAILWAY
// =====================================================

app.get(
    "/",
    (req, res) => {

        res.status(200).json({

            status:
                "online",

            bot:
                "Telegram SiCepat Tracking",

            telegram:
                TELEGRAM_TOKEN
                    ? "configured"
                    : "NOT CONFIGURED",

            binderbyte:
                BINDERBYTE_API_KEY
                    ? "configured"
                    : "NOT CONFIGURED"
        });
    }
);


// =====================================================
// START
// =====================================================

app.listen(
    PORT,
    async () => {

        console.log(
            "======================================"
        );

        console.log(
            "🚀 BOT TRACKING SICEPAT"
        );

        console.log(
            "======================================"
        );

        console.log(
            "PORT:",
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
            !TELEGRAM_TOKEN ||
            !BINDERBYTE_API_KEY
        ) {

            console.error(
                "❌ VARIABLE RAILWAY BELUM LENGKAP"
            );

            return;
        }


        const telegramOK =
            await cekTelegram();


        if (!telegramOK) {

            console.error(
                "❌ BOT TELEGRAM TIDAK BISA TERHUBUNG"
            );

            return;
        }


        await hapusWebhook();


        console.log(
            "✅ SEMUA SIAP"
        );


        mulaiPolling();
    }
);
