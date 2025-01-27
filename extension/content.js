// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_DOCUSIGN_URL') {
    // Find the DocuSign URL input field
    const urlInput = document.querySelector('input[placeholder*="DocuSign"]') || 
                    document.querySelector('input[placeholder*="docusign"]') ||
                    document.querySelector('input[aria-label*="DocuSign"]');
    
    if (urlInput) {
      // Set the value
      urlInput.value = message.url;
      // Trigger input event to notify React
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'URL input field not found' });
    }
  }
  return true; // Keep the message channel open for async response
}); 