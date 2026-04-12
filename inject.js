/* Injected directly into the page context to access window.fetch and XHR */

(function() {
  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest;

  function countWords(str) {
    if (!str || typeof str !== 'string') return 0;
    const matches = str.match(/\b\w+\b/g);
    return matches ? matches.length : 0;
  }

  function processPayload(text, isInput) {
    // This is a naive extraction since Google's API payload is obfuscated nested arrays.
    // It extracts long strings that are likely the chat text.
    let words = 0;
    try {
      const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const str = match[1];
        // Filter out short strings or likely JSON keys/IDs
        if (str.length > 20 && str.includes(' ')) {
          words += countWords(str);
        }
      }
    } catch (e) {
      console.error("Error processing payload", e);
    }
    
    if (words > 0) {
      window.postMessage({
        type: 'GEMINI_WORD_TRACKER',
        direction: isInput ? 'input' : 'read',
        wordCount: words
      }, '*');
    }
  }

  // Intercept Fetch
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
    
    // Process Request Body (Input)
    if (url.includes('/BardChatUi/') || url.includes('/GenerateAnswer') || url.includes('CreateConversation')) {
      try {
        let body = '';
        if (args[1] && args[1].body) {
          body = args[1].body;
        } else if (args[0] && args[0].body) {
          body = typeof args[0].text === 'function' ? await args[0].clone().text() : '';
        }
        if (typeof body === 'string' && body.length > 0) {
          processPayload(body, true);
        }
      } catch (e) {}
    }

    const response = await originalFetch.apply(this, args);
    
    // Process Response Body (Read)
    if (url.includes('/BardChatUi/') || url.includes('/GenerateAnswer') || url.includes('CreateConversation')) {
      try {
        const clonedResponse = response.clone();
        clonedResponse.text().then(text => {
          processPayload(text, false);
        }).catch(e => {});
      } catch(e) {}
    }
    
    return response;
  };

  // Intercept XHR
  const originalOpen = originalXHR.prototype.open;
  const originalSend = originalXHR.prototype.send;

  originalXHR.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  originalXHR.prototype.send = function(body) {
    if (this._url && (this._url.includes('/BardChatUi/') || this._url.includes('/GenerateAnswer') || this._url.includes('CreateConversation'))) {
      if (body && typeof body === 'string') {
        processPayload(body, true);
      }
      this.addEventListener('load', function() {
        if (this.responseText) {
          processPayload(this.responseText, false);
        }
      });
    }
    return originalSend.apply(this, arguments);
  };
})();
