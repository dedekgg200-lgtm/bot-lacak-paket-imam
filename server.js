const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BITESHIP_API_KEY = process.env.BITESHIP_API_KEY;

if (!BITESHIP_API_KEY) {
  console.error("BITESHIP_API_KEY belum diisi.");
}

// =========================
// Helper Biteship
// =========================
async function biteship(path, options = {}) {
  const response = await fetch(
    `https://api.biteship.com${path}`,
    {
      ...options,
      headers: {
        Authorization: BITESHIP_API_KEY,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const data = await response.json();

  return {
    status: response.status,
    data
  };
}

// =========================
// TEST SERVER
// =========================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Biteship API server aktif"
  });
});

// =========================
// CEK ONGKIR
// =========================
app.post("/rates", async (req, res) => {
  try {
    const result = await biteship("/v1/rates/couriers", {
      method: "POST",
      body: JSON.stringify(req.body)
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =========================
// BUAT ORDER
// =========================
app.post("/orders", async (req, res) => {
  try {
    const result = await biteship("/v1/orders", {
      method: "POST",
      body: JSON.stringify(req.body)
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =========================
// AMBIL ORDER BERDASARKAN ID
// =========================
app.get("/orders/:id", async (req, res) => {
  try {
    const result = await biteship(
      `/v1/orders/${encodeURIComponent(req.params.id)}`,
      {
        method: "GET"
      }
    );

    res.status(result.status).json(result.data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =========================
// JALANKAN SERVER
// =========================
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
