const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Endpoint Webhook yang menerima lemparan data dari Biteship
app.post('/webhook-biteship', (req, res) => {
    try {
        const data = req.body;

        // 1. Ekstraksi Data Kurir & Resi
        const namaKurir = data.courier?.company?.toUpperCase() || "SICEPAT EXPRESS";
        const noResi = data.waybill_id || "004646985892";
        
        // 2. LOGIKA UTAMA: Deteksi Status COD atau NONCOD
        // Mengonversi tipe pembayaran Biteship menjadi teks seperti format teman Anda
        const tipeBayar = data.payment_type || "prepaid";
        const serviceType = (tipeBayar.toLowerCase() === "cod") ? "COD" : "NONCOD";

        // 3. Status Pengiriman Utama
        const statusKurir = data.status?.toUpperCase() || "PICKING_UP";

        // 4. Data Pengirim & Penerima
        const namaPengirim = data.shipper?.name || "EcoNest";
        const asalPengirim = data.shipper?.address?.city || "KAB. TANGERANG";
        const namaPenerima = data.receiver?.name || "Lidya sintya:*";
        const tujuanPenerima = data.receiver?.address?.subdistrict || "SUKMAJAYA, KOTA DEPOK";

        // 5. Membuat Garis Riwayat / POD Detail secara terbalik (Terbaru di atas)
        let podDetailsText = "";
        if (data.history && data.history.length > 0) {
            // Urutkan riwayat agar tanggal terbaru muncul di paling atas
            const sortedHistory = [...data.history].reverse();
            
            sortedHistory.forEach(item => {
                podDetailsText += `✅ ${item.note.toUpperCase()}\n└ ${item.updated_at || item.timestamp}\n`;
            });
        } else {
            // Cadangan teks tiruan jika Biteship belum mengirimkan array history lengkap
            podDetailsText = `✅ PAKET GAGAL DI PICK UP OLEH [SIGESIT]. KET: SELLER TUTUP\n└ 2026-08-16 17:50:00\n✅ ORDER HAS BEEN CONFIRMED. LOCATING NEAREST DRIVER TO PICK UP.\n└ 2026-08-16 14:01:00\n`;
        }

        // 6. STRUKTUR FORMAT PESAN (Mirip bot teman Anda)
        const formatPesanBot = 
`📦 EXPEDISI ${namaKurir.split(' ')[0]}
└ ${namaKurir}

📩 Resi
├ Service : ${serviceType}
└ No Resi : ${noResi}

📮 Status
└ Status : ${statusKurir}

🚀 Pengirim
├ ${namaPengirim}
└ ${asalPengirim}

🚩 Penerima
├ ${namaPenerima}
└ ${tujuanPenerima}

⏩ POD Detail
${podDetailsText}`;

        // Cetak hasilnya di Logs Railway Anda untuk di-copy atau diteruskan ke Bot WA/Telegram
        console.log("\n====== HASIL FORMAT BOT ======");
        console.log(formatPesanBot);
        console.log("==============================\n");

        res.status(200).json({
            success: true,
            message: "Format teks berhasil dibuat",
            text_output: formatPesanBot
        });

    } catch (error) {
        console.error("Error generating format:", error.message);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/', (req, res) => {
    res.send('Server Format Bot Teks Biteship Aktif di Railway!');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
