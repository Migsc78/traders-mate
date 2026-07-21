import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import SearchPage from "./pages/SearchPage";
import LeadsPage from "./pages/LeadsPage";
import ClientsPage from "./pages/ClientsPage";
import ClientDetailPage from "./pages/ClientDetailPage";
import LeadDetailPage from "./pages/LeadDetailPage";
import TradieAuthPage from "./pages/tradie/TradieAuthPage";
import TradieSignupPage from "./pages/tradie/TradieSignupPage";
import TradieShell from "./pages/tradie/TradieShell";
import TradieJobsPage from "./pages/tradie/TradieJobsPage";
import TradieJobPage from "./pages/tradie/TradieJobPage";
import TradiePriceBookPage from "./pages/tradie/TradiePriceBookPage";
import TradieQuotesPage from "./pages/tradie/TradieQuotesPage";
import TradieInvoicesPage from "./pages/tradie/TradieInvoicesPage";
import TradieCustomersPage from "./pages/tradie/TradieCustomersPage";
import TradieSettingsPage from "./pages/tradie/TradieSettingsPage";
import TradieDiaryPage from "./pages/tradie/TradieDiaryPage";
import TradieCertificatesPage from "./pages/tradie/TradieCertificatesPage";
import TradieOnboardingPage from "./pages/tradie/TradieOnboardingPage";
import LandingPage from "./pages/LandingPage";
import EarlyAccessPage from "./pages/EarlyAccessPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import TwilioPage from "./pages/TwilioPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminAuthGate from "./components/AdminAuthGate";
import RouteSeo from "./components/RouteSeo";
import "./styles.css";
import "./tradie.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RedirectLead() {
  const { leadId } = useParams();
  return <Navigate to={`/admin/leads/${leadId}`} replace />;
}

function RedirectClient() {
  const { clientId } = useParams();
  return <Navigate to={`/admin/clients/${clientId}`} replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RouteSeo />
        <Routes>
          <Route path="/signup" element={<TradieSignupPage />} />
          <Route path="/t/auth" element={<TradieAuthPage />} />
          <Route path="/t" element={<TradieShell />}>
            <Route index element={<TradieJobsPage />} />
            <Route path="onboarding" element={<TradieOnboardingPage />} />
            <Route path="quotes" element={<TradieQuotesPage />} />
            <Route path="invoices" element={<TradieInvoicesPage />} />
            <Route path="customers" element={<TradieCustomersPage />} />
            <Route path="price-book" element={<TradiePriceBookPage />} />
            <Route path="diary" element={<TradieDiaryPage />} />
            <Route path="certificates" element={<TradieCertificatesPage />} />
            <Route path="settings" element={<TradieSettingsPage />} />
            <Route path="jobs/:enquiryId" element={<TradieJobPage />} />
          </Route>
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminAuthGate />}>
            <Route element={<App />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="leads" element={<LeadsPage />} />
              <Route path="leads/:leadId" element={<LeadDetailPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:clientId" element={<ClientDetailPage />} />
              <Route path="early-access" element={<EarlyAccessPage />} />
              <Route path="twilio" element={<TwilioPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          {/* Legacy CRM URLs */}
          <Route path="/search" element={<Navigate to="/admin/search" replace />} />
          <Route path="/leads" element={<Navigate to="/admin/leads" replace />} />
          <Route path="/leads/:leadId" element={<RedirectLead />} />
          <Route path="/clients" element={<Navigate to="/admin/clients" replace />} />
          <Route path="/clients/:clientId" element={<RedirectClient />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
