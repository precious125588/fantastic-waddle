/**
 * MIAS — Contact Handler
 * Send contact cards (vCard) using @itsliaaa/baileys.
 */

/**
 * Build a vCard string for a contact.
 * @param {object} opts
 * @param {string} opts.name     - Display name
 * @param {string} opts.number   - Phone number (digits only)
 * @param {string} [opts.org]    - Organization
 * @param {string} [opts.email]  - Email address
 * @returns {string} vCard string
 */
export function buildVCard({ name, number, org = "", email = "" }) {
  const num = String(number || "").replace(/[^0-9]/g, "");
  let vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nN:${name};;;\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}`;
  if (org) vcard += `\nORG:${org}`;
  if (email) vcard += `\nEMAIL:${email}`;
  vcard += `\nEND:VCARD`;
  return vcard;
}

/**
 * Send a contact card to a chat.
 * @param {object} sock
 * @param {object} msg           - Message to reply to
 * @param {object} contactOpts   - { name, number, org?, email? }
 */
export async function sendContact(sock, msg, contactOpts) {
  const jid = msg.key.remoteJid;
  const vcard = buildVCard(contactOpts);
  try {
    await sock.sendMessage(jid, {
      contacts: {
        displayName: contactOpts.name,
        contacts: [{ vcard }],
      },
    }, { quoted: msg });
  } catch {}
}

/**
 * Send multiple contact cards at once.
 * @param {object} sock
 * @param {object} msg
 * @param {Array<{name, number, org?, email?}>} contactsList
 * @param {string} displayName - Label shown above the contacts
 */
export async function sendContacts(sock, msg, contactsList, displayName = "Contacts") {
  const jid = msg.key.remoteJid;
  const contacts = contactsList.map(c => ({ vcard: buildVCard(c) }));
  try {
    await sock.sendMessage(jid, {
      contacts: { displayName, contacts },
    }, { quoted: msg });
  } catch {}
}
