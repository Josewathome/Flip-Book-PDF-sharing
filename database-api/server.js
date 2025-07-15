const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;

// Database configuration
const dbConfig = {
  host: '165.140.159.174',
  user: 'gre8_josemain',
  password: 'LZot1208FaKru',
  database: 'gre8_aria',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// Initialize database tables
async function initializeTables() {
  try {
    const connection = await pool.getConnection();
    
    // Create files table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pdf_files (
        id VARCHAR(255) PRIMARY KEY,
        file_name VARCHAR(500) NOT NULL,
        file_data LONGBLOB NOT NULL,
        file_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_uploaded_at (uploaded_at)
      )
    `);

    // Create embeddings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pdf_embeddings (
        id VARCHAR(255) PRIMARY KEY,
        pdf_id VARCHAR(255) NOT NULL,
        embedding_data LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pdf_id (pdf_id)
      )
    `);

    // Create podcasts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pdf_podcasts (
        id VARCHAR(255) PRIMARY KEY,
        pdf_id VARCHAR(255) NOT NULL,
        audio_data LONGBLOB NOT NULL,
        audio_type VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pdf_id (pdf_id)
      )
    `);

    console.log('✅ Database tables initialized');
    connection.release();
  } catch (error) {
    console.error('❌ Failed to initialize tables:', error);
    process.exit(1);
  }
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Routes

// Upload file
app.post('/api/files/upload', async (req, res) => {
  try {
    const { fileName, fileData, fileType, fileSize, userId } = req.body;
    
    if (!fileName || !fileData || !fileType || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const fileId = generateId();
    const fileBuffer = Buffer.from(fileData, 'base64');

    const connection = await pool.getConnection();
    await connection.execute(
      'INSERT INTO pdf_files (id, file_name, file_data, file_type, file_size, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [fileId, fileName, fileBuffer, fileType, fileSize, userId]
    );
    connection.release();

    res.json({ fileId, message: 'File uploaded successfully' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get file
app.get('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT file_data, file_type, file_name FROM pdf_files WHERE id = ?',
      [fileId]
    );
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = rows[0];
    const fileData = file.file_data.toString('base64');

    res.json({
      fileData,
      fileType: file.file_type,
      fileName: file.file_name
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// Delete file
app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    const connection = await pool.getConnection();
    const [result] = await connection.execute(
      'DELETE FROM pdf_files WHERE id = ?',
      [fileId]
    );
    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Store embeddings
app.post('/api/embeddings', async (req, res) => {
  try {
    const { pdfId, embeddingData } = req.body;
    
    if (!pdfId || !embeddingData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const embeddingId = generateId();

    const connection = await pool.getConnection();
    await connection.execute(
      'INSERT INTO pdf_embeddings (id, pdf_id, embedding_data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE embedding_data = VALUES(embedding_data)',
      [embeddingId, pdfId, embeddingData]
    );
    connection.release();

    res.json({ embeddingId, message: 'Embeddings stored successfully' });
  } catch (error) {
    console.error('Store embeddings error:', error);
    res.status(500).json({ error: 'Failed to store embeddings' });
  }
});

// Get embeddings
app.get('/api/embeddings/:pdfId', async (req, res) => {
  try {
    const { pdfId } = req.params;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT embedding_data FROM pdf_embeddings WHERE pdf_id = ? ORDER BY created_at DESC LIMIT 1',
      [pdfId]
    );
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Embeddings not found' });
    }

    res.json({
      embeddingData: rows[0].embedding_data
    });
  } catch (error) {
    console.error('Get embeddings error:', error);
    res.status(500).json({ error: 'Failed to get embeddings' });
  }
});

// Store podcast
app.post('/api/podcasts', async (req, res) => {
  try {
    const { pdfId, audioData, audioType } = req.body;
    
    if (!pdfId || !audioData || !audioType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const podcastId = generateId();
    const audioBuffer = Buffer.from(audioData, 'base64');

    const connection = await pool.getConnection();
    await connection.execute(
      'INSERT INTO pdf_podcasts (id, pdf_id, audio_data, audio_type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE audio_data = VALUES(audio_data), audio_type = VALUES(audio_type)',
      [podcastId, pdfId, audioBuffer, audioType]
    );
    connection.release();

    res.json({ podcastId, message: 'Podcast stored successfully' });
  } catch (error) {
    console.error('Store podcast error:', error);
    res.status(500).json({ error: 'Failed to store podcast' });
  }
});

// Get podcast
app.get('/api/podcasts/:pdfId', async (req, res) => {
  try {
    const { pdfId } = req.params;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT audio_data, audio_type FROM pdf_podcasts WHERE pdf_id = ? ORDER BY created_at DESC LIMIT 1',
      [pdfId]
    );
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Podcast not found' });
    }

    const podcast = rows[0];
    const audioData = podcast.audio_data.toString('base64');

    res.json({
      audioData,
      audioType: podcast.audio_type
    });
  } catch (error) {
    console.error('Get podcast error:', error);
    res.status(500).json({ error: 'Failed to get podcast' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  await testConnection();
  await initializeTables();
  
  app.listen(PORT, () => {
    console.log(`🚀 Database API server running on port ${PORT}`);
    console.log(`📊 Database: ${dbConfig.database} on ${dbConfig.host}`);
  });
}

startServer().catch(console.error);