import express from 'express';
import { Router } from 'express';

const router: Router = express.Router();

// Endpoint to receive URLs from the Chrome extension
router.post('/url', async (req, res) => {
  try {
    const { url } = req.body;
    
    // Here you can implement the logic to handle the URL
    // For example, store it in a global variable or emit an event
    
    // For now, we'll just send a success response
    res.status(200).json({ message: 'URL received successfully', url });
  } catch (error) {
    console.error('Error processing URL:', error);
    res.status(500).json({ error: 'Failed to process URL' });
  }
});

export default router; 