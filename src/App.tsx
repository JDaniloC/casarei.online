import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WeddingProvider } from "@/contexts/WeddingContext";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Preview from "./pages/Preview";
import Demo from "./pages/Demo";
import WeddingPage from "./pages/WeddingPage";
import GuestUploadPage from "./pages/GuestUploadPage";
import Privacy from "./pages/Privacy";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentFailure from "./pages/PaymentFailure";
import PaymentPending from "./pages/PaymentPending";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WeddingProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-failure" element={<PaymentFailure />} />
            <Route path="/payment-pending" element={<PaymentPending />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/preview" 
              element={
                <ProtectedRoute>
                  <Preview />
                </ProtectedRoute>
              } 
            />
            {/* Public guest photo upload page (QR code): must stay above the /:slug routes */}
            <Route path="/fotos/:token" element={<GuestUploadPage />} />
            {/* Public privacy policy (also the URL given to Google for the Drive OAuth app): must stay above the /:slug routes */}
            <Route path="/privacidade" element={<Privacy />} />
            {/* Public wedding pages with slug */}
            <Route path="/:slug" element={<WeddingPage />} />
            <Route path="/:slug/convite" element={<WeddingPage />} />
            <Route path="/:slug/convite/:token" element={<WeddingPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </WeddingProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
