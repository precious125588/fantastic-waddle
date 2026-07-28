const P = process.env.PREFIX || '.';
const BOT = process.env.BOT_NAME || 'NEW PAGE';

const LINE  = '━━━━━━━━━━━━━━━━━━━━━━';
const THIN  = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

export function buildMenu() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? '🌅 Morning' : hour < 17 ? '☀️ Afternoon' : hour < 21 ? '🌆 Evening' : '🌙 Night';

  return `╔${LINE}╗
║  ⚡  *${BOT}*  ║
╚${LINE}╝

${greet}! I have *120+ commands* ready.
Type *${P}menu <category>* for details.

${THIN}
📥 *DOWNLOADS*
  › ${P}tiktok  ${P}tiktokmp3
  › ${P}ytmp4  ${P}ytmp3  ${P}ytsearch
  › ${P}igdl  ${P}fbdl  ${P}twitter
  › ${P}spotify  ${P}play  ${P}song
  › ${P}soundcloud  ${P}mediafire  ${P}pindl
  › ${P}video  ${P}mediainfo

${THIN}
🎨 *STICKER*
  › ${P}s / ${P}sticker  ${P}toimage
  › ${P}stickertext  ${P}stickeranim  ${P}stickercrop

${THIN}
🖼 *IMAGE TOOLS*
  › ${P}enhance  ${P}cartoonify  ${P}removebg
  › ${P}blur  ${P}flip  ${P}rotate  ${P}compress  ${P}waifu

${THIN}
🤖 *AI*
  › ${P}gpt  ${P}gemini  ${P}imagine  ${P}ask
  › ${P}codeai  ${P}rewrite  ${P}summarize  ${P}poem

${THIN}
👁 *VIEW ONCE*
  › ${P}vv — unlock view-once image/video
  › ${P}vvid — convert video to view-once
  › ${P}vvimg — convert image to view-once

${THIN}
🛠 *TOOLS*
  › ${P}ss  ${P}calc  ${P}qr  ${P}b64e  ${P}b64d
  › ${P}ip  ${P}define  ${P}country  ${P}colorhex
  › ${P}morse  ${P}unmorse  ${P}binary  ${P}unbinary
  › ${P}pass  ${P}uuid  ${P}hash  ${P}short
  › ${P}ocr  ${P}tts  ${P}font  ${P}temp  ${P}unit

${THIN}
🎯 *FUN & EXTRAS*
  › ${P}leet  ${P}rev  ${P}fake
  › ${P}lyrics  ${P}anime  ${P}meme
  › ${P}cat  ${P}dog  ${P}coin  ${P}dice  ${P}random

${THIN}
👥 *GROUP*
  › ${P}kick  ${P}add  ${P}promote  ${P}demote
  › ${P}mute  ${P}unmute  ${P}kickall  ${P}tagall
  › ${P}hidetag  ${P}antilink  ${P}antispam  ${P}setgdesc

${THIN}
📱 *WHATSAPP*
  › ${P}block  ${P}unblock  ${P}setstatus  ${P}sendstatus
  › ${P}autostatus  ${P}autolikestatus
  › ${P}online  ${P}offline  ${P}typing  ${P}recording
  › ${P}readall  ${P}bio

${THIN}
🎲 *FUN*
  › ${P}joke  ${P}quote  ${P}roast  ${P}compliment
  › ${P}ship  ${P}truthdare  ${P}8ball  ${P}wouldyou
  › ${P}trivia  ${P}riddle

${THIN}
🔍 *STALK*
  › ${P}github  ${P}npm  ${P}ig  ${P}whois  ${P}phonelookup

${THIN}
💰 *ECONOMY*
  › ${P}balance  ${P}daily  ${P}transfer  ${P}gamble  ${P}work

${THIN}
🔧 *UTILITY*
  › ${P}ping  ${P}runtime  ${P}speed  ${P}alive  ${P}info
  › ${P}time  ${P}weather  ${P}translate  ${P}help

${THIN}
👑 *OWNER*
  › ${P}broadcast  ${P}setsudo  ${P}delsudo  ${P}listsudo
  › ${P}restart  ${P}eval  ${P}setprefix  ${P}cleartmp
  › ${P}botstat  ${P}setname

${LINE}
⚡ _Powered by NEW PAGE v2 — 120+ cmds_
🔧 _Baileys + GKTW Helper + All Engines_`;
}

