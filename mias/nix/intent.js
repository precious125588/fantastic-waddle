/**
 * NIX ASSISTANT — Intent Parser
 * Converts natural language to structured intent
 */

const PREFIX = (process.env.PREFIX || '.').toLowerCase();
const NIX_PREFIX = `${PREFIX}nix`;
const SETNIXOWNER_CMD = `${PREFIX}setnixowner`;

/**
 * Parse a raw message body into a Nix intent.
 * Returns null if message is not for Nix.
 * Returns { intent, args, raw, isNatural } if it is.
 */
export function parseNixMessage(body) {
  if (!body || typeof body !== 'string') return null;
  const trimmed = body.trim();
  const lower = trimmed.toLowerCase();

  let raw = '';
  let isNatural = false;

  // ── .setnixowner <name> ──────────────────────────────────────────────────
  if (lower.startsWith(SETNIXOWNER_CMD)) {
    const name = trimmed.slice(SETNIXOWNER_CMD.length).trim();
    return { intent: 'setnixowner', args: [name], raw: name, isNatural: false };
  }

  // ── .nix <command> ────────────────────────────────────────────────────────
  if (lower.startsWith(NIX_PREFIX)) {
    raw = trimmed.slice(NIX_PREFIX.length).trim();
    isNatural = false;
  }
  // ── Natural language: "nix ..." ──────────────────────────────────────────
  else if (lower.startsWith('nix ')) {
    raw = trimmed.slice(4).trim();
    isNatural = true;
  } else {
    return null;
  }

  if (!raw) return { intent: 'menu', args: [], raw: '', isNatural };

  const parts = raw.split(/\s+/);
  const keyword = parts[0].toLowerCase();
  const args = parts.slice(1);

  // ── Natural language full-phrase matching (checked before keyword map) ────
  if (isNatural) {
    const nl = resolveNaturalLanguage(lower.slice(4)); // strip "nix "
    if (nl) return { intent: nl.intent, args: nl.args || args, raw, isNatural };
  }

  return { intent: resolveIntent(keyword, raw.toLowerCase(), args), args, raw, isNatural };
}

/**
 * Full natural-language phrase matching.
 * Called when the user says "Nix <phrase>" without a dot.
 */
