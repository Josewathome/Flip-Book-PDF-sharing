import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit, Trash2, Eye, FileText, Search, Plus, Link } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Layout from '@/components/layout/Layout';
import { PDFDocument } from '@/types/pdf';
import { getAllPDFs, deletePDF } from '@/services/supabaseService';
import EditPDFDialog from '@/components/pdf/EditPDFDialog';
import { useAuth } from '@/context/AuthContext';

const PDFList = () => {
  const { user } = useAuth();
  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [filteredPdfs, setFilteredPdfs] = useState<PDFDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pdfToDelete, setPdfToDelete] = useState<string | null>(null);
  const [pdfToEdit, setPdfToEdit] = useState<PDFDocument | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const fetchPDFs = async () => {
      try {
        setIsLoading(true);
        const data = await getAllPDFs();
        setPdfs(data);
        setFilteredPdfs(data);
      } catch (error) {
        console.error('Error fetching PDFs:', error);
        toast.error('Failed to load PDFs. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPDFs();
  }, [user, navigate]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredPdfs(pdfs);
    } else {
      const filtered = pdfs.filter(
        pdf =>
          pdf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          pdf.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredPdfs(filtered);
    }
  }, [searchQuery, pdfs]);

  const handleDeleteConfirm = async () => {
    if (pdfToDelete) {
      try {
        const success = await deletePDF(pdfToDelete);
        if (success) {
          setPdfs(pdfs.filter(pdf => pdf.id !== pdfToDelete));
        }
      } catch (error) {
        console.error('Error deleting PDF:', error);
      }
      setPdfToDelete(null);
    }
  };

  const handleEditComplete = (updatedPdf: PDFDocument) => {
    setPdfs(pdfs.map(pdf => (pdf.id === updatedPdf.id ? updatedPdf : pdf)));
    setPdfToEdit(null);
  };

  const handleSearch = function(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
  };

  const formatDate = function(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleCopyLink = function(pdfId: string) {
    const url = `${window.location.origin}/pdf/${pdfId}`;
    navigator.clipboard.writeText(url)
      .then(() => {
        toast.success('Link copied to clipboard');
      })
      .catch((error) => {
        console.error('Error copying link:', error);
        toast.error('Failed to copy link');
      });
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-pdf-primary">My PDFs</h1>
          <Button 
            onClick={() => navigate('/upload')}
            className="bg-pdf-primary hover:bg-pdf-secondary"
          >
            <Plus className="h-4 w-4 mr-2" />
            Upload New
          </Button>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search PDFs by name or description..."
                className="pl-10"
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] text-pdf-primary motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-4 text-gray-600">Loading your PDFs...</p>
          </div>
        ) : filteredPdfs.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <CardTitle className="text-xl mb-2">No PDFs Found</CardTitle>
              <CardDescription className="mb-6">
                {searchQuery
                  ? "No PDFs match your search criteria"
                  : "You haven't uploaded any PDFs yet"}
              </CardDescription>
              <Button 
                onClick={() => navigate('/upload')}
                className="bg-pdf-primary hover:bg-pdf-secondary"
              >
                Upload Your First PDF
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredPdfs.map(pdf => (
              <Card key={pdf.id} className="overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  <div className="bg-gray-100 sm:w-16 w-full flex justify-center items-center p-4 sm:p-0">
                    <FileText className="h-8 w-8 text-pdf-primary" />
                  </div>
                  <CardContent className="flex-1 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-800">{pdf.name}</h3>
                        <p className="text-gray-500 text-sm mt-1">Uploaded on {formatDate(pdf.created_at)}</p>
                      </div>
                      <div className="flex mt-4 sm:mt-0 space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/pdf/${pdf.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCopyLink(pdf.id)}
                        >
                          <Link className="h-4 w-4 mr-1" />
                          Copy Link
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setPdfToEdit(pdf)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-pdf-danger hover:text-white hover:bg-pdf-danger"
                          onClick={() => setPdfToDelete(pdf.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                    <p className="text-gray-600 mt-3 line-clamp-2">{pdf.description}</p>
                    {pdf.password_protected && (
                      <div className="mt-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Password Protected
                        </span>
                      </div>
                    )}
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={!!pdfToDelete} onOpenChange={() => setPdfToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the PDF document.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-pdf-danger hover:bg-red-600"
                onClick={handleDeleteConfirm}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {pdfToEdit && (
          <EditPDFDialog
            pdf={pdfToEdit}
            isOpen={!!pdfToEdit}
            onClose={() => setPdfToEdit(null)}
            onComplete={handleEditComplete}
          />
        )}
      </div>
    </Layout>
  );
};

export default PDFList;
