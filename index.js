const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { handleCommands } = require('./bot');
const pino = require('pino');
const { exec } = require('child_process');
const ownerNumber = '947xxxxxxxx@s.whatsapp.net'; //fucking work  ( con to update cmd and dont fuck me ) 
// pako thoge nb ek othenda dapan itapasse update cmd ek wada change krnne nathuwa mage inbox haminenna hadnn epa besikayo 😒
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['Dl-Bot', 'Chrome', '1.0.0'],
        syncFullHistory: false, 
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Dl-Bot Ready! (Self-response enabled)');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        const isCmd = body.startsWith('.');

      
        if (msg.key.fromMe && !isCmd) return;

        // Inbox Only Check
        if (from.endsWith('@g.us')) return; 

        // Auto Update (Owner Only)
        if (body.toLowerCase() === '.update') {
            if (from !== ownerNumber && !msg.key.fromMe) return sock.sendMessage(from, { text: '❌ Owner Only!' });
            await sock.sendMessage(from, { text: '🚀 Updating...' });
            exec('git pull', (err, stdout) => {
                if (err) return sock.sendMessage(from, { text: `Error: ${err.message}` });
                sock.sendMessage(from, { text: `✅ Updated!\n${stdout}` }).then(() => process.exit());
            });
            return;
        }

        await handleCommands(sock, msg);
    });
}

connectToWhatsApp();
