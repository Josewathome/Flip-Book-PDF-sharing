
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, List, Lock, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Layout from '@/components/layout/Layout';

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Upload className="h-10 w-10 text-pdf-primary" />,
      title: 'Secure Uploads',
      description: 'Upload and store your PDF documents with optional password protection.',
    },
    {
      icon: <List className="h-10 w-10 text-pdf-primary" />,
      title: 'Manage PDFs',
      description: 'Keep all your documents organized in one place with easy access to view, edit, or delete them.',
    },
    {
      icon: <Lock className="h-10 w-10 text-pdf-primary" />,
      title: 'Password Protection',
      description: 'Add an extra layer of security to your sensitive documents with password protection.',
    },
    {
      icon: <FileText className="h-10 w-10 text-pdf-primary" />,
      title: 'In-Browser Viewing',
      description: 'View your PDFs directly in your browser without downloading additional software.',
    },
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* Hero Section */}
        <div className="text-center py-12 px-4 sm:px-6 lg:py-16 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-pdf-primary sm:text-5xl md:text-6xl">
            <span className="block">Secure PDF Reader</span>
            <span className="block text-pdf-secondary text-3xl sm:text-4xl mt-3">
              Manage, View, and Protect Your Documents
            </span>
          </h1>
          <p className="mt-6 max-w-lg mx-auto text-xl text-gray-500 sm:max-w-3xl">
            A secure platform to upload, manage, and view your PDF documents with optional password protection.
          </p>
          <div className="mt-10 flex justify-center gap-4 flex-col sm:flex-row">
            <Button 
              onClick={() => navigate('/upload')}
              className="bg-pdf-primary hover:bg-pdf-secondary text-white py-3 px-8 text-lg"
            >
              Upload New PDF
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate('/pdflist')}
              className="border-pdf-primary text-pdf-primary hover:bg-pdf-primary hover:text-white py-3 px-8 text-lg"
            >
              View My PDFs
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="py-12 bg-gray-50 rounded-lg shadow-inner">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Key Features</h2>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
              Everything you need to manage your PDF documents securely.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4 sm:px-6">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center text-center"
              >
                <div className="mb-4 rounded-full bg-blue-50 p-3">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center py-12 mt-12 bg-pdf-primary rounded-lg text-white">
          <h2 className="text-3xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="mb-8 max-w-2xl mx-auto text-lg">
            Upload your first PDF document and experience the convenience of secure document management.
          </p>
          <Button 
            onClick={() => navigate('/upload')}
            className="bg-white text-pdf-primary hover:bg-gray-100 py-3 px-8 text-lg"
          >
            Get Started Now
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default Index;