function resolveNaturalLanguage(phrase) {
  const p = phrase.toLowerCase().trim();

  // ── AUTO-FEATURE TOGGLES (highest priority — owner-only system controls) ──
  // Detect on/off intent
  const wantsOn  = /\b(on|enable|turn\s+on|activate|start|begin|allow|switch\s+on)\b/.test(p);
  const wantsOff = /\b(off|disable|turn\s+off|deactivate|stop|kill|switch\s+off)\b/.test(p);
  const onOff = wantsOff ? false : (wantsOn ? true : undefined);

  if (/\b(auto[-\s]?view|view[-\s]?status|view\s+all\s+status(es)?|see\s+(my\s+)?status)\b/.test(p))
    return { intent: 'autoview', args: [onOff === false ? 'off' : 'on'] };
  if (/\b(auto[-\s]?like|auto[-\s]?react\s+status|like\s+(all\s+)?status(es)?)\b/.test(p))
    return { intent: 'autolike', args: [onOff === false ? 'off' : 'on'] };
  if (/\b(auto[-\s]?typing|typing\s+indicator|show\s+typing)\b/.test(p))
    return { intent: 'autotyping', args: [onOff === false ? 'off' : 'on'] };
  if (/\b(auto[-\s]?record(ing)?|recording\s+indicator|show\s+recording)\b/.test(p))
    return { intent: 'autorecording', args: [onOff === false ? 'off' : 'on'] };
  if (/\b(auto[-\s]?read|read\s+(all\s+)?(my\s+)?(messages?|chats?))\b/.test(p))
    return { intent: 'autoread', args: [onOff === false ? 'off' : 'on'] };
  if (/\b(auto[-\s]?bio|change\s+(my\s+)?bio\s+automatically)\b/.test(p))
    return { intent: 'autobio', args: [onOff === false ? 'off' : 'on'] };
  if (/\b(auto[-\s]?react|react\s+to\s+(all\s+)?messages?)\b/.test(p))
    return { intent: 'autoreact', args: [onOff === false ? 'off' : 'on'] };

  // ── Text / Chat a number ─────────────────────────────────────────────────
  if (/^(chat|text|message|msg|dm|send\s+(a\s+)?(msg|message|text)?|write\s+to|talk\s+to|reply\s+to|hit\s+up|ping)\s+(this\s+(number|contact|person|guy|girl|dude)|the\s+number|\d+|me|him|her|them)/.test(p))
    return { intent: 'textcontact' };
  if (/\b(send|text|chat|message|msg|dm|tell|reply)\b.{0,40}\b(this\s+number|that\s+number|the\s+number|number|contact|them|him|her)\b/.test(p))
    return { intent: 'textcontact' };

  // ── Add contact ──────────────────────────────────────────────────────────
  if (/^(add|save|store|keep)\s+(this\s+)?(number|contact|person|them|guy|girl|dude)/.test(p))
    return { intent: 'addcontact' };

  // ── Block / Unblock ──────────────────────────────────────────────────────
  if (/^(block|ban|stop)\s+(this\s+)?(number|contact|person|them|guy|girl|dude|user|him|her)/.test(p))
    return { intent: 'block' };
  if (/^(unblock|unban|allow)\s+(this\s+)?(number|contact|person|them|guy|girl|dude|user|him|her)/.test(p))
    return { intent: 'unblock' };

  // ── Forward / Send media ─────────────────────────────────────────────────
  if (/^(forward|send|share|relay)\s+(this|it|that|media|the\s+(message|msg|video|audio|image|photo|file))\s+(to|for|with)/.test(p))
    return { intent: 'forward' };

  // ── Delete message ───────────────────────────────────────────────────────
  if (/^(delete|remove|unsend|clear|erase)\s+(this|the|that|my)?\s*(message|msg|chat)/.test(p))
    return { intent: 'deletemsg' };

  // ── Count contacts ───────────────────────────────────────────────────────
  if (/(count|how\s+many|number\s+of|total)\s+(my\s+|all\s+)?contacts?/.test(p) || /how\s+many\s+(people|peeps|contacts)/.test(p))
    return { intent: 'contacts' };

  // ── Count groups ─────────────────────────────────────────────────────────
  if (/(count|how\s+many|number\s+of|total|list)\s+(my\s+|all\s+)?groups?/.test(p))
    return { intent: 'groups' };

  // ── Group open/close ─────────────────────────────────────────────────────
  if (/(close|lock|restrict|silence|mute\s+everyone)\s+(this\s+|the\s+)?group/.test(p))
    return { intent: 'closegroup' };
  if (/(open|unlock|allow\s+everyone|free)\s+(this\s+|the\s+)?group/.test(p))
    return { intent: 'opengroup' };

  // ── Tag everyone ─────────────────────────────────────────────────────────
  if (/(tag|mention|alert|wake)\s+(every(one|body)|all|the\s+group)/.test(p))
    return { intent: 'tagall' };

  // ── Group invite link ────────────────────────────────────────────────────
  if (/(get|give|show|share|fetch)\s+(the\s+|this\s+)?(group\s+)?(invite\s+)?link/.test(p))
    return { intent: 'groupinvite' };
  if (/(revoke|reset|change|new)\s+(the\s+|this\s+)?(group\s+)?(invite\s+)?link/.test(p))
    return { intent: 'revokelink' };

  // ── Leave group ──────────────────────────────────────────────────────────
  if (/^(leave|exit|quit)\s+(this\s+|the\s+)?group/.test(p))
    return { intent: 'leavegroup' };

  // ── Mute / Unmute chat ───────────────────────────────────────────────────
  if (/^mute\s+(this\s+|the\s+)?(chat|conversation|group)?/.test(p))
    return { intent: 'mutechat' };
  if (/^unmute\s+(this\s+|the\s+)?(chat|conversation|group)?/.test(p))
    return { intent: 'unmutechat' };

  // ── Download ─────────────────────────────────────────────────────────────
  if (/(download|grab|save|fetch|rip)\s+(this|the|that)\s+(video|audio|media|file|song|music)/.test(p))
    return { intent: 'download' };
  if (/^(get|fetch|dl|download)\s+https?:\/\//i.test(p))
    return { intent: 'download' };

  // ── Get details / info about a number ────────────────────────────────────
  if (/(get|show|give|tell\s+me|fetch|find)\s+(me\s+)?(the\s+)?(details|info|information|profile|stuff)\s+(about|on|for|of)/.test(p))
    return { intent: 'contactinfo' };

  // ── Profile picture ──────────────────────────────────────────────────────
  if (/(get|show|fetch|grab)\s+(the\s+|their\s+|this\s+person'?s?\s+)?(profile\s+)?(pic(ture)?|photo|pp|dp|avatar)/.test(p))
    return { intent: 'profile' };

  // ── Last seen / online ───────────────────────────────────────────────────
  if (/(when|what)\s+.{0,15}\s+(last\s+seen|seen\s+last)/.test(p))
    return { intent: 'lastseen' };
  if (/(is|are)\s+(this\s+person|they|he|she|them)\s+(online|active|on)/.test(p))
    return { intent: 'isonline' };

  // ── Fetch last media ─────────────────────────────────────────────────────
  if (/(fetch|get|show|find|give)\s+(my\s+|the\s+)?(last|recent|latest)\s+(media|video|audio|photo|image|file)/.test(p))
    return { intent: 'lastmedia' };

  // ── Status update ────────────────────────────────────────────────────────
  if (/(set|change|update)\s+(my\s+)?(bio|about|status)\s+(to\s+)?/.test(p))
    return { intent: 'setstatus' };
  if (/(clear|remove|empty|delete)\s+(my\s+)?(bio|about|status)/.test(p))
    return { intent: 'clearstatus' };

  // ── Summarize this / that ────────────────────────────────────────────────
  if (/(summarize|summarise|sum\s+up|tldr)\s+(this|the|that)\s+(chat|text|message|convo|conversation)?/.test(p))
    return { intent: 'summarize' };

  // ── Translate ────────────────────────────────────────────────────────────
  if (/^(translate|convert)\s+(this|the|that)?/.test(p))
    return { intent: 'translate' };

  // ── Weather ──────────────────────────────────────────────────────────────
  if (/(what'?s?\s+the\s+weather|weather\s+(in|for|at|like)|how'?s?\s+the\s+weather)/.test(p))
    return { intent: 'weather' };

  // ── Joke / Quote / Fact ──────────────────────────────────────────────────
  if (/(tell\s+(me\s+)?(a\s+)?joke|make\s+me\s+laugh|crack\s+(a\s+)?joke|something\s+funny)/.test(p))
    return { intent: 'joke' };
  if (/(give\s+(me\s+)?(a\s+)?quote|inspire\s+me|motivate\s+me|words\s+of\s+wisdom)/.test(p))
    return { intent: 'quote' };
  if (/(tell\s+(me\s+)?(a\s+)?fact|random\s+fact|fun\s+fact|did\s+you\s+know)/.test(p))
    return { intent: 'fact' };

  // ── Remind me / Note / Todo ──────────────────────────────────────────────
  if (/^(remind\s+me|set\s+(a\s+)?reminder)/.test(p))
    return { intent: 'remind' };
  if (/^(take\s+(a\s+)?note|note\s+(this|that)|jot\s+down)/.test(p))
    return { intent: 'note' };
  if (/^(add\s+(a\s+)?todo|new\s+task|add\s+task)/.test(p))
    return { intent: 'todo' };

  // ── System / Bot health ──────────────────────────────────────────────────
  if (/^(ping|are\s+you\s+(there|alive|up)|test)$/.test(p))
    return { intent: 'ping' };
  if (/(how\s+long\s+(have\s+you|been|up)|uptime|when\s+did\s+you\s+start)/.test(p))
    return { intent: 'uptime' };
  if (/(how\s+are\s+you|bot\s+health|system\s+(health|status)|are\s+you\s+okay)/.test(p))
    return { intent: 'health' };

  // ── AI chat ──────────────────────────────────────────────────────────────
  if (/^(what\s+is|what'?s|who\s+is|who'?s|explain|how\s+does|how\s+do|tell\s+me\s+about|why\s+(is|do|does)|when\s+(is|did|will)|where\s+(is|can|do))/.test(p))
    return { intent: 'aichat' };

  // ── Kick (natural) ───────────────────────────────────────────────────────
  if (/(kick|remove|boot|throw\s+out|get\s+rid\s+of)\s+(this\s+)?(person|member|user|them|him|her|guy|girl|dude)/.test(p))
    return { intent: 'kick' };

  // ── Promote / Demote ─────────────────────────────────────────────────────
  if (/(make|promote|set)\s+(this\s+)?(person|member|user|them|him|her)?\s*(an?\s+)?admin/.test(p))
    return { intent: 'promote' };
  if (/(remove|demote|take\s+away|strip)\s+(this\s+)?(person|member|user|their|him|her|them)?\s*admin/.test(p))
    return { intent: 'demote' };

  return null;
}

function resolveIntent(keyword, fullRaw, args) {
  const map = {
    // Meta
    'menu': 'menu',
    'help': args.length ? 'help' : 'menu',
    'hi': 'menu',
    'hello': 'menu',
    'hey': 'menu',

    // Account
    'contacts': 'contacts',
    'contact': 'contacts',
    'count': fullRaw.includes('contact') ? 'contacts' : fullRaw.includes('group') ? 'groups' : 'contacts',
    'groups': fullRaw.includes('close') ? 'closegroup' : fullRaw.includes('open') ? 'opengroup' : 'groups',
    'group': fullRaw.includes('close') ? 'closegroup' : fullRaw.includes('open') ? 'opengroup' : fullRaw.includes('stat') ? 'groupstats' : 'groups',
    'unread': 'unread',
    'report': 'accountreport',
    'analyze': 'accountreport',
    'analysis': 'accountreport',
    'blocked': 'blocked',
    'blocklist': 'blocked',
    'archived': 'archived',
    'status': fullRaw.includes('clear') || fullRaw.includes('remove') ? 'clearstatus' : 'setstatus',
    'setstatus': 'setstatus',
    'clearstatus': 'clearstatus',

    // Auto-features
    'autoview':      'autoview',
    'autolike':      'autolike',
    'autoreact':     'autoreact',
    'autotyping':    'autotyping',
    'autorecording': 'autorecording',
    'autoread':      'autoread',
    'autobio':       'autobio',
    'enable':  fullRaw.includes('autoview') ? 'autoview' : fullRaw.includes('autolike') ? 'autolike' : fullRaw.includes('autotyp') ? 'autotyping' : fullRaw.includes('autorec') ? 'autorecording' : fullRaw.includes('autoread') ? 'autoread' : fullRaw.includes('autobio') ? 'autobio' : fullRaw.includes('autoreact') ? 'autoreact' : 'unknown',
    'disable': fullRaw.includes('autoview') ? 'autoview' : fullRaw.includes('autolike') ? 'autolike' : fullRaw.includes('autotyp') ? 'autotyping' : fullRaw.includes('autorec') ? 'autorecording' : fullRaw.includes('autoread') ? 'autoread' : fullRaw.includes('autobio') ? 'autobio' : fullRaw.includes('autoreact') ? 'autoreact' : 'unknown',

    // Messaging
    'text': 'textcontact',
    'chat': fullRaw.includes('group') || !args.length ? 'aichat' : 'textcontact',
    'message': fullRaw.includes('count') ? 'msgcount' : 'textcontact',
    'msg': 'textcontact',
    'dm': 'textcontact',
    'send': fullRaw.includes('media') ? 'lastmedia' : fullRaw.includes('msg') ? 'textcontact' : 'textcontact',
    'forward': 'forward',
    'delete': fullRaw.includes('msg') || fullRaw.includes('message') ? 'deletemsg' : 'unknown',
    'unsend': 'deletemsg',

    // Contacts
    'add': fullRaw.includes('contact') || fullRaw.includes('number') ? 'addcontact' : 'addcontact',
    'addcontact': 'addcontact',
    'save': fullRaw.includes('contact') || fullRaw.includes('number') ? 'addcontact' : 'unknown',
    'block': 'block',
    'unblock': 'unblock',

    // Group management
    'kick': 'kick',
    'remove': fullRaw.includes('admin') ? 'demote' : 'kick',
    'ban': 'kick',
    'close': 'closegroup',
    'lock': 'closegroup',
    'open': 'opengroup',
    'unlock': 'opengroup',
    'mute': 'mutechat',
    'unmute': 'unmutechat',
    'promote': 'promote',
    'makeadmin': 'promote',
    'demote': 'demote',
    'removeadmin': 'demote',
    'tagall': 'tagall',
    'tag': 'tagall',
    'everyone': 'tagall',
    'invite': 'groupinvite',
    'link': 'groupinvite',
    'getlink': 'groupinvite',
    'revoke': 'revokelink',
    'groupstats': 'groupstats',
    'active': 'activegroups',
    'activegroups': 'activegroups',
    'inactive': 'inactivegroups',
    'inactivegroups': 'inactivegroups',
    'members': 'members',
    'participants': 'members',
    'groupsummary': 'groupsummary',
    'summary': fullRaw.includes('group') ? 'groupsummary' : 'summarize',
    'leave': 'leavegroup',

    // AI
    'ai': 'aichat',
    'ask': 'aichat',
    'gpt': 'aichat',
    'say': 'aichat',
    'tell': 'aichat',
    'reply': 'aichat',
    'summarize': 'summarize',
    'sum': 'summarize',
    'rewrite': 'rewrite',
    'rephrase': 'rewrite',
    'translate': 'translate',
    'explain': 'explain',
    'poem': 'poem',
    'poetry': 'poem',
    'story': 'story',
    'write': fullRaw.includes('code') ? 'code' : fullRaw.includes('poem') ? 'poem' : fullRaw.includes('story') ? 'story' : 'rewrite',
    'code': 'code',
    'fix': 'fixcode',
    'debug': 'fixcode',
    'roast': 'roast',
    'define': 'define',
    'meaning': 'define',
    'synonym': 'synonym',
    'synonyms': 'synonym',
    'joke': 'joke',
    'jokes': 'joke',
    'quote': 'quote',
    'inspire': 'quote',
    'motivate': 'quote',
    'fact': 'fact',
    'facts': 'fact',

    // Media
    'download': 'download',
    'dl': 'download',
    'sticker': 'sticker',
    'gif': 'gif',
    'meme': 'meme',
    'viewonce': 'viewonce',
    'view': 'viewonce',
    'saveviewonce': 'saveviewonce',
    'lastmedia': 'lastmedia',
    'media': fullRaw.includes('last') ? 'lastmedia' : fullRaw.includes('from') ? 'mediafrom' : fullRaw.includes('sent') ? 'mediasent' : 'lastmedia',
    'fetch': fullRaw.includes('media') ? 'lastmedia' : fullRaw.includes('msg') || fullRaw.includes('message') ? 'lastmsg' : 'lastmedia',
    'get': fullRaw.includes('media') ? 'lastmedia' : fullRaw.includes('detail') ? 'contactinfo' : fullRaw.includes('msg') ? 'lastmsg' : 'contactinfo',

    // System
    'uptime': 'uptime',
    'up': 'uptime',
    'ping': 'ping',
    'speed': 'ping',
    'health': 'health',
    'status?': 'health',
    'logs': 'logs',
    'log': 'logs',
    'version': 'version',
    'stats': 'nixstats',
    'reset': 'nixreset',
    'restart': 'nixreset',

    // Info / Web
    'weather': 'weather',
    'news': 'news',
    'wiki': 'wiki',
    'wikipedia': 'wiki',
    'search': 'search',
    'calculate': 'calculate',
    'calc': 'calculate',
    'math': 'calculate',
    'ip': 'myip',
    'myip': 'myip',

    // Productivity
    'note': 'note',
    'notes': 'viewnotes',
    'viewnotes': 'viewnotes',
    'todo': 'todo',
    'todos': 'viewtodos',
    'viewtodos': 'viewtodos',
    'task': 'todo',
    'tasks': 'viewtodos',
    'remind': 'remind',
    'reminder': 'remind',
    'remindme': 'remind',

    // Contact Intelligence
    'profile': 'profile',
    'pic': 'profile',
    'photo': 'profile',
    'picture': 'profile',
    'pp': 'profile',
    'about': 'contactabout',
    'bio': 'contactabout',
    'lastseen': 'lastseen',
    'seen': 'lastseen',
    'online': 'isonline',
    'isonline': 'isonline',
    'contactinfo': 'contactinfo',
    'info': fullRaw.includes('contact') || fullRaw.includes('number') ? 'contactinfo' : 'health',
    'details': 'contactinfo',
    'number': 'contactinfo',
    'lastmsg': 'lastmsg',
    'firstmsg': 'firstmsg',
    'msgcount': 'msgcount',
    'messages': 'msgcount',
    'searchmsg': 'searchmsg',
    'deleted': 'deletedmsg',
    'edited': 'editedmsg',
    'lastcall': 'lastcall',
    'missedcalls': 'missedcalls',
    'missed': 'missedcalls',
    'callhistory': 'callhistory',
    'mostactive': 'mostactive',
    'leastactive': 'leastactive',
    'chatreport': 'chatreport',
    'response': 'responsetime',
    'streak': 'streak',
    'lastdoc': 'lastdoc',
    'document': 'lastdoc',
    'finddoc': 'finddoc',
  };

  // ── New system intents (sessions/diagnose/repair/cleanup) ─────────────
  map['sessions']  = 'sessions';
  map['session']   = 'sessions';
  map['diagnose']  = 'diagnose';
  map['diag']      = 'diagnose';
  map['repair']    = 'repair';
  map['cleanup']   = 'cleanup';
  map['clean']     = 'cleanup';

    return map[keyword] || 'unknown';
}
