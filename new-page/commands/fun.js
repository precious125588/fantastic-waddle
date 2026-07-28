import { randomJoke, randomQuote, getTrivia } from '../lib/api.js';

const ROASTS = [
  "You're like a cloud — when you disappear, it's a beautiful day! ☁️",
  "I'd roast you but my mama said I'm not allowed to burn trash 🔥",
  "You're the reason they put instructions on shampoo bottles 🧴",
  "I'd agree with you but then we'd both be wrong 😂",
  "You're not stupid; you just have bad luck thinking 🧠",
  "Some people bring happiness wherever they go; you bring it whenever you go 🚪",
  "You're proof that even God makes mistakes sometimes 😇",
  "If ignorance is bliss, you must be the happiest person alive 😊",
];

const COMPLIMENTS = [
  "You light up every room you enter! ✨",
  "Your smile is absolutely contagious! 😊",
  "You have an incredible way of making people feel special 💫",
  "You're stronger than you think 💪",
  "Your kindness inspires everyone around you 🌟",
  "You make the world a better place just by being in it 🌍",
  "You're incredibly talented and gifted 🎯",
  "Your positive energy is absolutely magnetic! 🧲",
];

const TRUTHS = [
  "What is your biggest fear?",
  "What is your most embarrassing moment?",
  "Have you ever lied to your best friend?",
  "What is the last thing you Googled?",
  "Have you ever cheated on a test?",
  "What is your biggest insecurity?",
  "Who was your first crush?",
  "What is the most childish thing you still do?",
];

const DARES = [
  "Send a voice note saying 'I love you' to the last person you texted",
  "Change your profile picture to a funny face for 1 hour",
  "Send a text message in a different language",
  "Post a status saying 'I'm a chicken'",
  "Do 10 pushups right now",
  "Speak only in rhymes for the next 2 minutes",
  "Send the 3rd photo in your gallery to this chat",
  "Tell a joke out loud right now",
];

const WYR = [
  "Would you rather be able to fly OR be invisible?",
  "Would you rather never use social media again OR never watch TV again?",
  "Would you rather be always hot OR always cold?",
  "Would you rather lose your phone OR your wallet?",
  "Would you rather speak every language OR play every instrument?",
  "Would you rather live in space OR under the ocean?",
  "Would you rather have super strength OR super speed?",
  "Would you rather never sleep again OR never eat again?",
];

const RIDDLES = [
  { q: "What has keys but no locks, and space but no room?", a: "A keyboard" },
  { q: "I speak without a mouth and hear without ears. What am I?", a: "An echo" },
  { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps" },
  { q: "What has hands but can't clap?", a: "A clock" },
  { q: "What gets wetter as it dries?", a: "A towel" },
  { q: "I have cities but no houses live there. What am I?", a: "A map" },
  { q: "What can travel around the world while staying in a corner?", a: "A stamp" },
];

const EIGHTBALL = [
  "It is certain ✅", "It is decidedly so ✅", "Without a doubt ✅",
  "Yes definitely ✅", "You may rely on it ✅", "As I see it, yes ✅",
  "Most likely ✅", "Outlook good ✅", "Signs point to yes ✅",
  "Reply hazy, try again 🌫", "Ask again later ⏳", "Better not tell you now 🤫",
  "Cannot predict now 🔮", "Concentrate and ask again 🧘",
  "Don't count on it ❌", "My reply is no ❌", "My sources say no ❌",
  "Outlook not so good ❌", "Very doubtful ❌",
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export async function handleFun(sock, msg, { command, args, jid, sender, text, reply, mentionedJids }) {
  switch (command) {

    case 'joke': {
      const res = await randomJoke();
      await reply(`😂 *JOKE*\n━━━━━━━━━━━━━━\n${res.setup}\n\n_${res.punchline}_ 😄`);
      break;
    }

    case 'quote': {
      const res = await randomQuote();
      await reply(`💬 *QUOTE*\n━━━━━━━━━━━━━━\n_"${res.quote}"_\n\n— *${res.author}*`);
      break;
    }

    case 'roast': {
      const target = mentionedJids[0] ? `@${mentionedJids[0].split('@')[0]}` : (text || 'you');
      await sock.sendMessage(jid, {
        text: `🔥 *ROAST*\n━━━━━━━━━━━━━━\n${target}, ${rand(ROASTS)}`,
        mentions: mentionedJids,
      });
      break;
    }

    case 'compliment': {
      const target = mentionedJids[0] ? `@${mentionedJids[0].split('@')[0]}` : (text || 'you');
      await sock.sendMessage(jid, {
        text: `💝 *COMPLIMENT*\n━━━━━━━━━━━━━━\n${target}, ${rand(COMPLIMENTS)}`,
        mentions: mentionedJids,
      });
      break;
    }

    case 'ship': {
      if (mentionedJids.length < 2) return reply('❌ Tag 2 people: .ship @person1 @person2');
      const [a, b] = mentionedJids;
      const pct = Math.floor(Math.random() * 101);
      const hearts = '❤️'.repeat(Math.floor(pct / 20));
      const empties = '🖤'.repeat(5 - Math.floor(pct / 20));
      await sock.sendMessage(jid, {
        text:
          `💕 *SHIP*\n━━━━━━━━━━━━━━\n` +
          `@${a.split('@')[0]} ❤️ @${b.split('@')[0]}\n\n` +
          `${hearts}${empties}\n\n` +
          `💘 Compatibility: *${pct}%*\n\n` +
          `${pct >= 80 ? '🔥 Perfect match!' : pct >= 50 ? '😊 Pretty good!' : pct >= 30 ? '🤔 Could work...' : '💔 Hmm...'}`,
        mentions: [a, b],
      });
      break;
    }

    case 'truthdare':
    case 'tod': {
      const isTruth = !text || text.toLowerCase() === 't' || text.toLowerCase() === 'truth';
      if (isTruth) {
        await reply(`🤔 *TRUTH*\n━━━━━━━━━━━━━━\n${rand(TRUTHS)}`);
      } else {
        await reply(`😈 *DARE*\n━━━━━━━━━━━━━━\n${rand(DARES)}`);
      }
      break;
    }

    case '8ball':
    case 'eightball': {
      if (!text) return reply('❌ Usage: .8ball <question>');
      await reply(`🎱 *MAGIC 8 BALL*\n━━━━━━━━━━━━━━\n❓ ${text}\n\n🎱 ${rand(EIGHTBALL)}`);
      break;
    }

    case 'wouldyou':
    case 'wyr': {
      await reply(`🤷 *WOULD YOU RATHER?*\n━━━━━━━━━━━━━━\n${rand(WYR)}`);
      break;
    }

    case 'trivia': {
      const m = await reply('🧠 Loading trivia...');
      const res = await getTrivia();
      const optStr = res.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
      await sock.sendMessage(jid, {
        text:
          `🧠 *TRIVIA*\n━━━━━━━━━━━━━━\n` +
          `❓ ${res.question}\n\n${optStr}\n\n` +
          `_Reply with the letter! Answer: ||${res.correct}||_`,
        edit: m.key,
      });
      break;
    }

    case 'riddle': {
      const r = rand(RIDDLES);
      await reply(`🤔 *RIDDLE*\n━━━━━━━━━━━━━━\n❓ ${r.q}\n\n_Reply with your answer!_\n\n||Answer: ${r.a}||`);
      break;
    }

    default:
      return false;
  }
  return true;
}
