// Minimal PDF.js worker implementation for Deno
self.onmessage = async function (event) {
  const data = event.data;
  
  // Log incoming message
  console.log('[PDF Worker] Received task:', data.action);
  
  try {
    // Handle different PDF.js worker tasks
    switch (data.action) {
      case 'GetTextContent':
        self.postMessage({
          taskId: data.taskId,
          data: { items: [] } // Return empty content to bypass worker
        });
        break;
        
      default:
        // For any other task, return empty result
        self.postMessage({
          taskId: data.taskId,
          data: null
        });
    }
  } catch (error) {
    console.error('[PDF Worker] Error:', error);
    self.postMessage({
      taskId: data.taskId,
      error: error.message
    });
  }
}; 