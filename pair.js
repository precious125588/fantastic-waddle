// @itsliaaa/baileys is ESM-only — cannot use require(). Load via dynamic import.
let makeWASocket, jidDecode, DisconnectReason, PHONENUMBER_MCC,
    makeCacheableSignalKeyStore, useMultiFileAuthState, Browsers,
    getContentType, proto, downloadContentFromMessage, fetchLatestBaileysVersion,
    makeInMemoryStore;

const _baileysReady = (async () => {
    try {
        const B = await import("@whiskeysockets/baileys");
        makeWASocket               = B.default || B.makeWASocket;
        jidDecode                  = B.jidDecode;
        DisconnectReason           = B.DisconnectReason;
        PHONENUMBER_MCC            = B.PHONENUMBER_MCC || {};
        makeCacheableSignalKeyStore = B.makeCacheableSignalKeyStore;
        useMultiFileAuthState      = B.useMultiFileAuthState;
        Browsers                   = B.Browsers;
        getContentType             = B.getContentType;
        proto                      = B.proto;
        downloadContentFromMessage = B.downloadContentFromMessage;
        fetchLatestBaileysVersion  = B.fetchLatestBaileysVersion;
        makeInMemoryStore          = B.makeInMemoryStore;
    } catch (e) {
        console.error('[pair] Failed to load @whiskeysockets/baileys:', e.message);
        throw e;
    }
})();
const NodeCache = require("node-cache");
const _ = require('lodash')
const {
    Boom
} = require('@hapi/boom')
const PhoneNumber = require('awesome-phonenumber')
let phoneNumber = "2347081827038";
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code");
const useMobile = process.argv.includes("--mobile");
const pino = require('pino')
const FileType = require('file-type')
const fs = require('fs')
const path = require('path')
let themeemoji = "😇";
const chalk = require('chalk')
const { writeExif, imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./allfunc/exif')
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch } = require('./allfunc/myfunc')

// Define sleep function directly here to avoid import issues
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const PAIRING_ROOT = path.join(__dirname, 'nexstore', 'pairing');
const LEGACY_PAIRING_FILE = path.join(PAIRING_ROOT, 'pairing.json');

function getSessionPath(nexusDevNumber) {
    return path.join(PAIRING_ROOT, nexusDevNumber);
}

function getPairingCodePath(nexusDevNumber) {
    return path.join(getSessionPath(nexusDevNumber), 'pairing-code.json');
}

function ensureSessionPath(nexusDevNumber) {
    ensureDirectoryExists(PAIRING_ROOT);
    const sessionPath = getSessionPath(nexusDevNumber);
    ensureDirectoryExists(sessionPath);
    return sessionPath;
}

// ── Session liveness ─────────────────────────────────────────────────────────
// A folder with a creds.json is NOT proof the number is still linked. When a
// user unlinks the device from their phone (or WhatsApp kills the session with
// a 401), the files stay on disk, so the old check answered "already paired"
// forever and the number could never be paired again. Everything below treats
// a session as paired only when the credentials are actually complete AND the
// session has not been logged out.

// Numbers purged in the last PURGE_GRACE_MS are never reported as paired, even
// if a late creds.update write recreates the folder behind our back.
const PURGE_GRACE_MS = 60 * 1000;
const recentlyPurged = new Map();

function markPurged(nexusDevNumber) {
    recentlyPurged.set(nexusDevNumber, Date.now());
}

function wasRecentlyPurged(nexusDevNumber) {
    const ts = recentlyPurged.get(nexusDevNumber);
    if (!ts) return false;
    if (Date.now() - ts > PURGE_GRACE_MS) {
        recentlyPurged.delete(nexusDevNumber);
        return false;
    }
    return true;
}

function readCredsFile(nexusDevNumber) {
    const credsPath = path.join(getSessionPath(nexusDevNumber), 'creds.json');
    if (!fs.existsSync(credsPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    } catch {
        return null;
    }
}

function credsAreComplete(creds) {
    return !!(creds && creds.registered === true && creds.me && creds.me.id);
}

// Returns true only for a session that is genuinely still linked.
// Invalid / logged-out leftovers are wiped so the number can pair again.
function hasPairedSession(nexusDevNumber, options = {}) {
    const { clean = true } = options;

    if (wasRecentlyPurged(nexusDevNumber)) return false;

    const credsPath = path.join(getSessionPath(nexusDevNumber), 'creds.json');
    if (!fs.existsSync(credsPath)) return false;

    const creds = readCredsFile(nexusDevNumber);
    if (!credsAreComplete(creds)) {
        if (clean) {
            console.log(chalk.yellow(`🧹 Incomplete/expired session for ${nexusDevNumber} — clearing so it can pair again.`));
            forceCleanupSession(nexusDevNumber);
        }
        return false;
    }

    const tracker = rentbotTracker.get(nexusDevNumber);
    if (tracker && (tracker.loggedOut || tracker.sessionInvalid)) {
        if (clean) {
            console.log(chalk.yellow(`🧹 ${nexusDevNumber} was logged out — clearing session.`));
            forceCleanupSession(nexusDevNumber);
        }
        return false;
    }

    return true;
}

// Is there a live websocket for this number right now?
function isSessionLive(nexusDevNumber) {
    const tracker = rentbotTracker.get(nexusDevNumber);
    if (!tracker || tracker.disconnected || tracker.loggedOut) return false;
    const ws = tracker.connection?.ws;
    return ws?.readyState === 1 || ws?.socket?.readyState === 1;
}

function getSessionState(nexusDevNumber) {
    const paired = hasPairedSession(nexusDevNumber);
    return {
        number: nexusDevNumber,
        paired,
        live: paired && isSessionLive(nexusDevNumber),
        loggedOut: !paired && fs.existsSync(getSessionPath(nexusDevNumber))
    };
}

// Explicit unlink — used by the web UI so a user can re-pair a dead number.
function unpairSession(nexusDevNumber) {
    forceCleanupSession(nexusDevNumber);
    markPurged(nexusDevNumber);
    try { fs.unlinkSync(getPairingCodePath(nexusDevNumber)); } catch {}
    try {
        if (fs.existsSync(LEGACY_PAIRING_FILE)) {
            const payload = JSON.parse(fs.readFileSync(LEGACY_PAIRING_FILE, 'utf8'));
            if (payload?.number === nexusDevNumber) fs.unlinkSync(LEGACY_PAIRING_FILE);
        }
    } catch {}
    return true;
}

// WhatsApp pairing codes expire after a couple of minutes. Serving a cached
// code from an old attempt is exactly what made users type a dead code and
// immediately get "Reason: 401", so anything older than PAIRING_CODE_TTL is
// treated as non-existent (and deleted).
const PAIRING_CODE_TTL = 2 * 60 * 1000;

function isFreshPairingRecord(payload) {
    if (!payload?.code) return false;
    const ts = Date.parse(payload.timestamp || '');
    if (!ts || Number.isNaN(ts)) return false;
    return Date.now() - ts < PAIRING_CODE_TTL;
}

function readPairingCodeRecord(nexusDevNumber) {
    const sessionFile = getPairingCodePath(nexusDevNumber);

    try {
        if (fs.existsSync(sessionFile)) {
            const payload = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            if (isFreshPairingRecord(payload)) return payload;
            try { fs.unlinkSync(sessionFile); } catch {}
        }
    } catch (error) {
        console.log(chalk.yellow(`⚠️ Failed to read session pairing code for ${nexusDevNumber}: ${error.message}`));
    }

    try {
        if (fs.existsSync(LEGACY_PAIRING_FILE)) {
            const payload = JSON.parse(fs.readFileSync(LEGACY_PAIRING_FILE, 'utf8'));
            if (payload?.number === nexusDevNumber) {
                if (isFreshPairingRecord(payload)) return payload;
                try { fs.unlinkSync(LEGACY_PAIRING_FILE); } catch {}
            }
        }
    } catch (error) {
        console.log(chalk.yellow(`⚠️ Failed to read legacy pairing file for ${nexusDevNumber}: ${error.message}`));
    }

    return null;
}

function writePairingCodeRecord(nexusDevNumber, code) {
    const payload = {
        number: nexusDevNumber,
        code,
        timestamp: new Date().toISOString()
    };

    ensureSessionPath(nexusDevNumber);
    fs.writeFileSync(getPairingCodePath(nexusDevNumber), JSON.stringify(payload, null, 2), 'utf8');
    ensureDirectoryExists(PAIRING_ROOT);
    fs.writeFileSync(LEGACY_PAIRING_FILE, JSON.stringify(payload, null, 2), 'utf8');

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

// Fix for makeInMemoryStore
const store = makeInMemoryStore ? makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) }) : null;
let msgRetryCounterCache;

