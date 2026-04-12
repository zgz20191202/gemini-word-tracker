/* Injected directly into the page context to access window.fetch and XHR */

(function() {
  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest;

  function countWords(str) {
    if (!str || typeof str !== 'string') return 0;
    const words = str.trim().split(/\s+/);
    return words.length > 0 && words[0] !== '' ? words.length : 0;
  }

  function processPayload(text, isInput) {
    let words = 0;
    try {
      let decodedText = text.replace(/\\u[\dA-F]{4}/gi, (match) => {
          return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
      });

      const regex = /"((?:[^"\\]|\\.)*)"/g;
      let match;
      let maxWords = 0;
      while ((match = regex.exec(decodedText)) !== null) {
        let str = match[1];
        str = str.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        
        if (str.length > 20 && str.includes(' ')) {
           const currentWords = countWords(str);
           if (currentWords > maxWords) {
             maxWords = currentWords;
           }
        }
      }
      words = maxWords;
    } catch (e) {}
    
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
    
    const isGeminiApi = url.includes('/BardChatUi/') || url.includes('StreamGenerate') || url.includes('generate');

    if (isGeminiApi) {
      try {
        let body = '';
        if (args[1] && args[1].body) {
          body = typeof args[1].body === 'string' ? args[1].body : '';
        } else if (args[0] && args[0].body && typeof args[0].clone === 'function') {
          try {
             const reqClone = args[0].clone();
             body = await reqClone.text();
          } catch(e) {}
        }
        
        if (body.length > 0) {
          try {
             let decodedBody = decodeURIComponent(body.replace(/\+/g, ' '));
             processPayload(decodedBody, true);
          } catch(e) {
             processPayload(body, true);
          }
        }
      } catch (e) {}
    }

    const response = await originalFetch.apply(this, args);
    
    if (isGeminiApi) {
      try {
        const clonedResponse = response.clone();
        if (clonedResponse.body) {
          const reader = clonedResponse.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let fullText = "";
          
          (async () => {
            while (true) {
              try {
                const { value, done } = await reader.read();
                if (value) {
                  fullText += decoder.decode(value, { stream: !done });
                }
                if (done) {
                  processPayload(fullText, false);
                  break;
                }
              } catch(e) {
                break;
              }
            }
          })();
        } else {
          clonedResponse.text().then(text => {
            processPayload(text, false);
          }).catch(e => {});
        }
      } catch(e) {}
    }
    
    return response;
  };

  const originalOpen = originalXHR.prototype.open;
  const originalSend = originalXHR.prototype.send;

  originalXHR.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  originalXHR.prototype.send = function(body) {
    const isGeminiApi = this._url && (this._url.includes('/BardChatUi/') || this._url.includes('StreamGenerate') || this._url.includes('generate'));
    
    if (isGeminiApi) {
      if (body && typeof body === 'string') {
         try {
             let decodedBody = decodeURIComponent(body.replace(/\+/g, ' '));
             processPayload(decodedBody, true);
          } catch(e) {
             processPayload(body, true);
          }
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
