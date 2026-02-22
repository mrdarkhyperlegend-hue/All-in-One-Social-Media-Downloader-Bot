const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const yts = require('yt-search');

async function startDownloaderBot() {
    const { state, saveCreds } = await useMultiFileAuthState('downloader_session');
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ["Downloader-Bot", "Chrome", "1.0.0"]
    });

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startDownloaderBot();
        } else if (connection === 'open') {
            console.log("Downloader Bot සක්‍රීයයි! ✅");
        }
    });

    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            const args = text.split(' ');
            const command = args[0].toLowerCase();
            const query = args.slice(1).join(' ');

            // --- 1. YouTube Song Download (.song) ---
            if (command === '.song') {
                if (!query) return conn.sendMessage(from, { text: "සින්දුවේ නම හෝ YouTube Link එකක් දෙන්න. 🎶" });
                await conn.sendMessage(from, { text: "සොයමින් පවතිී... කරුණාකර රැඳී සිටින්න. 🔎" });

                const search = await yts(query);
                const video = search.videos[0];
                
                // අපි මෙතනදී Free API එකක් පාවිච්චි කරනවා
                let downUrl = `https://api.aggelos-007.xyz/api/ytdl?url=${video.url}&type=audio`;
                
                await conn.sendMessage(from, { 
                    audio: { url: downUrl }, 
                    mimetype: 'audio/mpeg',
                    fileName: `${video.title}.mp3`
                }, { quoted: msg });
            }

            // --- 2. TikTok Download (.tt) ---
            if (command === '.tt' || command === '.tiktok') {
                if (!query.includes('tiktok.com')) return conn.sendMessage(from, { text: "කරුණාකර නිවැරදි TikTok Link එකක් ලබා දෙන්න." });
                await conn.sendMessage(from, { react: { text: '⏳', key: msg.key } });

                const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${query}`);
                const videoUrl = res.data.video.noWatermark;

                await conn.sendMessage(from, { video: { url: videoUrl }, caption: "මෙන්න ඔයාගේ TikTok වීඩියෝ එක! ✅" }, { quoted: msg });
            }

            // --- 3. FB Download (.fb) ---
            if (command === '.fb') {
                if (!query) return conn.sendMessage(from, { text: "FB වීඩියෝ ලින්ක් එක ලබා දෙන්න." });
                const res = await axios.get(`https://api.botcahx.eu.org/api/dowloader/fbdown?url=${query}&apikey=xyz`); // Free API
                await conn.sendMessage(from, { video: { url: res.data.result.url }, caption: "FB Video Downloaded! ✅" });
            }

        } catch (e) {
            console.log(e);
            // conn.sendMessage(from, { text: "Error එකක් ආවා. පසුව උත්සාහ කරන්න. ❌" });
        }
    });
}

startDownloaderBot();
