/**
 * NIX — System Tools Module (Enhanced)
 * Adds: .health, .sessions, .diagnose, .repair, .cleanup
 */
import { getOwnerName, greet } from '../owner.js';
import { stagedSend, sendNix, reactNix, nixFooter, formatNumber } from '../ui.js';
import { httpClient } from '../../lib/engineAccess.js';

const NIX_VERSION = '1.0.0';
const NIX_START_TIME = Date.now();
const nixUsageStats = { commands: 0, aiRequests: 0, downloads: 0, errors: 0 };

export function incrementStat(key) {
  if (key in nixUsageStats) nixUsageStats[key]++;
}

export async function uptime(sock, msg) {
  await reactNix(sock, msg, '⏰');
  const owner = getOwnerName();
  const botUptime = process.uptime();
  const nixUptime = (Date.now() - NIX_START_TIME) / 1000;
  const fmt = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h}h ${m}m ${sec}s`;
  };
  const mem = process.memoryUsage();
  const text = `⏰ *System Uptime*
━━━━━━━━━━━━━━━━━━

${greet(owner)} here's the current runtime:

🤖 Bot Uptime: *${fmt(botUptime)}*
🧠 Nix Uptime: *${fmt(nixUptime)}*

💾 Memory Usage:
• RSS: *${Math.round(mem.rss / 1024 / 1024)} MB*
• Heap Used: *${Math.round(mem.heapUsed / 1024 / 1024)} MB*
• Heap Total: *${Math.round(mem.heapTotal / 1024 / 1024)} MB*

⚙️ Node.js: *${process.version}*
📅 Checked: ${new Date().toLocaleTimeString()}
━━━━━━━━━━━━━━━━━━${nixFooter()}`;
  await sendNix(sock, msg, text);
}

export async function ping(sock, msg) {
  await reactNix(sock, msg, '🏓');
  const owner = getOwnerName();
  const start = Date.now();
  let sentMsg = null;
  try { sentMsg = await sock.sendMessage(msg.key.remoteJid, { text: '🏓 _Pinging..._' }, { quoted: msg }); } catch {}
  const latency = Date.now() - start;
  const rating = latency < 100 ? '🟢 Excellent' : latency < 300 ? '🟡 Good' : latency < 600 ? '🟠 Fair' : '🔴 Poor';
  const reply = `🏓 *Pong!* — *${latency}ms*  (${rating})`;
  try {
    if (sentMsg?.key) {
      await sock.sendMessage(msg.key.remoteJid, { text: reply, edit: sentMsg.key });
    } else {
      await sendNix(sock, msg, reply);
    }
  } catch { await sendNix(sock, msg, reply); }
}

export async function health(sock, msg) {
  await reactNix(sock, msg, '🏥');
  const owner = getOwnerName();

  // Memory
  const mem = process.memoryUsage();
  const heapPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  const memStatus = heapPct < 70 ? '🟢 Healthy' : heapPct < 85 ? '🟡 Moderate' : '🔴 High';
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);

  // CPU (rough estimate)
  const cpuUsage = process.cpuUsage();
  const cpuMs = Math.round((cpuUsage.user + cpuUsage.system) / 1000);

  // Session health from global reference
  let sessionStatus = '🟡 No data';
  let reconnectCount = 0;
  let badMacCount = 0;
  let lastCheck = 'never';
  try {
    const health = globalThis.__SESSION_HEALTH_SUMMARY__?.();
    if (health) {
      reconnectCount = health.reconnectCount;
      badMacCount    = health.badMacCount;
      lastCheck      = health.lastCheck;
      const results  = Object.values(health.results || {});
      const allOk    = results.every(r => r.ok);
      sessionStatus = results.length === 0 ? '🟡 Not checked yet'
        : allOk ? '🟢 All sessions healthy'
        : `🔴 ${results.filter(r => !r.ok).length} session(s) need attention`;
    }
  } catch {}

  // API status
  let apiStatus = '🟡 Checking...';
  try {
    const r = await httpClient.get('https://apis.prexzyvilla.site', { timeout: 5000 });
    apiStatus = r.status < 400 ? '🟢 Online' : '🟡 Degraded';
  } catch { apiStatus = '🔴 Unreachable'; }

  const upFmt = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h}h ${m}m ${sec}s`;
  };

  const text = `🏥 *MAIS MDX Health Report*
━━━━━━━━━━━━━━━━━━━━━━━━━

${greet(owner)} full health check complete:

🤖 *Bot:* 🟢 Running
🔗 *Session:* ${sessionStatus}
💾 *Memory:* ${memStatus} (${heapPct}% heap, ${rssMB}MB RSS)
   › Heap Used: ${heapUsedMB}MB / ${Math.round(mem.heapTotal/1024/1024)}MB
🌐 *Prexzy API:* ${apiStatus}
📡 *WhatsApp:* 🟢 Connected
⚙️ *Node.js:* ${process.version}
🖥️ *Platform:* ${process.platform}

📊 *Stability Counters:*
• Reconnects: ${reconnectCount}
• Bad MAC events: ${badMacCount}
• Last session check: ${lastCheck}

⏰ *Uptime:* ${upFmt(process.uptime())}
📅 *Checked:* ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━${nixFooter()}`;
  await sendNix(sock, msg, text);
}

