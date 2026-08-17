import os, re, time, requests, telebot
from telebot import types

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
BITESHIP_API_KEY = os.getenv("BITESHIP_API_KEY")
BASE = "https://api.biteship.com"

if not TELEGRAM_TOKEN:
    raise ValueError("TELEGRAM_TOKEN belum diisi di Railway")
if not BITESHIP_API_KEY:
    raise ValueError("BITESHIP_API_KEY belum diisi di Railway")

bot = telebot.TeleBot(TELEGRAM_TOKEN)
user_courier = {}

def menu():
    k = types.InlineKeyboardMarkup(row_width=1)
    k.add(types.InlineKeyboardButton("🔎 Cari Resi SiCepat", callback_data="sicepat"))
    return k

@bot.message_handler(commands=["start"])
def start(m):
    bot.send_message(m.chat.id,
        "📦 Halo! Selamat datang di Bot Tracking Paket.\n\nSilakan pilih ekspedisi:",
        reply_markup=menu())

@bot.callback_query_handler(func=lambda c: c.data == "sicepat")
def choose(c):
    user_courier[c.message.chat.id] = "sicepat"
    bot.answer_callback_query(c.id)
    bot.send_message(c.message.chat.id,
        "🔎 Kirim nomor resi SiCepat.\nBisa 1 sampai 50 resi sekaligus.")

def pembayaran(data):
    found = []
    def scan(x):
        if isinstance(x, dict):
            for k,v in x.items():
                name = str(k).lower()
                text = "" if v is None else str(v).strip().upper()
                if text and any(s in name for s in ("cod","payment")):
                    found.append(text)
                if isinstance(v,(dict,list)): scan(v)
        elif isinstance(x,list):
            for v in x: scan(v)
    scan(data)
    for x in found:
        if "NONCOD" in x or "NON-COD" in x or "NON COD" in x:
            return "NONCOD — SUDAH DIBAYAR"
    for x in found:
        if re.search(r"\bCOD\b", x):
            return "COD — MENUNGGU PEMBAYARAN"
    for x in found:
        if any(s in x for s in ("PAID","SUDAH DIBAYAR","LUNAS")):
            return "SUDAH DIBAYAR"
    for x in found:
        if any(s in x for s in ("UNPAID","BELUM DIBAYAR","MENUNGGU PEMBAYARAN")):
            return "MENUNGGU PEMBAYARAN"
    return "DATA PEMBAYARAN TIDAK TERSEDIA"

def riwayat(history):
    if not isinstance(history,list) or not history:
        return "Tidak tersedia"
    out=[]
    for x in history[:10]:
        if not isinstance(x,dict): continue
        out.append(f"• {x.get('updated_at','-')}\n  {x.get('note','-')}\n  Status: {x.get('status','-')}")
    return "\n".join(out) or "Tidak tersedia"

def track(resi):
    url = f"{BASE}/v1/trackings/{resi}/couriers/sicepat"
    try:
        r = requests.get(url, headers={
            "Authorization": BITESHIP_API_KEY,
            "Content-Type": "application/json"
        }, timeout=30)
        print("BITESHIP", resi, r.status_code)
        if r.status_code != 200:
            try: msg = r.json().get("message","Tracking gagal")
            except Exception: msg = "Tracking gagal"
            return f"📦 TRACKING SICEPAT\n━━━━━━━━━━━━━━━━\n\n🔢 Resi : {resi}\n❌ {msg}\nHTTP : {r.status_code}"
        d = r.json()
        if d.get("success") is False:
            return f"❌ RESI TIDAK DITEMUKAN\nResi : {resi}"
        origin = d.get("origin") or {}
        dest = d.get("destination") or {}
        hist = d.get("history") or []
        service = "Tidak tersedia"
        for h in hist:
            if isinstance(h,dict) and h.get("service_type"):
                service = str(h["service_type"]); break
        return (
            "📦 EXPEDISI SICEPAT\n└ SiCepat Express\n\n"
            "📩 Resi\n"
            f"├ Service : {service}\n└ No Resi : {d.get('waybill_id',resi)}\n\n"
            "📮 Status\n"
            f"└ Status : {d.get('status','Tidak tersedia')}\n\n"
            "🚀 Pengirim\n"
            f"├ {origin.get('contact_name','Tidak tersedia')}\n"
            f"└ {origin.get('address','Tidak tersedia')}\n\n"
            "🚩 Penerima\n"
            f"├ {dest.get('contact_name','Tidak tersedia')}\n"
            f"└ {dest.get('address','Tidak tersedia')}\n\n"
            "💰 Pembayaran\n"
            f"└ {pembayaran(d)}\n\n"
            "⏩ POD Detail\n"
            f"{riwayat(hist)}"
        )
    except requests.exceptions.Timeout:
        return f"⚠️ REQUEST TIMEOUT\nResi : {resi}"
    except Exception as e:
        print("ERROR",e)
        return f"⚠️ GAGAL MENGAMBIL DATA\nResi : {resi}"

@bot.message_handler(func=lambda m: True)
def receive(m):
    if m.chat.id not in user_courier:
        bot.send_message(m.chat.id,"⚠️ Pilih ekspedisi terlebih dahulu.",reply_markup=menu()); return
    resis=list(dict.fromkeys(re.findall(r"\b\d{10,15}\b",m.text or "")))
    if not resis:
        bot.send_message(m.chat.id,"⚠️ Nomor resi tidak ditemukan."); return
    if len(resis)>50:
        bot.send_message(m.chat.id,"⚠️ Maksimal 50 resi sekali cek."); return
    bot.send_message(m.chat.id,f"🔎 Mengecek {len(resis)} resi SiCepat...\n⏳ Mohon tunggu.")
    for resi in resis:
        bot.send_message(m.chat.id,track(resi)); time.sleep(.5)
    bot.send_message(m.chat.id,f"✅ Selesai mengecek {len(resis)} resi.",reply_markup=menu())

if __name__ == "__main__":
    print("📦 BOT TRACKING SICEPAT - BITESHIP")
    bot.infinity_polling(skip_pending=True,timeout=30,long_polling_timeout=30)
