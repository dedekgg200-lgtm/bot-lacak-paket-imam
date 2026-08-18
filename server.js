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
            console.error("❌ Telegram error:", result);
            return;
        }

        for (const update of result.result || []) {

            offset = update.update_id + 1;

            if (!update.message) {
                continue;
            }

            const chatId = update.message.chat.id;

            const text = String(
                update.message.text || ""
            ).trim();

            console.log(
                "📩 Pesan Telegram:",
                text
            );


            // =========================================
            // START
            // =========================================

            if (text === "/start") {

                waitingResi.delete(chatId);

                await sendMessage(
                    chatId,
                    "👋 <b>Selamat datang!</b>\n\n" +
                    "📦 Bot Tracking SiCepat\n\n" +
                    "Silakan tekan tombol di bawah untuk mengecek nomor resi.",
                    menuUtama()
                );

                continue;
            }


            // =========================================
            // TOMBOL CEK RESI
            // =========================================

            if (
                text === "🔎 Cek Resi SiCepat" ||
                text === "/cekresi"
            ) {

                waitingResi.add(chatId);

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


            // =========================================
            // USER SEDANG DIMINTA MENGIRIM RESI
            // =========================================

            if (waitingResi.has(chatId)) {

                const resi = bersihkanResi(text);

                if (!resi) {

                    await sendMessage(
                        chatId,
                        "❌ Nomor resi tidak terbaca.\n\n" +
                        "Silakan kirim nomor resi SiCepat yang benar.",
                        menuUtama()
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


            // =========================================
            // JIKA USER LANGSUNG KIRIM RESI
            // =========================================

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


            // =========================================
            // PESAN LAIN
            // =========================================

            await sendMessage(
                chatId,
                "Silakan tekan tombol <b>🔎 Cek Resi SiCepat</b> terlebih dahulu.",
                menuUtama()
            );
        }

    } catch (error) {

        console.error(
            "❌ TELEGRAM POLLING ERROR:",
            error
        );

        // Jangan membuat polling berhenti
        await new Promise(
            resolve => setTimeout(resolve, 3000)
        );
    }
}


// =====================================================
// POLLING CONTROLLER
// =====================================================

async function mulaiPolling() {

    console.log(
        "🤖 Memulai Telegram polling..."
    );

    while (true) {

        try {

            await pollingTelegram();

        } catch (error) {

            console.error(
                "❌ POLLING CONTROLLER ERROR:",
                error
            );
        }

        await new Promise(
            resolve => setTimeout(resolve, 1000)
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


app.get("/health", (req, res) => {

    res.json({
        status: "ok",
        telegram:
            TELEGRAM_TOKEN
                ? "configured"
                : "missing",
        binderbyte:
            BINDERBYTE_API_KEY
                ? "configured"
                : "missing"
    });

});


app.listen(PORT, () => {

    console.log(
        `🚀 Server aktif di port ${PORT}`
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

    mulaiPolling();

});
