
import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FileIcon, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { PDFDocument } from '@/types/pdf';
import { updatePDF } from '@/services/supabaseService';

interface EditPDFDialogProps {
  pdf: PDFDocument;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (updatedPdf: PDFDocument) => void;
}

const formSchema = z.object({
  name: z.string().min(1, 'PDF name is required'),
  description: z.string().min(1, 'Description is required'),
  password: z.string().optional(),
  changePassword: z.boolean().default(false),
  removePassword: z.boolean().default(false),
  file: z.any().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const EditPDFDialog = ({ pdf, isOpen, onClose, onComplete }: EditPDFDialogProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: pdf.name,
      description: pdf.description,
      password: '',
      changePassword: false,
      removePassword: false,
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      const file = files[0];
      if (file.type !== 'application/pdf') {
        alert('Only PDF files are allowed');
        return;
      }
      setSelectedFile(file);
      form.setValue('file', file);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    form.setValue('file', undefined);
  };

  const onSubmit = async (data: FormValues) => {
    try {
      setIsUpdating(true);
      
      const updateData: any = {
        name: data.name,
        description: data.description,
      };
      
      if (selectedFile) {
        updateData.file = selectedFile;
      }
      
      if (data.changePassword) {
        updateData.password = data.password;
      } else if (data.removePassword) {
        updateData.password = '';
      }
      
      const updatedPdf = await updatePDF(pdf.id, updateData);
      
      if (updatedPdf) {
        onComplete(updatedPdf);
      }
    } catch (error) {
      console.error('Error updating PDF:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const changePassword = form.watch('changePassword');
  const removePassword = form.watch('removePassword');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit PDF</DialogTitle>
          <DialogDescription>
            Update the details or replace the file for this PDF document
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PDF Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea className="resize-none min-h-[100px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border rounded-md p-4">
              <h3 className="font-medium mb-2">Password Settings</h3>
              {pdf.password_protected ? (
                <>
                  <div className="mb-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Currently Password Protected
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="removePassword"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (checked) {
                                  form.setValue('changePassword', false);
                                }
                              }}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Remove password protection</FormLabel>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="changePassword"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (checked) {
                                  form.setValue('removePassword', false);
                                }
                              }}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Change password</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Currently Not Password Protected
                    </span>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="changePassword"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Add password protection</FormLabel>
                      </FormItem>
                    )}
                  />
                </>
              )}
              
              {changePassword && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="mt-3">
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="border rounded-md p-4">
              <h3 className="font-medium mb-2">Replace PDF File (Optional)</h3>
              {!selectedFile ? (
                <div>
                  <Input
                    id="replace-pdf"
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileChange}
                    ref={(input) => {
                      if (input) {
                        input.value = '';
                      }
                    }}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => {
                      const fileInput = document.getElementById('replace-pdf');
                      if (fileInput) {
                        fileInput.click();
                      }
                    }}
                  >
                    Choose a new PDF file
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                  <div className="flex items-center space-x-3">
                    <FileIcon className="h-6 w-6 text-pdf-primary" />
                    <div>
                      <p className="font-medium text-sm text-gray-800">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-pdf-primary hover:bg-pdf-secondary"
                disabled={isUpdating}
              >
                {isUpdating ? 'Updating...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditPDFDialog;
