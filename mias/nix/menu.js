/**
 * NIX ASSISTANT — Menu System (Redesigned)
 * Dope --> style command listing with bot identity
 */
import { getOwnerName } from './owner.js';
import { nixFooter } from './ui.js';

const PREFIX = process.env.PREFIX || '.';
const P = PREFIX;

// ─── Bot Identity ─────────────────────────────────────────────────────────────
const BOT_NAME  = process.env.BOT_NAME  || 'NIX';
const BOT_VER   = process.env.BOT_VER   || 'v2.1';

// ─── Divider helpers ─────────────────────────────────────────────────────────
const LINE = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const THIN = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

// ─── Section builder ─────────────────────────────────────────────────────────
function section(emoji, title, cmds) {
  const rows = cmds.map(c => `  ╰➤ *${P}nix ${c}*`).join('\n');
  return `${emoji} *${title}*\n${rows}`;
}

// ─── Main Menu ────────────────────────────────────────────────────────────────
export function buildMainMenu() {
  const owner = getOwnerName();
  const now   = new Date();
  const hour  = now.getHours();
  const greeting =
    hour < 12 ? '🌅 Good morning' :
    hour < 17 ? '☀️  Good afternoon' :
    hour < 21 ? '🌆 Good evening' : '🌙 Good night';

  return `╔══════════════════════════════╗
║  🤖  *${BOT_NAME} ASSISTANT*  ${BOT_VER}   ║
╚══════════════════════════════╝

${greeting}, *${owner}* 👋
I'm *${BOT_NAME}* — your smart WhatsApp assistant.

*How to use:*
› ${P}nix *<command>*  — prefix style
› Or just say  *"${BOT_NAME} <request>"*  — natural

${LINE}

👤 *ACCOUNT*
  ╰➤ *${P}nix contacts*
  ╰➤ *${P}nix groups*
  ╰➤ *${P}nix unread*
  ╰➤ *${P}nix blocked*
  ╰➤ *${P}nix archived*
  ╰➤ *${P}nix status <text>*
  ╰➤ *${P}nix clearstatus*
  ╰➤ *${P}nix report*

${THIN}

💬 *MESSAGING & CONTACTS*
  ╰➤ *${P}nix text <number> <msg>*
  ╰➤ *${P}nix block <number>*
  ╰➤ *${P}nix unblock <number>*
  ╰➤ *${P}nix add <number> <name>*
  ╰➤ *${P}nix forward <number>*
  ╰➤ *${P}nix delete*

${THIN}

👥 *GROUP MANAGEMENT*
  ╰➤ *${P}nix groups*
  ╰➤ *${P}nix groupstats*
  ╰➤ *${P}nix members*
  ╰➤ *${P}nix activegroups*
  ╰➤ *${P}nix inactivegroups*
  ╰➤ *${P}nix kick <number>*
  ╰➤ *${P}nix close*
  ╰➤ *${P}nix open*
  ╰➤ *${P}nix mute*
  ╰➤ *${P}nix promote <number>*
  ╰➤ *${P}nix demote <number>*
  ╰➤ *${P}nix tagall <msg>*
  ╰➤ *${P}nix invite*
  ╰➤ *${P}nix revoke*
  ╰➤ *${P}nix leave*

${THIN}

🤖 *AI ASSISTANT*
  ╰➤ *${P}nix ai <message>*
  ╰➤ *${P}nix summarize <text>*
  ╰➤ *${P}nix rewrite <text>*
  ╰➤ *${P}nix translate <lang> <text>*
  ╰➤ *${P}nix explain <topic>*
  ╰➤ *${P}nix poem <topic>*
  ╰➤ *${P}nix story <topic>*
  ╰➤ *${P}nix code <lang> <task>*
  ╰➤ *${P}nix fix <code>*
  ╰➤ *${P}nix roast <target>*
  ╰➤ *${P}nix define <word>*
  ╰➤ *${P}nix synonym <word>*

${THIN}

🎧 *MEDIA TOOLS*
  ╰➤ *${P}nix download <url>*
  ╰➤ *${P}nix sticker*
  ╰➤ *${P}nix gif <keyword>*
  ╰➤ *${P}nix meme*
  ╰➤ *${P}nix viewonce*
  ╰➤ *${P}nix saveviewonce*
  ╰➤ *${P}nix lastmedia <number>*
  ╰➤ *${P}nix mediafrom <number>*
  ╰➤ *${P}nix mediasent <number>*

${THIN}

👤 *CONTACT INTELLIGENCE*
  ╰➤ *${P}nix profile <number>*
  ╰➤ *${P}nix about <number>*
  ╰➤ *${P}nix lastseen <number>*
  ╰➤ *${P}nix online <number>*
  ╰➤ *${P}nix contactinfo <number>*
  ╰➤ *${P}nix lastmsg <number>*
  ╰➤ *${P}nix firstmsg <number>*
  ╰➤ *${P}nix msgcount <number>*
  ╰➤ *${P}nix searchmsg <keyword>*
  ╰➤ *${P}nix deleted*
  ╰➤ *${P}nix edited*
  ╰➤ *${P}nix mostactive*
  ╰➤ *${P}nix leastactive*
  ╰➤ *${P}nix chatreport <number>*
  ╰➤ *${P}nix streak <number>*
  ╰➤ *${P}nix lastcall*
  ╰➤ *${P}nix missedcalls*
  ╰➤ *${P}nix lastdoc <number>*

${THIN}

⚙️ *SYSTEM TOOLS*
  ╰➤ *${P}nix uptime*
  ╰➤ *${P}nix ping*
  ╰➤ *${P}nix health*
  ╰➤ *${P}nix logs*
  ╰➤ *${P}nix version*
  ╰➤ *${P}nix stats*
  ╰➤ *${P}nix reset*

${THIN}

🌐 *INFO & WEB*
  ╰➤ *${P}nix weather <city>*
  ╰➤ *${P}nix news*
  ╰➤ *${P}nix wiki <topic>*
  ╰➤ *${P}nix search <query>*
  ╰➤ *${P}nix fact*
  ╰➤ *${P}nix joke*
  ╰➤ *${P}nix quote*
  ╰➤ *${P}nix calculate <expr>*
  ╰➤ *${P}nix myip*

${THIN}

📝 *PRODUCTIVITY*
  ╰➤ *${P}nix note <text>*
  ╰➤ *${P}nix notes*
  ╰➤ *${P}nix todo <task>*
  ╰➤ *${P}nix todos*
  ╰➤ *${P}nix remind <time> <msg>*

${THIN}

🔧 *AUTO FEATURES*
  ╰➤ *${P}nix autoview on/off*
  ╰➤ *${P}nix autolike on/off*
  ╰➤ *${P}nix autotyping on/off*
  ╰➤ *${P}nix autoread on/off*
  ╰➤ *${P}nix autobio on/off*
  ╰➤ *${P}nix autoreact on/off*

${THIN}

🔐 *OWNER ONLY*
  ╰➤ *${P}setnixowner <name>*

${LINE}

💬 *Natural language — just say it:*
  › "Nix count my contacts"
  › "Nix kick @number from group"
  › "Nix translate this to French"
  › "Nix download this video"
  › "Nix show weather in Lagos"
  › "Nix ai explain quantum physics"

${nixFooter()}`;
}

