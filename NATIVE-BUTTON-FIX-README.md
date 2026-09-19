# WhatsApp native-button replacement

This drop fixes the native-flow button path used by MIAS and the local `cox`
helper. It is intended for regular WhatsApp, including older Android 11
clients such as the Tecno Camon 17P.

## Files to replace

Copy these files over the same paths in the deployed project:

```text
cox/index.js
mias/index.js
mias/handlers/gktwAdapter.js
lib/universalButtons.js
PATCH-v29.cjs
```

Do not copy authentication folders, `.env`, `node_modules`, or generated
lockfiles from this drop.

## What changed

- Native-flow messages use the `viewOnceMessage` envelope first, with
  `messageContextInfo.deviceListMetadata` and a normalized bot account JID.
  This is the reliable path for taps on regular WhatsApp.
- The bare interactive payload remains a second strategy. Set
  `BUTTON_MODE=direct` only if a particular client rejects the wrapped form.
- The local `cox` adapter now accepts both its documented spec form and the
  positional adapter form, and maps `body`/`sections` to the fields it needs.
- If a native relay really fails, the bot sends a numbered fallback and stores
  the choices instead of sending a body-only message that appears dead.
- The v29 boot patch no longer chooses the bare payload first.

## Deploy and verify

1. Replace the four files and restart the bot completely.
2. Send the command that displays the menu/card.
3. Tap a native button on the Camon 17P.
4. Confirm the bot log contains:

   ```text
   [native-flow] relayed viewonce payload
   ```

5. If the button still cannot open on that client, set `BUTTON_MODE=direct`,
   restart once, and test again. That changes only the envelope order; command
   response parsing is unchanged.

The replacement was syntax-checked locally. A physical Android 11 device and a
live WhatsApp session are not available in this workspace, so the final tap
must still be tested on the Camon 17P.