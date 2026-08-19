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

    const result = await response.json();

    console.log(
        `TELEGRAM ${method}:`,
        JSON.stringify(result)
    );

    return result;
}


// =====================================================
// KIRIM PESAN
// =====================================================

async function sendMessage(
    chatId,
    text,
    keyboard = null
) {

    const body = {
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
    };

    if (keyboard) {
        body.reply_markup = keyboard;
    }

    return telegram(
        "sendMessage",
        body
    );
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
// BERSIHKAN RESI
// =====================================================

function bersihkanResi(text) {

    return String(text || "")
        .replace(/[^\dA-Za-z]/g, "")
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
// FORMAT RUPIAH
// =====================================================

function formatRupiah(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "";
    }

    const number = Number(
        String(value).replace(/[^\d]/g, "")
    );

    if (
        !Number.isFinite(number) ||
        number <= 0
    ) {
        return String(value);
    }

    return new Intl.NumberFormat(
        "id-ID"
    ).format(number);
}


// =====================================================
// NILAI NORMAL
// =====================================================

function nilaiNormal(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    if (
        typeof value === "object"
    ) {
        return "";
    }

    return String(value).trim();
}


// =====================================================
// CARI FIELD PEMBAYARAN
// =====================================================

function cariFieldPembayaran(
    obj,
    path = "",
    hasil = []
) {

    if (
        !obj ||
        typeof obj !== "object"
    ) {
        return hasil;
    }

    for (
        const [key, value]
        of Object.entries(obj)
    ) {

        const currentPath =
            path
                ? `${path}.${key}`
                : key;

        const keyLower =
            key
                .toLowerCase()
                .replace(/[\s_-]/g, "");

        const kataPembayaran = [
            "payment",
            "paymentstatus",
            "paymentmethod",
            "paymenttype",
            "paystatus",
            "paymethod",
            "paytype",
            "cod",
            "iscod",
            "codstatus",
            "codamount",
            "codvalue",
            "cashondelivery",
            "deliverypayment",
            "transactionstatus"
        ];

        const cocok =
            kataPembayaran.some(
                word =>
                    keyLower.includes(word)
            );

        if (cocok) {

            if (
                typeof value !== "object" &&
                value !== null
            ) {

                hasil.push({
                    key: key,
                    path: currentPath,
                    value: String(value)
                });

            }
        }

        if (
            value &&
            typeof value === "object"
        ) {

            cariFieldPembayaran(
                value,
                currentPath,
                hasil
            );
        }
    }

    return hasil;
}


// =====================================================
// DETEKSI COD / NONCOD
// =====================================================

function deteksiPembayaran(data) {

    const fields =
        cariFieldPembayaran(data);

    console.log(
        "FIELD PEMBAYARAN:",
        JSON.stringify(
            fields,
            null,
            2
        )
    );


    // ================================================
    // IS COD
    // ================================================

    for (
        const field
        of fields
    ) {

        const key =
            field.key
                .toLowerCase()
                .replace(/[\s_-]/g, "");

        const value =
            field.value
                .toLowerCase()
                .trim();

        if (
            key === "iscod"
        ) {

            if (
                value === "true" ||
                value === "1" ||
                value === "yes" ||
                value === "y"
            ) {

                return {
                    status: "COD",
                    nominal: ""
                };

            }

            if (
                value === "false" ||
                value === "0" ||
                value === "no" ||
                value === "n"
            ) {

                return {
                    status: "NONCOD",
                    nominal: ""
                };
            }
        }
    }


    // ================================================
    // COD STATUS / PAYMENT STATUS
    // ================================================

    for (
        const field
        of fields
    ) {

        const key =
            field.key
                .toLowerCase()
                .replace(/[\s_-]/g, "");

        const value =
            field.value
                .toLowerCase()
                .trim();


        if (
            key === "codstatus" ||
            key === "paymentstatus" ||
            key === "paymenttype" ||
            key === "paymentmethod" ||
            key === "cod"
        ) {

            if (
                value.includes("non cod") ||
                value.includes("noncod") ||
                value === "non-cod"
            ) {

                return {
                    status: "NONCOD",
                    nominal: ""
                };
            }


            if (
                value === "cod" ||
                value.includes("cash on delivery")
            ) {

                return {
                    status: "COD",
                    nominal: ""
                };
            }
        }
    }


    // ================================================
    // NOMINAL COD
    // ================================================

    for (
        const field
        of fields
    ) {

        const key =
            field.key
                .toLowerCase()
                .replace(/[\s_-]/g, "");

        const value =
            field.value.trim();


        if (
            key.includes("codamount") ||
            key.includes("codvalue")
        ) {

            const nominal =
                Number(
                    value.replace(
                        /[^\d]/g,
                        ""
                    )
                );

            if (
                Number.isFinite(nominal) &&
                nominal > 0
            ) {

                return {
                    status: "COD",
                    nominal: nominal
                };
            }
        }
    }


    // ================================================
    // TIDAK ADA INFORMASI
    // ================================================

    return {
        status:
            "INFORMASI PEMBAYARAN TIDAK TERSEDIA",
        nominal: ""
    };
}


// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(
    data,
    resi
) {

    const summary =
        data.summary || {};

    const detail =
        data.detail || {};

    const history =
        Array.isArray(data.history)
            ? data.history
            : [];

    const pembayaran =
        deteksiPembayaran(data);


    let text = "";


    // ================================================
    // HEADER
    // ================================================

    text +=
        "📦 <b>TRACKING SICEPAT</b>\n";

    text +=
        "━━━━━━━━━━━━━━━━━━━━\n\n";


    // ================================================
    // RESI
    // ================================================

    text +=
        "📨 <b>RESI</b>\n";

    text +=
        `└ No Resi : <code>${escapeHtml(
            summary.awb || resi
        )}</code>\n`;

    text +=
        `└ Service : ${escapeHtml(
            summary.service ||
            "DATA TIDAK TERSEDIA"
        )}\n\n`;


    // ================================================
    // STATUS
    // ================================================

    text +=
        "🚩 <b>STATUS TERBARU</b>\n";

    text +=
        `└ ${escapeHtml(
            summary.status ||
            "DATA TIDAK TERSEDIA"
        )}\n\n`;


    // ================================================
    // PENGIRIM
    // ================================================

    text +=
        "🚀 <b>PENGIRIM</b>\n";

    text +=
        `└ ${escapeHtml(
            detail.shipper ||
            "DATA TIDAK TERSEDIA"
        )}\n\n`;


    // ================================================
    // PENERIMA
    // ================================================

    text +=
        "🏁 <b>PENERIMA</b>\n";

    text +=
        `└ ${escapeHtml(
            detail.receiver ||
            "DATA TIDAK TERSEDIA"
        )}\n\n`;


    // ================================================
    // RUTE
    // ================================================

    text +=
        "📍 <b>RUTE</b>\n";

    text +=
        `└ Asal : ${escapeHtml(
            detail.origin ||
            "DATA TIDAK TERSEDIA"
        )}\n`;

    text +=
        `└ Tujuan : ${escapeHtml(
            detail.destination ||
            "DATA TIDAK TERSEDIA"
        )}\n\n`;


    // ================================================
    // PEMBAYARAN
    // ================================================

    text +=
        "💰 <b>PEMBAYARAN</b>\n";

    text +=
        `└ ${escapeHtml(
            pembayaran.status
        )}\n`;

    if (
        pembayaran.nominal
    ) {

        text +=
            `└ Nominal COD : Rp${escapeHtml(
                formatRupiah(
                    pembayaran.nominal
                )
            )}\n`;
    }

    text += "\n";


    // ================================================
    // TANGGAL
    // ================================================

    text +=
        "📅 <b>TANGGAL</b>\n";

    text +=
        `└ ${escapeHtml(
            summary.date ||
            "DATA TIDAK TERSEDIA"
        )}\n\n`;


    // ================================================
    // RIWAYAT
    // ================================================

    text +=
        "📌 <b>RIWAYAT PENGIRIMAN</b>\n";


    if (
        history.length === 0
    ) {

        text +=
            "└ Data riwayat tidak tersedia\n";

    } else {

        history.forEach(
            (item, index) => {

                text +=
                    `\n<b>${index + 1}. ${escapeHtml(
                        item.date || "-"
                    )}</b>\n`;

                text +=
                    `└ ${escapeHtml(
                        item.desc || "-"
                    )}\n`;

                if (
                    item.location
                ) {

                    text +=
                        `└ 📍 ${escapeHtml(
                            item.location
                        )}\n`;
                }
            }
        );
    }


    return text;
}