// ─── Category Help Pages ───────────────────────────────────────────────────────
export function buildCategoryHelp(category) {
  const P2 = PREFIX;

  const cats = {
    account: `👤 *ACCOUNT INTELLIGENCE*\n${LINE}\n\n  ╰➤ *${P2}nix contacts* — Total contacts count\n  ╰➤ *${P2}nix groups* — Total groups count\n  ╰➤ *${P2}nix unread* — Unread chats\n  ╰➤ *${P2}nix report* — Full account summary\n  ╰➤ *${P2}nix blocked* — Blocked contacts list\n  ╰➤ *${P2}nix archived* — Archived chats list\n  ╰➤ *${P2}nix status <text>* — Set your WhatsApp status\n  ╰➤ *${P2}nix clearstatus* — Clear your status`,

    messaging: `💬 *MESSAGING & CONTACTS*\n${LINE}\n\n  ╰➤ *${P2}nix text <number> <msg>* — Send a message\n  ╰➤ *${P2}nix block <number>* — Block a contact\n  ╰➤ *${P2}nix unblock <number>* — Unblock a contact\n  ╰➤ *${P2}nix add <number> <name>* — Save contact card\n  ╰➤ *${P2}nix forward <number>* — Forward quoted message\n  ╰➤ *${P2}nix delete* — Delete quoted message\n\n_Natural language:_\n  › "Nix text 2349012345678 Hey!"\n  › "Nix block this person"\n  › "Nix add this number as John"`,

    group: `👥 *GROUP MANAGEMENT*\n${LINE}\n\n  ╰➤ *${P2}nix groups* — List all groups\n  ╰➤ *${P2}nix groupstats* — Group breakdown\n  ╰➤ *${P2}nix members* — Member count & list\n  ╰➤ *${P2}nix activegroups* — Most active groups\n  ╰➤ *${P2}nix inactivegroups* — Inactive groups\n  ╰➤ *${P2}nix kick <number>* — Remove a member\n  ╰➤ *${P2}nix close* — Lock group (admin only)\n  ╰➤ *${P2}nix open* — Open group messages\n  ╰➤ *${P2}nix mute* — Mute this chat\n  ╰➤ *${P2}nix unmute* — Unmute this chat\n  ╰➤ *${P2}nix promote <number>* — Make admin\n  ╰➤ *${P2}nix demote <number>* — Remove admin\n  ╰➤ *${P2}nix tagall <msg>* — Tag all members\n  ╰➤ *${P2}nix invite* — Get group invite link\n  ╰➤ *${P2}nix revoke* — Revoke invite link\n  ╰➤ *${P2}nix groupsummary* — Group activity summary\n  ╰➤ *${P2}nix leave* — Leave this group`,

    ai: `🤖 *AI ASSISTANT*\n${LINE}\n\n  ╰➤ *${P2}nix ai <message>* — Chat with AI\n  ╰➤ *${P2}nix summarize <text>* — Summarize text\n  ╰➤ *${P2}nix rewrite <text>* — Rephrase text\n  ╰➤ *${P2}nix translate <lang> <text>* — Translate\n  ╰➤ *${P2}nix explain <text>* — Explain simply\n  ╰➤ *${P2}nix poem <topic>* — Write a poem\n  ╰➤ *${P2}nix story <topic>* — Write a short story\n  ╰➤ *${P2}nix code <lang> <task>* — Generate code\n  ╰➤ *${P2}nix fix <code>* — Debug code\n  ╰➤ *${P2}nix roast <text>* — Roast mode\n  ╰➤ *${P2}nix define <word>* — Dictionary\n  ╰➤ *${P2}nix synonym <word>* — Word synonyms`,

    media: `🎧 *MEDIA TOOLS*\n${LINE}\n\n  ╰➤ *${P2}nix download <url>* — Download media\n  ╰➤ *${P2}nix sticker* — Convert to sticker\n  ╰➤ *${P2}nix gif <keyword>* — Search GIF\n  ╰➤ *${P2}nix meme* — Random meme\n  ╰➤ *${P2}nix viewonce* — Reveal view once\n  ╰➤ *${P2}nix saveviewonce* — Auto-save view once\n  ╰➤ *${P2}nix lastmedia <number>* — Last media from contact\n  ╰➤ *${P2}nix mediafrom <number>* — Media received from contact\n  ╰➤ *${P2}nix mediasent <number>* — Media you sent to contact`,

    system: `⚙️ *SYSTEM TOOLS*\n${LINE}\n\n  ╰➤ *${P2}nix uptime* — Bot uptime\n  ╰➤ *${P2}nix ping* — Response speed\n  ╰➤ *${P2}nix health* — System health\n  ╰➤ *${P2}nix logs* — Recent logs\n  ╰➤ *${P2}nix version* — Nix version\n  ╰➤ *${P2}nix stats* — Usage stats\n  ╰➤ *${P2}nix reset* — Reset Nix settings`,

    info: `🌐 *INFO & WEB*\n${LINE}\n\n  ╰➤ *${P2}nix weather <city>* — Weather info\n  ╰➤ *${P2}nix news* — Latest headlines\n  ╰➤ *${P2}nix wiki <topic>* — Wikipedia summary\n  ╰➤ *${P2}nix search <query>* — Web search\n  ╰➤ *${P2}nix fact* — Random fact\n  ╰➤ *${P2}nix joke* — Random joke\n  ╰➤ *${P2}nix quote* — Inspirational quote\n  ╰➤ *${P2}nix calculate <expr>* — Calculator\n  ╰➤ *${P2}nix myip* — My IP info`,

    productivity: `📝 *PRODUCTIVITY*\n${LINE}\n\n  ╰➤ *${P2}nix note <text>* — Save a note\n  ╰➤ *${P2}nix notes* — View all notes\n  ╰➤ *${P2}nix todo <task>* — Add a task\n  ╰➤ *${P2}nix todos* — View all tasks\n  ╰➤ *${P2}nix remind <time> <msg>* — Set reminder`,

    contact: `👤 *CONTACT INTELLIGENCE*\n${LINE}\n\n  ╰➤ *${P2}nix profile <number>* — Profile picture\n  ╰➤ *${P2}nix about <number>* — About/bio\n  ╰➤ *${P2}nix lastseen <number>* — Last seen\n  ╰➤ *${P2}nix online <number>* — Online status\n  ╰➤ *${P2}nix contactinfo <number>* — Full info\n  ╰➤ *${P2}nix lastmsg <number>* — Last message\n  ╰➤ *${P2}nix firstmsg <number>* — First message\n  ╰➤ *${P2}nix msgcount <number>* — Message count\n  ╰➤ *${P2}nix searchmsg <keyword>* — Search messages\n  ╰➤ *${P2}nix deleted* — Last deleted message\n  ╰➤ *${P2}nix edited* — Last edited message\n  ╰➤ *${P2}nix mostactive* — Who messages you most\n  ╰➤ *${P2}nix leastactive* — Least active contacts\n  ╰➤ *${P2}nix chatreport <number>* — Full chat report\n  ╰➤ *${P2}nix streak <number>* — Daily chat streak\n  ╰➤ *${P2}nix lastcall* — Last call info\n  ╰➤ *${P2}nix missedcalls* — Missed calls list\n  ╰➤ *${P2}nix lastdoc <number>* — Last document sent\n  ╰➤ *${P2}nix finddoc <name>* — Find document by name`,

    auto: `🔧 *AUTO FEATURES*\n${LINE}\n\n  ╰➤ *${P2}nix autoview on/off* — Auto-view statuses\n  ╰➤ *${P2}nix autolike on/off* — Auto-react to statuses\n  ╰➤ *${P2}nix autotyping on/off* — Show typing indicator\n  ╰➤ *${P2}nix autorecording on/off* — Show recording indicator\n  ╰➤ *${P2}nix autoread on/off* — Auto-read messages\n  ╰➤ *${P2}nix autobio on/off* — Auto-update bio\n  ╰➤ *${P2}nix autoreact on/off* — Auto-react to messages`,
  };

  return cats[category] || null;
}
