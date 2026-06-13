/**
 * NIX ASSISTANT — Menu System
 */
import { getOwnerName } from './owner.js';
import { nixFooter } from './ui.js';

const PREFIX = process.env.PREFIX || '.';
const P = PREFIX;

export function buildMainMenu() {
  const owner = getOwnerName();
  return `🧠 *NIX ASSISTANT MENU*
━━━━━━━━━━━━━━━━━━━━━━━━━━

Hey *${owner}*, I'm Nix — your smart WhatsApp assistant.
Use *${P}nix <command>* or just say *"Nix <request>"*

━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 *ACCOUNT INTELLIGENCE*
  contacts · unread · blocked
  archived · report · status · clearstatus

💬 *MESSAGING & CONTACTS*
  text · block · unblock · add
  forward · delete

👥 *GROUP MANAGEMENT*
  groups · groupstats · members
  activegroups · inactivegroups
  kick · close · open · mute
  promote · demote · tagall
  invite · revoke · leave

🤖 *AI ASSISTANT*
  ai · summarize · rewrite
  translate · explain · poem
  story · code · fix · roast
  define · synonym

🎧 *MEDIA TOOLS*
  download · sticker · gif · meme
  viewonce · saveviewonce
  lastmedia · mediafrom · mediasent

👤 *CONTACT INTELLIGENCE*
  profile · about · lastseen
  online · contactinfo · lastmsg
  firstmsg · msgcount · searchmsg
  deleted · edited · mostactive
  leastactive · chatreport · streak
  lastcall · missedcalls · lastdoc

⚙️ *SYSTEM TOOLS*
  uptime · ping · health · logs
  version · stats · reset

🌐 *INFO & WEB*
  weather · news · wiki · search
  fact · joke · quote · calculate · myip

📝 *PRODUCTIVITY*
  note · notes · todo · todos · remind

🔐 *OWNER*
  ${P}setnixowner <name>

━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 *Natural language examples:*
• "Nix count my contacts"
• "Nix kick this number"
• "Nix close this group"
• "Nix text 2349012345678 Hello!"
• "Nix add this number John"
• "Nix block this person"
• "Nix forward this to 2349012345678"
• "Nix delete this message"
• "Nix download this video"
• "Nix get details about this number"
• "Nix fetch my last media sent"
• "Nix summarize this chat"
• "Nix show me the weather in Lagos"
• "Nix ai explain quantum physics"
${nixFooter()}`;
}

