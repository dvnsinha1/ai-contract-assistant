document.addEventListener('DOMContentLoaded', function() {
  const grabUrlButton = document.getElementById('grabUrl');
  const statusDiv = document.getElementById('status');

  // Configuration
  const BACKEND_URL = 'https://ai-contract-assistant-backend.vercel.app';
  const FRONTEND_URL = 'https://ai-contract-assistant.vercel.app';

  // Function to validate DocuSign URL
  const isDocuSignUrl = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('docusign.com') || urlObj.hostname.includes('docusign.net');
    } catch {
      return false;
    }
  };

  // Function to show status message
  const showStatus = (message, type) => {
    statusDiv.textContent = message;
    statusDiv.className = type; // 'error' or 'success'
  };

  grabUrlButton.addEventListener('click', async () => {
    try {
      // Get the current tab's URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url;

      // Validate if it's a DocuSign URL
      if (!isDocuSignUrl(url)) {
        showStatus('Error: Please open a DocuSign contract page to analyze', 'error');
        return;
      }

      showStatus('Sending URL to Contract Assistant...', 'info');

      // Send the URL to your Contract Assistant application
      const response = await fetch(`${BACKEND_URL}/api/contract/url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'include',
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      showStatus('URL sent successfully! Redirecting...', 'success');

      // Store URL in background script
      await chrome.runtime.sendMessage({ type: 'STORE_URL', url });

      // Find or create frontend tab
      const frontendTabs = await chrome.tabs.query({
        url: `${FRONTEND_URL}/*`
      });

      if (frontendTabs.length > 0) {
        // Frontend tab exists, reload it
        await chrome.tabs.reload(frontendTabs[0].id);
        await chrome.tabs.update(frontendTabs[0].id, { active: true });
      } else {
        // No frontend tab found, create one
        chrome.tabs.create({ 
          url: FRONTEND_URL
        });
      }

      // Close the popup after a short delay
      setTimeout(() => window.close(), 1500);
    } catch (error) {
      console.error('Extension error:', error);
      showStatus(`Error: ${error.message || 'Failed to connect to Contract Assistant'}`, 'error');
    }
  });
}); 