// Background service worker. Content scripts can't always POST cross-origin
// (page CORS/CSP), so they hand the upload to the background, which has
// host_permissions and is free of page CSP.

// Toolbar icon state: red "REC" badge while recording, cleared when idle.
function setBadge(recording) {
  try {
    chrome.action.setBadgeText({ text: recording ? "REC" : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#ffffff" });
    if (chrome.action.setTitle) {
      chrome.action.setTitle({ title: recording ? "Twomilia Recorder — RECORDING" : "Twomilia Recorder" });
    }
  } catch (e) {}
}

chrome.storage.local.get(["twm_recording"], (st) => setBadge(!!st.twm_recording));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.twm_recording) setBadge(!!changes.twm_recording.newValue);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "TWM_POST") {
    fetch(msg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyticsKey: msg.key, map: msg.map, reset: !!msg.reset }),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => sendResponse({ ok: true, d }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // keep the message channel open for the async response
  }
  return false;
});