// =====================================================
// CEK RESI BINDERBYTE
// =====================================================

async function cekResiSiCepat(
    resi
) {

    if (
        !BINDERBYTE_API_KEY
    ) {

        throw new Error(
            "BINDERBYTE_API_KEY belum tersedia"
        );
    }


    const url =
        `${BINDERBYTE_API}` +
        `?api_key=${encodeURIComponent(
            BINDERBYTE_API_KEY
        )}` +
        `&courier=sicepat` +
        `&awb=${encodeURIComponent(
            resi
        )}`;


    console.log(
        "🔎 Mengecek BinderByte:",
        resi
    );


    const response =
        await fetch(url);


    const result =
        await response.json();


    console.log(
        "📦 HASIL BINDERBYTE:",
        JSON.stringify(
            result,
            null,
            2
        )
    );


    return result;
}


// =====================================================
// PROSES RESI
// =====================================================

async function prosesResi(
    chatId,
    resi
) {

    await sendMessage(
        chatId,

        `🔎 Sedang mengecek resi SiCepat:\n` +
        `<code>${escapeHtml(
            resi
        )}</code>\n\n` +
        `Mohon tunggu...`
    );


    try {

        const result =
            await cekResiSiCepat(
                resi
            );


        if (
            !result
        ) {

            await sendMessage(
                chatId,
                "❌ Tidak mendapatkan respons dari BinderByte.",
                menuUtama()
            );

            return;
        }


        // ============================================
        // API ERROR
        // ============================================

        if (
            Number(result.status) !== 200
        ) {

            await sendMessage(
                chatId,

                `❌ <b>RESI TIDAK DAPAT DICEK</b>\n\n` +
                `${escapeHtml(
                    result.message ||
                    "Data tidak tersedia"
                )}`,

                menuUtama()
            );

            return;
        }


        // ============================================
        // DATA TIDAK ADA
        // ============================================

        if (
            !result.data ||
            !result.data.summary
        ) {

            await sendMessage(
                chatId,

                "❌ <b>RESI TIDAK DITEMUKAN</b>\n\n" +
                "Nomor resi tersebut tidak memiliki data tracking dari BinderByte.",

                menuUtama()
            );

            return;
        }


        const summary =
            result.data.summary;


        // ============================================
        // AWB TIDAK ADA
        // ============================================

        if (
            !summary.awb
        ) {

            await sendMessage(
                chatId,

                "❌ <b>RESI TIDAK DITEMUKAN</b>\n\n" +
                "Data resi tidak lengkap.",

                menuUtama()
            );

            return;
        }


        // ============================================
        // FORMAT PESAN
        // ============================================

        const pesan =
            formatTracking(
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
            "❌ ERROR CEK RESI:",
            error
        );


        await sendMessage(
            chatId,

            "❌ Terjadi kesalahan saat menghubungi server tracking.\n\n" +
            "Silakan coba lagi beberapa saat.",

            menuUtama()
        );
    }
}


