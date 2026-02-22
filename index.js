const Baileys = require("@whiskeysockets/baileys");
const { 
    default: makeWASocket, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    generateForwardMessageContent, 
    generateWAMessageFromContent 
} = Baileys;

const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const mongoose = require("mongoose");
const { useMongoDBAuthState } = require("baileys-mongodb-library");

// 1. MongoDB Connection URL
const mongoURI = process.env.MONGODB_URI || "mongodb+srv://Suneth:SK_154712@cluster0.gbihtt6.mongodb.net/?appName=Cluster0";

const makeInMemoryStore = Baileys.makeInMemoryStore || (Baileys.default && Baileys.default.makeInMemoryStore);
const store = makeInMemoryStore ? makeInMemoryStore({ logger: pino({ level: 'silent' }) }) : null;

const warnCount = {};

async function startBot() {
    // MongoDB සම්බන්ධ කිරීම
    await mongoose.connect(mongoURI);
    console.log("MongoDB සම්බන්ධ වුණා! 📦");

    const { state, saveCreds } = await useMongoDBAuthState(mongoose.connection.collection("session"));
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ["Chrome", "Windows", "10.0.0"]
    });

    if (store) store.bind(conn.ev);

    // Forwarding function (Status download කිරීමට අවශ්‍ය වේ)
    conn.copyNForward = async (jid, message, forceForward = false, options = {}) => {
        let content = await generateForwardMessageContent(message, forceForward)
        let ctype = Object.keys(content)[0]
        let context = {}
        if (Object.keys(message.message)[0] != "conversation") context = message.message[Object.keys(message.message)[0]].contextInfo
        content[ctype].contextInfo = { ...context, ...content[ctype].contextInfo }
        const waMessage = await generateWAMessageFromContent(jid, content, options ? { ...options, ...context, userJid: conn.user.id } : {})
        await conn.relayMessage(jid, waMessage.message, { messageId: waMessage.key.id })
        return waMessage
    }

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log("බොට් සාර්ථකව සම්බන්ධ විය! ✅");
        }
    });

    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message || msg.key.fromMe) return; 

            const from = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();

            // A. Auto Status Seen & Download (ඔබේ නම්බර් එකට ලැබෙනු ඇත)
            if (from === 'status@broadcast') {
                await conn.readMessages([msg.key]);
                await conn.copyNForward(conn.user.id, msg, true);
                return;
            }

            // B. Anti-Badwords (නරක වචන පාලනය)
            const badWords = ['හුත්ත', 'පයිය', 'කැරියා', 'පොන්නයා', 'වේසි', 'හුකන', 'පකය'];
            if (badWords.some(word => text.includes(word))) {
                warnCount[from] = (warnCount[from] || 0) + 1;
                if (warnCount[from] >= 3) {
                    await conn.sendMessage(from, { text: "❌ *ඔබව Block කරන ලදී!*" });
                    await conn.updateBlockStatus(from, "block");
                } else {
                    await conn.sendMessage(from, { text: `⚠️ *අවවාදයයි!* නරක වචන පාවිච්චි කිරීමෙන් වළකින්න. (${warnCount[from]}/3)` });
                }
                return;
            }

        } catch (err) {
            console.log("Error: " + err);
        }
    });
}

startBot();
