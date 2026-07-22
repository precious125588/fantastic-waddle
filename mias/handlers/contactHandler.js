/**
 * MIAS — Contact Handler
 *
 * Centralized vCard / contact sending abstraction.
 * Commands must never build vCard strings or call sock.sendMessage({contacts}) directly.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

// ─── vCard builder ─────────────────────────────────────────────────────────────

/**
 * Build a vCard 3.0 string for a single contact.
 *
 * @param {object} contact
 * @param {string} contact.displayName  - Full name shown in WhatsApp
 * @param {string} contact.phone        - Phone number (digits only, with country code)
 * @param {string} [contact.org]        - Organization name
 * @param {string} [contact.title]      - Job title
 * @param {string} [contact.email]      - Email address
 * @param {string} [contact.url]        - Website URL
 * @param {string} [contact.note]       - Free-form note
 * @returns {string}
 */
export function buildVCard(contact) {
  const { displayName, phone, org, title, email, url, note } = contact;
  const name = displayName || phone || "Unknown";
  const cleanPhone = String(phone || "").replace(/\D/g, "");

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${name}`,
    `N:${name};;;`,
    `TEL;type=CELL;type=VOICE;waid=${cleanPhone}:+${cleanPhone}`,
  ];

  if (org)   lines.push(`ORG:${org}`);
  if (title) lines.push(`TITLE:${title}`);
  if (email) lines.push(`EMAIL:${email}`);
  if (url)   lines.push(`URL:${url}`);
  if (note)  lines.push(`NOTE:${note}`);

  lines.push("END:VCARD");
  return lines.join("\r\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a single contact card.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} contact
 * @param {object} [opts]
 * @param {object} [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendContact(sock, jid, contact, opts = {}) {
  try {
    const vcard = buildVCard(contact);
    const content = {
      contacts: {
        displayName: contact.displayName || contact.phone || "Contact",
        contacts: [{ vcard }],
      },
    };

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendContact] Error:", err?.message);
    return null;
  }
}

/**
 * Send multiple contacts in one message.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object[]} contacts   - Array of contact objects (same shape as buildVCard)
 * @param {object}   [opts]
 * @param {string}   [opts.displayName]  - Header name for the contacts list
 * @param {object}   [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendContacts(sock, jid, contacts, opts = {}) {
  try {
    if (!contacts?.length) return null;

    const vcards = contacts.map(c => ({ vcard: buildVCard(c) }));
    const content = {
      contacts: {
        displayName: opts.displayName || `${contacts.length} Contacts`,
        contacts: vcards,
      },
    };

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendContacts] Error:", err?.message);
    return null;
  }
}

/**
 * Parse a vCard string into a contact object.
 * @param {string} vcard
 * @returns {object}
 */
export function parseVCard(vcard) {
  const result = {};
  for (const line of vcard.split(/\r?\n/)) {
    if (line.startsWith("FN:")) result.displayName = line.slice(3);
    if (line.startsWith("TEL")) {
      const match = line.match(/(?:waid=(\d+)|:(\+?\d+))/);
      result.phone = match?.[1] || match?.[2]?.replace(/\D/g, "") || "";
    }
    if (line.startsWith("ORG:"))   result.org   = line.slice(4);
    if (line.startsWith("TITLE:")) result.title = line.slice(6);
    if (line.startsWith("EMAIL:")) result.email = line.slice(6);
    if (line.startsWith("URL:"))   result.url   = line.slice(4);
    if (line.startsWith("NOTE:"))  result.note  = line.slice(5);
  }
  return result;
}
