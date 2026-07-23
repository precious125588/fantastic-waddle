/**
 * NIX — Info & Web Tools Module
 */
import { getOwnerName, greet } from '../owner.js';
import { stagedSend, sendNix, reactNix, nixFooter } from '../ui.js';
import { nixWeather, nixWiki, nixNews, prexzyGet, nixFetch } from '../api.js';
import { httpClient as axios } from '../../lib/engineAccess.js';

export async function weather(sock, msg, args) {
  const owner = getOwnerName();
  const city = args.join(' ');
  if (!city) {
    await sendNix(sock, msg, `🌤️ *Weather*\n\nUsage: \`.nix weather <city>\`\nExample: \`.nix weather Lagos\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🌤️');
  const result = await nixWeather(city);
  if (!result.ok) {
    await sendNix(sock, msg, `❌ *Weather Failed*\n\n${greet(owner)} I couldn't fetch weather for "${city}".${nixFooter()}`);
    return;
  }
  const d = result.data;
  // wttr.in JSON format
  const current = d?.current_condition?.[0];
  if (current) {
    const desc = current?.weatherDesc?.[0]?.value || 'N/A';
    const temp_c = current?.temp_C || '?';
    const temp_f = current?.temp_F || '?';
    const humidity = current?.humidity || '?';
    const wind = current?.windspeedKmph || '?';
    const feels = current?.FeelsLikeC || '?';
    const text = `🌤️ *Weather: ${city}*
━━━━━━━━━━━━━━━━
${greet(owner)} current conditions:

🌡️ Temperature: *${temp_c}°C / ${temp_f}°F*
🌡️ Feels Like: *${feels}°C*
☁️ Condition: *${desc}*
💧 Humidity: *${humidity}%*
💨 Wind: *${wind} km/h*

📅 ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━${nixFooter()}`;
    await sendNix(sock, msg, text);
    return;
  }
  // Prexzy format
  const text = `🌤️ *Weather: ${city}*\n\n${JSON.stringify(d).slice(0, 300)}${nixFooter()}`;
  await sendNix(sock, msg, text);
}

export async function news(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '📰');
  const result = await nixNews();
  if (!result.ok) {
    await sendNix(sock, msg, `❌ *News Failed*\n\n${greet(owner)} I couldn't fetch the latest news right now.${nixFooter()}`);
    return;
  }
  const articles = result.data?.articles || result.data?.news || (Array.isArray(result.data) ? result.data : []);
  if (!articles.length) {
    await sendNix(sock, msg, `📰 *News*\n\n${greet(owner)} no news articles found right now.${nixFooter()}`);
    return;
  }
  const lines = articles.slice(0, 5).map((a, i) => `${i + 1}. *${a.title || a.headline}*\n   _${(a.description || a.summary || '').slice(0, 80)}_`).join('\n\n');
  await stagedSend(sock, msg, `📰 *Latest News*\n\n${greet(owner)} here are today's top stories:\n\n${lines}${nixFooter()}`, { stages: 3 });
}

export async function wiki(sock, msg, args) {
  const owner = getOwnerName();
  const query = args.join(' ');
  if (!query) {
    await sendNix(sock, msg, `📖 *Wikipedia*\n\nUsage: \`.nix wiki <topic>\`\nExample: \`.nix wiki artificial intelligence\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📖');
  const result = await nixWiki(query);
  if (!result.ok) {
    await sendNix(sock, msg, `❌ *Wikipedia Failed*\n\n${greet(owner)} I couldn't find anything on "${query}".${nixFooter()}`);
    return;
  }
  const d = result.data;
  const title = d?.title || query;
  const extract = d?.extract || d?.summary || d?.description || d?.result;
  if (!extract) {
    await sendNix(sock, msg, `📖 *Wikipedia: ${title}*\n\n${greet(owner)} no summary available for this topic.${nixFooter()}`);
    return;
  }
  const text = `📖 *Wikipedia: ${title}*\n\n${greet(owner)} here's the summary:\n\n${String(extract).slice(0, 1500)}${String(extract).length > 1500 ? '...' : ''}${nixFooter()}`;
  await stagedSend(sock, msg, text, { stages: 3 });
}

export async function search(sock, msg, args) {
  const owner = getOwnerName();
  const query = args.join(' ');
  if (!query) {
    await sendNix(sock, msg, `🔍 *Search*\n\nUsage: \`.nix search <query>\`\nExample: \`.nix search best WhatsApp bots 2025\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🔍');
  try {
    const r = await prexzyGet('/tools/search', { q: query });
    if (r.ok) {
      const d = r.data?.data || r.data;
      const results = Array.isArray(d) ? d : (d?.results || []);
      if (results.length) {
        const lines = results.slice(0, 5).map((r, i) => `${i + 1}. *${r.title || r.name}*\n   ${(r.snippet || r.description || '').slice(0, 100)}\n   🔗 ${r.url || r.link || ''}`).join('\n\n');
        await sendNix(sock, msg, `🔍 *Search: "${query}"*\n\n${lines}${nixFooter()}`);
        return;
      }
    }
  } catch {}
  // Fallback: DuckDuckGo instant answer
  try {
    const { data } = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, { timeout: 10000 });
    const answer = data?.AbstractText || data?.Answer || data?.RelatedTopics?.[0]?.Text;
    if (answer) {
      await sendNix(sock, msg, `🔍 *Search: "${query}"*\n\n${greet(owner)} here's what I found:\n\n${String(answer).slice(0, 1000)}${nixFooter()}`);
      return;
    }
  } catch {}
  await sendNix(sock, msg, `🔍 *Search: "${query}"*\n\n${greet(owner)} no instant results found. Try \`.nix wiki ${query}\` for Wikipedia info.${nixFooter()}`);
}

export async function fact(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '💡');
  try {
    const r = await prexzyGet('/fun/fact');
    if (r.ok) {
      const d = r.data?.data || r.data;
      const text = d?.fact || d?.text || d?.result;
      if (text) { await sendNix(sock, msg, `💡 *Random Fact*\n\n${greet(owner)} here's something interesting:\n\n_${text}_${nixFooter()}`); return; }
    }
  } catch {}
  try {
    const { data } = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 10000 });
    if (data?.text) { await sendNix(sock, msg, `💡 *Random Fact*\n\n${greet(owner)}\n\n_${data.text}_${nixFooter()}`); return; }
  } catch {}
  await sendNix(sock, msg, `💡 *Fact*\n\n${greet(owner)} did you know? The human brain can hold approximately 2.5 petabytes of data — that's roughly 3 million hours of TV!${nixFooter()}`);
}

