
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Index from "./pages/Index";
import UploadPage from "./pages/Upload";
import PDFList from "./pages/PDFList";
import PDFViewer from "./pages/PDFViewer";
import NotFound from "./pages/NotFound";
import Info from "./pages/Info";
import Auth from "./pages/Auth";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { WasmTester } from "./components/WasmTester";

// Create a new QueryClient instance with proper configuration for better cache management
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/info" />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/info" element={<Info />} />
            <Route
              path="/main"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pdflist"
              element={
                <ProtectedRoute>
                  <PDFList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/wasm-test"
              element={
                <ProtectedRoute>
                  <WasmTester />
                </ProtectedRoute>
              }
            />
            {/* This route is public by design - no ProtectedRoute wrapper */}
            <Route path="/pdf/:id" element={<PDFViewer />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
