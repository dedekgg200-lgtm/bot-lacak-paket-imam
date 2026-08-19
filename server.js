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


// =====================================================
// DATA BOT
// =====================================================

const waitingResi = new Set();

let offset = 0;
let pollingRunning = false;


// =====================================================
// TELEGRAM REQUEST
// =====================================================

async function telegram(method, body = {}) {

    if (!TELEGRAM_TOKEN) {
        throw new Error(
            "TELEGRAM_TOKEN belum tersedia."
        );
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

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error(
            `Telegram memberikan respons tidak valid. HTTP ${response.status}`
        );
    }

    if (!response.ok || !result.ok) {

        throw new Error(
            `Telegram error: ${JSON.stringify(result)}`
        );
    }

    return result;
}


// =====================================================
// KIRIM PESAN TELEGRAM
// =====================================================

async function sendMessage(
    chatId,
    text,
    keyboard = null
) {

    const body = {

        chat_id: chatId,

        text: text,

        // PENTING:
        // Supaya <b> dan <code> bekerja
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
// ESCAPE HTML
// =====================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


// =====================================================
// CLEAN VALUE
// =====================================================

function clean(
    value,
    fallback = ""
) {

    if (
        value === undefined ||
        value === null
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
// BERSIHKAN RESI
// =====================================================

function bersihkanResi(text) {

    return String(text || "")
        .replace(/[^\dA-Za-z]/g, "")
        .trim();
}


// =====================================================
// FORMAT RUPIAH
// =====================================================

function formatRupiah(value) {

    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return "";
    }


    const angka = Number(
        String(value)
            .replace(/[^\d]/g, "")
    );


    if (
        !Number.isFinite(angka) ||
        angka <= 0
    ) {
        return String(value);
    }


    return new Intl.NumberFormat(
        "id-ID"
    ).format(angka);
}


// =====================================================
// BINDERBYTE - CEK RESI
// =====================================================

async function cekResiSiCepat(awb) {

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
        "🔎 CEK BINDERBYTE:",
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
        "📦 BINDERBYTE RESPONSE:",
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
// SERVICE
// =====================================================

function getService(data) {

    const service =
        clean(
            data?.summary?.service
        );


    if (!service) {

        return "DATA TIDAK TERSEDIA";
    }


    return service;
}


// =====================================================
// STATUS
// =====================================================

function getStatus(data) {

    const summary =
        data?.summary || {};


    const history =
        Array.isArray(
            data?.history
        )
            ? data.history
            : [];


    // Prioritas utama:
    // summary.status

    const summaryStatus =
        clean(
            summary.status
        );


    if (summaryStatus) {

        return summaryStatus;
    }


    // Kalau summary.status kosong,
    // gunakan history terbaru

    if (history.length > 0) {

        const latest =
            history[0];


        const status =
            clean(
                latest?.status ||
                latest?.Status
            );


        if (status) {

            return status;
        }


        const description =
            clean(
                latest?.desc ||
                latest?.description
            );


        if (description) {

            return description;
        }
    }


    return "STATUS TIDAK TERSEDIA";
}


// =====================================================
// CARI DATA PEMBAYARAN
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

        const currentPath =
            path
                ? `${path}.${key}`
                : key;


        const keyLower =
            key
                .toLowerCase()
                .replace(
                    /[\s_-]/g,
                    ""
                );


        const kataPembayaran = [

            "payment",

            "paymentstatus",

            "paymentmethod",

            "paymenttype",

            "paystatus",

            "paymethod",

            "paytype",

            "iscod",

            "codstatus",

            "codamount",

            "codvalue",

            "cashondelivery",

            "deliverypayment"
        ];


        const cocok =
            kataPembayaran.some(
                kata =>
                    keyLower.includes(kata)
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

function deteksiPembayaran(data) {

    const fields =
        cariPembayaran(data);


    console.log(
        "💰 FIELD PEMBAYARAN:",
        JSON.stringify(
            fields,
            null,
            2
        )
    );


    // =================================================
    // IS COD
    // =================================================

    for (
        const field
        of fields
    ) {

        const value =
            field.value
                .toLowerCase()
                .trim();


        if (
            field.key.includes(
                "iscod"
            )
        ) {

            if (
                value === "true" ||
                value === "1" ||
                value === "yes" ||
                value === "y"
            ) {

                return {

                    status:
                        "COD",

                    nominal:
                        ""
                };
            }


            if (
                value === "false" ||
                value === "0" ||
                value === "no" ||
                value === "n"
            ) {

                return {

                    status:
                        "NONCOD",

                    nominal:
                        ""
                };
            }
        }
    }


    // =================================================
    // PAYMENT STATUS / TYPE / METHOD
    // =================================================

    for (
        const field
        of fields
    ) {

        const value =
            field.value
                .toLowerCase()
                .trim();


        if (
            value.includes(
                "non cod"
            ) ||
            value.includes(
                "non-cod"
            ) ||
            value.includes(
                "noncod"
            )
        ) {

            return {

                status:
                    "NONCOD",

                nominal:
                    ""
            };
        }


        if (
            value === "cod" ||
            value.includes(
                "cash on delivery"
            )
        ) {

            return {

                status:
                    "COD",

                nominal:
                    ""
            };
        }
    }


    // =================================================
    // NOMINAL COD
    // =================================================

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

                    status:
                        "COD",

                    nominal:
                        nominal
                };
            }
        }
    }


    // =================================================
    // JANGAN MENEBak DARI SERVICE
    // =================================================

    /*
        REG bukan berarti NONCOD.

        BEST bukan berarti NONCOD.

        Service hanya jenis layanan
        pengiriman.

        Jadi kalau API tidak memberikan
        informasi pembayaran, kita tampilkan:

        DATA TIDAK TERSEDIA
    */


    return {

        status:
            "DATA TIDAK TERSEDIA",

        nominal:
            ""
    };
}


// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(
    data,
    inputAwb
) {

    const summary =
        data?.summary || {};


    const detail =
        data?.detail || {};


    const history =
        Array.isArray(
            data?.history
        )
            ? data.history
            : [];


    // =================================================
    // DATA DASAR
    // =================================================

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
        getService(data);


    const status =
        getStatus(data);


    const shipper =
        clean(
            detail.shipper,
            "DATA TIDAK TERSEDIA"
        );


    const receiver =
        clean(
            detail.receiver,
            "DATA TIDAK TERSEDIA"
        );


    const origin =
        clean(
            detail.origin,
            "DATA TIDAK TERSEDIA"
        );


    const destination =
        clean(
            detail.destination,
            "DATA TIDAK TERSEDIA"
        );


    const tanggal =
        clean(
            summary.date,
            "DATA TIDAK TERSEDIA"
        );


    const pembayaran =
        deteksiPembayaran(data);


    // =================================================
    // BIKIN PESAN
    // =================================================

    let text = "";


    text +=
        "📦 <b>TRACKING SICEPAT</b>\n";

    text +=
        "━━━━━━━━━━━━━━━━━━━━\n\n";


    // RESI

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


    // STATUS

    text +=
        "🚩 <b>STATUS TERBARU</b>\n";

    text +=
        `└ ${escapeHtml(
            status
        )}\n\n`;


    // PENGIRIM

    text +=
        "🚀 <b>PENGIRIM</b>\n";

    text +=
        `└ ${escapeHtml(
            shipper
        )}\n`;


    text +=
        `└ Asal : ${escapeHtml(
            origin
        )}\n\n`;


    // PENERIMA

    text +=
        "🏁 <b>PENERIMA</b>\n";

    text +=
        `└ ${escapeHtml(
            receiver
        )}\n`;


    text +=
        `└ Tujuan : ${escapeHtml(
            destination
        )}\n\n`;


    // PEMBAYARAN

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


    // TANGGAL

    text +=
        "📅 <b>TANGGAL</b>\n";

    text +=
        `└ ${escapeHtml(
            tanggal
        )}\n\n`;


    // RIWAYAT

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
                        item?.location
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

    awb =
        bersihkanResi(awb);


    if (!awb) {

        await sendMessage(
            chatId,

            "❌ <b>Nomor resi belum dikirim.</b>\n\n" +
            "Silakan kirim nomor resi SiCepat.",

            menuUtama()
        );

        return;
    }


    // Pesan tunggu

    await sendMessage(
        chatId,

        "🔎 <b>SEDANG MENGECEK RESI</b>\n\n" +
        `Resi : <code>${escapeHtml(
            awb
        )}</code>\n\n` +
        "Mohon tunggu..."
    );


    try {

        const response =
            await cekResiSiCepat(
                awb
            );


        const result =
            response.data;


        // =================================================
        // API ERROR
        // =================================================

        if (
            !result ||
            Number(result.status) !== 200
        ) {

            await sendMessage(
                chatId,

                "❌ <b>RESI TIDAK DAPAT DICEK</b>\n\n" +

                `Resi : <code>${escapeHtml(
                    awb
                )}</code>\n` +

                `Pesan : ${escapeHtml(
                    result?.message ||
                    "Data tidak tersedia."
                )}`,

                menuUtama()
            );

            return;
        }


        // =================================================
        // DATA TIDAK ADA
        // =================================================

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


        // =================================================
        // SUMMARY
        // =================================================

        if (
            !result.data.summary ||
            !result.data.summary.awb
        ) {

            await sendMessage(
                chatId,

                "❌ <b>RESI TIDAK DITEMUKAN</b>\n\n" +
                `Nomor : <code>${escapeHtml(
                    awb
                )}</code>`,

                menuUtama()
            );

            return;
        }


        // =================================================
        // FORMAT HASIL
        // =================================================

        const pesan =
            formatTracking(
                result.data,
                awb
            );


        // =================================================
        // KIRIM HASIL
        // =================================================

        await sendMessage(
            chatId,
            pesan,
            menuUtama()
        );


    } catch (error) {

        console.error(
            "❌ ERROR TRACKING:",
            error.message ||
            error
        );


        try {

            await sendMessage(
                chatId,

                "❌ <b>TERJADI KESALAHAN</b>\n\n" +
                "Server tracking sedang mengalami masalah.\n\n" +
                "Silakan coba lagi.",

                me