export async function joke(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '😂');
  try {
    const r = await prexzyGet('/fun/joke');
    if (r.ok) {
      const d = r.data?.data || r.data;
      const text = d?.joke || d?.text || d?.result;
      if (text) { await sendNix(sock, msg, `😂 *Random Joke*\n\n${greet(owner)}\n\n${text}${nixFooter()}`); return; }
    }
  } catch {}
  try {
    const { data } = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 10000 });
    if (data?.setup) { await sendNix(sock, msg, `😂 *Random Joke*\n\n${greet(owner)}\n\n${data.setup}\n\n_${data.punchline}_${nixFooter()}`); return; }
  } catch {}
  await sendNix(sock, msg, `😂 *Joke*\n\n${greet(owner)}\n\nWhy do programmers prefer dark mode?\n_Because light attracts bugs!_ 🐛${nixFooter()}`);
}

export async function quote(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '✨');
  try {
    const r = await prexzyGet('/fun/quote');
    if (r.ok) {
      const d = r.data?.data || r.data;
      const text = d?.quote || d?.text || d?.result;
      const author = d?.author || '';
      if (text) { await sendNix(sock, msg, `✨ *Quote of the Moment*\n\n${greet(owner)}\n\n_"${text}"_${author ? `\n\n— *${author}*` : ''}${nixFooter()}`); return; }
    }
  } catch {}
  try {
    const { data } = await axios.get('https://zenquotes.io/api/random', { timeout: 10000 });
    if (data?.[0]?.q) { await sendNix(sock, msg, `✨ *Quote*\n\n${greet(owner)}\n\n_"${data[0].q}"_\n\n— *${data[0].a}*${nixFooter()}`); return; }
  } catch {}
  await sendNix(sock, msg, `✨ *Quote*\n\n${greet(owner)}\n\n_"The only way to do great work is to love what you do."_\n\n— *Steve Jobs*${nixFooter()}`);
}

export async function calculate(sock, msg, args) {
  const owner = getOwnerName();
  const expr = args.join(' ');
  if (!expr) {
    await sendNix(sock, msg, `🔢 *Calculator*\n\nUsage: \`.nix calculate <expression>\`\nExample: \`.nix calculate 25 * 4 + 100 / 2\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🔢');
  try {
    // Safe math evaluation
    const safe = expr.replace(/[^0-9+\-*/.() %^]/g, '');
    if (!safe) throw new Error('Invalid');
    const result = Function(`"use strict"; return (${safe.replace(/\^/g, '**')})`)();
    if (isNaN(result) || !isFinite(result)) throw new Error('Invalid result');
    await sendNix(sock, msg, `🔢 *Calculator*\n\n${greet(owner)}\n\n📝 Expression: \`${expr}\`\n✅ Result: *${result}*${nixFooter()}`);
  } catch {
    try {
      const r = await prexzyGet('/tools/calculator', { expression: expr });
      if (r.ok) {
        const d = r.data?.data || r.data;
        const res = d?.result || d?.answer;
        if (res !== undefined) { await sendNix(sock, msg, `🔢 *Result:* *${res}*${nixFooter()}`); return; }
      }
    } catch {}
    await sendNix(sock, msg, `❌ *Invalid Expression*\n\n${greet(owner)} I couldn't calculate "${expr}".\nMake sure it's a valid math expression.${nixFooter()}`);
  }
}

export async function myIp(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '🌐');
  try {
    const r = await prexzyGet('/tools/myip');
    if (r.ok) {
      const d = r.data?.data || r.data;
      let out = `🌐 *IP Info*\n\n${greet(owner)}\n\n`;
      if (d?.ip) out += `🖥️ IP: \`${d.ip}\`\n`;
      if (d?.country) out += `🌍 Country: ${d.country}\n`;
      if (d?.city) out += `🏙️ City: ${d.city}\n`;
      if (d?.isp) out += `📡 ISP: ${d.isp}\n`;
      if (d?.timezone) out += `🕐 Timezone: ${d.timezone}\n`;
      await sendNix(sock, msg, out + nixFooter());
      return;
    }
  } catch {}
  try {
    const { data } = await axios.get('https://ipapi.co/json/', { timeout: 10000 });
    await sendNix(sock, msg, `🌐 *IP Info*\n\n${greet(owner)}\n\n🖥️ IP: \`${data.ip}\`\n🌍 Country: ${data.country_name}\n🏙️ City: ${data.city}\n📡 ISP: ${data.org}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *IP Info Failed*\n\n${greet(owner)} I was unable to fetch IP information.${nixFooter()}`);
  }
}
