const ytdl = require('ytdl-core');
const yts = require('yt-search');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function handleCommands(sock, msg) {
    const from = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const args = body.trim().split(/ +/).slice(1);
    const command = body.trim().split(/ +/)[0].toLowerCase();

    // --- YouTube Downloader (.video / .song) ---
    if (command === '.video' || command === '.song') {
        const query = args.join(" ");
        if (!query) return sock.sendMessage(from, { text: 'නමක් හෝ YouTube Link එකක් ලබා දෙන්න.' });

        try {
            const search = await yts(query);
            const video = search.videos[0];
            if (!video) return sock.sendMessage(from, { text: 'සොයාගත නොහැක.' });

            let quality = args.includes('720p') ? '22' : '18'; // Simplified Quality
            await sock.sendMessage(from, { text: `*${video.title}* බාගත වෙමින් පවතී...` });

            const fileName = `./temp_${Date.now()}.${command === '.video' ? 'mp4' : 'mp3'}`;
            const stream = ytdl(video.url, { 
                quality: quality, 
                filter: command === '.song' ? 'audioonly' : 'videoandaudio' 
            });

            stream.pipe(fs.createWriteStream(fileName)).on('finish', async () => {
                const stats = fs.statSync(fileName);
                const sizeMB = stats.size / (1024 * 1024);

                if (sizeMB > 200) {
                    await sock.sendMessage(from, { 
                        document: { url: fileName }, 
                        mimetype: command === '.video' ? 'video/mp4' : 'audio/mpeg',
                        fileName: `${video.title}.${command === '.video' ? 'mp4' : 'mp3'}`
                    }, { quoted: msg });
                } else {
                    if (command === '.video') {
                        await sock.sendMessage(from, { video: { url: fileName }, caption: video.title }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { audio: { url: fileName }, mimetype: 'audio/mp4' }, { quoted: msg });
                    }
                }
                fs.unlinkSync(fileName);
            });
        } catch (e) {
            sock.sendMessage(from, { text: 'YouTube Error: ' + e.message });
        }
    }

    // --- TikTok Downloader (.tt) ---
    if (command === '.tt' || command === '.tiktok') {
        const url = args[0];
        if (!url) return sock.sendMessage(from, { text: 'TikTok Link එකක් ලබා දෙන්න.' });

        try {
            // Scraper using ttsave.app logic
            const response = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${url}`);
            const data = response.data;
            
            if (data.video) {
                await sock.sendMessage(from, { 
                    video: { url: data.video.noWatermark }, 
                    caption: `Downloaded: ${data.title || 'TikTok Video'}` 
                }, { quoted: msg });
            }
        } catch (e) {
            sock.sendMessage(from, { text: 'TikTok බාගත කිරීම අසාර්ථකයි. Link එක පරීක්ෂා කරන්න.' });
        }
    }

    // --- Facebook Downloader (.fb) ---
    if (command === '.fb' || command === '.facebook') {
        const url = args[0];
        if (!url) return sock.sendMessage(from, { text: 'Facebook Link එකක් ලබා දෙන්න.' });

        try {
            // Fdown.net scraping logic (No API)
            const config = {
                method: 'post',
                url: 'https://fdown.net/download.php',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: qs.stringify({ 'URLz': url })
            };

            const res = await axios(config);
            const $ = cheerio.load(res.data);
            const sdLink = $('#sdlink').attr('href');
            const hdLink = $('#hdlink').attr('href');
            const finalLink = hdLink || sdLink;

            if (finalLink) {
                await sock.sendMessage(from, { video: { url: finalLink }, caption: 'FB Video Success' }, { quoted: msg });
            } else {
                throw new Error("Link not found");
            }
        } catch (e) {
            sock.sendMessage(from, { text: 'Facebook බාගත කිරීම අසාර්ථකයි. වීඩියෝව Public එකක් දැයි බලන්න.' });
        }
    }
}

module.exports = { handleCommands };
