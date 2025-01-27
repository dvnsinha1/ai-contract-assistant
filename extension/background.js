// Store the URL temporarily
let pendingUrl = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STORE_URL') {
    pendingUrl = message.url;
    sendResponse({ success: true });
  }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && 
      tab.url && 
      tab.url.startsWith('http://localhost:5173') && 
      pendingUrl) {
    // Inject the content script
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: (url) => {
        // Find the DocuSign URL input field
        const urlInput = document.querySelector('input#docusign-url');
        
        if (urlInput) {
          // Set the value
          urlInput.value = url;
          // Trigger input event to notify React
          urlInput.dispatchEvent(new Event('input', { bubbles: true }));

          // Find and click the analyze button after a short delay
          setTimeout(() => {
            // Find the button next to the input field
            const analyzeButton = urlInput.parentElement.querySelector('button');
            
            if (analyzeButton && !analyzeButton.disabled) {
              console.log('Found analyze button, clicking...');
              analyzeButton.click();
            } else {
              console.log('Could not find analyze button or button is disabled');
            }
          }, 1000); // Wait 1 second for React to process the input
        } else {
          console.log('Could not find DocuSign URL input field');
        }
      },
      args: [pendingUrl]
    });
    
    // Clear the pending URL
    pendingUrl = null;
  }
}); 