// =====================================================
// TELEGRAM POLLING
// =====================================================

let offset = 0;

let pollingBerjalan = false;


async function pollingTelegram() {

    if (
        pollingBerjalan
    ) {
        return;
    }


    pollingBerjalan = true;


    try {

        if (
            !TELEGRAM_TOKEN
        ) {

            console.error(
                "❌ TELEGRAM_TOKEN belum diisi."
            );

            return;
        }


        if (
            !BINDERBYTE_API_KEY
        ) {

            console.error(
                "❌ BINDERBYTE_API_KEY belum diisi."
            );

            return;
        }


        const result =
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
            !result.ok
        ) {

            console.error(
                "❌ Telegram getUpdates error:",
                result
            );

            return;
        }


        for (
            const update
            of result.result || []
        ) {

            offset =
                update.update_id + 1;


            if (
                !update.message
            ) {
                continue;
            }


            const chatId =
                update.message.chat.id;


            const text =
                String(
                    update.message.text || ""
                ).trim();


            console.log(
                "📩 Pesan masuk:",
                text
            );


            // ========================================
            // START
            // ========================================

            if (
                text === "/start"
            ) {

                waitingResi.delete(
                    chatId
                );


                await sendMessage(
                    chatId,

                    "👋 <b>Selamat datang!</b>\n\n" +
                    "📦 <b>BOT TRACKING SICEPAT</b>\n\n" +
                    "Bot siap membantu mengecek status pengiriman.\n\n" +
                    "Silakan tekan tombol di bawah.",

                    menuUtama()
                );


                continue;
            }


            // ========================================
            // CEK RESI
            // ========================================

            if (
                text === "🔎 Cek Resi SiCepat" ||
                text === "/cekresi"
            ) {

                waitingResi.add(
                    chatId
                );


                await sendMessage(
                    chatId,

                    "📦 <b>CEK RESI SICEPAT</b>\n\n" +
                    "Silakan kirim nomor resi SiCepat.\n\n" +
                    "Contoh:\n" +
                    "<code>004646985892</code>",

                    menuUtama()
                );


                continue;
            }


            // ========================================
            // USER SEDANG M
