# Together Video Sync (MVP)

A minimal Chrome/Chromium extension that relays playback state. Everyone still loads the same video themselves; this app does not transmit or host video files.

## What it supports

- Play and pause
- Seeking / scrubbing
- Playback speed changes
- Periodic position corrections while playing
- Two or more people in one room

It targets the largest visible standard HTML `<video>` element in each page frame. Sites that use inaccessible/custom playback, DRM restrictions, browser-internal pages, or unusual embedded players may not work. A browser may also block remote `play()` until the user has clicked play locally once.

## 1. Run the relay locally

Install Node.js, then from this folder run:

```bash
npm install
npm start
```

The server listens on `ws://localhost:8787` by default. This is only reachable from your own computer, so it is suitable for local testing, not for friends connecting over the internet.

## 2. Load the extension

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this project's `extension` folder.
4. Open a page containing a video, then click the extension icon.
5. Generate a room code and click **Join on this page**.
6. For a local test, open the same video in another browser profile on the same computer, load the extension there too, and enter the same room code.

## 3. Use it with friends over the internet

Deploy `server.js` on a Node-compatible host that supports WebSockets. Use the secure WebSocket URL the host provides (normally `wss://...`) in the extension popup. Every participant must use the same server URL and room code, and each participant must open the same video.

Do not expose a public relay without adding basic abuse controls such as rate limits, room-code entropy, connection limits, and appropriate deployment configuration. This MVP has no authentication; anyone who knows a room code can send playback commands to that room.

## How it works

- A Manifest V3 extension uses `activeTab` and `scripting` so it only injects after the user clicks the extension on a page.
- The content script finds the most visible HTML video element and watches its play/pause/seek/rate events.
- A small WebSocket server relays those events to other connections in the same room.
- The relay holds the latest state so a person who joins later can catch up.

## Notes

- All participants need legitimate access to the same content. The extension does not bypass DRM, logins, or paywalls.
- This starter is intentionally small, not production-hardened. Consider adding a toolbar status indicator, host controls, media/URL matching, reconnect status, tests, and a secure random room invite flow before publishing.
