
import { supabase } from "@/integrations/supabase/client";
import { PDFDocument, UploadPDFFormData, PDFPassword } from '../types/pdf';
import { toast } from 'sonner';
import { databaseService } from './databaseService';

// Simulate password hashing (in a real app, this would be done securely on the server)
const hashPassword = (password: string): string => {
  // This is just a simple hash for demonstration
  return btoa(`secure-${password}`);
};

const verifyPassword = (inputPassword: string, hashedPassword: string): boolean => {
  return btoa(`secure-${inputPassword}`) === hashedPassword;
};

export const uploadPDF = async (data: UploadPDFFormData): Promise<PDFDocument | null> => {
  try {
    // Check if user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.error('You must be logged in to upload PDFs');
      return null;
    }

    const userId = sessionData.session.user.id;

    // Upload file to external database
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${data.file.name}`;
    const fileId = await databaseService.uploadFile(data.file, fileName, userId);
    
    // Insert metadata into database
    const newPDF = {
      name: data.name,
      description: data.description,
      file_path: fileId, // Store file ID instead of URL
      password_hash: data.password ? hashPassword(data.password) : null,
      password_protected: !!data.password,
      user_id: userId // Associate PDF with current user
    };

    const { data: insertedData, error: insertError } = await supabase
      .from('pdfs')
      .insert([newPDF])
      .select()
      .single();

    if (insertError) {
      // If there was an error inserting metadata, clean up the uploaded file
      await databaseService.deleteFile(fileId);
      throw insertError;
    }

    toast.success('PDF uploaded successfully!');
    return insertedData;
  } catch (error) {
    console.error('Error uploading PDF:', error);
    toast.error('Failed to upload PDF. Please try again.');
    return null;
  }
};

export const getAllPDFs = async (): Promise<PDFDocument[]> => {
  try {
    // Get current user
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.error('You must be logged in to view your PDFs');
      return [];
    }

    const userId = sessionData.session.user.id;

    // Get PDFs for the current user only
    const { data, error } = await supabase
      .from('pdfs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching PDFs:', error);
    toast.error('Failed to fetch PDFs. Please try again.');
    return [];
  }
};

export const getPDFById = async (id: string): Promise<PDFDocument | null> => {
  try {
    // Get PDF metadata from Supabase
    const { data, error } = await supabase
      .from('pdfs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    // Get file URL from external database
    const fileUrl = await databaseService.getFileUrl(data.file_path);
    
    return {
      ...data,
      file_path: fileUrl // Replace file ID with actual file URL
    };
  } catch (error) {
    console.error('Error fetching PDF:', error);
    return null;
  }
};

export const checkPDFPassword = async (id: string, passwordData: PDFPassword): Promise<boolean> => {
  try {
    // No authentication required for checking password
    const { data, error } = await supabase
      .from('pdfs')
      .select('password_hash')
      .eq('id', id)
      .single();

    if (error || !data) {
      return false;
    }

    return verifyPassword(passwordData.password, data.password_hash);
  } catch (error) {
    console.error('Error checking password:', error);
    return false;
  }
};

export const updatePDF = async (id: string, data: Partial<UploadPDFFormData>): Promise<PDFDocument | null> => {
  try {
    // Check if user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.error('You must be logged in to update PDFs');
      return null;
    }

    const userId = sessionData.session.user.id;

    // Get the existing PDF
    const { data: existingPDF, error: fetchError } = await supabase
      .from('pdfs')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)  // Ensure user owns this PDF
      .single();

    if (fetchError || !existingPDF) {
      toast.error('PDF not found or you do not have permission to update it');
      return null;
    }

    const updateData: any = {
      name: data.name || existingPDF.name,
      description: data.description || existingPDF.description,
    };

    // Handle password changes
    if (data.password !== undefined) {
      updateData.password_hash = data.password ? hashPassword(data.password) : null;
      updateData.password_protected = !!data.password;
    }

    // If there's a new file, upload it
    if (data.file) {
      // Upload new file to external database
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${data.file.name}`;
      const newFileId = await databaseService.uploadFile(data.file, fileName, userId);
      updateData.file_path = newFileId;

      // Delete old file
      if (existingPDF.file_path) {
        await databaseService.deleteFile(existingPDF.file_path);
      }
    }

    // Update the database
    const { data: updatedData, error: updateError } = await supabase
      .from('pdfs')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)  // Ensure user owns this PDF
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    toast.success('PDF updated successfully!');
    return updatedData;
  } catch (error) {
    console.error('Error updating PDF:', error);
    toast.error('Failed to update PDF. Please try again.');
    return null;
  }
};

export const deletePDF = async (id: string): Promise<boolean> => {
  try {
    // Check if user is authenticated
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.error('You must be logged in to delete PDFs');
      return false;
    }

    const userId = sessionData.session.user.id;

    // Get the file path to delete from storage
    const { data: pdfData, error: fetchError } = await supabase
      .from('pdfs')
      .select('file_path, user_id')
      .eq('id', id)
      .eq('user_id', userId)  // Ensure user owns this PDF
      .single();

    if (fetchError || !pdfData) {
      toast.error('PDF not found or you do not have permission to delete it');
      return false;
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('pdfs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);  // Ensure user owns this PDF

    if (deleteError) {
      throw deleteError;
    }

    // Delete from external database storage
    if (pdfData && pdfData.file_path) {
      await databaseService.deleteFile(pdfData.file_path);
    }

    toast.success('PDF deleted successfully!');
    return true;
  } catch (error) {
    console.error('Error deleting PDF:', error);
    toast.error('Failed to delete PDF. Please try again.');
    return false;
  }
};
