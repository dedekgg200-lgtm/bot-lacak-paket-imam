const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware untuk membaca JSON body dari Biteship
app.use(express.json());

// Endpoint untuk menerima webhook tracking dari Biteship
app.post('/webhook-biteship', (req, res) => {
    try {
        const data = req.body;

        // Ambil data penting dari payload Biteship
        const trackingId = data.id; // ID Tracking Biteship
        const orderId = data.order_id; // ID Order toko Anda
        const status = data.status; // Status kurir (picked, delivered, dll)
        const paymentType = data.payment_type; // 'cod', 'prepaid', atau 'postpaid'
        
        console.log(`=== Menerima Update Paket: ${orderId} ===`);
        console.log(`Status Pengiriman: ${status}`);

        // LOGIKA PENGECEKAN STATUS BAYAR (COD VS NON-COD)
        let statusPembayaran = "";
        
        if (paymentType === "cod") {
            statusPembayaran = "BELUM BAYAR (Paket COD - Harus Ditagih Kurir)";
            
            // Cek jika paket COD sudah sampai, berarti otomatis sudah dibayar ke kurir
            if (status === "delivered") {
                statusPembayaran = "SUDAH BAYAR (Paket COD Sukses Diterima & Dibayar)";
            } else if (status === "rejected") {
                statusPembayaran = "GAGAL BAYAR (Paket COD Ditolak/Retur)";
            }
        } else {
            // Jika statusnya prepaid/postpaid berarti pembeli sudah bayar lunas di awal
            statusPembayaran = "SUDAH LUNAS (Pembayaran Non-COD di Awal)";
        }

        console.log(`Status Pembayaran Paket: ${statusPembayaran}`);

        // Kirim respon 200 ke Biteship agar tidak dikirim ulang
        res.status(200).json({
            success: true,
            message: "Data berhasil diterima oleh server Railway",
            status_pembayaran: statusPembayaran
        });

    } catch (error) {
        console.error("Terjadi error parsing:", error.message);
        res.status(500).send("Internal Server Error");
    }
});

// Endpoint tes untuk memastikan server Railway hidup
app.get('/', (req, res) => {
    res.send('Server Tracker Biteship di Railway siap menerima data!');
});

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});

