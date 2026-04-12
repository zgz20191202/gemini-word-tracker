/* Content Script */

const HARRY_POTTER_1_WORDS = 76944;

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
}

// Inject `inject.js` into the page
const s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

// Create Widget UI
const widget = document.createElement('div');
widget.id = 'gemini-word-tracker-widget';
widget.innerHTML = `
  <div class="gwt-header">Gemini Word Tracker</div>
  <div class="gwt-stat">Sent: <span id="gwt-input">0</span></div>
  <div class="gwt-stat">Read: <span id="gwt-read">0</span></div>
  <div class="gwt-analogy" id="gwt-analogy">0.00x Harry Potter 1</div>
`;
document.body.appendChild(widget);

const inputEl = document.getElementById('gwt-input');
const readEl = document.getElementById('gwt-read');
const analogyEl = document.getElementById('gwt-analogy');

// Initial Load
let dailyInput = 0;
let dailyRead = 0;

function updateWidget() {
  inputEl.textContent = dailyInput.toLocaleString();
  readEl.textContent = dailyRead.toLocaleString();
  const ratio = dailyRead / HARRY_POTTER_1_WORDS;
  analogyEl.textContent = `${ratio.toFixed(4)}x Harry Potter 1`;
}

chrome.storage.local.get(null, (result) => {
  const todayKey = getTodayKey();
  if (result[todayKey]) {
    dailyInput = result[todayKey].input || 0;
    dailyRead = result[todayKey].read || 0;
  }
  
  if (result.showWidget === false) {
    widget.style.display = 'none';
  }
  
  updateWidget();
});

// Listen for updates from popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.showWidget) {
    widget.style.display = changes.showWidget.newValue ? 'block' : 'none';
  }
});

// Listen to injected script messages
window.addEventListener('message', function(event) {
  if (event.source !== window || !event.data || event.data.type !== 'GEMINI_WORD_TRACKER') {
    return;
  }

  const { direction, wordCount } = event.data;
  
  const todayKey = getTodayKey();
  
  chrome.storage.local.get([todayKey], (result) => {
    let stats = result[todayKey] || { input: 0, read: 0 };
    
    if (direction === 'input') {
      // Due to the naive extraction, network payloads often send the same text multiple times.
      // We will add the words but it could be inaccurate. A real product needs exact payload parsing.
      stats.input += wordCount;
      dailyInput = stats.input;
    } else if (direction === 'read') {
      stats.read += wordCount;
      dailyRead = stats.read;
    }
    
    const updateObj = {};
    updateObj[todayKey] = stats;
    chrome.storage.local.set(updateObj);
    
    updateWidget();
  });
});
