
export interface PDFDocument {
  id: string;
  name: string;
  description: string;
  file_path: string;
  password_hash?: string;
  password_protected: boolean;
  created_at: string;
}

export interface UploadPDFFormData {
  file: File;
  name: string;
  description: string;
  password?: string;
}

export interface PDFPassword {
  password: string;
}
