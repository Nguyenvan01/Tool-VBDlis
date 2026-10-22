// Bấm icon extension → mở Side Panel bên cạnh trang
function enablePanelOnClick() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(enablePanelOnClick);
chrome.runtime.onStartup.addListener(enablePanelOnClick);
enablePanelOnClick();

// Phím tắt Alt+Shift+S: dừng khẩn cấp công cụ đang chạy ở tab đang mở
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'emergency-stop') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;
  let frames = [{ frameId: 0 }];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) || frames;
  } catch (e) { /* dùng khung chính */ }
  for (const f of frames) chrome.tabs.sendMessage(tab.id, { cmd: 'apiStop' }, { frameId: f.frameId }).catch(() => {});
});
