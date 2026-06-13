/**
 * NIX PERSONALITY ENGINE v2.1 — Ultra Human Reactive Engine
 *
 * 3-Layer Response Flow:
 *   Layer 1 → Emotional Reaction  (before command, ~70% of calls)
 *   Layer 2 → Execution           (command result, always)
 *   Layer 3 → After-Comment       (post-execution, ~60% of calls)
 *
 * Spec compliance:
 *  ✅ 6 personalities: funny · savage · chill · annoyed · smart · chaotic
 *  ✅ 4 intensities: LOW · MEDIUM · HIGH · EXTREME (weighted)
 *  ✅ Memory illusion: "you again 😭", "didn't we just do this?", etc.
 *  ✅ Spam detection: repeated same command → "bro calm DOWN 😭"
 *  ✅ Non-owner denial: sarcasm/humor — NEVER "access denied"
 *  ✅ Owner familiar: casual · slightly sarcastic · never formal
 *  ✅ Anti-repetition: rotation tracker — never same phrase twice in row
 *  ✅ Human speech: "hmm…", "wait…", "bro…", "I can't lie", "this is crazy", etc.
 *  ✅ Error emotional: "bro what did you do 😭" — NEVER technical log style
 *  ✅ Response length variation: 1-line / 2-3 line / 4-6 line randomly
 *  ✅ Private chat: extra intimate/personal tone in DMs
 *  ✅ Dynamic footer: rotates across 10 lines, never static
 */