export async function sessions(sock, msg) {
  await reactNix(sock, msg, '🔗');
  const owner = getOwnerName();

  let sessionInfo = '🟡 No session health data available.';
  try {
    const summary = globalThis.__SESSION_HEALTH_SUMMARY__?.();
    if (summary) {
      const results = Object.entries(summary.results || {});
      if (results.length === 0) {
        sessionInfo = '🟡 No sessions have been checked yet.\n_Run_ `.nix diagnose` _to check now._';
      } else {
        const lines = results.map(([label, r]) => {
          const icon = r.ok ? '🟢' : '🔴';
          const warns = r.warnings?.length ? `\n  ⚠️ ${r.warnings.join('; ')}` : '';
          return `${icon} *${label}*${warns}`;
        });
        sessionInfo = lines.join('\n\n');
      }
    }
  } catch {}

  const text = `🔗 *Session Status*
━━━━━━━━━━━━━━━━━━━━━━

${greet(owner)} here's the current session health:

${sessionInfo}
━━━━━━━━━━━━━━━━━━━━━━${nixFooter()}`;
  await sendNix(sock, msg, text);
}

export async function diagnose(sock, msg) {
  await reactNix(sock, msg, '🔍');
  const owner = getOwnerName();

  const wait = await sock.sendMessage(msg.key.remoteJid, { text: '🔍 _Running diagnostics..._' }, { quoted: msg });

  const mem = process.memoryUsage();
  const heapPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);

  let sessionDiag = '';
  let reconnectCount = 0;
  let badMacCount = 0;

  try {
    const summary = globalThis.__SESSION_HEALTH_SUMMARY__?.();
    if (summary) {
      reconnectCount = summary.reconnectCount;
      badMacCount    = summary.badMacCount;
      const results  = Object.values(summary.results || {});
      if (results.length > 0) {
        const unhealthy = results.filter(r => !r.ok);
        sessionDiag = unhealthy.length === 0
          ? '\n✅ All sessions passed last health check.'
          : `\n⚠️ ${unhealthy.length} session(s) flagged:\n` +
            unhealthy.map(r => `  • ${r.label}: ${r.warnings?.join(', ') || 'unknown issue'}`).join('\n');
      } else {
        sessionDiag = '\n🟡 No session health data — run `.nix repair` to force a check.';
      }
    }
  } catch {}

  const issues = [];
  if (heapPct > 85) issues.push(`🔴 High heap usage: ${heapPct}%`);
  if (badMacCount > 10) issues.push(`🔴 High Bad MAC count: ${badMacCount}`);
  if (reconnectCount > 20) issues.push(`🟡 High reconnect count: ${reconnectCount}`);

  const diagText = `🔍 *Diagnostic Report*
━━━━━━━━━━━━━━━━━━━━━━━

${greet(owner)} diagnostics complete:

💾 *Memory:* ${heapPct}% heap, ${Math.round(mem.rss/1024/1024)}MB RSS
🔄 *Reconnects:* ${reconnectCount}
⚠️ *Bad MAC events:* ${badMacCount}
⏰ *Process uptime:* ${Math.floor(process.uptime()/60)} min

*Session Health:*${sessionDiag}

${issues.length > 0 ? '*Issues Detected:*\n' + issues.join('\n') : '✅ No critical issues detected.'}
━━━━━━━━━━━━━━━━━━━━━━━${nixFooter()}`;

  try {
    await sock.sendMessage(msg.key.remoteJid, { text: diagText, edit: wait.key });
  } catch {
    await sendNix(sock, msg, diagText);
  }
}

