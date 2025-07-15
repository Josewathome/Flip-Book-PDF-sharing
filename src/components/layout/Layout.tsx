
import React from 'react';
import Navbar from './Navbar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-1 container mx-auto py-8 px-4">{children}</main>
      <footer className="bg-black text-white py-4 text-center">
        <p>© {new Date().getFullYear()} Secure PDF Reader -{' '}
          <a
            href="https://www.scratchandscript.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            scratch &amp; script
          </a>{' '}
          - All Rights Reserved
        </p>

      </footer>
    </div>
  );
};

export default Layout;
