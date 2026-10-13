const roomInput = document.getElementById('room');
const serverInput = document.getElementById('server');
const status = document.getElementById('status');

chrome.storage.local.get(['syncRoom', 'syncServer'], (saved) => {
  if (saved.syncRoom) roomInput.value = saved.syncRoom;
  if (saved.syncServer) serverInput.value = saved.syncServer;
});

document.getElementById('generate').addEventListener('click', () => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  roomInput.value = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
});

document.getElementById('join').addEventListener('click', async () => {
  const room = roomInput.value.trim();
  const server = serverInput.value.trim();
  if (!room || room.length < 4) {
    status.textContent = 'Enter a room code with at least 4 characters.';
    return;
  }
  if (!/^wss?:\/\//i.test(server)) {
    status.textContent = 'Server must start with ws:// or wss://.';
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
      status.textContent = 'Open a normal video webpage first.';
      return;
    }

    await chrome.storage.local.set({ syncRoom: room, syncServer: server });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js']
    });
    status.textContent = `Joined room ${room}. Share this code with everyone.`;
  } catch (error) {
    status.textContent = 'Could not activate here. Try refreshing the page and retrying.';
    console.error(error);
  }
});
