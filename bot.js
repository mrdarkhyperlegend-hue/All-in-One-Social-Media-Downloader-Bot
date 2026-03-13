const yts = require('yt-search');
const fs = require('fs');
const { exec } = require('child_process');

async function handleCommands(sock, msg) {
    const from = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const args = body.trim().split(/ +/).slice(1);
    const command = body.trim().split(/ +/)[0].toLowerCase();

    if (command === '.video' || command === '.song' || command === '.tt' || command === '.fb') {
        let query = args.join(" ");
        if (!query) return sock.sendMessage(from, { text: 'කරුණාකර නමක් හෝ ලින්ක් එකක් ලබා දෙන්න.' });

        try {
            let downloadUrl = query;
            let title = "Social Media Video";

            
            if (command === '.video' || command === '.song') {
                const search = await yts(query);
                const video = search.videos[0];
                if (!video) return sock.sendMessage(from, { text: 'සොයාගත නොහැක.' });
                downloadUrl = video.url;
                title = video.title;
            }

            await sock.sendMessage(from, { text: `*${title}* බාගත වෙමින් පවතී... ⏳` });

            const isAudio = command === '.song';
            const fileName = `./temp_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`;
            
            
            const cmd = isAudio 
                ? `yt-dlp -x --audio-format mp3 --no-playlist "${downloadUrl}" -o "${fileName}"`
                : `yt-dlp -f "b[ext=mp4]" --no-playlist "${downloadUrl}" -o "${fileName}"`;

            exec(cmd, async (error, stdout, stderr) => {
                if (error) {
                    console.error(error);
                    return sock.sendMessage(from, { text: 'බාගත කිරීම අසාර්ථකයි. (YouTube "Bot Detection" හෝ Link දෝෂයකි)' });
                }

                const stats = fs.statSync(fileName);
                const sizeMB = stats.size / (1024 * 1024);

               
                if (sizeMB > 200) {
                    await sock.sendMessage(from, { 
                        document: { url: fileName }, 
                        mimetype: isAudio ? 'audio/mpeg' : 'video/mp4',
                        fileName: `${title}.${isAudio ? 'mp3' : 'mp4'}`
                    }, { quoted: msg });
                } else {
                    if (isAudio) {
                        await sock.sendMessage(from, { audio: { url: fileName }, mimetype: 'audio/mp4' }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { video: { url: fileName }, caption: title }, { quoted: msg });
                    }
                }

                if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
            });

        } catch (e) {
            console.error(e);
            sock.sendMessage(from, { text: 'දෝෂයක් මතු වුණා: ' + e.message });
        }
    }
}

module.exports = { handleCommands };
