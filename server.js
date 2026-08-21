const { Bot } = require("grammy");

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN belum ada di Railway");
}

const bot = new Bot(token);

bot.command("start", async (ctx) => {
  await ctx.reply("✅ BOT AKTIF");
});

bot.catch((err) => {
  console.error("BOT ERROR:", err);
});

bot.start({
  onStart: (info) => {
    console.log(`🤖 BOT AKTIF: @${info.username}`);
  }
});
