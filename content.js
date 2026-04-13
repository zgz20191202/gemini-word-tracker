/* Content Script - Refined Multilingual Tracker */

const HARRY_POTTER_1_WORDS = 76944;

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
}

function isContextValid() {
  return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
}

function countWords(str) {
  if (!str || typeof str !== 'string') return 0;
  // Use a more strict word counting regex to avoid overcounting punctuation/symbols
  const latinMatches = str.match(/[a-zA-Z0-9\u00C0-\u017F]+/g) || [];
  const cjkMatches = str.match(/[\u4e00-\u9fa5]|[\u3040-\u309f]|[\u30a0-\u30ff]|[\uac00-\ud7af]/g) || [];
  return latinMatches.length + cjkMatches.length;
}

function getCleanText(element, type) {
  if (!element) return "";
  
  let contentEl = element;
  if (type === 'read') {
      contentEl = element.querySelector('.markdown') || element.querySelector('.message-content') || element;
  } else if (type === 'asked') {
      contentEl = element.querySelector('.query-content') || element.querySelector('.message-content') || element;
  }

  const clone = contentEl.cloneNode(true);
  // Remove UI elements like buttons, SVGs, hidden elements, media, and attachments
  const unwanted = clone.querySelectorAll('button, svg, img, video, audio, figure, iframe, canvas, [aria-hidden="true"], .visually-hidden, a, .file-attachment, .uploaded-file, .attachment-container, file-preview');
  unwanted.forEach(el => el.remove());

  return clone.textContent || "";
}

// Track elements we've already counted to avoid double-counting on re-renders
const countedMessages = new WeakMap();

let dailyInput = 0;
let dailyRead = 0;

// Track user interaction to differentiate history vs new queries
let lastInteractionTime = 0;
// Track whether we are expecting a new model response
let isWaitingForResponse = false;

document.addEventListener('mousedown', () => { lastInteractionTime = Date.now(); }, true);
document.addEventListener('keydown', () => { lastInteractionTime = Date.now(); }, true);

// Handle SPA navigation to prevent history from counting as recent user action
let currentPath = window.location.pathname;
let isNavigating = false;

setInterval(() => {
  if (window.location.pathname !== currentPath) {
    currentPath = window.location.pathname;
    isNavigating = true;
    setTimeout(() => { isNavigating = false; }, 3000); // 3-second grace period for history to load
  }
}, 500);

let widget = null;
let inputEl, readEl, analogyEl;

// ----------------- Widget UI -----------------

function updateWidget() {
  if (!widget) return;
  inputEl.textContent = dailyInput.toLocaleString();
  readEl.textContent = dailyRead.toLocaleString();
  const ratio = dailyRead / HARRY_POTTER_1_WORDS;
  analogyEl.textContent = `${ratio.toFixed(4)}x Harry Potter 1`;
}

function initUI() {
  const targetNode = document.documentElement || document.body;
  if (!targetNode) {
    requestAnimationFrame(initUI);
    return;
  }
  
  if (document.getElementById('gemini-word-tracker-widget')) return;

  widget = document.createElement('div');
  widget.id = 'gemini-word-tracker-widget';
  widget.innerHTML = `
    <div class="gwt-header">Gemini Word Tracker</div>
    <div class="gwt-stat">Asked: <span id="gwt-input">0</span></div>
    <div class="gwt-stat">Read: <span id="gwt-read">0</span></div>
    <div class="gwt-analogy" id="gwt-analogy">0.00x Harry Potter 1</div>
  `;
  targetNode.appendChild(widget);

  inputEl = document.getElementById('gwt-input');
  readEl = document.getElementById('gwt-read');
  analogyEl = document.getElementById('gwt-analogy');

  if (isContextValid()) {
    chrome.storage.local.get(null, (result) => {
      const todayKey = getTodayKey();
      if (result[todayKey]) {
        dailyInput = result[todayKey].input || 0;
        dailyRead = result[todayKey].read || 0;
      }
      if (result.showWidget === false) widget.style.display = 'none';
      updateWidget();
    });
  }
}

initUI();

if (isContextValid()) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      const todayKey = getTodayKey();
      if (changes[todayKey] && changes[todayKey].newValue) {
        // Sync local variables with storage to prevent overwriting from other tabs
        dailyInput = changes[todayKey].newValue.input || 0;
        dailyRead = changes[todayKey].newValue.read || 0;
        updateWidget();
      }
      if (changes.showWidget && widget) {
        widget.style.display = changes.showWidget.newValue ? 'block' : 'none';
      }
    }
  });
}

function saveData(deltaInput = 0, deltaRead = 0) {
  if (!isContextValid()) return;
  if (deltaInput === 0 && deltaRead === 0) return;
  
  const todayKey = getTodayKey();
  
  // Use get before set to ensure we don't overwrite concurrent saves
  chrome.storage.local.get(todayKey, (result) => {
    const currentData = result[todayKey] || { input: 0, read: 0 };
    const newData = {
      input: currentData.input + deltaInput,
      read: currentData.read + deltaRead
    };
    
    const updateObj = {};
    updateObj[todayKey] = newData;
    chrome.storage.local.set(updateObj);
  });
}

// ----------------- Tracking Logic -----------------

function processNodeAddition(element, type) {
  const text = getCleanText(element, type);
  const words = countWords(text);
  
  // Save the current word count so future mutations only count the delta
  countedMessages.set(element, words);

  let deltaInput = 0;
  let deltaRead = 0;

  if (type === 'asked') {
      // Check if this was a recent user action and not a navigation history load
      if (!isNavigating && (Date.now() - lastInteractionTime < 5000)) {
          deltaInput = words;
          isWaitingForResponse = true;
      }
  } else if (type === 'read') {
      if (isWaitingForResponse) {
          deltaRead = words;
          isWaitingForResponse = false;
      }
  }

  saveData(deltaInput, deltaRead);
}

function processNodeMutation(element, type) {
  const text = getCleanText(element, type);
  const words = countWords(text);
  const prevCount = countedMessages.get(element) || 0;

  if (words > prevCount) {
    const delta = words - prevCount;
    countedMessages.set(element, words);
    
    if (type === 'asked') {
        saveData(delta, 0);
    } else {
        saveData(0, delta);
    }
  }
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    // Handle newly added nodes
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'USER-QUERY' || node.classList.contains('user-query')) {
          processNodeAddition(node, 'asked');
        } else if (node.tagName === 'MODEL-RESPONSE' || node.classList.contains('model-response')) {
          processNodeAddition(node, 'read');
        } else {
          node.querySelectorAll('user-query, .user-query').forEach(el => processNodeAddition(el, 'asked'));
          node.querySelectorAll('model-response, .model-response').forEach(el => processNodeAddition(el, 'read'));
        }
      }
    });

    // Handle text updates to existing nodes (streaming or editing)
    if (mutation.type === 'characterData' || mutation.type === 'childList') {
      let target = mutation.target;
      if (target.nodeType !== Node.ELEMENT_NODE) {
          target = target.parentElement;
      }
      
      if (target) {
        const userQuery = target.closest('user-query, .user-query');
        if (userQuery) {
            processNodeMutation(userQuery, 'asked');
        } else {
            const aiResponse = target.closest('model-response, .model-response');
            if (aiResponse) {
                processNodeMutation(aiResponse, 'read');
            }
        }
      }
    }
  });
});

// Start observing as soon as body is available or fallback to document element
const targetToObserve = document.body || document.documentElement;
observer.observe(targetToObserve, {
  childList: true,
  subtree: true,
  characterData: true
});
