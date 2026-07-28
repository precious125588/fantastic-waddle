import { senderNum } from '../lib/utils.js';
import {
  getBalance, setBalance, addBalance, deductBalance,
  canClaimDaily, claimDaily,
} from '../lib/db.js';

const DAILY_AMOUNT  = 500;
const WORK_MIN      = 100;
const WORK_MAX      = 400;
const GAMBLE_MIN_BET = 10;

const WORK_MSGS = [
  'You delivered pizzas 🍕',
  'You fixed a computer 💻',
  'You babysat kids 👶',
  'You drove Uber 🚗',
  'You sold art online 🎨',
  'You taught guitar 🎸',
  'You wrote a blog post ✍️',
  'You fixed plumbing 🔧',
  'You walked dogs 🐕',
  'You coded a website 💻',
];

export async function handleEconomy(sock, msg, { command, args, jid, sender, text, reply, mentionedJids }) {
  const num = senderNum(sender);

  switch (command) {

    case 'balance':
    case 'bal':
    case 'wallet': {
      const bal = getBalance(num);
      await reply(
        `💰 *BALANCE*\n━━━━━━━━━━━━━━\n` +
        `👤 User: @${num}\n` +
        `💵 Balance: *${bal.toLocaleString()} coins*`
      );
      break;
    }

    case 'daily':
    case 'claim': {
      if (!canClaimDaily(num)) {
        await reply(`⏳ You already claimed today!\nCome back in 24 hours.`);
        return true;
      }
      claimDaily(num);
      addBalance(num, DAILY_AMOUNT);
      const newBal = getBalance(num);
      await reply(
        `🎁 *DAILY REWARD*\n━━━━━━━━━━━━━━\n` +
        `✅ You received *${DAILY_AMOUNT} coins*!\n` +
        `💰 Balance: *${newBal.toLocaleString()} coins*`
      );
      break;
    }

    case 'work':
    case 'job': {
      const earned = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
      addBalance(num, earned);
      const newBal = getBalance(num);
      const workMsg = WORK_MSGS[Math.floor(Math.random() * WORK_MSGS.length)];
      await reply(
        `💼 *WORK*\n━━━━━━━━━━━━━━\n` +
        `📋 ${workMsg}\n` +
        `💵 Earned: *+${earned} coins*\n` +
        `💰 Balance: *${newBal.toLocaleString()} coins*`
      );
      break;
    }

    case 'transfer':
    case 'give':
    case 'pay': {
      const target = mentionedJids[0];
      if (!target || !text) return reply('❌ Usage: .transfer @user <amount>');
      const parts = text.trim().split(' ');
      const amount = parseInt(parts[parts.length - 1]);
      if (isNaN(amount) || amount <= 0) return reply('❌ Invalid amount.');
      const targetNum = senderNum(target);
      if (targetNum === num) return reply('❌ You cannot transfer to yourself.');
      const bal = getBalance(num);
      if (bal < amount) return reply(`❌ Insufficient balance. You have *${bal} coins*.`);
      deductBalance(num, amount);
      addBalance(targetNum, amount);
      await sock.sendMessage(jid, {
        text:
          `💸 *TRANSFER*\n━━━━━━━━━━━━━━\n` +
          `From: @${num} → To: @${targetNum}\n` +
          `💵 Amount: *${amount.toLocaleString()} coins*\n` +
          `💰 Your balance: *${getBalance(num).toLocaleString()} coins*`,
        mentions: [sender, target],
      });
      break;
    }

    case 'gamble':
    case 'bet': {
      if (!text) return reply('❌ Usage: .gamble <amount>');
      const bet = parseInt(text);
      if (isNaN(bet) || bet < GAMBLE_MIN_BET) return reply(`❌ Minimum bet is *${GAMBLE_MIN_BET} coins*.`);
      const bal = getBalance(num);
      if (bal < bet) return reply(`❌ You only have *${bal} coins*.`);
      const won = Math.random() > 0.5;
      if (won) {
        addBalance(num, bet);
        await reply(
          `🎰 *GAMBLE — WIN!*\n━━━━━━━━━━━━━━\n` +
          `🎉 You WON *+${bet} coins*!\n` +
          `💰 Balance: *${getBalance(num).toLocaleString()} coins*`
        );
      } else {
        deductBalance(num, bet);
        await reply(
          `🎰 *GAMBLE — LOSS*\n━━━━━━━━━━━━━━\n` +
          `😢 You LOST *-${bet} coins*.\n` +
          `💰 Balance: *${getBalance(num).toLocaleString()} coins*`
        );
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
