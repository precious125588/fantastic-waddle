/**
   * NIX ASSISTANT — Owner System  v2.0
   * Priority: runtime session name → ENV (NIX_OWNER_NAME) → owner.json → "Owner"
   * 
   * FIX: Added setOwnerNameFromSession() so name is detected immediately
   * when the bot connects and pushName is available from WhatsApp.
   */

  import fs from 'fs';
  import path from 'path';
  import { fileURLToPath } from 'url';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const OWNER_FILE = path.join(__dirname, '..', 'owner.json');

  // Runtime name — set immediately from WhatsApp session pushName on connect
  let _runtimeOwnerName = '';

  /**
   * Call this from the connection update handler when the bot connects.
   * Passes the pushName/linked account name from WhatsApp session.
   * This is the FIRST source checked so the name shows immediately.
   */
  export function setOwnerNameFromSession(pushName) {
    if (pushName && typeof pushName === 'string' && pushName.trim()) {
      _runtimeOwnerName = pushName.trim();
      // Also persist to owner.json so it survives restarts
      try {
        const existing = (() => {
          try { return JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8')); } catch { return {}; }
        })();
        // Only update if no manual name was set
        if (!existing.manuallySet) {
          fs.writeFileSync(OWNER_FILE, JSON.stringify({ ownerName: pushName.trim(), autoDetected: true }, null, 2), 'utf8');
        }
      } catch {}
    }
  }

  /**
   * Returns the best available owner display name.
   * Priority: runtime session → ENV → owner.json → "Owner"
   */
  export function getOwnerName() {
    // 1. Session-detected name (from WhatsApp pushName on connect — immediate)
    if (_runtimeOwnerName) return _runtimeOwnerName;

    // 2. ENV variable
    if (process.env.NIX_OWNER_NAME && process.env.NIX_OWNER_NAME.trim()) {
      return process.env.NIX_OWNER_NAME.trim();
    }

    // 3. owner.json file
    try {
      if (fs.existsSync(OWNER_FILE)) {
        const data = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8'));
        if (data.ownerName && data.ownerName.trim()) return data.ownerName.trim();
      }
    } catch {}

    // 4. Fallback
    return 'Owner';
  }

  /**
   * Manually override the owner name (from .nix setname command).
   * Sets manuallySet=true so auto-detect won't overwrite it.
   */
  export function setOwnerName(name) {
    try {
      const cleanName = String(name || '').trim();
      if (!cleanName) return false;
      _runtimeOwnerName = cleanName;
      fs.writeFileSync(OWNER_FILE, JSON.stringify({ ownerName: cleanName, manuallySet: true }, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  export function greet(name) {
    return `*${name}*,`;
  }
  