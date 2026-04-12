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

// Track elements we've already counted to avoid double-counting on re-renders
const countedMessages = new WeakMap();

let dailyInput = 0;
let dailyRead = 0;
let isNavigating = true;
let currentPath = window.location.pathname;

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
    if (area === 'local' && changes.showWidget && widget) {
      widget.style.display = changes.showWidget.newValue ? 'block' : 'none';
    }
  });
}

function saveData() {
  if (!isContextValid()) return;
  const todayKey = getTodayKey();
  const updateObj = {};
  updateObj[todayKey] = { input: dailyInput, read: dailyRead };
  chrome.storage.local.set(updateObj);
}

// ----------------- Tracking Logic -----------------

function processMessage(element, type) {
  // Use a cleaner text extraction to avoid counting UI text (like "Copy", "Share", etc)
  // Gemini puts message content in specific sub-elements
  let contentElement = element;
  if (type === 'read') {
    contentElement = element.querySelector('.markdown') || element.querySelector('.message-content') || element;
  } else {
    contentElement = element.querySelector('.query-content') || element;
  }

  const text = contentElement.innerText || "";
  const words = countWords(text);
  const prevCount = countedMessages.get(element) || 0;

  if (words > prevCount) {
    const delta = words - prevCount;
    if (type === 'asked') dailyInput += delta;
    else dailyRead += delta;
    
    countedMessages.set(element, words);
    saveData();
    updateWidget();
  }
}

// Mark history to ignore it
function seedHistory() {
  document.querySelectorAll('user-query, model-response').forEach(el => {
    const text = el.innerText || "";
    countedMessages.set(el, countWords(text));
  });
}

function handleNavigation() {
  isNavigating = true;
  setTimeout(() => {
    seedHistory();
    isNavigating = false;
  }, 2000);
}

setInterval(() => {
  if (window.location.pathname !== currentPath) {
    currentPath = window.location.pathname;
    handleNavigation();
  }
}, 1000);

handleNavigation();

const observer = new MutationObserver((mutations) => {
  if (isNavigating) return;

  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Check if the added node is a message or contains messages
        if (node.tagName === 'USER-QUERY' || node.classList.contains('user-query')) {
          processMessage(node, 'asked');
        } else if (node.tagName === 'MODEL-RESPONSE' || node.classList.contains('model-response')) {
          processMessage(node, 'read');
        } else {
          node.querySelectorAll('user-query, model-response').forEach(el => {
            const type = el.tagName === 'USER-QUERY' ? 'asked' : 'read';
            processMessage(el, type);
          });
        }
      }
    });

    // Handle streaming updates to existing responses
    if (mutation.type === 'characterData' || mutation.type === 'childList') {
      const target = mutation.target.parentElement;
      if (target) {
        const aiResponse = target.closest('model-response');
        if (aiResponse) processMessage(aiResponse, 'read');
      }
    }
  });
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true
});
