import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import Landing from "./pages/Landing";
import Landing1 from "./pages/Landing1";
import Landing2 from "./pages/Landing2";
import Landing3 from "./pages/Landing3";
import Landing4 from "./pages/Landing4";
import Landing5 from "./pages/Landing5";
import Landing6 from "./pages/Landing6";
import Landing7 from "./pages/Landing7";
import Landing8 from "./pages/Landing8";
import Landing9 from "./pages/Landing9";
import Landing10 from "./pages/Landing10";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Payment from "./pages/Payment";
import Atlas from "./pages/Atlas";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/v1" element={<Landing1 />} />
            <Route path="/v2" element={<Landing2 />} />
            <Route path="/v3" element={<Landing3 />} />
            <Route path="/v4" element={<Landing4 />} />
            <Route path="/v5" element={<Landing5 />} />
            <Route path="/v6" element={<Landing6 />} />
            <Route path="/v7" element={<Landing7 />} />
            <Route path="/v8" element={<Landing8 />} />
            <Route path="/v9" element={<Landing9 />} />
            <Route path="/v10" element={<Landing10 />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/atlas" element={<Atlas />} />
            <Route path="/success" element={<PaymentSuccess />} />
            <Route path="/cancel" element={<PaymentCancel />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
