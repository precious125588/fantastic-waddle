// pair.js - LATEST WHISKEY SOCKET BAILEYS - Updated for fixed button/list handling
const {
    default: makeWASocket,
    jidDecode,
    DisconnectReason,
    PHONENUMBER_MCC,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    Browsers,
    getContentType,
    proto,
    downloadContentFromMessage,
    fetchLatestBaileysVersion,
    makeInMemoryStore
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const _ = require('lodash')
const { Boom } = require('@hapi/boom')
const PhoneNumber = require('awesome-phonenumber')
const pino = require('pino')
const FileType = require('file-type')
const fs = require('fs')
const path = require('path')
const chalk = require('chalk')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const PAIRING_ROOT = path.join(__dirname, 'nexstore', 'pairing');
const LEGACY_PAIRING_FILE = path.join(PAIRING_ROOT, 'pairing.json');

function getSessionPath(nexusDevNumber) {
    return path.join(PAIRING_ROOT, nexusDevNumber);
}

function hasPairedSession(nexusDevNumber) {
    return fs.existsSync(path.join(getSessionPath(nexusDevNumber), 'creds.json'));
}

function readPairingCodeRecord(nexusDevNumber) {
    const sessionFile = path.join(getSessionPath(nexusDevNumber), 'pairing-code.json');
    try {
        if (fs.existsSync(sessionFile)) {
            const payload = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            if (payload?.code) return payload;
        }
    } catch (error) {}
    return null;
}

function writePairingCodeRecord(nexusDevNumber, code) {
    const sessionPath = getSessionPath(nexusDevNumber);
    fs.mkdirSync(sessionPath, { recursive: true });
    const payload = { number: nexusDevNumber, code, timestamp: new Date().toISOString() };
    fs.writeFileSync(path.join(sessionPath, 'pairing-code.json'), JSON.stringify(payload, null, 2), 'utf8');
    return payload;
}

function listPairedDevices(includePending = false) {
    if (!fs.existsSync(PAIRING_ROOT)) return [];
    return fs.readdirSync(PAIRING_ROOT).filter((entry) => {
        const fullPath = path.join(PAIRING_ROOT, entry);
        if (entry === 'pairing.json' || !entry.endsWith('@s.whatsapp.net')) return false;
        try {
            if (!fs.statSync(fullPath).isDirectory()) return false;
            return includePending || fs.existsSync(path.join(fullPath, 'creds.json'));
        } catch {
            return false;
        }
    });
}

const store = makeInMemoryStore ? makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) }) : null;
let msgRetryCounterCache;
const rentbotTracker = new Map();
const MAX_RETRIES_440 = 3;
const MAX_CONCURRENT_CONNECTIONS = 50;
const connectionQueue = [];
let activeConnections = 0;

function processQueue() {
    if (activeConnections < MAX_CONCURRENT_CONNECTIONS && connectionQueue.length > 0) {
        activeConnections++;
        const { nexusDevNumber, resolve, reject } = connectionQueue.shift();
        startpairing(nexusDevNumber)
            .then(result => {
                activeConnections--;
                resolve(result);
                setTimeout(processQueue, 100);
            })
            .catch(error => {
                activeConnections--;
                reject(error);
                setTimeout(processQueue, 100);
            });
    }
}

function deleteFolderRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach(file => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(folderPath);
    }
}

async function startpairing(nexusDevNumber) {
    fs.mkdirSync(PAIRING_ROOT, { recursive: true });
    
    if (!rentbotTracker.has(nexusDevNumber)) {
        rentbotTracker.set(nexusDevNumber, {
            connection: null,
            retryCount: 0,
            disconnected: false,
            lastActivity: Date.now()
        });
    }
    
    const tracker = rentbotTracker.get(nexusDevNumber);
    tracker.retryCount++;
    tracker.disconnected = false;
    tracker.lastActivity = Date.now();

    let version;
    try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
    } catch (err) {
        throw new Error('Could not reach WhatsApp servers. Check internet connection.');
    }
    
    const sessionPath = path.join(PAIRING_ROOT, nexusDevNumber);
    fs.mkdirSync(sessionPath, { recursive: true });

    let state, saveCreds;
    try {
        const authResult = await useMultiFileAuthState(sessionPath);
        state = authResult.state;
        saveCreds = authResult.saveCreds;
    } catch (err) {
        throw new Error('Failed to load session state: ' + err.message);
    }

    let nexus;
    try {
        nexus = makeWASocket({
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.ubuntu("Edge"),
            getMessage: async key => {
                if (!store) return { conversation: '' };
                const jid = key.remoteJid;
                const msg = await store.loadMessage(jid, key.id);
                return msg?.message || '';
            },
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            emitOwnEvents: true,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            markOnlineOnConnect: true,
        });
    } catch (err) {
        throw new Error('Failed to create WhatsApp connection: ' + err.message);
    }
    
    tracker.connection = nexus;
    
    if (store) store.bind(nexus.ev);

    if (!state.creds.registered) {
        let phoneNumber = nexusDevNumber.replace(/[^0-9]/g, '');
        if (!phoneNumber) throw new Error('Invalid phone number');

        tracker.pairingPromise = (async () => {
            const startedAt = Date.now();
            let lastError;
            await sleep(2500);

            while (Date.now() - startedAt < 120000) {
                try {
                    let code = await nexus.requestPairingCode(phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    if (!code) throw new Error('Empty pairing code');

                    console.log(chalk.bgGreen.black(`📱 Pairing: ${nexusDevNumber}: ${code}`));
                    writePairingCodeRecord(nexusDevNumber, code);
                    tracker.pairingCode = code;
                    return { number: nexusDevNumber, code };
                } catch (err) {
                    lastError = err;
                    console.log(chalk.yellow(`⚠️ Pair retry: ${err.message}`));
                    await sleep(3000);
                }
            }
            throw new Error('Pairing timeout');
        })();

        tracker.pairingPromise.catch(() => {});
    }

    nexus.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.log(chalk.yellow(`Connection closed: ${reason}`));
            if (reason === 405) {
                deleteFolderRecursive(sessionPath);
                tracker.disconnected = true;
            }
        } else if (connection === "open") {
            console.log(chalk.bgGreen.black(`✅ Paired: ${nexusDevNumber}`));
            tracker.retryCount = 0;
        }
    });

    nexus.ev.on('creds.update', async () => {
        try {
            if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
            await saveCreds();
        } catch (e) {
            if (e && e.code !== 'ENOENT') console.log(chalk.yellow(`Save error: ${e.message}`));
        }
    });

    return nexus;
}

async function waitForPairingResult(nexusDevNumber, timeoutMs = 120000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const tracker = rentbotTracker.get(nexusDevNumber);
        const pairingRecord = readPairingCodeRecord(nexusDevNumber);

        if (pairingRecord?.code) return pairingRecord;
        if (hasPairedSession(nexusDevNumber)) throw new Error('Already paired');
        if (!tracker) throw new Error('Session cleared');
        if (tracker.pairingCode) return { number: nexusDevNumber, code: tracker.pairingCode };

        await sleep(1000);
    }
    throw new Error('Pairing timeout');
}

module.exports = {
    startpairing,
    waitForPairingResult,
    readPairingCodeRecord,
    hasPairedSession,
    listPairedDevices
};