export function buildCategoryHelp(category) {
  const P2 = PREFIX;
  const cats = {
    account: `👤 *ACCOUNT INTELLIGENCE*\n\n• ${P2}nix contacts — Total contacts\n• ${P2}nix groups — Total groups\n• ${P2}nix unread — Unread chats\n• ${P2}nix report — Full account summary\n• ${P2}nix blocked — Blocked contacts list\n• ${P2}nix archived — Archived chats list\n• ${P2}nix status <text> — Set your WhatsApp status`,
    messaging: `💬 *MESSAGING & CONTACTS*\n\n• ${P2}nix text <number> <msg> — Send a message\n• ${P2}nix block <number> — Block a contact\n• ${P2}nix unblock <number> — Unblock a contact\n• ${P2}nix add <number> <name> — Save contact card\n• ${P2}nix forward <number> — Forward quoted msg\n• ${P2}nix delete — Delete quoted message\n\n_Or just say:_\n• "Nix text 2349012345678 Hey!"\n• "Nix block this person"\n• "Nix add this number as John"`,
    group: `👥 *GROUP MANAGEMENT*\n\n• ${P2}nix groups — List all groups\n• ${P2}nix groupstats — Group breakdown\n• ${P2}nix members — Member count & list\n• ${P2}nix activegroups — Most active groups\n• ${P2}nix inactivegroups — Inactive groups\n• ${P2}nix kick <number> — Remove a member\n• ${P2}nix close — Lock group (admin only)\n• ${P2}nix open — Open group messages\n• ${P2}nix mute — Mute this chat\n• ${P2}nix unmute — Unmute this chat\n• ${P2}nix promote <number> — Make admin\n• ${P2}nix demote <number> — Remove admin\n• ${P2}nix tagall <msg> — Tag all members\n• ${P2}nix invite — Get group invite link\n• ${P2}nix revoke — Revoke invite link\n• ${P2}nix groupsummary — Group activity summary\n• ${P2}nix leave — Leave this group`,
    ai: `🤖 *AI ASSISTANT*\n\n• ${P2}nix ai <message> — Chat with AI\n• ${P2}nix summarize <text> — Summarize text\n• ${P2}nix rewrite <text> — Rephrase text\n• ${P2}nix translate <lang> <text> — Translate\n• ${P2}nix explain <text> — Explain simply\n• ${P2}nix poem <topic> — Write a poem\n• ${P2}nix story <topic> — Write a short story\n• ${P2}nix code <lang> <task> — Generate code\n• ${P2}nix fix <code> — Debug code\n• ${P2}nix roast <text> — Roast mode\n• ${P2}nix define <word> — Dictionary\n• ${P2}nix synonym <word> — Word synonyms`,
    media: `🎧 *MEDIA TOOLS*\n\n• ${P2}nix download <url> — Download media\n• ${P2}nix sticker — Convert to sticker\n• ${P2}nix gif <keyword> — Search GIF\n• ${P2}nix meme — Random meme\n• ${P2}nix viewonce — Reveal view once\n• ${P2}nix saveviewonce — Auto-save view once\n• ${P2}nix lastmedia <number> — Last media from contact\n• ${P2}nix mediafrom <number> — Media received from contact\n• ${P2}nix mediasent <number> — Media you sent to contact`,
    system: `⚙️ *SYSTEM TOOLS*\n\n• ${P2}nix uptime — Bot uptime\n• ${P2}nix ping — Response speed\n• ${P2}nix health — System health\n• ${P2}nix logs — Recent logs\n• ${P2}nix version — Nix version\n• ${P2}nix stats — Usage stats\n• ${P2}nix reset — Reset Nix settings`,
    info: `🌐 *INFO & WEB*\n\n• ${P2}nix weather <city> — Weather info\n• ${P2}nix news — Latest headlines\n• ${P2}nix wiki <topic> — Wikipedia summary\n• ${P2}nix search <query> — Web search\n• ${P2}nix fact — Random fact\n• ${P2}nix joke — Random joke\n• ${P2}nix quote — Inspirational quote\n• ${P2}nix calculate <expr> — Calculator\n• ${P2}nix myip — My IP info`,
    productivity: `📝 *PRODUCTIVITY*\n\n• ${P2}nix note <text> — Save a note\n• ${P2}nix notes — View all notes\n• ${P2}nix todo <task> — Add a task\n• ${P2}nix todos — View all tasks\n• ${P2}nix remind <time> <msg> — Set reminder`,
    contact: `👤 *CONTACT INTELLIGENCE*\n\n• ${P2}nix profile <number> — Profile picture\n• ${P2}nix about <number> — About/bio\n• ${P2}nix lastseen <number> — Last seen\n• ${P2}nix online <number> — Online status\n• ${P2}nix contactinfo <number> — Full info\n• ${P2}nix lastmsg <number> — Last message\n• ${P2}nix firstmsg <number> — First message\n• ${P2}nix msgcount <number> — Message count\n• ${P2}nix searchmsg <keyword> — Search messages\n• ${P2}nix deleted — Last deleted message\n• ${P2}nix edited — Last edited message\n• ${P2}nix mostactive — Who messages you most\n• ${P2}nix leastactive — Least active contacts\n• ${P2}nix chatreport <number> — Full chat report\n• ${P2}nix streak <number> — Daily chat streak\n• ${P2}nix lastcall — Last call info\n• ${P2}nix missedcalls — Missed calls list\n• ${P2}nix callhistory <number> — Call history\n• ${P2}nix lastdoc <number> — Last document sent\n• ${P2}nix finddoc <name> — Find document by name`,
  };
  return cats[category] || null;
}