export function buildCategoryMenu(cat) {
  const maps = {
    dl:       `📥 *DOWNLOADS*\n${P}tiktok <url>\n${P}tiktokmp3 <url>\n${P}ytmp4 <url|query>\n${P}ytmp3 <url|query>\n${P}ytsearch <query>\n${P}igdl <url>\n${P}fbdl <url>\n${P}twitter <url>\n${P}spotify <query>\n${P}play <query>\n${P}song <query>\n${P}video <query>\n${P}soundcloud <url>\n${P}mediafire <url>\n${P}pindl <url>\n${P}mediainfo <url>`,
    sticker:  `🎨 *STICKER*\n${P}sticker — reply to image/video\n${P}toimage — reply to sticker\n${P}stickertext <text>\n${P}stickeranim — reply to gif\n${P}stickercrop — reply to sticker`,
    img:      `🖼 *IMAGE TOOLS*\n${P}enhance — reply to image\n${P}cartoonify — reply to image\n${P}removebg — reply to image\n${P}blur — reply to image\n${P}flip — reply to image\n${P}rotate <deg> — reply to image\n${P}compress — reply to image\n${P}waifu`,
    ai:       `🤖 *AI*\n${P}gpt <prompt>\n${P}gemini <prompt>\n${P}imagine <prompt>\n${P}ask <question>\n${P}codeai <code question>\n${P}rewrite <text>\n${P}summarize <text>\n${P}poem <topic>`,
    vv:       `👁 *VIEW ONCE*\n${P}vv — reply to view-once to unlock it\n${P}vvid — reply to video to send as view-once\n${P}vvimg — reply to image to send as view-once`,
    tools:    `🛠 *TOOLS*\n${P}ss <url> — screenshot website\n${P}calc <expr> — calculator (e.g. 2+2*10)\n${P}qr <text> — generate QR code\n${P}b64e <text> — base64 encode\n${P}b64d <base64> — base64 decode\n${P}ip <address> — IP info lookup\n${P}define <word> — dictionary\n${P}country <name> — country info\n${P}colorhex <#hex> — color info\n${P}morse <text> — encode to morse\n${P}unmorse <morse> — decode from morse\n${P}binary <text> — encode to binary\n${P}unbinary <binary> — decode from binary\n${P}pass [length] — password generator\n${P}uuid [count] — UUID generator\n${P}hash <text> — SHA-256 hash\n${P}short <url> — URL shortener\n${P}ocr — reply to image to read text\n${P}tts [lang] <text> — text to speech\n${P}font <text> — text styler\n${P}temp <val> <C|F|K> — temperature\n${P}unit <val> <from> <to> — unit converter`,
    extra:    `🎯 *EXTRAS*\n${P}leet <text> — leet speak\n${P}rev <text> — reverse text\n${P}fake — fake identity generator\n${P}lyrics <artist song> — song lyrics\n${P}anime <title> — anime info\n${P}meme — random meme\n${P}cat — random cat image\n${P}dog — random dog image\n${P}coin — coin flip\n${P}dice [sides] — roll dice\n${P}random [min max] — random number`,
    group:    `👥 *GROUP*\n${P}kick @user\n${P}add <number>\n${P}promote @user\n${P}demote @user\n${P}mute\n${P}unmute\n${P}kickall\n${P}tagall <msg>\n${P}hidetag <msg>\n${P}antilink on|off\n${P}antispam on|off\n${P}setgdesc <text>`,
    wa:       `📱 *WHATSAPP*\n${P}block @user|<number>\n${P}unblock <number>\n${P}setstatus <text>\n${P}sendstatus <text>\n${P}autostatus on|off\n${P}autolikestatus on|off\n${P}online\n${P}offline\n${P}typing <number>\n${P}recording <number>\n${P}readall\n${P}bio <text>`,
    fun:      `🎲 *FUN*\n${P}joke\n${P}quote\n${P}roast @user\n${P}compliment @user\n${P}ship @user1 @user2\n${P}truthdare\n${P}8ball <question>\n${P}wouldyou\n${P}trivia\n${P}riddle`,
    stalk:    `🔍 *STALK*\n${P}github <username>\n${P}npm <package>\n${P}ig <username>\n${P}whois @user\n${P}phonelookup <number>`,
    economy:  `💰 *ECONOMY*\n${P}balance\n${P}daily\n${P}transfer @user <amount>\n${P}gamble <amount>\n${P}work`,
  };
  return maps[cat] || buildMenu();
}