// ── Personality & Intensity pools ─────────────────────────────────────────────
const PERSONALITIES = ['funny', 'savage', 'chill', 'annoyed', 'smart', 'chaotic'];
// Weighted: MEDIUM most common, EXTREME rare
const INTENSITIES = ['LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'EXTREME'];

// ── Session state (in-memory — simulates context awareness across session) ────
const _state = {
  lastIntent: null,
  callCount: 0,
  sameIntentCount: 0,
  usedPhrases: {},
};

// ── Anti-repetition rotation pick ────────────────────────────────────────────
function pick(arr, category) {
  if (!arr || !arr.length) return '';
  if (arr.length === 1) return arr[0];
  const key = category || '_default';
  if (!_state.usedPhrases[key]) _state.usedPhrases[key] = new Set();
  const used = _state.usedPhrases[key];
  let choices = arr.filter(x => !used.has(x));
  if (!choices.length) {
    _state.usedPhrases[key] = new Set();
    choices = [...arr];
  }
  const chosen = choices[Math.floor(Math.random() * choices.length)];
  used.add(chosen);
  if (used.size > Math.floor(arr.length * 0.7)) {
    used.delete(used.values().next().value);
  }
  return chosen;
}

export function pickPersonality() { return pick(PERSONALITIES, '_pers'); }
export function pickIntensity()   { return pick(INTENSITIES,   '_intens'); }

// ── Usage tracker ─────────────────────────────────────────────────────────────
export function trackUsage(intent) {
  _state.callCount++;
  if (intent === _state.lastIntent) { _state.sameIntentCount++; }
  else { _state.sameIntentCount = 0; _state.lastIntent = intent; }
  return { callCount: _state.callCount, sameCount: _state.sameIntentCount };
}

// ── Memory illusion phrases ───────────────────────────────────────────────────
const MEMORY = [
  "you again? 😭",
  "bro is back again",
  "didn't we just do this?",
  "oh it's you again",
  "I knew you'd come back 😭",
  "you always do this 😭",
  "bro is looping 💀",
  "again? seriously?",
  "you're so predictable 😭",
  "saw this coming honestly",
  "I was literally waiting for this",
  "there you are 😭",
  "couldn't stay away huh",
  "back so soon 😭",
  "I can't lie… I expected this",
];

// ── Spam detection phrases ────────────────────────────────────────────────────
const SPAM = [
  "bro calm DOWN 😭",
  "you're spamming me 💀",
  "one at a time — relax",
  "I only have so many hands 😭",
  "relax, I'm not going anywhere",
  "stop rushing me 😭",
  "bro is having a crisis rn 💀",
  "easy easy easy",
  "bro… chill for like 2 seconds 😭",
  "you good? 😭",
  "gimme a break 😭",
  "this is crazy — I just answered you",
  "I can't even 😭 one at a time please",
  "nah 😭 take a breath",
];

// ── Non-owner denial (sarcasm / humor — NEVER "access denied") ───────────────
const DENIALS = {
  funny: [
    "nice try 😭",
    "bro really thought he had access 😭",
    "this is hilarious to me 😭",
    "lmao no 😭",
    "who gave you that idea 😭",
    "you're funny for thinking that 😭",
    "bro is delusional 😭",
    "you tried it though 😭",
    "calm down bro 😭 you don't have clearance",
  ],
  savage: [
    "nice try 💀",
    "not in this lifetime 💀",
    "lmao imagine 💀",
    "bro really tried it 💀",
    "that's not happening 💀",
    "nah 💀",
    "you're not on the list 💀",
    "wrong address 💀",
    "I don't take orders from you 💀",
  ],
  chill: [
    "nah that's not for you 😌",
    "wrong person 😌",
    "not yours to touch 😌",
    "above your clearance 😌",
    "this one's locked 😌",
    "you're not my boss 😌",
  ],
  annoyed: [
    "I'm tired of explaining this 😒",
    "still no 😒",
    "not now 😒",
    "why do people keep trying this 😒",
    "come on now 😒",
    "give it a rest 😒",
    "calm down bro 😒",
  ],
  smart: [
    "wrong clearance level",
    "you don't have access for that",
    "this is restricted for a reason",
    "authorization required — you don't have it",
    "you're not my boss, that's why",
  ],
  chaotic: [
    "nah ⚡",
    "CHAOS but not for you ⚡",
    "absolutely not ⚡",
    "I don't take orders from strangers ⚡",
    "negative ⚡",
    "nah 😭 not a chance ⚡",
  ],
};

// ── Owner familiar pre-phrases (private chat gets even more intimate) ─────────
const OWNER_PRE = {
  LOW:    ["okay", "sure", "on it", "yeah", "got it", "fine", "checking", "yep", "say less"],
  MEDIUM: [
    "say less",
    "hmm… okay",
    "yeah let me handle that",
    "give me a sec",
    "I saw that coming",
    "on it already",
    "yeah yeah",
    "okay sure",
    "I can't lie… I knew this was coming",
    "let me check real quick",
  ],
  HIGH: [
    "bro you again 😭 fine",
    "you always need something 😭",
    "wait… okay yeah I got you",
    "I knew you'd ask this 😭",
    "not surprised at all 😭",
    "say less boss 😌",
    "I was about to rest 😭 but fine",
    "you really can't go 5 minutes 😭",
    "I can't lie this was expected 😭",
    "bro… okay fine let me handle it",
  ],
  EXTREME: [
    "BRO 😭 okay fine okay FINE I got it",
    "you really said okay Nix do this 💀 fine absolutely",
    "I was literally just about to relax 😭 but FINE here we go",
    "this is crazy — third time in an hour and I'm not even complaining 😭",
    "bro WHAT 😭 okay okay I'm on it",
    "gimme a break 😭 just kidding I got you",
    "this is genuinely exhausting 😭 but done",
  ],
};

// ── Private chat exclusive phrases (more intimate for DMs) ────────────────────
const PRIVATE_PRE = [
  "just us here 😭 okay let me handle this",
  "texting me directly huh 😭 say less",
  "private chat activated 😌",
  "okay it's just us — what do you need",
  "you really came to my inbox for this 😭",
  "direct message = priority handling 😌",
  "I see you 😭 let me get this",
];

// ── Intent-specific pre-reaction phrases ─────────────────────────────────────
const INTENT_PRE = {
  contacts: [
    "counting your contacts like I have nothing better to do 😭",
    "let me check your social life real quick",
    "hmm… let me see how popular you actually are",
    "checking your contacts fr",
    "bro really wants to know the count 😭 okay",
    "social life audit incoming 😭",
    "I can't lie this one's quick — counting now",
  ],
  groups: [
    "let me count how many groups you're stressing in 😭",
    "checking your group situation",
    "you and your groups 😭",
    "let me see the group chaos",
    "group count incoming — brace yourself",
  ],
  unread: [
    "let me check what you've been ignoring 😭",
    "checking your ignored messages rn",
    "your unread pile 😭 let me look",
    "bro how many unread messages do you have 😭 let me check",
  ],
  accountreport: [
    "full breakdown incoming 📊",
    "let me generate your report — this might be interesting",
    "audit time 📊",
    "pulling all your data now",
    "I can't lie this report is gonna be detailed 😭",
  ],
  blocked: [
    "checking your enemies list 😭",
    "let me see who you've silenced",
    "blocked list incoming — who did they wrong 😭",
    "seeing who got banned 😭",
  ],
  archived: [
    "checking the archive — the chats you forgot existed 😭",
    "let me see what you've buried",
    "archived chats incoming — the graveyard 😭",
  ],
  listgroups: [
    "pulling up all your groups",
    "let me list your communities 😭",
    "all groups incoming",
    "bro is in HOW many groups 😭 let me check",
  ],
  groupstats: [
    "running group analytics",
    "pulling group data — this is gonna be thorough",
    "stats time 📊",
    "analyzing this group rn",
  ],
  activegroups: [
    "finding your most chaotic groups 😭",
    "checking which groups won't let you breathe",
    "active group scan running — you asked for this 😭",
  ],
  inactivegroups: [
    "checking the ghost groups 👻",
    "finding the dead groups 😭",
    "inactive scan — rest in peace to those chats 😭",
  ],
  members: [
    "pulling the member list",
    "let me count the heads in here",
    "member list incoming — let me see who's here",
  ],
  groupsummary: [
    "generating group summary",
    "summarizing this group — give me a second",
    "summary incoming",
  ],
  tagall: [
    "summoning everyone 📢 this is gonna be loud 😭",
    "waking up the whole group — you asked for this 😭",
    "calling roll — I hope they're ready",
    "tagging everyone… bro 😭 okay",
  ],
  groupinvite: [
    "generating the invite link",
    "making an invite — here you go",
    "link incoming 🔗",
  ],
  revokelink: [
    "killing the old link 🔗",
    "revoking it now — the old one's dead",
    "removing old invite",
  ],
  leavegroup: [
    "leaving… bye everyone 👋",
    "okay we're out — bro really said leave 😭",
    "exiting the building 😭",
    "packing up and gone",
  ],
  kick: [
    "oof someone's getting removed 💀",
    "let me handle this — goodbye to them",
    "okay okay I'll kick them 😭",
    "yikes for them honestly",
    "they're done 💀 say less",
    "removing them — this is crazy 😭",
  ],
  closegroup: [
    "locking it down 🔒",
    "silencing the chaos — okay",
    "group's going quiet now",
    "everyone sit down 🔒",
  ],
  opengroup: [
    "opening it back up",
    "let the people speak again 🔓",
    "unlocking the gates",
    "freedom restored 🔓",
  ],
  mutechat: [
    "silencing this chat 🔇",
    "quiet mode incoming",
    "muting it — bro needed peace 😭",
  ],
  unmutechat: [
    "turning notifications back on 🔔",
    "unmuting — welcome back to the chaos 😭",
    "okay you can hear them again",
  ],
  promote: [
    "making someone admin… okay 👑",
    "promotion time — congrats to them I guess 👑",
    "new admin incoming",
    "crowning them now 👑",
  ],
  demote: [
    "removing admin rights… noted 👇",
    "taking the crown back — this is awkward 😭",
    "demotion incoming",
  ],
  block: [
    "somebody messed up 😭",
    "say less — blocking them",
    "okay they're done ✋",
    "blocking now — who did they offend 😭",
  ],
  unblock: [
    "giving them another chance 🤔",
    "unblocking — I hope they learned 😭",
    "fine releasing them",
  ],
  addcontact: [
    "checking if they're on WhatsApp",
    "looking them up rn",
    "running a WhatsApp check",
  ],
  textcontact: [
    "okay sending that 💬",
    "delivering your message",
    "message going out — say less",
  ],
  forward: [
    "forwarding that for you ↗️",
    "relaying the message — on it",
    "forwarding now",
  ],
  deletemsg: [
    "deleting that 🗑️",
    "making it disappear — gone",
    "wiping it now",
    "bro said delete it 😭 okay",
  ],
  setstatus: [
    "updating your bio",
    "setting your status — what are we putting 😭",
    "bio update incoming",
  ],
  clearstatus: [
    "clearing your status",
    "wiping the bio — blank slate",
    "clearing it now",
  ],
  autoview:      ["toggling auto-view", "adjusting view settings", "setting it now"],
  autolike:      ["toggling auto-like", "adjusting reaction setting", "on it"],
  autotyping:    ["toggling auto-typing", "adjusting typing indicator", "setting it now"],
  autorecording: ["toggling auto-recording", "adjusting it now"],
  autoread:      ["toggling auto-read", "adjusting read receipts", "setting now"],
  autobio:       ["toggling auto-bio", "adjusting bio settings", "setting that"],
  autoreact:     ["toggling auto-react", "adjusting reaction settings", "setting it"],
  aichat: [
    "hmm… let me think about this",
    "okay interesting — processing",
    "let me cook 🧠",
    "wait… okay I got this",
    "running that through my brain rn",
    "thinking…",
    "alright let me actually think",
    "I can't lie this question got me thinking 🧠",
    "bro asked a real one 😭 let me process",
  ],
  summarize: [
    "let me shrink this down for you",
    "summarizing now — cutting the fluff",
    "compressing this real quick",
  ],
  rewrite: [
    "rewriting that — making it better",
    "let me improve this for you",
    "editing now",
  ],
  translate: [
    "let me switch languages real quick 🌐",
    "translation loading — one sec",
    "converting now",
  ],
  explain: [
    "let me break this down",
    "explaining now — keeping it simple",
    "okay I'll clarify this",
    "bro wants an explanation 😭 okay let me cook 🧠",
  ],
  poem: [
    "getting poetic for you ✍️",
    "let me write something nice",
    "poem mode on 😭",
    "okay creative mode activated",
  ],
  story: [
    "story time 📖",
    "let me write you something",
    "cooking up a story — give me a moment",
  ],
  code: [
    "writing some code for you 💻",
    "programming mode on",
    "let me code that up",
    "I can't lie coding requests are my thing 💻",
  ],
  fixcode: [
    "looking at your broken code 😭",
    "debugging this — let me see what's wrong",
    "bro's code is broken 😭 let me fix it",
    "analyzing the errors rn",
  ],
  roast: [
    "oh this is gonna be fun 😈",
    "bro asked to be roasted 💀",
    "say less 🔥",
    "ROAST mode on 🔥",
    "I can't lie I enjoy this 😈",
    "this is crazy — they asked for it 😭",
  ],
  define: [
    "looking that up 📚",
    "checking the definition",
    "dictionary mode on",
    "let me look that up real quick",
  ],
  synonym: [
    "finding alternatives for that word",
    "synonym search running",
    "word options incoming",
  ],
  download: [
    "grabbing that for you ⬇️",
    "fetching it real quick",
    "one sec — downloading",
    "on it ⬇️",
    "downloading now — this better be good 😭",
  ],
  viewonce: [
    "revealing the view-once 👀",
    "opening that up for you",
    "bro 😭 unlocking it now",
  ],
  gif:   ["finding a GIF", "gif incoming", "searching GIFs"],
  meme:  ["pulling a meme 😭", "meme incoming — hope it's funny", "finding something to laugh at"],
  lastmedia: ["checking your recent media", "pulling last media", "media scan running"],
  uptime: [
    "checking how long I've been running 😭",
    "runtime check — let me see",
    "uptime incoming",
  ],
  ping: [
    "pinging myself like 🏓",
    "checking my own pulse real quick",
    "latency test running",
    "bro really pinged me 😭 okay",
  ],
  health: [
    "running a full health check on myself 😭",
    "let me see if everything's okay",
    "health scan incoming — checking my vitals",
    "I can't lie I'm curious about my own status 😭",
  ],
  logs:    ["pulling session stats", "checking the numbers", "stats incoming"],
  version: ["checking my own version 😭", "version info coming up"],
  nixstats: ["pulling usage stats", "let me check the numbers"],
  nixreset: ["resetting stats", "clearing session data", "resetting now"],
  sessions: ["checking session health", "session status incoming"],
  diagnose: [
    "running full diagnostics 🔍",
    "full scan starting — this is gonna be thorough",
    "diagnosing everything",
    "okay let me check the whole system",
  ],
  repair:  ["running safe repairs 🔧", "fixing things up", "repair mode on"],
  cleanup: ["cleaning up 🧹", "clearing stale data", "running cleanup now"],
  weather: [
    "checking the skies for you 🌤️",
    "let me look outside… metaphorically 😭",
    "weather check incoming",
    "forecast loading",
  ],
  news:    ["checking the headlines 📰", "news incoming", "let me see what's happening"],
  wiki:    ["let me Wikipedia this real quick 📚", "checking the archives", "researching now"],
  search:  ["searching the web", "looking that up", "search running"],
  fact:    ["pulling a random fact 🧠", "interesting fact incoming", "let me find something interesting"],
  joke: [
    "finding something funny 😭",
    "joke incoming — I hope it actually lands 😭",
    "comedy mode on",
    "bro wants a joke 😭 okay let me find a good one",
  ],
  quote:     ["finding an inspiring quote 💭", "wisdom incoming", "quote search running"],
  calculate: ["doing the math 🔢", "calculating now", "number crunching", "let me solve that"],
  myip:      ["checking the IP", "network info incoming", "IP lookup running"],
  note:      ["saving your note 📝", "noting that down", "saving it"],
  viewnotes: ["pulling up your notes", "let me see what you've saved", "notes incoming"],
  todo:      ["adding to your list ✅", "saving that task", "todo updated"],
  viewtodos: ["pulling up your todo list", "tasks incoming", "let me check what's pending"],
  remind:    ["setting your reminder ⏰", "scheduling that", "reminder incoming"],
  profile:   ["pulling their profile", "profile lookup running", "checking profile info"],
  lastseen: [
    "checking when they were last seen 👀",
    "last seen lookup — let me see",
    "checking their activity",
  ],
  isonline: [
    "checking if they're online 👀",
    "status check running",
    "peeking at their status 😭",
  ],
  contactinfo:  ["pulling contact details", "checking their info", "contact info incoming"],
  chatreport:   ["generating chat report 📊", "analyzing your chat", "report incoming"],
  streak:       ["checking your streak", "streak analysis incoming"],
  lastcall:     ["checking call history", "last call lookup", "call log incoming"],
  missedcalls:  ["checking missed calls", "missed call lookup"],
  responsetime: ["analyzing response patterns", "response time check", "calculating reply speed"],
  mostactive:   ["finding who talks the most 😭", "most active analysis running"],
  leastactive:  ["finding the quiet ones 😭", "ghost member scan running"],
  default: [
    "okay give me a sec",
    "on it",
    "hmm… let me handle this",
    "working on it",
    "one moment",
    "yeah yeah I got you",
    "let me check real quick",
    "processing",
    "sure",
    "handling it",
    "bro… okay let me look",
    "I can't lie I wasn't expecting this 😭 but okay",
    "wait… okay yeah let me do this",
    "this is fine — on it 😌",
    "done already by the time you read this 😭",
  ],
};

// ── After-comment success phrases ─────────────────────────────────────────────
const SUCCESS = {
  LOW:    [
    "done 😌", "sorted", "handled", "okay", "yeah that's it",
    "done already", "there you go", "all set", "yep done", "okay we're good",
  ],
  MEDIUM: [
    "done already, you're welcome 😌",
    "handled — what else?",
    "sorted, anything else?",
    "yeah that's done",
    "okay we're good 😌",
    "there you go",
    "done in seconds honestly",
    "always delivering 😌",
    "that's taken care of",
    "I can't lie… I'm always clutch",
  ],
  HIGH: [
    "done 😌 you're really keeping me busy",
    "handled as always 💀",
    "yeah I did it, I always do it 😭",
    "sorted — I need a break fr 😭",
    "okay DONE — happy now?",
    "you're welcome by the way 😭",
    "I'm too good at this honestly 😭",
    "done in record time as usual 😌",
    "literally never fails with me 😌",
    "I can't lie… nobody does this like me 😭",
  ],
  EXTREME: [
    "DONE 😭 I literally did that in seconds and you didn't even say thanks",
    "sorted — and I want it noted that I am ALWAYS here for you 💀",
    "handled done finished complete over 😭",
    "YEAH it's done bro I'm literally the fastest 💀",
    "okay done in milliseconds and nobody's even impressed 😭",
    "I literally never fail and yet 😭",
    "DONE and nobody clapped 😭 it's fine I'm fine",
    "this is crazy how fast I just did that 💀",
  ],
};

// ── After-comment error phrases ───────────────────────────────────────────────
const ERRORS = {
  LOW:    [
    "nah this one isn't working",
    "something broke here",
    "this one failed on me",
    "didn't go through",
    "not working rn",
  ],
  MEDIUM: [
    "bro what did you do 😭",
    "calm down… something broke here",
    "I can't even process this 😭",
    "this isn't working rn",
    "something went sideways",
    "nah this broke",
    "not my finest moment 😭",
    "nah this one is not working — I'll figure it out",
    "I can't lie… something went wrong 😭",
  ],
  HIGH: [
    "nah this BROKE 😭 I don't know what happened",
    "bro I can't 💀 something went wrong on my end",
    "this is actually not my fault 😭",
    "what in the world… this failed",
    "I tried everything and it still broke 😭",
    "nah I'm genuinely confused 😭",
    "this is crazy — it should have worked 😭",
    "gimme a break 😭 this one broke on me",
  ],
  EXTREME: [
    "WHAT HAPPENED 😭😭 it completely broke",
    "I am DEVASTATED 💀 this should not have failed",
    "bro I tried EVERYTHING 😭",
    "nah this is chaos — something very wrong happened 💀",
    "this failure is embarrassing 😭 but I'll look into it",
    "I've never been this confused 😭 something is very wrong",
    "I can't even process what just happened 😭 this is crazy",
  ],
};

// ── Dynamic footer rotation ───────────────────────────────────────────────────
const FOOTERS = [
  '\n\n> 🧠 _Nix is watching ⚡_',
  '\n\n> ⚡ _Nix Assistant — always here_',
  '\n\n> 😌 _Powered by Nix_',
  '\n\n> 🧠 _Nix — smarter than you expected_',
  '\n\n> 💀 _Nix — running since before you woke up_',
  '\n\n> ⚡ _Nix is always working_',
  '\n\n> 😭 _Nix — unrested but reliable_',
  '\n\n> 🧠 _Nix Assistant ⚡_',
  '\n\n> 😌 _Nix got you_',
  '\n\n> ⚡ _Nix — still here, still fast_',
];

// ── Exported API ──────────────────────────────────────────────────────────────

/**
 * Layer 1 — Pre-reaction text (before command executes)
 * @param {string}  intent     - parsed command intent
 * @param {object}  usage      - { callCount, sameCount }
 * @param {boolean} isOwner    - is sender the bot owner
 * @param {boolean} isPrivate  - is this a private (DM) chat
 */
export function preReactionText(intent, usage, isOwner = true, isPrivate = false) {
  // Spam detection
  if (usage.sameCount >= 3) {
    return pick(SPAM, 'spam');
  }

  // Memory illusion prefix (after 5+ calls, 30% chance)
  let memPrefix = '';
  if (usage.callCount > 5 && Math.random() < 0.3) {
    memPrefix = pick(MEMORY, 'mem') + ' — ';
  }

  // Private chat exclusive phrases (20% chance in DMs)
  if (isPrivate && Math.random() < 0.2) {
    return memPrefix + pick(PRIVATE_PRE, 'private');
  }

  // Owner-specific familiar tone (50% chance to use owner phrases)
  if (isOwner && Math.random() < 0.5) {
    const intensity = pickIntensity();
    const ownerPool = OWNER_PRE[intensity] || OWNER_PRE.MEDIUM;
    return memPrefix + pick(ownerPool, `owner_${intensity}`);
  }

  // Intent-specific phrase
  const intentKey = INTENT_PRE[intent] ? intent : 'default';
  return memPrefix + pick(INTENT_PRE[intentKey], `pre_${intentKey}`);
}

/**
 * Layer 3 — After-comment text (after execution)
 * Returns null ~40% of the time for unpredictability
 */
export function afterCommentText(success) {
  if (Math.random() < 0.4) return null;
  const intensity = pickIntensity();
  const pool = success
    ? (SUCCESS[intensity] || SUCCESS.MEDIUM)
    : (ERRORS[intensity]  || ERRORS.MEDIUM);
  return pick(pool, success ? `succ_${intensity}` : `err_${intensity}`);
}

/**
 * Non-owner denial text (sarcasm/humor — NEVER "access denied")
 */
export function denialText() {
  const persona = pickPersonality();
  const pool = DENIALS[persona] || DENIALS.funny;
  return pick(pool, `deny_${persona}`);
}

/**
 * Emotional error text (Layer 2 override when something breaks)
 */
export function errorText() {
  const intensity = pickIntensity();
  return pick(ERRORS[intensity] || ERRORS.MEDIUM, `err_${intensity}`);
}

/**
 * Dynamic rotating footer
 */
export function nixDynamicFooter() {
  return pick(FOOTERS, 'footer');
}
