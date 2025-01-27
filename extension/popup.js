document.addEventListener('DOMContentLoaded', function() {
  const grabUrlButton = document.getElementById('grabUrl');
  const statusDiv = document.getElementById('status');

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

  // Function to get the API base URL
  const getApiBaseUrl = () => {
    // Check if we're in development mode (you can add more sophisticated checks)
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3001';
    }
    return 'https://ai-contract-assistant.vercel.app';
  };

  // Function to get the client URL
  const getClientUrl = () => {
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:5173';
    }
    return 'https://ai-contract-assistant.vercel.app';
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

      // Send the URL to your Contract Assistant application
      const response = await fetch(`${getApiBaseUrl()}/api/contract/url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ url }),
      });

      if (response.ok) {
        showStatus('URL sent successfully! Redirecting...', 'success');

        // Store URL in background script
        await chrome.runtime.sendMessage({ type: 'STORE_URL', url });

        // Find or create frontend tab
        const frontendTabs = await chrome.tabs.query({
          url: `${getClientUrl()}/*`
        });

        if (frontendTabs.length > 0) {
          // Frontend tab exists, reload it
          await chrome.tabs.reload(frontendTabs[0].id);
          await chrome.tabs.update(frontendTabs[0].id, { active: true });
        } else {
          // No frontend tab found, create one
          chrome.tabs.create({ 
            url: getClientUrl()
          });
        }

        // Close the popup after a short delay
        setTimeout(() => window.close(), 1500);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send URL');
      }
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
}); 