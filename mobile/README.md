# Agent Flow Mobile

Phone viewer for the desktop/standalone relay. Uses Supabase Realtime as a
transport. Status snapshots are encrypted locally with AES-256-GCM and decrypted
in the phone browser with a 256-bit pairing key. The public site contains only
the Supabase URL and publishable key, never a pairing, database, or secret key.

The mobile view includes session status, parent/child agents, model, token count,
tool names and recent event types, using the same canvas renderer as desktop.
On phones, drag to pan, pinch to zoom, and tap agents to inspect them.
Session titles and agent display names match the desktop app and are included in
the encrypted snapshots. Source code, tool inputs/outputs, transcript messages
and file paths are excluded.
Snapshots remain in memory; Supabase Broadcast does not provide an offline archive.
The viewer marks data stale after 35 seconds without a snapshot. The computer
must stay awake and online. Safari may suspend the connection in the background;
the viewer reconnects when it becomes visible again.

## Run

1. Put `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in an env file outside Git.
2. Run `node scripts/setup-mobile.mjs D:/sensitive/agent-flow-supabase.env` once.
   It generates a pairing key locally and sets `AGENT_FLOW_REMOTE_ENABLED=1` if
   that setting is absent. It never prints the key.
3. Build with `npm run build:desktop` and `npm run package:desktop`, then open
   `artifacts.local/desktop/Agent Flow-win32-x64/Agent Flow.exe`.
   The app discovers the existing external config automatically. Development
   launchers remain available for custom config paths.
   Mobile sharing uses a separate profile and Chromium cache under
   `%LOCALAPPDATA%/Agent Flow Mobile`, so it can run alongside an older packaged
   local viewer. Existing workspace preferences are imported once.
4. Choose the workspace folder in the desktop app.
5. Click **iPhone QR** in the desktop toolbar. Scan with the iPhone camera and
   open Safari to pair. The URL fragment is removed immediately and is not part
   of the request to the web host. Manual `AGENT_FLOW_PAIRING_KEY` entry remains
   available. The key is kept in memory only. Reloading or choosing
   **เลิกจับคู่** clears it. Add the site to the iPhone Home Screen if desired.

For the standalone app, set `AGENT_FLOW_REMOTE_CONFIG` to the same absolute env
file path before launch. Sharing requires Node.js 22+ and is disabled unless both
the config path and `AGENT_FLOW_REMOTE_ENABLED=1` are set. Changing the workspace
stops the old publisher. Use one shared desktop instance per pairing key.

Set `AGENT_FLOW_REMOTE_ENABLED=0` and restart to turn sharing off. To revoke a
lost pairing key, remove that variable from the local file, rerun setup, and
restart. Re-pair trusted phones with the new key. Anyone holding the pairing key
can read and forge status on that channel: keep it private. A person without it
may send ciphertext on the public transport, but cannot decrypt or authenticate
snapshots. This approach does not use Supabase database/Auth policies and does
not create public database tables. Enable a private authenticated channel instead
if organizational policy requires account-based access or audit logs.

## Verify

```
node --import tsx --test scripts/remote-state.test.ts
```

Set `AGENT_FLOW_REMOTE_CONFIG` and run
`node --import tsx scripts/supabase-encrypted-smoke.ts` for an opt-in live test
using synthetic data. `node scripts/preview-mobile.mjs` serves the viewer locally.
The demo screen is explicitly marked as sample data.

## Hosting

Publish the static files in this directory (excluding this README) over HTTPS.
Use a dedicated Pages branch, keeping application changes and local credentials
out of that branch. No secrets, backend server or build step are needed on Pages.
