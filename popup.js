document.addEventListener('DOMContentLoaded', () => {
  const inputWordsEl = document.getElementById('input-words');
  const readWordsEl = document.getElementById('read-words');
  const analogyEl = document.getElementById('analogy');
  const toggleWidget = document.getElementById('toggle-widget');

  const HARRY_POTTER_1_WORDS = 76944;

  const getTodayKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  };

  const updateUI = (data) => {
    const todayKey = getTodayKey();
    const stats = data[todayKey] || { input: 0, read: 0 };
    inputWordsEl.textContent = stats.input.toLocaleString();
    readWordsEl.textContent = stats.read.toLocaleString();
    
    const ratio = stats.read / HARRY_POTTER_1_WORDS;
    analogyEl.textContent = `${ratio.toFixed(4)}x of Harry Potter 1`;
  };

  chrome.storage.local.get(null, (result) => {
    updateUI(result);
    toggleWidget.checked = result.showWidget !== false; // default true
  });

  toggleWidget.addEventListener('change', (e) => {
    chrome.storage.local.set({ showWidget: e.target.checked });
  });

  // Listen for changes while popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      chrome.storage.local.get(null, updateUI);
    }
  });
});
