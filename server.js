const express = require('express');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINDERBYTE_API_KEY = process.env.BINDERBYTE_API_KEY;

const TELEGRAM_API = TELEGRAM_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_TOKEN}`
  : '';

const BINDERBYTE_API = 'https://api.binderbyte.com/v1/track';

const waitingResi = new Set();
let offset = 0;
let pollingStarted = false;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));


// =====================================================
// TELEGRAM REQUEST
// =====================================================

async function telegram(method, body = {}) {

    if (!TELEGRAM_TOKEN) {
        throw new Error('TELEGRAM_TOKEN belum diisi');
    }

    const response = await fetch(
        `${TELEGRAM_API}/${method}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `Telegram HTTP ${response.status}: ${text}`
        );
    }

    return data;
}


// =====================================================
// MENU UTAMA
// =====================================================

function menuUtama() {

    return {
        keyboard: [
            [
                {
                    text: '🔎 Cek Resi SiCepat'
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

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
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
        parse_mode: 'HTML'
    };

    if (keyboard) {
        body.reply_markup = keyboard;
    }

    const result = await telegram(
        'sendMessage',
        body
    );

    if (!result.ok) {
        console.error(
            'sendMessage error:',
            result
        );
    }

    return result;
}


// =====================================================
// BERSIHKAN RESI
// =====================================================

function bersihkanResi(text) {

    return String(text || '')
        .replace(/[^0-9A-Za-z]/g, '')
        .trim();
}


// =====================================================
// CARI FIELD PEMBAYARAN
// =====================================================

function cariFieldPembayaran(
    obj,
    path = '',
    hasil = []
) {

    if (
        !obj ||
        typeof obj !== 'object'
    ) {
        return hasil;
    }

    const kata = [
        'payment',
        'paystatus',
        'paymethod',
        'paytype',
        'iscod',
        'codstatus',
        'codamount',
        'codvalue',
        'cashondelivery'
    ];

    for (
        const [key, value]
        of Object.entries(obj)
    ) {

        const keyNormal =
            key
                .toLowerCase()
                .replace(/[\s_-]/g, '');

        const currentPath =
            path
                ? `${path}.${key}`
                : key;

        if (
            kata.some(word =>
                keyNormal.includes(word)
            ) &&
            value !== null &&
            typeof value !== 'object'
        ) {

            hasil.push({
                key: keyNormal,
                path: currentPath,
                value: String(value).trim()
            });
        }

        if (
            value &&
            typeof value === 'object'
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
        'FIELD PEMBAYARAN:',
        JSON.stringify(
            fields,
            null,
            2
        )
    );


    // IS COD

    for (const field of fields) {

        const value =
            field.value
                .toLowerCase()
                .trim();

        if (
            field.key.includes('iscod')
        ) {

            if (
                [
                    'true',
                    '1',
                    'yes',
                    'y'
                ].includes(value)
            ) {

                return {
                    status: 'COD',
                    nominal: ''
                };
            }

            if (
                [
                    'false',
                    '0',
                    'no',
                    'n'
                ].includes(value)
            ) {

                return {
                    status: 'NONCOD',
                    nominal: ''
                };
            }
        }
    }


    // PAYMENT TYPE / STATUS

    for (const field of fields) {

        const value =
            field.value
                .toLowerCase()
                .trim();

        if (
            value.includes('non cod') ||
            value.includes('non-cod') ||
            value.includes('noncod')
        ) {

            return {
                status: 'NONCOD',
                nominal: ''
            };
        }

        if (
            value === 'cod' ||
            value.includes(
                'cash on delivery'
            )
        ) {

            return {
                status: 'COD',
                nominal: ''
            };
        }
    }


    // NOMINAL COD

    for (const field of fields) {

        if (
            field.key.includes(
                'codamount'
            ) ||
            field.key.includes(
                'codvalue'
            )
        ) {

            const nominal =
                Number(
                    field.value.replace(
                        /[^0-9]/g,
                        ''
                    )
                );

            if (
                Number.isFinite(nominal) &&
                nominal > 0
            ) {

                return {
                    status: 'COD',
                    nominal: nominal
                };
            }
        }
    }


    // JANGAN MENEBak DARI SERVICE REG/BEST

    return {
        status: 'DATA TIDAK TERSEDIA',
        nominal: ''
    };
}


// =====================================================
// FORMAT RUPIAH
// =====================================================

function formatRupiah(value) {

    const number =
        Number(value);

    if (
        !Number.isFinite(number)
    ) {
        return String(
            value ?? ''
        );
    }

    return number.toLocaleString(
        'id-ID'
    );
}


// =====================================================
// FORMAT TRACKING
// =====================================================

function formatTracking(
    data,
    requestedResi
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

    let text =
        '📦 <b>TRACKING SICEPAT</b>\n';

    text +=
        '━━━━━━━━━━━━━━━━━━━━\n\n';


    // RESI

    text +=
        '📨 <b>RESI</b>\n';

    text +=
        `└ No Resi : <code>${
            escapeHtml(
                summary.awb ||
                requestedResi
            )
        }</code>\n`;

    text +=
        `└ Service : ${
            escapeHtml(
                summary.service ||
                'DATA TIDAK TERSEDIA'
            )
        }\n\n`;


    // STATUS

    text +=
        '🚩 <b>STATUS TERBARU</b>\n';

    text +=
        `└ ${
            escapeHtml(
                summary.status ||
                'DATA TIDAK TERSEDIA'
            )
        }\n\n`;


    // PENGIRIM

    text +=
        '🚀 <b>PENGIRIM</b>\n';

    text +=
        `└ ${
            escapeHtml(
                detail.shipper ||
                'DATA TIDAK TERSEDIA'
            )
        }\n\n`;


    // PENERIMA

    text +=
        '🏁 <b>PENERIMA</b>\n';

    text +=
        `└ ${
            escapeHtml(
                detail.receiver ||
                'DATA TIDAK TERSEDIA'
            )
        }\n\n`;


    // RUTE

    text +=
        '📍 <b>RUTE</b>\n';

    text +=
        `└ Asal : ${
            escapeHtml(
                detail.origin ||
                'DATA TIDAK TERSEDIA'
            )
        }\n`;

    text +=
        `└ Tujuan : ${
            escapeHtml(
                detail.destination ||
                'DATA TIDAK TERSEDIA'
            )
        }\n\n`;


    // PEMBAYARAN

    text +=
        '💰 <b>PEMBAYARAN</b>\n';

    text +=
        `└ ${
            escapeHtml(
                pembayaran.status
            )
        }\n`;

    if (
        pembayaran.nominal
    ) {

        text +=
            `└ Nominal COD : Rp${
                escapeHtml(
                    formatRupiah(
                        pembayaran.nominal
                    )
                )
            }\n`;
    }

    text += '\n';


    // TANGGAL

    text +=
        '📅 <b>TANGGAL</b>\n';

    text +=
        `└ ${
            escapeHtml(
                summary.date ||
                'DATA TIDAK TERSEDIA'
            )
        }\n\n`;


    // RIWAYAT

    text +=
        '📌 <b>RIWAYAT PENGIRIMAN</b>\n';

    if (
        !history.length
    ) {

        text +=
            '└ Data riwayat tidak tersedia\n';

    } else {

        history.forEach(
            (item, index) => {

                text +=
                    `\n<b>${index + 1}. ${
                        escapeHtml(
                            item.date ||
                            '-'
                        )
                    }</b>\n`;

                text +=
                    `└ ${
                        escapeHtml(
                            item.desc ||
                            '-'
                        )
                    }\n`;

                if (
                    item.location
                ) {

                    text +=
                        `└ 📍 ${
                            escapeHtml(
                                item.location
                            )
                        }\n`;
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
            'BINDERBYTE_API_KEY belum diisi'
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
        'Mengecek BinderByte:',
        resi
    );

    const response =
        await fetch(url);

    const text =
        await response.text();

    let result;

    try {

        result =
            JSON.parse(text);

    } catch {

        throw new Error(
            `BinderByte HTTP ${
                response.status
            }: ${text}`
        );
    }

    console.log(
        'HASIL BINDERBYTE:',
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
        `🔎 Sedang mengecek resi SiCepat:\n<code>${
            escapeHtml(resi)
        }</code>\n\nMohon tunggu...`
    );

    try {

        const result =
            await cekResiSiCepat(
                resi
            );

        if (
            !result ||
            Number(result.status) !== 200 ||
            !result.data ||
            !result.data.summary ||
            !result.data.summary.awb
        ) {

            await sendMessage(
                chatId,
                `❌ <b>RESI TIDAK DITEMUKAN</b>\n\n${
                    escapeHtml(
                        result?.message ||
                        'Data tracking tidak tersedia.'
                    )
                }`,
                menuUtama()
            );

            return;
        }

        await sendMessage(
            chatId,
            formatTracking(
                result.data,
                resi
            ),
            menuUtama()
        );

    } catch (error) {

        console.error(
            'ERROR CEK RESI:',
            error
        );

        await sendMessage(
            chatId,
            '❌ Terjadi kesalahan saat menghubungi server tracking.\n\nSilakan coba lagi.',
            menuUtama()
        );
    }
}


// =====================================================
// PROSES PESAN TELEGRAM
// =====================================================

async function handleMessage(
    message
) {

    if (
        !message ||
        !message.chat
    ) {
        return;
    }

    const chatId =
        message.chat.id;

    const text =
        String(
            message.text || ''
        ).trim();

    console.log(
        '📩 PESAN TELEGRAM:',
        chatId,
        JSON.stringify(text)
    );


    // START

    if (
        text === '/start'
    ) {

        waitingResi.delete(
            chatId
        );

        await sendMessage(
            chatId,
            '👋 <b>Selamat datang!</b>\n\nSilakan pilih menu di bawah untuk melakukan pengecekan resi SiCepat.',
            menuUtama()
        );

        return;
    }


    // TOMBOL CEK RESI

    if (
        text ===
            '🔎 Cek Resi SiCepat' ||
        text === '/cekresi'
    ) {

        waitingResi.add(
            chatId
        );

        await sendMessage(
            chatId,
            '📦 <b>CEK RESI SICEPAT</b>\n\nSilakan kirim nomor resi SiCepat kamu.\n\nContoh:\n<code>004646985892</code>',
            menuUtama()
        );

        return;
    }


    // USER MENGIRIM RESI

    if (
        waitingResi.has(
            chatId
        )
    ) {

        const resi =
            bersihkanResi(
                text
            );

        if (
            !resi
        ) {

            await sendMessage(
                chatId,
                '❌ Nomor resi tidak terbaca.\n\nSilakan kirim nomor resi yang benar.',
                menuUtama()
            );

            return;
        }

        waitingResi.delete(
            chatId
        );

        await prosesResi(
            chatId,
            resi
        );

        return;
    }


    // LANGSUNG KIRIM RESI

    const kemungkinanResi =
        bersihkanResi(
            text
        );

    if (
        /^[0-9A-Za-z]{8,30}$/.test(
            kemungkinanResi
        )
    ) {

        await prosesResi(
            chatId,
            kemungkinanResi
        );

        return;
    }


    await sendMessage(
        chatId,
        'Silakan tekan tombol <b>🔎 Cek Resi SiCepat</b> terlebih dahulu.',
        menuUtama()
    );
}


// =====================================================
// POLLING TELEGRAM
// =====================================================

async function pollingTelegram() {

    if (
        pollingStarted
    ) {
        return;
    }

    pollingStarted = true;

    console.log(
        '🔄 POLLING TELEGRAM DIMULAI'
    );

    while (true) {

        try {

            const result =
                await telegram(
                    'getUpdates',
                    {
                        offset: offset,
                        timeout: 30,
                        allowed_updates: [
                            'message'
                        ]
                    }
                );

            if (
                !result.ok
            ) {

                console.error(
                    'Telegram getUpdates error:',
                    result
                );

                await sleep(
                    5000
                );

                continue;
            }

            for (
                const update
                of result.result || []
            ) {

                offset =
                    update.update_id + 1;

                try {

                    await handleMessage(
                        update.message
                    );

                } catch (error) {

                    console.error(
                        'HANDLE MESSAGE ERROR:',
                        error
                    );
                }
            }

        } catch (error) {

            console.error(
                'POLLING ERROR:',
                error
            );

            await sleep(
                5000
            );
        }
    }
}


// =====================================================
// START BOT
// =====================================================

async function startBot() {

    console.log(
        '🚀 MEMULAI BOT SICEPAT'
    );

    console.log(
        'TELEGRAM_TOKEN:',
        TELEGRAM_TOKEN
            ? 'ADA'
            : 'TIDAK ADA'
    );

    console.log(
        'BINDERBYTE_API_KEY:',
        BINDERBYTE_API_KEY
            ? 'ADA'
            : 'TIDAK ADA'
    );


    if (
        !TELEGRAM_TOKEN ||
        !BINDERBYTE_API_KEY
    ) {

        console.error(
            '❌ Environment variable belum lengkap. Cek TELEGRAM_TOKEN dan BINDERBYTE_API_KEY di Railway Variables.'
        );

        return;
    }


    try {

        // Hapus webhook agar polling bisa berjalan.

        const webhook =
            await telegram(
                'deleteWebhook',
                {
                    drop_pending_updates: false
                }
            );

        console.log(
            'DELETE WEBHOOK:',
            JSON.stringify(
                webhook
            )
        );


        // Tes token Telegram.

        const me =
            await telegram(
                'getMe'
            );

        console.log(
            'GET ME:',
            JSON.stringify(
                me
            )
        );


        if (
            !me.ok
        ) {

            console.error(
                '❌ TELEGRAM_TOKEN tidak valid atau bot tidak dapat diakses.'
            );

            return;
        }


        console.log(
            `✅ BOT AKTIF: @${me.result.username}`
        );


        await pollingTelegram();

    } catch (error) {

        console.error(
            'START BOT ERROR:',
            error
        );
    }
}


// =====================================================
// RAILWAY HEALTH CHECK
// =====================================================

app.get(
    '/',
    (req, res) => {

        res.json({
            status: 'online',

            bot:
                'Telegram SiCepat Tracking',

            telegram:
                TELEGRAM_TOKEN
                    ? 'configured'
                    : 'not configured',

            binderbyte:
                BINDERBYTE_API_KEY
                    ? 'configured'
                    : 'not configured'
        });
    }
);


// =====================================================
// J