// Newsletter channels to auto-follow
// Newsletter auto-follow DISABLED — new user connect must not affect existing users
const NEWSLETTER_CHANNELS = [];

// Group auto-join DISABLED — new user connect must not affect existing users  
const GROUP_INVITE_CODES = [];

// ============ ANTI-SPAM & ANTI-ABUSE SYSTEM ==========
// Anti-spam storage
const spamStorage = new Map();
const antilinkGroups = new Map();
const antistickerGroups = new Map();
const antigroupmentionGroups = new Map();
const antitagallGroups = new Map();
const antidemoteGroups = new Map();
const antispamGroups = new Map();
const antipromoteGroups = new Map();
const antikickallGroups = new Map();
const antideleteGroups = new Map();
const messageCache = new Map();
const kickTracker = new Map();
const commandCooldown = new Map();

// Anti-spam settings
const SPAM_CONFIG = {
    MAX_MESSAGES: 5,
    TIME_WINDOW: 5000,
    WARN_LIMIT: 3,
    MUTE_DURATION: 60000,
    BAN_DURATION: 3600000
};

// ============ HELPER FUNCTIONS ==========

function isSpam(sender, chat) {
    const key = `${chat}_${sender}`;
    const now = Date.now();
    
    if (!spamStorage.has(key)) {
        spamStorage.set(key, {
            messages: [now],
            warnings: 0,
            muted: false,
            mutedUntil: 0,
            banned: false,
            bannedUntil: 0
        });
        return false;
    }
    
    const data = spamStorage.get(key);
    
    if (data.banned && now < data.bannedUntil) {
        return { isSpam: true, action: 'banned', timeLeft: data.bannedUntil - now };
    }
    
    if (data.muted && now < data.mutedUntil) {
        return { isSpam: true, action: 'muted', timeLeft: data.mutedUntil - now };
    }
    
    data.messages = data.messages.filter(t => now - t < SPAM_CONFIG.TIME_WINDOW);
    data.messages.push(now);
    
    if (data.messages.length > SPAM_CONFIG.MAX_MESSAGES) {
        data.warnings++;
        
        if (data.warnings >= SPAM_CONFIG.WARN_LIMIT) {
            data.muted = true;
            data.mutedUntil = now + SPAM_CONFIG.MUTE_DURATION;
            data.warnings = 0;
            data.messages = [];
            return { isSpam: true, action: 'muted', duration: SPAM_CONFIG.MUTE_DURATION };
        }
        
        data.messages = [];
        return { isSpam: true, action: 'warn', warningCount: data.warnings };
    }
    
    return false;
}

function containsLink(text, chat) {
    if (!text) return false;
    
    const linkRegex = /(https?:\/\/[^\s]+)/gi;
    const whatsappRegex = /(chat\.whatsapp\.com|whatsapp\.com\/channel)/i;
    const telegramRegex = /(t\.me|telegram\.me|telegram\.dog)/i;
    
    const links = text.match(linkRegex);
    if (!links) return false;
    
    const mode = antilinkGroups.get(chat);
    
    if (mode === 'all') return links.length > 0;
    if (mode === 'whatsapp') return links.some(link => whatsappRegex.test(link));
    if (mode === 'telegram') return links.some(link => telegramRegex.test(link));
    
    return false;
}

function containsGroupMention(text) {
    if (!text) return false;
    const groupMentionRegex = /(https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+)/gi;
    return groupMentionRegex.test(text);
}

function countMentions(text) {
    if (!text) return 0;
    const mentionRegex = /@(\d{5,15}|all|everyone)/gi;
    const matches = text.match(mentionRegex) || [];
    return matches.length;
}

// Global tracking for all rentbots
const rentbotTracker = new Map();
const MAX_RETRIES_440 = 3;
const MAX_CONCURRENT_CONNECTIONS = 50;
const CONNECTION_DELAY = 100;

// Connection queue system
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
                setTimeout(processQueue, CONNECTION_DELAY);
            })
            .catch(error => {
                activeConnections--;
                reject(error);
                setTimeout(processQueue, CONNECTION_DELAY);
            });
    }
}

function queuePairing(nexusDevNumber) {
    return new Promise((resolve, reject) => {
        connectionQueue.push({ nexusDevNumber, resolve, reject });
        processQueue();
    });
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

async function validateSession(nexusDevNumber) {
    const sessionPath = getSessionPath(nexusDevNumber);
    const credsPath = path.join(sessionPath, 'creds.json');
    
    if (!fs.existsSync(credsPath)) {
        console.log(chalk.yellow(`⚠️ No creds.json for ${nexusDevNumber}`));
        return false;
    }
    
    try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        if (!creds.me || !creds.me.id) {
            console.log(chalk.yellow(`⚠️ Invalid session for ${nexusDevNumber}, cleaning up...`));
            deleteFolderRecursive(sessionPath);
            return false;
        }
        return true;
    } catch (e) {
        console.log(chalk.red(`❌ Corrupt session for ${nexusDevNumber}: ${e.message}`));
        deleteFolderRecursive(sessionPath);
        return false;
    }
}

