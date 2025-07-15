
import { PDFDocument, UploadPDFFormData, PDFPassword } from '../types/pdf';
import { toast } from 'sonner';

// This is a mock service that simulates API calls
// In a real application, these would be actual API calls to a backend

// Simulate local storage as our "database"
const getStoredPDFs = (): PDFDocument[] => {
  const pdfs = localStorage.getItem('pdfs');
  return pdfs ? JSON.parse(pdfs) : [];
};

const storePDFs = (pdfs: PDFDocument[]) => {
  localStorage.setItem('pdfs', JSON.stringify(pdfs));
};

// Simulate password hashing
const hashPassword = (password: string): string => {
  // In a real app, you would use bcrypt or similar
  // This is just a simple mock for demonstration
  return btoa(`secure-${password}`);
};

const verifyPassword = (inputPassword: string, hashedPassword: string): boolean => {
  // In a real app, you would use bcrypt.compare or similar
  return btoa(`secure-${inputPassword}`) === hashedPassword;
};

// Store password hashes separately for security
const passwords: Record<string, string> = {};

export const uploadPDF = async (data: UploadPDFFormData): Promise<PDFDocument> => {
  try {
    // Simulate file upload delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const id = Math.random().toString(36).substring(2, 15);
    const now = new Date().toISOString();
    
    // Read the file as data URL (base64)
    const fileReader = new FileReader();
    const fileDataPromise = new Promise<string>((resolve, reject) => {
      fileReader.onload = () => resolve(fileReader.result as string);
      fileReader.onerror = reject;
    });
    fileReader.readAsDataURL(data.file);
    
    const file_path = await fileDataPromise;
    
    const newPDF: PDFDocument = {
      id,
      name: data.name,
      description: data.description,
      file_path,
      password_protected: !!data.password,
      created_at: now,
    };
    
    // Store the PDF in our "database"
    const pdfs = getStoredPDFs();
    pdfs.push(newPDF);
    storePDFs(pdfs);
    
    // If password protected, store the hashed password
    if (data.password) {
      passwords[id] = hashPassword(data.password);
      localStorage.setItem('pdf_passwords', JSON.stringify(passwords));
    }
    
    toast.success('PDF uploaded successfully!');
    return newPDF;
  } catch (error) {
    console.error('Error uploading PDF:', error);
    toast.error('Failed to upload PDF. Please try again.');
    throw error;
  }
};

export const getAllPDFs = async (): Promise<PDFDocument[]> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return getStoredPDFs();
};

export const getPDFById = async (id: string): Promise<PDFDocument | null> => {
  const pdfs = getStoredPDFs();
  const pdf = pdfs.find(p => p.id === id);
  return pdf || null;
};

export const checkPDFPassword = async (id: string, passwordData: PDFPassword): Promise<boolean> => {
  try {
    // Retrieve stored passwords
    const storedPasswords = JSON.parse(localStorage.getItem('pdf_passwords') || '{}');
    const hashedPassword = storedPasswords[id];
    
    if (!hashedPassword) {
      return false;
    }
    
    return verifyPassword(passwordData.password, hashedPassword);
  } catch (error) {
    console.error('Error checking password:', error);
    return false;
  }
};

export const updatePDF = async (id: string, data: Partial<UploadPDFFormData>): Promise<PDFDocument | null> => {
  try {
    const pdfs = getStoredPDFs();
    const index = pdfs.findIndex(p => p.id === id);
    
    if (index === -1) {
      toast.error('PDF not found');
      return null;
    }
    
    let file_path = pdfs[index].file_path;
    
    // If there's a new file, process it
    if (data.file) {
      const fileReader = new FileReader();
      const fileDataPromise = new Promise<string>((resolve, reject) => {
        fileReader.onload = () => resolve(fileReader.result as string);
        fileReader.onerror = reject;
      });
      fileReader.readAsDataURL(data.file);
      file_path = await fileDataPromise;
    }
    
    // Update the PDF
    pdfs[index] = {
      ...pdfs[index],
      name: data.name || pdfs[index].name,
      description: data.description || pdfs[index].description,
      file_path,
      password_protected: data.password !== undefined ? !!data.password : pdfs[index].password_protected,
    };
    
    storePDFs(pdfs);
    
    // Update password if changed
    if (data.password !== undefined) {
      // Retrieve stored passwords
      const storedPasswords = JSON.parse(localStorage.getItem('pdf_passwords') || '{}');
      
      if (data.password) {
        storedPasswords[id] = hashPassword(data.password);
      } else {
        delete storedPasswords[id];
      }
      
      localStorage.setItem('pdf_passwords', JSON.stringify(storedPasswords));
    }
    
    toast.success('PDF updated successfully!');
    return pdfs[index];
  } catch (error) {
    console.error('Error updating PDF:', error);
    toast.error('Failed to update PDF. Please try again.');
    throw error;
  }
};

export const deletePDF = async (id: string): Promise<boolean> => {
  try {
    const pdfs = getStoredPDFs();
    const filteredPDFs = pdfs.filter(p => p.id !== id);
    
    if (filteredPDFs.length === pdfs.length) {
      toast.error('PDF not found');
      return false;
    }
    
    storePDFs(filteredPDFs);
    
    // Remove password if exists
    const storedPasswords = JSON.parse(localStorage.getItem('pdf_passwords') || '{}');
    if (storedPasswords[id]) {
      delete storedPasswords[id];
      localStorage.setItem('pdf_passwords', JSON.stringify(storedPasswords));
    }
    
    toast.success('PDF deleted successfully!');
    return true;
  } catch (error) {
    console.error('Error deleting PDF:', error);
    toast.error('Failed to delete PDF. Please try again.');
    return false;
  }
};
