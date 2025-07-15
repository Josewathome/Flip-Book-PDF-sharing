# PDF Database API

This is a REST API server that provides database storage for the PDF viewer application using your external MySQL database.

## Setup Instructions

### 1. Install Dependencies

```bash
cd database-api
npm install
```

### 2. Database Configuration

The API is configured to connect to your MySQL database with these credentials:
- Host: 165.140.159.174
- Username: gre8_josemain
- Password: LZot1208FaKru
- Database: gre8_aria

### 3. Start the Server

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will run on port 3001 by default.

### 4. Database Tables

The API will automatically create the following tables if they don't exist:

#### pdf_files
- `id` (VARCHAR(255), PRIMARY KEY) - Unique file identifier
- `file_name` (VARCHAR(500)) - Original filename
- `file_data` (LONGBLOB) - File content stored as binary data
- `file_type` (VARCHAR(100)) - MIME type
- `file_size` (BIGINT) - File size in bytes
- `user_id` (VARCHAR(255)) - User who uploaded the file
- `uploaded_at` (TIMESTAMP) - Upload timestamp

#### pdf_embeddings
- `id` (VARCHAR(255), PRIMARY KEY) - Unique embedding identifier
- `pdf_id` (VARCHAR(255)) - Reference to PDF
- `embedding_data` (LONGTEXT) - JSON string containing embeddings
- `created_at` (TIMESTAMP) - Creation timestamp

#### pdf_podcasts
- `id` (VARCHAR(255), PRIMARY KEY) - Unique podcast identifier
- `pdf_id` (VARCHAR(255)) - Reference to PDF
- `audio_data` (LONGBLOB) - Audio file content
- `audio_type` (VARCHAR(100)) - Audio MIME type
- `created_at` (TIMESTAMP) - Creation timestamp

## API Endpoints

### Files
- `POST /api/files/upload` - Upload a new file
- `GET /api/files/:fileId` - Get file data
- `DELETE /api/files/:fileId` - Delete a file

### Embeddings
- `POST /api/embeddings` - Store PDF embeddings
- `GET /api/embeddings/:pdfId` - Get PDF embeddings

### Podcasts
- `POST /api/podcasts` - Store podcast audio
- `GET /api/podcasts/:pdfId` - Get podcast audio

### Health Check
- `GET /api/health` - Server health status

## Security Considerations

1. **File Size Limits**: The API accepts files up to 50MB. Adjust the limit in `server.js` if needed.

2. **Database Security**: Ensure your MySQL database has proper security configurations:
   - Use strong passwords
   - Limit network access
   - Regular backups

3. **CORS**: The API currently allows all origins. In production, configure CORS to only allow your domain.

4. **Authentication**: Consider adding authentication middleware to protect the API endpoints.

## Deployment

### Option 1: Same Server as Database
Deploy the API on the same server as your MySQL database (165.140.159.174).

### Option 2: Separate Server
Deploy on a separate server but ensure network connectivity to your database.

### Environment Variables
You can override database configuration using environment variables:
- `DB_HOST`
- `DB_USER` 
- `DB_PASSWORD`
- `DB_NAME`
- `PORT`

## Monitoring

The API includes basic error logging. Consider adding:
- Request logging middleware
- Performance monitoring
- Health check endpoints
- Database connection monitoring

## Troubleshooting

### Connection Issues
1. Verify database credentials
2. Check network connectivity
3. Ensure MySQL server is running
4. Check firewall settings

### Large File Issues
1. Increase MySQL `max_allowed_packet` setting
2. Adjust Node.js memory limits
3. Consider file compression

### Performance Issues
1. Add database indexes
2. Implement connection pooling (already included)
3. Consider file caching strategies