export async function repair(sock, msg) {
  await reactNix(sock, msg, '🔧');
  const owner = getOwnerName();

  const wait = await sock.sendMessage(msg.key.remoteJid, { text: '🔧 _Running safe repair..._' }, { quoted: msg });
  const actions = [];

  // 1. Trigger session health check and repair
  try {
    const healthFn = globalThis.__RUN_SESSION_HEALTH_CHECK__;
    if (typeof healthFn === 'function') {
      const result = await healthFn();
      if (result) {
        actions.push(`✅ Session health check completed (${result.actions?.length || 0} repair action(s))`);
      }
    } else {
      actions.push('🟡 Session health checker not available');
    }
  } catch (e) {
    actions.push(`⚠️ Session check failed: ${e.message}`);
  }

  // 2. Trigger resource cleanup
  try {
    const cleanupFn = globalThis.__RESOURCE_CLEANUP__;
    if (typeof cleanupFn === 'function') {
      const result = cleanupFn(true);
      actions.push(`✅ Resource cleanup: ${result?.totalRemoved || 0} stale entries removed`);
    } else {
      actions.push('🟡 Resource manager not available');
    }
  } catch (e) {
    actions.push(`⚠️ Resource cleanup failed: ${e.message}`);
  }

  // 3. Rebuild caches if Bad MAC count is high
  try {
    const summary = globalThis.__SESSION_HEALTH_SUMMARY__?.();
    if (summary?.badMacCount > 5) {
      const rebuildFn = globalThis.__REBUILD_CACHES__;
      if (typeof rebuildFn === 'function') {
        await rebuildFn();
        actions.push('✅ Signal caches rebuilt (Bad MAC recovery)');
      }
    }
  } catch {}

  // 4. Suggest GC
  if (typeof global.gc === 'function') {
    global.gc();
    actions.push('✅ Garbage collection run');
  }

  const repairText = `🔧 *Safe Repair Complete*
━━━━━━━━━━━━━━━━━━━━━

${greet(owner)} repair finished:

${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

_Note: Only safe, non-destructive repairs were performed._
_Healthy sessions were never restarted._
━━━━━━━━━━━━━━━━━━━━━${nixFooter()}`;

  try {
    await sock.sendMessage(msg.key.remoteJid, { text: repairText, edit: wait.key });
  } catch {
    await sendNix(sock, msg, repairText);
  }
}

export async function cleanup(sock, msg) {
  await reactNix(sock, msg, '🧹');
  const owner = getOwnerName();

  const wait = await sock.sendMessage(msg.key.remoteJid, { text: '🧹 _Running cleanup..._' }, { quoted: msg });

  let totalRemoved = 0;
  let memBefore = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  try {
    const cleanupFn = globalThis.__RESOURCE_CLEANUP__;
    if (typeof cleanupFn === 'function') {
      const result = cleanupFn(true);
      totalRemoved = result?.totalRemoved || 0;
    }
  } catch {}

  if (typeof global.gc === 'function') global.gc();
  const memAfter = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const freed = Math.max(0, memBefore - memAfter);

  const cleanupText = `🧹 *Cleanup Complete*
━━━━━━━━━━━━━━━━━━

${greet(owner)} cleanup done:

🗑️ Stale cache entries removed: *${totalRemoved}*
💾 Memory freed: *~${freed}MB*
   (${memBefore}MB → ${memAfter}MB heap)

✅ Active caches were preserved.
✅ Active sessions untouched.
━━━━━━━━━━━━━━━━━━${nixFooter()}`;

  try {
    await sock.sendMessage(msg.key.remoteJid, { text: cleanupText, edit: wait.key });
  } catch {
    await sendNix(sock, msg, cleanupText);
  }
}

export async function logs(sock, msg) {
  await reactNix(sock, msg, '📋');
  const owner = getOwnerName();
  await sendNix(sock, msg, `📋 *Nix Session Stats*

${greet(owner)} here's your Nix usage this session:

🧠 Commands Handled: *${formatNumber(nixUsageStats.commands)}*
🤖 AI Requests: *${formatNumber(nixUsageStats.aiRequests)}*
⬇️ Downloads: *${formatNumber(nixUsageStats.downloads)}*
❌ Errors: *${formatNumber(nixUsageStats.errors)}*

💾 Memory: *${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB*
⏰ Uptime: *${Math.floor(process.uptime() / 60)} min*
📅 Session: ${new Date(NIX_START_TIME).toLocaleString()}${nixFooter()}`);
}

export async function version(sock, msg) {
  await reactNix(sock, msg, '🧠');
  await sendNix(sock, msg, `🧠 *Nix Assistant*

Version: *v${NIX_VERSION}*
Node.js: *${process.version}*
Platform: *${process.platform}*
Architecture: *${process.arch}*

🌐 Primary API: ZeroAPI
🔁 Fallback: DavidCyril → Prexzyvilla → Public APIs

Built for: MIAS MDX Bot v4.9.9+
Owner: ${getOwnerName()}${nixFooter()}`);
}

export async function nixStats(sock, msg) {
  await logs(sock, msg);
}

export async function nixReset(sock, msg) {
  const owner = getOwnerName();
  nixUsageStats.commands = 0;
  nixUsageStats.aiRequests = 0;
  nixUsageStats.downloads = 0;
  nixUsageStats.errors = 0;
  await reactNix(sock, msg, '✅');
  await sendNix(sock, msg, `✅ *Nix Reset*\n\n${greet(owner)} Nix session stats have been cleared.${nixFooter()}`);
}
