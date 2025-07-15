
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/pdfviewlayout';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const Info = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <Layout>
      {/* Conditional Header for logged in users */}
      {user && (
        <header className="bg-pdf-primary text-white shadow-md">
          <div className="max-w-3xl mx-auto px-4 py-3 flex justify-between items-center">
            <h1 className="text-xl font-semibold">Welcome to Secure PDF Reader</h1>
            <Button 
              variant="ghost"
              className="bg-gray text-white border border-white hover:bg-neutral-800 hover:text-white text-sm font-medium transition-colors duration-200"
              onClick={() => navigate('/main')}
            >
              Go to Home Page
            </Button>
          </div>
        </header>
      )}

      <div className="max-w-3xl mx-auto mt-8">
        <Card className="shadow-lg border-2 border-pdf-primary/20">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-pdf-primary">About Secure PDF Reader</CardTitle>
            <CardDescription className="text-lg mt-2">
              By Scratch & Script
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <img 
                src="/lovable-uploads/1e52fd00-9ede-4243-9a5e-d866e6d18121.png" 
                alt="Scratch & Script Logo" 
                className="h-32 w-auto mb-4" 
              />
            </div>
            
            <p className="text-lg">
              Secure PDF Reader was created by Scratch & Script for sharing PDF documents across groups securely and efficiently.
            </p>
            
            <p className="text-lg">
              Our platform offers a simple yet powerful way to upload, manage, and view your important PDF documents from any device.
            </p>
            
            <h3 className="text-xl font-semibold text-pdf-primary mt-4">Key Features:</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Secure document storage and sharing</li>
              <li>Easy-to-use interface</li>
              <li>Mobile-responsive design</li>
              <li>Fast document loading and viewing</li>
              <li>Organized document management</li>
            </ul>
            
            {!user && (
              <div className="flex justify-center mt-6">
                <Button 
                  className="bg-pdf-primary hover:bg-pdf-secondary text-white font-medium py-6 text-lg"
                  onClick={() => navigate('/auth')}
                >
                  Sign in to Get Started
                </Button>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-center pb-6">
            <Button className="bg-pdf-primary hover:bg-pdf-accent">
              <a 
                href="https://www.scratchandscript.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center"
              >
                Visit Scratch & Script <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </Layout>
  );
};

export default Info;
