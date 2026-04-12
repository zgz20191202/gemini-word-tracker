/* Content Script - Robust DOM-based Tracker */

const HARRY_POTTER_1_WORDS = 76944;

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
}

function countWords(str) {
  if (!str || typeof str !== 'string') return 0;
  const matches = str.match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

const IGNORE_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'IFRAME', 'BUTTON'];
const processedTextNodes = new WeakMap();

let dailyInput = 0;
let dailyRead = 0;
let maxUnsentInputWords = 0;

let isNavigating = true;
let currentPath = window.location.pathname;

let widget = null;
let inputEl, readEl, analogyEl;

// ----------------- Widget UI -----------------

function updateWidget() {
  if (!widget) return;
  const displayedInput = dailyInput + maxUnsentInputWords;
  if (inputEl) inputEl.textContent = displayedInput.toLocaleString();
  if (readEl) readEl.textContent = dailyRead.toLocaleString();
  const ratio = dailyRead / HARRY_POTTER_1_WORDS;
  if (analogyEl) analogyEl.textContent = `${ratio.toFixed(4)}x Harry Potter 1`;
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
    <div class="gwt-stat">Sent: <span id="gwt-input">0</span></div>
    <div class="gwt-stat">Read: <span id="gwt-read">0</span></div>
    <div class="gwt-analogy" id="gwt-analogy">0.00x Harry Potter 1</div>
  `;
  targetNode.appendChild(widget);

  inputEl = document.getElementById('gwt-input');
  readEl = document.getElementById('gwt-read');
  analogyEl = document.getElementById('gwt-analogy');

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
}

initUI();

// Listen for updates from popup (e.g., toggling widget visibility)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.showWidget && widget) {
      widget.style.display = changes.showWidget.newValue ? 'block' : 'none';
    }
  }
});

// ----------------- Data Storage -----------------

function saveData() {
  const todayKey = getTodayKey();
  const updateObj = {};
  updateObj[todayKey] = {
    input: dailyInput,
    read: dailyRead
  };
  chrome.storage.local.set(updateObj);
}

// ----------------- Input Tracking -----------------

document.addEventListener('input', (e) => {
  const target = e.target;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
    const text = target.textContent || target.value || '';
    const words = countWords(text);
    
    if (words > maxUnsentInputWords) {
      maxUnsentInputWords = words;
    }
    
    // Commit if the user clears the input box (e.g. hits send)
    if (words === 0 && maxUnsentInputWords > 0) {
      dailyInput += maxUnsentInputWords;
      maxUnsentInputWords = 0;
      saveData();
    }
    
    updateWidget();
  }
});

window.addEventListener('beforeunload', () => {
  if (maxUnsentInputWords > 0) {
    dailyInput += maxUnsentInputWords;
    maxUnsentInputWords = 0;
    saveData();
  }
});

// ----------------- Output Tracking -----------------

// Marks existing nodes on page load or after a thread switch so we don't count history.
function markExistingNodes() {
  const target = document.body || document.documentElement;
  if (!target) return;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null, false);
  let textNode;
  while ((textNode = walker.nextNode())) {
    processedTextNodes.set(textNode, countWords(textNode.nodeValue));
  }
}

function handleNavigation() {
  isNavigating = true;
  // Allow time for history to render before we mark them as processed
  setTimeout(() => {
    markExistingNodes();
    isNavigating = false;
  }, 2000);
}

// Poll for SPA URL changes
setInterval(() => {
  if (window.location.pathname !== currentPath) {
    currentPath = window.location.pathname;
    handleNavigation();
  }
}, 500);

window.addEventListener('popstate', () => {
  if (window.location.pathname !== currentPath) {
    currentPath = window.location.pathname;
    handleNavigation();
  }
});

handleNavigation(); // Trigger on initial load

function handleTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return;
  if (IGNORE_TAGS.includes(parent.tagName)) return;
  if (parent.isContentEditable || parent.tagName === 'TEXTAREA' || parent.tagName === 'INPUT') return;

  const text = node.nodeValue;
  const words = countWords(text);
  const prevWords = processedTextNodes.get(node) || 0;
  
  if (words > prevWords) {
    const delta = words - prevWords;
    dailyRead += delta;
    processedTextNodes.set(node, words);
    saveData();
    updateWidget();
  }
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    if (isNavigating) return;

    if (mutation.type === 'characterData') {
      handleTextNode(mutation.target);
    } else if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          handleTextNode(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
          let textNode;
          while ((textNode = walker.nextNode())) {
            handleTextNode(textNode);
          }
        }
      });
    }
  });
});

function startObserver() {
  const target = document.body || document.documentElement;
  if (target) {
    observer.observe(target, {
      childList: true,
      characterData: true,
      subtree: true
    });
  } else {
    setTimeout(startObserver, 100);
  }
}
startObserver();
