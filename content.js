/* Content Script - Multilingual DOM-based Tracker */

const HARRY_POTTER_1_WORDS = 76944;

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
}

/**
 * Robust word counter for English, Chinese, Japanese, and Korean.
 * - English/Latin: Counts words separated by spaces/punctuation.
 * - CJK: Counts each character as a "word" (standard for metrics).
 */
function countWords(str) {
  if (!str || typeof str !== 'string') return 0;
  
  // Latin/English/Numeric words
  const latinMatches = str.match(/[a-zA-Z0-9\u00C0-\u017F]+/g) || [];
  
  // CJK characters (each char is a word)
  // \u4e00-\u9fa5 : Chinese
  // \u3040-\u309f : Hiragana
  // \u30a0-\u30ff : Katakana
  // \uac00-\ud7af : Hangul
  const cjkMatches = str.match(/[\u4e00-\u9fa5]|[\u3040-\u309f]|[\u30a0-\u30ff]|[\uac00-\ud7af]/g) || [];
  
  return latinMatches.length + cjkMatches.length;
}

const IGNORE_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'IFRAME', 'BUTTON'];
const processedTextNodes = new WeakMap();

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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.showWidget && widget) {
    widget.style.display = changes.showWidget.newValue ? 'block' : 'none';
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

// ----------------- Message Detection -----------------

/**
 * Check if a text node belongs to a User Message bubble.
 */
function isUserMessage(node) {
  const parent = node.parentElement;
  if (!parent) return false;
  // Gemini selectors for user prompts
  return !!(
    parent.closest('user-query') || 
    parent.closest('.query-content') || 
    parent.closest('.user-query')
  );
}

/**
 * Check if a text node belongs to an AI Response bubble.
 */
function isAiMessage(node) {
  const parent = node.parentElement;
  if (!parent) return false;
  // Gemini selectors for AI responses
  return !!(
    parent.closest('model-response') || 
    parent.closest('.model-response-text') || 
    parent.closest('.markdown') ||
    parent.closest('.message-content')
  );
}

// ----------------- Output Tracking -----------------

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
  setTimeout(() => {
    markExistingNodes();
    isNavigating = false;
  }, 2000);
}

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

handleNavigation();

function handleTextNode(node) {
  const parent = node.parentElement;
  if (!parent) return;
  if (IGNORE_TAGS.includes(parent.tagName)) return;
  
  // EXCLUDE THE TYPING BOX (ContentEditable)
  if (parent.isContentEditable || parent.tagName === 'TEXTAREA' || parent.tagName === 'INPUT' || parent.closest('[contenteditable="true"]')) {
    return;
  }

  const text = node.nodeValue;
  const words = countWords(text);
  const prevWords = processedTextNodes.get(node) || 0;
  
  if (words > prevWords) {
    const delta = words - prevWords;
    
    // DIFFERENTIATE: Sent vs Read
    if (isUserMessage(node)) {
      dailyInput += delta;
      processedTextNodes.set(node, words);
      saveData();
      updateWidget();
    } else if (isAiMessage(node)) {
      dailyRead += delta;
      processedTextNodes.set(node, words);
      saveData();
      updateWidget();
    }
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
