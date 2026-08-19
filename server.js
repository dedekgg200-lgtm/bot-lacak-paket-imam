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

let offset = 0;
let pollingRunning = false;


// =====================================================
// TELEGRAM API
// =====================================================

async function telegram(method, body = {}) {

    if (!TELEGRAM_TOKEN) {
        throw new Error("TELEGRAM_TOKEN belum tersedia.");
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
        text: text
    };

    if (keyboard) {
        body.reply_markup = keyboard;
    }

    const result =
        await telegram(
            "sendMessage",
            body
        );

    if (!result.ok) {
        console.error(
            "GAGAL KIRIM PESAN TELEGRAM:",
            result
        );
    }

    return result;
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
// NILAI AMAN
// =====================================================

function clean(
    value,
    fallback = "DATA TIDAK TERSEDIA"
) {

    if (
        value === null ||
        value === undefined
    ) {
        return fallback;
    }

    if (
        typeof value === "object"
    ) {
        return fallback;
    }

    const result =
        String(value).trim();

    return result || fallback;
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
// HAPUS WEBHOOK
//
// Kita memakai getUpdates / polling.
// Telegram tidak bisa menerima getUpdates
// jika webhook masih aktif.
// =====================================================

async function hapusWebhook() {

    try {

        console.log(
            "Memeriksa webhook Telegram..."
        );

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
                    "✅ Webhook berhasil dihapus."
                );

            } else {

                console.error(
                    "❌ Gagal menghapus webhook:",
                    result
                );
            }

        } else {

            console.log(
                "✅ Tidak ada webhook aktif."
            );
        }

    } catch (error) {

        console.error(
            "ERROR WEBHOOK:",
            error.message || error
        );
    }
}


// =====================================================
// CEK TOKEN TELEGRAM
// =====================================================

async function cekTelegram() {

    try {

        const result =
            await telegram("getMe");

        if (
            result.ok &&
            result.result
        ) {

            console.log(
                "✅ TELEGRAM TERHUBUNG"
            );

            console.log(
                "Nama Bot:",
                result.result.first_name
            );

            console.log(
                "Username Bot:",
                result.result.username
            );

            return true;
        }

        console.error(
            "❌ TOKEN TELEGRAM TIDAK VALID:",
            result
        );

        return false;

    } catch (error) {

        console.error(
            "❌ GAGAL MENGHUBUNGI TELEGRAM:",
            error.message || error
        );

        return false;
    }
}


// =====================================================
// CEK BINDERBYTE
// =====================================================

async function cekResiSiCepat(
    awb
) {

    if (!BINDERBYTE_API_KEY) {

        throw new Error(
            "BINDERBYTE_API_KEY belum tersedia."
        );
    }

    const params =
        new URLSearchParams({
            api_key:
                BINDERBYTE_API_KEY,

            courier:
                "sicepat",

            awb:
                awb
        });

    const url =
        `${BINDERBYTE_API}?${params.toString()}`;

    console.log(
        "MENGECEK BINDERBYTE:",
        awb
    );

    const response =
        await fetch(url);

    let result;

    try {

        result =
            await response.json();

    } catch {

        throw new Error(
            `Respons BinderByte tidak valid. HTTP ${response.status}`
        );
    }

    console.log(
        "BINDERBYTE RESPONSE:",
        JSON.stringify(
            result,
            null,
            2
        )
    );

    return {
        httpStatus:
            response.status,

        data:
            result
    };
}


// =====================================================
// CARI INFORMASI PEMBAYARAN
//
// Tidak menebak COD/NONCOD dari service REG.
// =====================================================

function cariPembayaran(
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

        const keyLower =
            key
                .toLowerCase()
                .replace(
                    /[\s_-]/g,
                    ""
                );

        const currentPath =
            path
                ? `${path}.${key}`
                : key;

        const kataPembayaran = [
            "payment",
            "paystatus",
            "paymethod",
            "paytype",
            "iscod",
            "codstatus",
            "codamount",
            "codvalue",
            "cashondelivery"
        ];

        const cocok =
            kataPembayaran.some(
                word =>
                    keyLower.includes(word)
            );

        if (
            cocok &&
            value !== null &&
            typeof value !== "object"
        ) {

            hasil.push({
                key:
                    keyLower,

                path:
                    currentPath,

                value:
                    String(value).trim()
            });
        }

        if (
            value &&
            typeof value === "object"
        ) {

            cariPembayaran(
                value,
                currentPath,
                hasil
            );
        }
    }

    return hasil;
}


// =====================================================
// DETEKSI PEMBAYARAN
// =====================================================

function deteksiPembayaran(
    data
) {

    const fields =
        cariPembayaran(data);

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

        if (
            field.key.includes(
                "iscod"
            )
        ) {

            const value =
                field.value
                    .toLowerCase()
                    .trim();

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
    // STATUS / TYPE / METHOD
    // ================================================

    for (
        const field
        of fields
    ) {

        const value =
            field.value
                .toLowerCase()
                .trim();

        if (
            value.includes("non cod") ||
            value.includes("non-cod") ||
            value.includes("noncod")
        ) {

            return {
                status: "NONCOD",
                nominal: ""
            };
        }

        if (
            value === "cod" ||
            value.includes(
                "cash on delivery"
            )
        ) {

            return {
                status: "COD",
                nominal: ""
            };
        }
    }


    // ================================================
    // NOMINAL COD
    // ================================================

    for (
        const field
        of fields
    ) {

        if (
            field.key.includes(
                "codamount"
            ) ||
            field.key.includes(
                "codvalue"
            )
        ) {

            const nominal =
                Number(
                    field.value
                        .replace(
                            /[^\d]/g,
                            ""
                        )
                );

            if (
                Number.isFinite(
                    nominal
                ) &&
                nominal > 0
            ) {

                return {
                    status: "COD",
                    nominal:
                        nominal
                };
            }
        }
    }


    // ================================================
    // TIDAK ADA INFORMASI
    // ================================================

    return {
        status:
            "DATA TIDAK TERSEDIA",

        nominal:
            ""
    };
}


// =====================================================
// FORMAT RUPIAH
// =====================================================

function formatRupiah(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "";
    }

    const number =
        Number(
            String(value)
                .replace(
                    /[^\d]/g,
                    ""
                )
        );

    if (
        !Number.isFinite(
            number
        )
    ) {
        return String(value);
    }

    return new Intl.NumberFormat(
        "id-ID"
    ).format(number);
}


// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(
    data,
    inputAwb
) {

    const summary =
        data.summary || {};

    const detail =
        data.detail || {};

    const history =
        Array.isArray(
            data.history
        )
            ? data.history
            : [];


    const awb =
        clean(
            summary.awb,
            inputAwb
        );

    const courier =
        clean(
            summary.courier,
            "SiCepat"
        );

    const service =
        clean(
            summary.service,
            "DATA TIDAK TERSEDIA"
        );

    const status =
        clean(
            summary.status,
            "DATA TIDAK TERSEDIA"
        );

    const shipper =
        clean(
            detail.shipper
        );

    const receiver =
        clean(
            detail.receiver
        );

    const origin =
        clean(
            detail.origin
        );

    const destination =
        clean(
            detail.destination
        );

    const tanggal =
        clean(
            summary.date
        );


    const pembayaran =
        deteksiPembayaran(data);


    let text = "";


    // =================================================
    // HEADER
    // =================================================

    text +=
        "📦 <b>TRACKING SICEPAT</b>\n";

    text +=
        "━━━━━━━━━━━━━━━━━━━━\n\n";


    // =================================================
    // RESI
    // =================================================

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


    // =================================================
    // STATUS
    // =================================================

    text +=
        "🚩 <b>STATUS TERBARU</b>\n";

    text +=
        `└ ${escapeHtml(
            status
        )}\n\n`;


    // =================================================
    // PENGIRIM
    // =================================================

    text +=
        "🚀 <b>PENGIRIM</b>\n";

    text +=
        `└ ${escapeHtml(
            shipper
        )}\n\n`;


    // =================================================
    // PENERIMA
    // =================================================

    text +=
        "🏁 <b>PENERIMA</b>\n";

    text +=
        `└ ${escapeHtml(
            receiver
        )}\n\n`;


    // =================================================
    // RUTE
    // =================================================

    text +=
        "📍 <b>RUTE</b>\n";

    text +=
        `└ Asal : ${escapeHtml(
            origin
        )}\n`;

    text +=
        `└ Tujuan : ${escapeHtml(
            destination
        )}\n\n`;


    // =================================================
    // PEMBAYARAN
    // =================================================

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


    // =================================================
    // TANGGAL
    // =================================================

    text +=
        "📅 <b>TANGGAL</b>\n";

    text +=
        `└ ${escapeHtml(
            tanggal
        )}\n\n`;


    // =================================================
    // RIWAYAT
    // =================================================

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

                const date =
                    clean(
                        item?.date ||
                        item?.datetime,
                        "-"
                    );

                const desc =
                    clean(
                        item?.desc ||
                        item?.description,
                        "-"
                    );

                const location =
                    clean(
                        item?.location,
                        ""
                    );


                text +=
                    `\n<b>${index + 1}. ${escapeHtml(
                        date
                    )}</b>\n`;

                text +=
                    `└ ${escapeHtml(
                        desc
                    )}\n`;


                if (
                    location
                ) {

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
    awb
) {

    const resi =
        bersihkanResi(
            awb
        );


    if (!resi) {

        await sendMessage(
            chatId,

            "❌ Nomor resi tidak terbaca.\n\n" +
            "Silakan kirim nomor resi yang benar.",

            menuUtama()
        );

        return;
    }


    await sendMessage(
        chatId,

        `🔎 Sedang mengecek resi SiCepat:\n` +
        `<code>${escapeHtml(
            resi
        )}</code>\n\n` +
        `Mohon tunggu...`
    );


    try {

        const response =
            await cekResiSiCepat(
                resi
            );

        const result =
            response.data;


        // ============================================
        // API GAGAL
        // ============================================

        if (
            response.httpStatus !== 200 ||
            !result ||
            Number(
                result.status
            ) !== 200
        ) {

            await sendMessage(
                chatId,

                "❌ <b>RESI TIDAK DAPAT DICEK</b>\n\n" +

                `Resi : <code>${escapeHtml(
                    resi
                )}</code>\n` +

                `Pesan : ${escapeHtml(
                    result?.message ||
                    "Data tidak tersedia."
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
            typeof result.data !== "object"
        ) {

            await sendMessage(
                chatId,

                "❌ <b>DATA RESI TIDAK DITEMUKAN</b>\n\n" +
                "BinderByte tidak memberikan data tracking.",

                menuUtama()
            );

            return;
        }


        const summary =
            result.data.summary || {};


        if (
            !summary.awb
        ) {

            await sendMessage(
                chatId,

                "❌ <b>RESI TIDAK DITEMUKAN</b>\n\n" +
                "Nomor resi tidak terdaftar.",

                menuUtama()
            );

            return;
        }


        // ============================================
        // FORMAT HASIL
        // ============================================

       