function forceCleanupSession(nexusDevNumber) {
    const sessionPath = getSessionPath(nexusDevNumber);

    // 1) Tear down the socket + ALL listeners FIRST so no further
    //    creds.update / keys.set events can fire writeFile() into the
    //    folder we are about to delete. This is the fix for:
    //    "ENOENT: no such file or directory, open '.../creds.json'"
    //    Unhandled Promise Rejection that was killing the pair-bot
    //    master process and taking every linked user down with it.
    if (rentbotTracker.has(nexusDevNumber)) {
        const tracker = rentbotTracker.get(nexusDevNumber);
        const conn = tracker.connection;
        if (conn) {
            try { conn.ev?.removeAllListeners?.('creds.update'); } catch {}
            try { conn.ev?.removeAllListeners?.('connection.update'); } catch {}
            try { conn.ev?.removeAllListeners?.('messaging-history.set'); } catch {}
            try { conn.ev?.removeAllListeners?.(); } catch {}
            try { conn.end?.(new Error('forceCleanupSession')); } catch {}
            try { conn.ws?.close?.(); } catch {}
        }
        tracker.connection = null;
        tracker.disconnected = true;
        rentbotTracker.delete(nexusDevNumber);
    }


    // Remember the purge: a straggler creds.update write can recreate the
    // folder a moment later, and that leftover is what used to make the web
    // page insist "this number is already paired" forever.
    markPurged(nexusDevNumber);

    // 2) Delete now, then sweep again a few times so any in-flight writeFile
    //    that lands after the first delete does not resurrect the session.
    const wipe = (label) => {
        try {
            if (fs.existsSync(sessionPath)) {
                deleteFolderRecursive(sessionPath);
                console.log(chalk.red(`🗑️ Force cleaned${label}: ${nexusDevNumber}`));
            }
        } catch (e) {
            // ENOENT here is fine — already gone.
            if (e && e.code !== 'ENOENT') {
                console.log(chalk.red(`❌ Error force cleaning ${nexusDevNumber}: ${e.message}`));
            }
        }
    };

    wipe('');
    setTimeout(() => wipe(' (sweep 1)'), 250);
    setTimeout(() => wipe(' (sweep 2)'), 1500);
    setTimeout(() => wipe(' (sweep 3)'), 5000);

    return true;
}

function cleanupExpiredSessions() {
    const sessionDir = PAIRING_ROOT;
    if (!fs.existsSync(sessionDir)) return;
    
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    fs.readdirSync(sessionDir).forEach(folder => {
        if (folder === 'pairing.json') return;
        
        const folderPath = path.join(sessionDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            const credsPath = path.join(folderPath, 'creds.json');
            const tracker = rentbotTracker.get(folder);
            if (tracker && tracker.disconnected) {
                console.log(chalk.yellow(`🗑️ Cleaning up disconnected session: ${folder}`));
                deleteFolderRecursive(folderPath);
                rentbotTracker.delete(folder);
                return;
            }

            // Keep valid paired sessions permanently. Only clear stale/incomplete
            // pairing folders that never produced creds.json.
            if (fs.existsSync(credsPath)) {
                return;
            }
            
            try {
                const stats = fs.statSync(folderPath);
                if (stats.mtimeMs < oneDayAgo) {
                    console.log(chalk.yellow(`🗑️ Cleaning up stale incomplete pairing: ${folder}`));
                    deleteFolderRecursive(folderPath);
                    rentbotTracker.delete(folder);
                }
            } catch (e) {
                console.log(chalk.red(`❌ Error checking session age: ${e.message}`));
            }
        }
    });
}

setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(chalk.blue(`📁 Created directory: ${dirPath}`));
    }
}

// ── FAST / CACHED WHATSAPP VERSION ───────────────────────────────────
// fetchLatestBaileysVersion() hits the network with no timeout. On a weak
// connection it could hang 60s+ before a pairing code was even requested
// (this is why the site "counted for 60 seconds"). We now cache the result
// for 6 hours, cap the lookup at 6 seconds, and fall back to a known-good
// version instead of failing the whole pairing.
const FALLBACK_WA_VERSION = [2, 3000, 1023223821];
let _waVersionCache = { version: null, at: 0 };
const WA_VERSION_TTL = 6 * 60 * 60 * 1000;

async function getWAVersion() {
    if (_waVersionCache.version && Date.now() - _waVersionCache.at < WA_VERSION_TTL) {
        return _waVersionCache.version;
    }
    try {
        const result = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('version lookup timeout')), 6000))
        ]);
        if (result?.version) {
            _waVersionCache = { version: result.version, at: Date.now() };
            return result.version;
        }
    } catch (err) {
        console.log(chalk.yellow(`⚠️ WA version lookup failed (${err.message}) — using cached/fallback version`));
    }
    return _waVersionCache.version || FALLBACK_WA_VERSION;
}

// Resolves as soon as the underlying websocket is actually open, so we never
// request a pairing code against a socket that is not ready (a common source
// of instant 401 / stale codes).
function waitForSocketOpen(sock, timeoutMs = 20000) {
    return new Promise((resolve) => {
        const done = (ok) => { clearTimeout(timer); try { sock.ev.off('connection.update', onUpd); } catch {} resolve(ok); };
        const timer = setTimeout(() => done(false), timeoutMs);
        const ready = () => sock?.ws?.readyState === 1 || sock?.ws?.socket?.readyState === 1;
        if (ready()) return done(true);
        const onUpd = () => { if (ready()) done(true); };
        try { sock.ev.on('connection.update', onUpd); } catch {}
        const poll = setInterval(() => { if (ready()) { clearInterval(poll); done(true); } }, 250);
        setTimeout(() => clearInterval(poll), timeoutMs);
    });
}

