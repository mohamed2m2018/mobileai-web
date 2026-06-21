# Twomilia Screen-Map Recorder (browser extension)

Record your website's screens + navigation flow to train your Twomilia AI agent —
**without installing any code on your site**, and surviving full-page navigations
(unlike a bookmarklet).

## Install (unpacked, dev)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `screenmap-extension/` folder.
4. Pin the **Twomilia Screen-Map Recorder** extension.

## Use

1. In the dashboard: **Settings → Train AI on your site → Record with the extension**.
   Copy the **Ingest URL** and **Project key** shown there.
2. Click the extension icon, paste both values.
3. Click **Start recording**, then browse your own site (log in if needed).
   A red bar appears at the top of every page; the screen/link count climbs.
4. In the dashboard, click **Start listening** to watch the map fill live.
5. Click **✓ Finish** (red bar) or **Stop** (popup) when done, then **Publish map**
   in the dashboard.

## Notes

- Works on any site, including behind login and multi-page (full-reload) sites —
  the content script re-injects on every page and state is kept in `chrome.storage`.
- The extension uploads through its background worker, so the target site's CSP /
  CORS does not block it.
- Captures stream to the dashboard's public `screenmap-ingest` endpoint, keyed by
  your project's public `analyticsKey`.
- For production, host the dashboard over HTTPS so the Ingest URL is HTTPS.
