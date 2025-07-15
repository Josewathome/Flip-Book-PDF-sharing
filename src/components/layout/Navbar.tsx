
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Info, LogOut, User, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const Navbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user) return 'U';
    
    const email = user.email || '';
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    
    return 'U';
  };

  return (
    <nav className="bg-black text-white py-4 px-6 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-2 text-xl font-bold">
          <img 
            src="/lovable-uploads/1e52fd00-9ede-4243-9a5e-d866e6d18121.png" 
            alt="Scratch & Script Logo" 
            className="h-8 w-auto" 
          />
          <span className="hidden md:inline">Secure PDF Reader</span>
        </Link>
        
        <div className="flex space-x-2 md:space-x-4 items-center">
          {user ? (
            <>
              <Button
                asChild
                variant="ghost"
                className="text-white border border-white hover:bg-red-700 rounded-md"
              >
                <Link to="/main">Home</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="text-white border border-white hover:bg-red-700 rounded-md"
              >
                <Link to="/upload">Upload</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="text-white border border-white hover:bg-red-700 rounded-md"
              >
                <Link to="/pdflist">My PDFs</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="text-white border border-white hover:bg-red-700 rounded-md"
              >
                <Link to="/wasm-test" className="flex items-center">
                  <Cpu className="mr-1 h-4 w-4" />
                  <span className="hidden md:inline">WASM Test</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="text-white border border-white hover:bg-red-700 rounded-md"
              >
                <Link to="/info" className="flex items-center">
                  <Info className="mr-1 h-4 w-4" />
                  <span className="hidden md:inline">Info</span>
                </Link>
              </Button>

              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-pdf-primary text-white">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" className="text-white hover:bg-red-700">
                <Link to="/info" className="flex items-center">
                  <Info className="mr-1 h-4 w-4" />
                  <span className="hidden md:inline">Info</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="bg-pdf-primary text-white hover:bg-pdf-secondary border-pdf-primary">
                <Link to="/auth">Login</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