async function startpairing(nexusDevNumber) {
    await _baileysReady; // ensure ESM baileys is loaded before use
    ensureDirectoryExists(PAIRING_ROOT);
    
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
    tracker.pairingCode = null;
    tracker.pairingError = null;
    tracker.pairingPromise = null;
    tracker.loggedOut = false;
    tracker.sessionInvalid = false;
    // A fresh pairing attempt clears the purge tombstone, otherwise the freshly
    // created session would still be reported as "not paired".
    recentlyPurged.delete(nexusDevNumber);

    const version = await getWAVersion();
    
    const sessionPath = ensureSessionPath(nexusDevNumber);

    let state, saveCreds;
    try {
        const authResult = await useMultiFileAuthState(sessionPath);
        state = authResult.state;
        saveCreds = authResult.saveCreds;
    } catch (err) {
        tracker.pairingError = 'Failed to load session state: ' + err.message;
        throw new Error(tracker.pairingError);
    }

    let nexus;
    try {
        nexus = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        version,
        browser: Browsers.macOS("Safari"), // pairing-code registration is most reliable on the macOS/Safari signature
        getMessage: async key => {
            if (!store) return { conversation: '' };
            const jid = key.remoteJid;
            const msg = await store.loadMessage(jid, key.id);
            return msg?.message || '';
        },
        shouldSyncHistoryMessage: msg => {
            console.log(`\x1b[32mLoading Chat [${msg.progress}%]\x1b[39m`);
            return !!msg.syncType;
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
        tracker.pairingError = 'Failed to create WhatsApp connection: ' + err.message;
        throw new Error(tracker.pairingError);
    }
    
    tracker.connection = nexus;
    
    if (store) store.bind(nexus.ev);

    if (pairingCode && !state.creds.registered) {
        if (useMobile) {
            throw new Error('Cannot use pairing code with mobile API');
        }

        let phoneNumber = nexusDevNumber.replace(/[^0-9]/g, '');
        
        if (!phoneNumber) {
            throw new Error('Invalid phone number');
        }

        tracker.pairingPromise = (async () => {
            let lastError;

            // Wait for the websocket to actually be open instead of a blind
            // sleep. On a weak network the old 2.5s sleep fired too early and
            // every request failed, burning the 120s window.
            const opened = await waitForSocketOpen(nexus, 25000);
            if (!opened) {
                tracker.pairingError = 'Could not reach WhatsApp servers. Please retry.';
                throw new Error(tracker.pairingError);
            }
            await sleep(1200);

            // Only a couple of attempts: asking WhatsApp for a new pairing code
            // over and over on the same socket invalidates the previous codes
            // and is what triggered the instant "Reason: 401" disconnects.
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    let code = await nexus.requestPairingCode(phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;

                    if (!code) {
                        throw new Error('Empty pairing code received from WhatsApp');
                    }

                    console.log(chalk.bgGreen.black(`📱 Pairing code for ${nexusDevNumber}: ${chalk.white.bold(code)}`));

                    ensureSessionPath(nexusDevNumber);
                    writePairingCodeRecord(nexusDevNumber, code);

                    tracker.pairingCode = code;
                    tracker.pairingError = null;
                    console.log(chalk.green(`✓ Pairing code saved to pairing.json`));
                    return { number: nexusDevNumber, code };
                } catch (err) {
                    lastError = err;
                    tracker.pairingError = null;
                    console.log(chalk.yellow(`⚠️ Pair request attempt ${attempt}/3 for ${nexusDevNumber}: ${err.message}`));
                    if (attempt < 3) await sleep(4000);
                }
            }

            tracker.pairingError = lastError?.message || 'Could not get a pairing code. Please try again.';
            throw new Error(tracker.pairingError);
        })();

        tracker.pairingPromise.catch(() => {});
    }

    nexus.newsletterMsg = async (key, content = {}, timeout = 5000) => {
        const { type: rawType = 'INFO', name, description = '', picture = null, react, id, newsletter_id = key, ...media } = content;
        const type = rawType.toUpperCase();
        if (react) {
            if (!(newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id))) throw [{ message: 'Use Id Newsletter', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            if (!id) throw [{ message: 'Use Id Newsletter Message', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            const hasil = await nexus.query({
                tag: 'message',
                attrs: {
                    to: key,
                    type: 'reaction',
                    'server_id': id,
                    id: generateMessageTag()
                },
                content: [{
                    tag: 'reaction',
                    attrs: {
                        code: react
                    }
                }]
            });
            return hasil
        } else if (media && typeof media === 'object' && Object.keys(media).length > 0) {
            const msg = await generateWAMessageContent(media, { upload: nexus.waUploadToServer });
            const anu = await nexus.query({
                tag: 'message',
                attrs: { to: newsletter_id, type: 'text' in media ? 'text' : 'media' },
                content: [{
                    tag: 'plaintext',
                    attrs: /image|video|audio|sticker|poll/.test(Object.keys(media).join('|')) ? { mediatype: Object.keys(media).find(key => ['image', 'video', 'audio', 'sticker','poll'].includes(key)) || null } : {},
                    content: proto.Message.encode(msg).finish()
                }]
            })
            return anu
        } else {
            if ((/(FOLLOW|UNFOLLOW|DELETE)/.test(type)) && !(newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id))) return [{ message: 'Use Id Newsletter', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            const _query = await nexus.query({
                tag: 'iq',
                attrs: {
                    to: 's.whatsapp.net',
                    type: 'get',
                    xmlns: 'w:mex'
                },
                content: [{
                    tag: 'query',
                    attrs: {
                        query_id: type == 'FOLLOW' ? '9926858900719341' : type == 'UNFOLLOW' ? '7238632346214362' : type == 'CREATE' ? '6234210096708695' : type == 'DELETE' ? '8316537688363079' : '6563316087068696'
                    },
                    content: new TextEncoder().encode(JSON.stringify({
                        variables: /(FOLLOW|UNFOLLOW|DELETE)/.test(type) ? { newsletter_id } : type == 'CREATE' ? { newsletter_input: { name, description, picture }} : { fetch_creation_time: true, fetch_full_image: true, fetch_viewer_metadata: false, input: { key, type: (newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id)) ? 'JID' : 'INVITE' }}
                    }))
                }]
            }, timeout);
            const res = JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_join_v2 || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_leave_v2 || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_create || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_delete_v2 || JSON.parse(_query.content[0].content)?.errors || JSON.parse(_query.content[0].content)
            res.thread_metadata ? (res.thread_metadata.host = 'https://mmg.whatsapp.net') : null
            return res
        }
    }

    nexus.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && `${decode.user}@${decode.server}` || jid;
        } else {
            return jid;
        }
    };
    
    // ============ ENHANCED MESSAGES.UPSERT WITH ANTI-ABUSE ==========
    nexus.ev.on('messages.upsert', async chatUpdate => {
        try {
            // ── DEPLOYMENT SELECTOR: intercept bot-selection responses ────────
            // The Deployment Manager keys pending selections by digits-only
            // phone number, so a full "234...@s.whatsapp.net" JID matches the
            // bare number pair.js tracks. (Previously these never matched, so
            // every deploy timed out and silently fell back to MIAS MDX.)
            try {
                const _dm      = require('./deploy/deploymentManager');
                const _rawMsg  = chatUpdate?.messages?.[0];
                const _jid     = _rawMsg?.key?.remoteJid;
                const _msgBody = _rawMsg?.message;
                // Only 1:1 chats can answer the menu — ignore groups/status/newsletters.
                const _isDirect = typeof _jid === 'string' && _jid.endsWith('@s.whatsapp.net');
                if (_isDirect && _msgBody && !_rawMsg?.key?.fromMe
                    && _dm.handleIncomingMessage(_jid, _msgBody)) return;
            } catch (e) {
                console.log(chalk.yellow(`⚠️ Selector intercept error: ${e.message}`));
            }
            // ─────────────────────────────────────────────────────────────────
            const nexusboijid = chatUpdate.messages[0];
            if (!nexusboijid.message || !Object.keys(nexusboijid.message).length) return;
            
            nexusboijid.message = (Object.keys(nexusboijid.message)[0] === 'ephemeralMessage') 
                ? nexusboijid.message.ephemeralMessage.message 
                : nexusboijid.message;
            
            let botNumber = await nexus.decodeJid(nexus.user.id);
            let antiswview = global.db?.data?.settings?.[botNumber]?.antiswview || false;
            
            if (antiswview) {
                if (nexusboijid.key && nexusboijid.key.remoteJid === 'status@broadcast'){  
                    await nexus.readMessages([nexusboijid.key]);
                }
            }

            if (!nexus.public && !nexusboijid.key.fromMe && chatUpdate.type === 'notify') return;
            if (nexusboijid.key.id.startsWith('BAE5') && nexusboijid.key.id.length === 16) return;
            
            // Use local vars (not implicit globals) to avoid cross-session pollution
            const nexusboiConnect = nexus;
            const mek = smsg(nexusboiConnect, nexusboijid, store);
            
            // ============ ANTI-SPAM & ANTI-ABUSE CHECKS ==========
            const isGroup = mek.isGroup;
            const sender = mek.sender;
            const isCreator = false; // Set based on your owner list
            const isSudo = false; // Set based on your sudo list
            const isAdmins = false; // Set based on group admins
            
            // Anti-Spam check
            if (isGroup && antispamGroups.get(mek.chat) && !isCreator && !isSudo && !isAdmins) {
                const spamCheck = isSpam(sender, mek.chat);
                if (spamCheck) {
                    if (spamCheck.action === 'banned') {
                        const secondsLeft = Math.ceil(spamCheck.timeLeft / 1000);
                        await nexus.sendMessage(mek.chat, { 
                            text: `🚫 @${sender.split('@')[0]} you are BANNED for ${Math.floor(secondsLeft / 60)} minute(s) due to spam!`,
                            mentions: [sender]
                        });
                        await nexus.sendMessage(mek.chat, { delete: mek.key });
                        return;
                    } else if (spamCheck.action === 'muted') {
                        const secondsLeft = Math.ceil(spamCheck.timeLeft / 1000);
                        await nexus.sendMessage(mek.chat, { 
                            text: `🔇 @${sender.split('@')[0]} you are MUTED for ${secondsLeft} second(s) due to spam!`,
                            mentions: [sender]
                        });
                        await nexus.sendMessage(mek.chat, { delete: mek.key });
                        return;
                    } else if (spamCheck.action === 'warn') {
                        await nexus.sendMessage(mek.chat, { 
                            text: `⚠️ @${sender.split('@')[0]} WARNING ${spamCheck.warningCount}/${SPAM_CONFIG.WARN_LIMIT}! Slow down!`,
                            mentions: [sender]
                        });
                        await nexus.sendMessage(mek.chat, { delete: mek.key });
                        return;
                    }
                }
            }
            
            // Anti-Link check
            if (isGroup && antilinkGroups.get(mek.chat) && !isCreator && !isSudo && !isAdmins && containsLink(mek.text, mek.chat)) {
                await nexus.sendMessage(mek.chat, { delete: mek.key });
                await nexus.sendMessage(mek.chat, { 
                    text: `🔗 @${sender.split('@')[0]} Links are NOT allowed in this group!`,
                    mentions: [sender]
                });
                return;
            }
            
            // Anti-Sticker check
            if (isGroup && antistickerGroups.get(mek.chat) && !isCreator && !isSudo && !isAdmins && mek.mtype === 'stickerMessage') {
                await nexus.sendMessage(mek.chat, { delete: mek.key });
                await nexus.sendMessage(mek.chat, { 
                    text: `🖼️ @${sender.split('@')[0]} Stickers are NOT allowed in this group!`,
                    mentions: [sender]
                });
                return;
            }
            
            // Anti-Group Mention check
            if (isGroup && antigroupmentionGroups.get(mek.chat) && !isCreator && !isSudo && !isAdmins && containsGroupMention(mek.text)) {
                await nexus.sendMessage(mek.chat, { delete: mek.key });
                await nexus.sendMessage(mek.chat, { 
                    text: `👥 @${sender.split('@')[0]} Group mentions/link sharing are NOT allowed!`,
                    mentions: [sender]
                });
                return;
            }
            
            // Anti-TagAll check
            if (isGroup && antitagallGroups.get(mek.chat) && !isCreator && !isSudo && !isAdmins) {
                const mentionCount = countMentions(mek.text);
                const threshold = antitagallGroups.get(`${mek.chat}_threshold`) || 10;
                
                if (mentionCount > threshold) {
                    await nexus.sendMessage(mek.chat, { delete: mek.key });
                    await nexus.sendMessage(mek.chat, { 
                        text: `🏷️ @${sender.split('@')[0]} Tagging ${mentionCount} people (limit: ${threshold}) is NOT allowed!`,
                        mentions: [sender]
                    });
                    return;
                }
            }
            
            // Cache message for anti-delete
            if (!mek.key.fromMe) {
                messageCache.set(mek.key.id, {
                    sender: mek.key.participant || mek.key.remoteJid,
                    text: mek.text || 'Media message',
                    timestamp: Date.now()
                });
                
                setTimeout(() => {
                    messageCache.delete(mek.key.id);
                }, 300000);
            }
            
            // Filter system/protocol messages that must NOT trigger commands
            const _msgType = Object.keys(nexusboijid.message || {})[0] || '';
            const _SKIP_TYPES = ['protocolMessage','senderKeyDistributionMessage',
              'messageContextInfo','reactionMessage','pollUpdateMessage',
              'callLogMessagesNotification','appStateSyncKeyShare','notificationSource'];
            if (_SKIP_TYPES.includes(_msgType)) return;
            // Skip status@broadcast so it never triggers spam replies
            if (nexusboijid.key?.remoteJid === 'status@broadcast') return;
            // Skip group-notify events (not real user messages)
            if (nexusboijid.key?.id?.startsWith?.('3EB0') && !nexusboijid.key?.participant) return;

            require("./case")(nexusboiConnect, mek, chatUpdate, store);
            
        } catch (err) {
            console.log(err);
        }
    });

    // ============ ANTI-DELETE MESSAGE TRACKING ==========
    nexus.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
            if (update.update && update.update.messageStubType === 77) {
                const chatId = update.key.remoteJid;
                
                if (antideleteGroups.get(chatId) && messageCache.has(update.key.id)) {
                    const cachedMsg = messageCache.get(update.key.id);
                    const deleteMsg = `🗑️ *Message Deleted*\n\nFrom: @${cachedMsg.sender.split('@')[0]}\nOriginal: ${cachedMsg.text || 'Media message'}\n\n⚠️ Anti-Delete Active!`;
                    
                    await nexus.sendMessage(chatId, {
                        text: deleteMsg,
                        mentions: [cachedMsg.sender]
                    });
                    
                    messageCache.delete(update.key.id);
                }
            }
        }
    });

    // ============ ANTI-KICKALL & ANTI-DEMOTE PROTECTION ==========
    nexus.ev.on('group-participants.update', async (update) => {
        const { id, participants, action, actor } = update;
        const botNumber = nexus.decodeJid(nexus.user.id);
        
        // Anti-Demote check
        if (action === 'demote' && antidemoteGroups.get(id)) {
            for (const participant of participants) {
                if (participant === botNumber) {
                    // Re-promote the bot
                    await nexus.groupParticipantsUpdate(id, [participant], 'promote');
                    // Demote the person who tried to demote the bot
                    if (actor && actor !== botNumber) {
                        try {
                            await nexus.groupParticipantsUpdate(id, [actor], 'demote');
                        } catch (_) {}
                    }
                    const actorTag = actor ? `@${actor.split('@')[0]}` : 'Someone';
                    await nexus.sendMessage(id, { 
                        text: `🛡️ *Anti-Demote Active!*\n\n${actorTag} tried to demote me — I've been re-promoted and they have been demoted as punishment! ⚡`, 
                        mentions: [participant, actor].filter(Boolean)
                    });
                }
            }
        }
        
        // Anti-KickAll detection
        if (action === 'remove' && antikickallGroups.get(id)) {
            const now = Date.now();
            const key = `${id}_kicks`;
            
            if (!kickTracker.has(key)) {
                kickTracker.set(key, []);
            }
            
            const kicks = kickTracker.get(key);
            kicks.push({ time: now, count: participants.length });
            
            const recentKicks = kicks.filter(k => now - k.time < 10000);
            const totalRecentKicks = recentKicks.reduce((sum, k) => sum + k.count, 0);
            
            if (totalRecentKicks > 5) {
                await nexus.sendMessage(id, {
                    text: `⚠️ *Mass Kick Detected!*\n\n${totalRecentKicks} members were kicked in a short time.\nAnti-KickAll is active.`
                });
                
                kickTracker.set(key, []);
            }
            
            kickTracker.set(key, recentKicks);
            
            setTimeout(() => {
                const current = kickTracker.get(key) || [];
                kickTracker.set(key, current.filter(k => Date.now() - k.time < 30000));
            }, 30000);
        }
    });

    nexus.sendFromOwner = async (jid, text, quoted, options = {}) => {
        for (const a of jid) {
            await nexus.sendMessage(a + '@s.whatsapp.net', { text, ...options }, { quoted });
        }
    }

    nexus.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifImg(buff, options)
        } else {
            buffer = await imageToWebp(buff)
        }
        await nexus.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        .then( response => {
            fs.unlinkSync(buffer)
            return response
        })
    }

    nexus.public = true

    nexus.sendText = (jid, text, quoted = '', options) => nexus.sendMessage(jid, { text: text, ...options }, { quoted })

    nexus.getFile = async (PATH, save) => {
        let res
        let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await getBuffer(PATH)) : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
        let type = await FileType.fromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: '.bin'
        }
        filename = path.join(__filename, '../src/' + new Date * 1 + '.' + type.ext)
        if (data && save) fs.promises.writeFile(filename, data)
        return {
            res,
            filename,
            size: await getSizeMedia(data),
            ...type,
            data
        }
    }
    
    nexus.ments = (teks = "") => {
        return teks.match("@")
        ? [...teks.matchAll(/@([0-9]{5,16}|0)/g)].map(
            (v) => v[1] + "@s.whatsapp.net"
            )
        : [];
    };
    
    nexus.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await nexus.getFile(path, true);
        let { res, data: file, filename: pathFile } = type;

        if (res && res.status !== 200 || file.length <= 65536) {
            try {
                throw {
                    json: JSON.parse(file.toString())
                };
            } catch (e) {
                if (e.json) throw e.json;
            }
        }

        let opt = {
            filename
        };

        if (quoted) opt.quoted = quoted;
        if (!type) options.asDocument = true;

        let mtype = '',
            mimetype = type.mime,
            convert;

        if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) mtype = 'sticker';
        else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) mtype = 'image';
        else if (/video/.test(type.mime)) mtype = 'video';
        else if (/audio/.test(type.mime)) {
            convert = await (ptt ? toPTT : toAudio)(file, type.ext);
            file = convert.data;
            pathFile = convert.filename;
            mtype = 'audio';
            mimetype = 'audio/ogg; codecs=opus';
        } else mtype = 'document';

        if (options.asDocument) mtype = 'document';

        delete options.asSticker;
        delete options.asLocation;
        delete options.asVideo;
        delete options.asDocument;
        delete options.asImage;

        let message = { ...options, caption, ptt, [mtype]: { url: pathFile }, mimetype };
        let m;

        try {
            m = await nexus.sendMessage(jid, message, { ...opt, ...options });
        } catch (e) {
            m = null;
        } finally {
            if (!m) m = await nexus.sendMessage(jid, { ...message, [mtype]: file }, { ...opt, ...options });
            file = null;
            return m;
        }
    }

    nexus.sendTextWithMentions = async (jid, text, quoted, options = {}) => nexus.sendMessage(jid, { text: text, mentions: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net'), ...options }, { quoted })

    nexus.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
        let quoted = message.msg ? message.msg : message
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(quoted, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        let type = await FileType.fromBuffer(buffer)
        let trueFileName = attachExtension ? ('./sticker/' + filename + '.' + type.ext) : './sticker/' + filename
        await fs.writeFileSync(trueFileName, buffer)
        return trueFileName
    }

    nexus.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(message, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
    }

    // Enhanced connection.update handler
    nexus.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        const tracker = rentbotTracker.get(nexusDevNumber);

        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            const pairingStillPending = !state.creds.registered && !tracker?.pairingCode;

            if (tracker?.handoffToMais) {
                console.log(chalk.gray(`🤝 Pairing socket closed after MAIS handoff for ${nexusDevNumber}; keeping session.`));
                tracker.connection = null;
                tracker.handoffToMais = false;
                return;
            }

            console.log(chalk.yellow(`🔌 Connection closed for ${nexusDevNumber}, reason: ${reason}`));

            // Don't spam the "USER DISCONNECTED" card while the user is still
            // trying to pair — those closes are part of the normal handshake
            // (401/515) and the bot retries by itself.
            if (!pairingStillPending) {
                await sendUserDisconnected(nexusDevNumber, `Reason: ${reason}`);
            }

            // ── 401 DURING PAIRING ───────────────────────────────────────
            // A 401 before the device is registered is NOT a real logout: the
            // pairing attempt was rejected (stale code / half-written session).
            // Wipe the half session and start a clean pairing instead of
            // dead-ending the user.
            if (reason === 401 && pairingStillPending) {
                tracker.pairRestarts = (tracker.pairRestarts || 0) + 1;
                if (tracker.pairRestarts <= 2) {
                    console.log(chalk.yellow(`🔁 401 while pairing ${nexusDevNumber} — restarting with a fresh session (${tracker.pairRestarts}/2)`));
                    const restarts = tracker.pairRestarts;
                    forceCleanupSession(nexusDevNumber);
                    await sleep(2500);
                    queuePairing(nexusDevNumber).catch(() => {});
                    const t2 = rentbotTracker.get(nexusDevNumber);
                    if (t2) t2.pairRestarts = restarts;
                    return;
                }
                console.log(chalk.red(`❌ Pairing rejected repeatedly for ${nexusDevNumber}`));
                forceCleanupSession(nexusDevNumber);
                return;
            }

            // 515: WhatsApp always asks for a restart right after a successful
            // pairing — reconnect, never wipe the session.
            if (reason === 515) {
                console.log(chalk.blue(`🔄 Restart required (515) for ${nexusDevNumber}`));
                tracker.connection = null;
                await sleep(2000);
                queuePairing(nexusDevNumber).catch(() => {});
                return;
            }

            if (reason === 405) {
                console.log(chalk.red.bold(`❌ Error 405 for ${nexusDevNumber}: Session logged out or invalid`));
                tracker.sessionInvalid = true;
                console.log(chalk.yellow(`🗑️ Force cleaning session for ${nexusDevNumber}...`));
                
                forceCleanupSession(nexusDevNumber);
                
                tracker.disconnected = true;
                tracker.connection = null;
                if (pairingStillPending) tracker.pairingError = 'Pairing session became invalid. Please try again.';
                
                console.log(chalk.red(`🚫 ${nexusDevNumber} will NOT reconnect. User must re-pair.`));
                return;
            } else if (reason === 440) {
                if (tracker.retryCount < MAX_RETRIES_440) {
                    console.warn(chalk.yellow(`⚠️ Error 440 for ${nexusDevNumber}. Retry ${tracker.retryCount}/${MAX_RETRIES_440}...`));
                    await sleep(3000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.error(chalk.red.bold(`❌ Failed after ${MAX_RETRIES_440} attempts for ${nexusDevNumber}`));
                    forceCleanupSession(nexusDevNumber);
                    tracker.disconnected = true;
                    if (pairingStillPending) tracker.pairingError = 'Pairing request failed after multiple retries. Please try again.';
                }
            } else if (reason === DisconnectReason.badSession) {
                console.log(chalk.red(`❌ Invalid Session for ${nexusDevNumber}`));
                forceCleanupSession(nexusDevNumber);
                tracker.disconnected = true;
                if (pairingStillPending) tracker.pairingError = 'Invalid pairing session. Please try again.';
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.bgRed(`❌ ${nexusDevNumber} logged out`));
                // Real logout (device unlinked from the phone): mark it so the
                // web UI stops claiming the number is still paired.
                tracker.loggedOut = true;
                markPurged(nexusDevNumber);
                forceCleanupSession(nexusDevNumber);
                tracker.disconnected = true;
                if (pairingStillPending) tracker.pairingError = 'The device logged out before pairing completed. Please try again.';
            } else if (reason === DisconnectReason.connectionClosed || 
                       reason === DisconnectReason.connectionLost || 
                       reason === DisconnectReason.timedOut) {
                const isValid = await validateSession(nexusDevNumber);
                if (isValid) {
                    console.log(chalk.yellow(`🔄 Reconnecting ${nexusDevNumber}...`));
                    await sleep(3000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.log(chalk.red(`❌ Invalid session for ${nexusDevNumber}`));
                    tracker.disconnected = true;
                }
            } else if (reason === DisconnectReason.restartRequired) {
                console.log(chalk.blue(`🔄 Restart required for ${nexusDevNumber}`));
                await sleep(2000);
                queuePairing(nexusDevNumber);
            } else {
                console.log(chalk.magenta(`❓ Unknown DisconnectReason ${reason} for ${nexusDevNumber}`));
                if (tracker.retryCount < 2) {
                    await sleep(5000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.log(chalk.red(`❌ Max retries for ${nexusDevNumber}`));
                    tracker.disconnected = true;
                }
            }
        } else if (connection === "open") {
            console.log(chalk.bgGreen.black(`✅ Paired: ${nexusDevNumber}`));
            tracker.retryCount = 0;
            tracker.disconnected = false;
            tracker.loggedOut = false;
            tracker.sessionInvalid = false;
            recentlyPurged.delete(nexusDevNumber);
            tracker.lastActivity = Date.now();
            await sendUserConnected(nexusDevNumber);

            // ── DEPLOYMENT SELECTOR (MIAS Platform) ──────────────────────────
            // The Deployment Manager scans bots/ for manifests, sends the
            // WhatsApp selection menu, waits for the user's choice, reports
            // progress, then launches the bot they picked.
            //
            // IMPORTANT: there is deliberately NO "fall back to MIAS MDX"
            // branch here. The old fallback fired on any error and was the
            // reason users always ended up on MIAS MDX without choosing.
            // If selection fails we tell the user and deploy nothing.
            try {
                const sessionDir = path.resolve(getSessionPath(nexusDevNumber));
                const launcher   = require('./mais_launcher');
                const deployMgr  = require('./deploy/deploymentManager');
                const chosen = await deployMgr.startDeploymentFlow(
                    nexus, nexusDevNumber, tracker, sessionDir, launcher
                );
                if (!chosen) {
                    console.log(chalk.yellow(`ℹ️ No bot deployed for ${nexusDevNumber} (no selection)`));
                }
            } catch (e) {
                console.log(chalk.red(`⚠️ Deployment flow error for ${nexusDevNumber}: ${e.message}`));
                try {
                    await nexus.sendMessage(`${String(nexusDevNumber).replace(/\D/g, '')}@s.whatsapp.net`, {
                        text:
                            `⚠️ *Deployment could not start*\n\n` +
                            `Something went wrong showing the bot menu, so nothing was deployed.\n\n` +
                            `Send *deploy* to try again.`,
                    });
                } catch {}
            }
                } else if (connection === "connecting") {
            console.log(chalk.blue(`🔄 Connecting ${nexusDevNumber}...`));
        }
    });

    // SAFE saveCreds — recreate dir if missing, swallow ENOENT so a late
    // creds.update event after forceCleanupSession can never crash the
    // master pair-bot process. (Was killing every linked user.)
    const _safeSaveCreds = async () => {
        try {
            if (!fs.existsSync(sessionPath)) {
                try { fs.mkdirSync(sessionPath, { recursive: true }); } catch {}
            }
            await saveCreds();
        } catch (e) {
            if (e && e.code === 'ENOENT') return; // session was wiped — ignore
            console.log(chalk.yellow(`⚠️ saveCreds ${nexusDevNumber}: ${e.message}`));
        }
    };
    nexus.ev.on('creds.update', _safeSaveCreds);

    // ── 2-MINUTE FULL SYNC ───────────────────────────────────────────
    // Syncs groups, contacts, and blocklist every 2 minutes so the bot
    // always has fresh data without waiting for full history on connect.
    let _syncRunning = false;
    const syncInterval = setInterval(async () => {
        if (_syncRunning || tracker.disconnected) return;
        _syncRunning = true;
        try { await nexus.groupFetchAllParticipating(); } catch (_) {}
        try { await nexus.fetchBlocklist(); } catch (_) {}
        try {
            if (typeof nexus.refreshMediaConn === 'function') {
                await nexus.refreshMediaConn(true);
            }
        } catch (_) {}
        _syncRunning = false;
    }, 2 * 60 * 1000);

    // Clean up sync interval when session disconnects
    nexus.ev.on('connection.update', ({ connection: _conn2 }) => {
        if (_conn2 === 'close') clearInterval(syncInterval);
    });

    const healthCheckInterval = setInterval(() => {
        if (tracker.disconnected) {
            clearInterval(healthCheckInterval);
            return;
        }
        
        tracker.lastActivity = Date.now();
        
        if (nexus.ws?.readyState === 1) {
            nexus.sendPresenceUpdate('available').catch(() => {});
        }
    }, 60000);

    return nexus;
}

