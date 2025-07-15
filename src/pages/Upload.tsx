
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Upload as UploadIcon, FileIcon, X } from 'lucide-react'; // Renamed to UploadIcon to avoid conflict
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/layout/Layout';
import { uploadPDF } from '@/services/supabaseService';

const formSchema = z.object({
  name: z.string().min(1, 'PDF name is required'),
  description: z.string().min(1, 'Description is required'),
  password: z.string().optional(),
  file: z.instanceof(File, { message: 'Please upload a PDF file' })
    .refine(file => file.type === 'application/pdf', 'Only PDF files are allowed')
});

type FormValues = z.infer<typeof formSchema>;

const UploadPage = () => {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      password: '',
    },
  });

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length) {
      const file = files[0];
      
      if (file.type !== 'application/pdf') {
        toast({
          variant: 'destructive',
          title: 'Invalid file type',
          description: 'Only PDF files are allowed',
        });
        return;
      }
      
      setSelectedFile(file);
      form.setValue('file', file);
      
      // Auto-fill name if empty
      if (!form.getValues('name')) {
        const fileName = file.name.replace(/\.pdf$/, '');
        form.setValue('name', fileName);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      const file = files[0];
      setSelectedFile(file);
      form.setValue('file', file);
      
      // Auto-fill name if empty
      if (!form.getValues('name')) {
        const fileName = file.name.replace(/\.pdf$/, '');
        form.setValue('name', fileName);
      }
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    form.setValue('file', undefined as any);
    // Reset the file input value
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBrowseClick = () => {
    // Programmatically click the hidden file input
    fileInputRef.current?.click();
  };

  const onSubmit = async (data: FormValues) => {
    try {
      setIsUploading(true);
      
      const result = await uploadPDF({
        file: data.file,
        name: data.name,
        description: data.description,
        password: data.password,
      });
      
      if (result) {
        // Navigate to the PDF list page
        navigate('/pdflist');
      }
    } catch (error) {
      console.error('Error uploading PDF:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-pdf-primary text-2xl">Upload a New PDF</CardTitle>
            <CardDescription>Upload your PDF document and add information about it</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div 
                  className={`border-2 border-dashed rounded-lg p-8 text-center ${
                    isDragging ? 'border-pdf-primary bg-blue-50' : 'border-gray-300'
                  } ${selectedFile ? 'bg-blue-50' : ''}`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  {!selectedFile ? (
                    <div className="flex flex-col items-center justify-center gap-4">
                      <UploadIcon className="h-12 w-12 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-700">Drag and drop your PDF here</p>
                        <p className="text-sm text-gray-500 mt-1">or</p>
                      </div>
                      <Input
                        id="pdf-upload"
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={handleFileChange}
                        ref={fileInputRef}
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleBrowseClick}
                      >
                        Browse files
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-white p-4 rounded-md shadow-sm">
                      <div className="flex items-center space-x-3">
                        <FileIcon className="h-8 w-8 text-pdf-primary" />
                        <div className="text-left">
                          <p className="font-medium text-gray-800">{selectedFile.name}</p>
                          <p className="text-sm text-gray-500">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={clearFile}
                        className="text-gray-500 hover:text-red-500"
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </div>
                {form.formState.errors.file && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.file.message}</p>
                )}

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PDF Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter a name for your PDF" {...field} />
                      </FormControl>
                      <FormDescription>
                        This will be displayed in your PDF list
                      </FormDescription>
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
                        <Textarea 
                          placeholder="Add a description of this PDF document"
                          className="resize-none min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password Protection (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Leave empty for no password"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Add a password to restrict access to this PDF
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-4">
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => navigate('/pdflist')}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-pdf-primary hover:bg-pdf-secondary"
                    disabled={isUploading}
                  >
                    {isUploading ? 'Uploading...' : 'Upload PDF'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default UploadPage;
