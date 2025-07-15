import { toast } from 'sonner';

// Database configuration
const DB_CONFIG = {
  host: '165.140.159.174',
  username: 'gre8_josemain',
  password: 'LZot1208FaKru',
  database: 'gre8_aria'
};

// Database service for external MySQL database
export class DatabaseService {
  private static instance: DatabaseService;
  private baseUrl: string;

  private constructor() {
    // You'll need to set up a REST API endpoint for your database
    // This could be a simple Express.js server or any other backend
    this.baseUrl = `http://${DB_CONFIG.host}:3001/api`; // Adjust port as needed
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Upload file to database
  async uploadFile(file: File, fileName: string, userId: string): Promise<string> {
    try {
      // Convert file to base64 for database storage
      const base64Data = await this.fileToBase64(file);
      
      const response = await fetch(`${this.baseUrl}/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName,
          fileData: base64Data,
          fileType: file.type,
          fileSize: file.size,
          userId,
          uploadedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.fileId; // Return the file ID from database
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  // Get file URL from database
  async getFileUrl(fileId: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/files/${fileId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get file: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Return a data URL for the file
      return `data:${result.fileType};base64,${result.fileData}`;
    } catch (error) {
      console.error('Error getting file:', error);
      throw error;
    }
  }

  // Delete file from database
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
        method: 'DELETE'
      });

      return response.ok;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  // Helper method to convert file to base64
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix to get just the base64 data
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  }

  // Store embeddings in database
  async storeEmbeddings(pdfId: string, embeddings: any): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfId,
          embeddingData: JSON.stringify(embeddings),
          createdAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to store embeddings: ${response.statusText}`);
      }

      const result = await response.json();
      return result.embeddingId;
    } catch (error) {
      console.error('Error storing embeddings:', error);
      throw error;
    }
  }

  // Get embeddings from database
  async getEmbeddings(pdfId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings/${pdfId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get embeddings: ${response.statusText}`);
      }

      const result = await response.json();
      return JSON.parse(result.embeddingData);
    } catch (error) {
      console.error('Error getting embeddings:', error);
      throw error;
    }
  }

  // Store podcast audio in database
  async storePodcastAudio(pdfId: string, audioBlob: Blob): Promise<string> {
    try {
      const base64Audio = await this.blobToBase64(audioBlob);
      
      const response = await fetch(`${this.baseUrl}/podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfId,
          audioData: base64Audio,
          audioType: 'audio/mp3',
          createdAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to store podcast: ${response.statusText}`);
      }

      const result = await response.json();
      return result.podcastId;
    } catch (error) {
      console.error('Error storing podcast:', error);
      throw error;
    }
  }

  // Get podcast audio from database
  async getPodcastAudio(pdfId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/podcasts/${pdfId}`);
      
      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return `data:${result.audioType};base64,${result.audioData}`;
    } catch (error) {
      console.error('Error getting podcast:', error);
      return null;
    }
  }

  // Helper method to convert blob to base64
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  }
}

export const databaseService = DatabaseService.getInstance();