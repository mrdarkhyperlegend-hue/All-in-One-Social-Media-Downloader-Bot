const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const axios = require('axios');
const fs = require('fs');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('downloader_session');
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ["Scraper-Bot", "Chrome", "1.0.0"]
    });

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log("Downloader Bot සක්‍රීයයි! ✅");
        }
    });

    conn.ev.on('messages.upsert', async (chatUpdate) => {
        const msg = chatUpdate.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        const args = text.split(' ');
        const command = args[0].toLowerCase();
        const query = args.slice(1).join(' ');

        // --- 1. YouTube Downloader (.song) ---
        if (command === '.song') {
            if (!query) return conn.sendMessage(from, { text: "සින්දුවේ නම හෝ YouTube Link එකක් දෙන්න. 🎶" });

            try {
                const search = await yts(query);
                const video = search.videos[0];
                if (!video) return conn.sendMessage(from, { text: "සින්දුව හමු වුණේ නැත. ❌" });

                await conn.sendMessage(from, { 
                    image: { url: video.thumbnail }, 
                    caption: `*🎬 Title:* ${video.title}\n*⏳ Duration:* ${video.timestamp}\n\n*සින්දුව සකසමින් පවතී...* ⏳` 
                }, { quoted: msg });

                let requestOptions = {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Connection': 'keep-alive',
                    }
                };

                if (fs.existsSync('./cookies.json')) {
                    const cookieData = JSON.parse(fs.readFileSync('./cookies.json'));
                    requestOptions.headers.cookie = cookieData.map(c => `${c.name}=${c.value}`).join('; ');
                }

                const stream = ytdl(video.url, {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    requestOptions: requestOptions
                });

                const chunks = [];
                for await (const chunk of stream) { chunks.push(chunk); }
                const buffer = Buffer.concat(chunks);

                await conn.sendMessage(from, { 
                    audio: buffer, 
                    mimetype: 'audio/mp4', 
                    fileName: `${video.title}.mp3`,
                    ptt: false
                }, { quoted: msg });

                await conn.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } catch (err) {
                console.error("Song Error: ", err.message);
                await conn.sendMessage(from, { text: "YouTube දෝෂයකි. කරුණාකර Cookies යාවත්කාලීන කරන්න හෝ පසුව උත්සාහ කරන්න. ❌" });
            }
        }

        // --- 2. TikTok Downloader (.tiktok) ---
        if (command === '.tiktok' || command === '.tt') {
            if (!query) return conn.sendMessage(from, { text: "TikTok Link එක ලබා දෙන්න. 📲" });

            try {
                await conn.sendMessage(from, { react: { text: '⏳', key: msg.key } });

                const response = await axios.get(`https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(query)}`);
                const result = response.data.result;
                
                if (!result) return conn.sendMessage(from, { text: "වීඩියෝව හමු වුණේ නැත. ❌" });

                const finalVideoUrl = result.video_no_watermark || result.video;

                await conn.sendMessage(from, { 
                    video: { url: finalVideoUrl }, 
                    caption: `🎬 *TikTok Downloaded*\n\n*📝 Title:* ${result.title || 'No Title'}`,
                    mimetype: 'video/mp4'
                }, { quoted: msg });

                await conn.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } catch (err) {
                console.error("TikTok Error: ", err.message);
                await conn.sendMessage(from, { text: "TikTok API දෝෂයකි. පසුව උත්සාහ කරන්න. ❌" });
            }
        }
    });
}

startBot();