async function waitForPairingResult(nexusDevNumber, timeoutMs = 120000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        const tracker = rentbotTracker.get(nexusDevNumber);
        const pairingRecord = readPairingCodeRecord(nexusDevNumber);

        if (pairingRecord?.code) {
            return pairingRecord;
        }

        if (hasPairedSession(nexusDevNumber)) {
            throw new Error('This number is already paired. Use the linked device directly.');
        }

        if (!tracker) {
            throw new Error('Pairing session was cleared before a code was generated.');
        }

        if (tracker.pairingCode) {
            return {
                number: nexusDevNumber,
                code: tracker.pairingCode,
                timestamp: new Date().toISOString()
            };
        }

        if (tracker.pairingError) {
            throw new Error(tracker.pairingError);
        }

        await sleep(300);
    }

    throw new Error('Pairing code timeout. Please try again.');
}

function smsg(nexus, m, store) {
    if (!m) return m
    let M = proto.WebMessageInfo
    if (m.key) {
        m.id = m.key.id
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
        m.chat = m.key.remoteJid
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')
        m.sender = nexus.decodeJid(m.fromMe && nexus.user.id || m.participant || m.key.participant || m.chat || '')
        if (m.isGroup) m.participant = nexus.decodeJid(m.key.participant) || ''
    }
    if (m.message) {
        m.mtype = getContentType(m.message)
        m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype]?.message?.[getContentType(m.message[m.mtype]?.message)] : m.message[m.mtype]) || {}
        m.body = m.message.conversation || m.msg?.caption || m.msg?.text || (m.mtype == 'listResponseMessage' && m.msg?.singleSelectReply?.selectedRowId) || (m.mtype == 'buttonsResponseMessage' && m.msg?.selectedButtonId) || (m.mtype == 'viewOnceMessage' && m.msg?.caption) || m.text || ''
        let quoted = m.quoted = m.msg?.contextInfo?.quotedMessage || null
        m.mentionedJid = m.msg?.contextInfo?.mentionedJid || []
        if (m.quoted) {
            let type = getContentType(quoted)
            m.quoted = m.quoted[type]
            if (['productMessage'].includes(type)) {
                type = getContentType(m.quoted)
                m.quoted = m.quoted[type]
            }
            if (typeof m.quoted === 'string') m.quoted = {
                text: m.quoted
            }
            m.quoted.mtype = type
            m.quoted.id = m.msg.contextInfo.stanzaId
            m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
            m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
            m.quoted.sender = nexus.decodeJid(m.msg.contextInfo.participant)
            m.quoted.fromMe = m.quoted.sender === nexus.decodeJid(nexus.user.id)
            m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
            m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
            m.getQuotedObj = m.getQuotedMessage = async () => {
                if (!m.quoted.id) return false
                let q = await store.loadMessage(m.chat, m.quoted.id, nexus)
                return exports.smsg(nexus, q, store)
            }
            let vM = m.quoted.fakeObj = M.fromObject({
                key: {
                    remoteJid: m.quoted.chat,
                    fromMe: m.quoted.fromMe,
                    id: m.quoted.id
                },
                message: quoted,
                ...(m.isGroup ? { participant: m.quoted.sender } : {})
            })
            m.quoted.delete = () => nexus.sendMessage(m.quoted.chat, { delete: vM.key })
            m.quoted.copyNForward = (jid, forceForward = false, options = {}) => nexus.copyNForward(jid, vM, forceForward, options)
            m.quoted.download = () => nexus.downloadMediaMessage(m.quoted)
        }
    }
    if (m.msg?.url) m.download = () => nexus.downloadMediaMessage(m.msg)
    m.text = m.msg?.text || m.msg?.caption || m.message?.conversation || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || ''
    m.reply = (text, chatId = m.chat, options = {}) => Buffer.isBuffer(text) ? nexus.sendMedia(chatId, text, 'file', '', m, { ...options }) : nexus.sendText(chatId, text, m, { ...options })
    m.copy = () => exports.smsg(nexus, M.fromObject(M.toObject(m)))
    m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => nexus.copyNForward(jid, m, forceForward, options)

    return m
}

// ============ NOTIFICATION SYSTEM ============
let sendUserConnected, sendUserDisconnected, sendBotStartMessage;

try {
    const notify = require('./notify');
    sendUserConnected = notify.sendUserConnected;
    sendUserDisconnected = notify.sendUserDisconnected;
    sendBotStartMessage = notify.sendBotStartMessage;
    console.log(chalk.green('✓ Notification system loaded'));
} catch (e) {
    console.log(chalk.yellow('⚠️ Notification module not available, continuing without notifications'));
    sendUserConnected = async () => {};
    sendUserDisconnected = async () => {};
    sendBotStartMessage = async () => {};
}
// Export anti-spam maps for use in case.js
module.exports = {
    startpairing,
    waitForPairingResult,
    readPairingCodeRecord,
    hasPairedSession,
    isSessionLive,
    getSessionState,
    unpairSession,
    forceCleanupSession,
    listPairedDevices,
    antilinkGroups,
    antistickerGroups,
    antispamGroups,
    antideleteGroups,
    antidemoteGroups,
    antikickallGroups,
    antigroupmentionGroups,
    antitagallGroups,
    SPAM_CONFIG
};
