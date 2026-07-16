import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import "./styles.css";
import "./tradie.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/signup" element={<TradieSignupPage />} />
          <Route path="/t/auth" element={<TradieAuthPage />} />
          <Route path="/t" element={<TradieShell />}>
            <Route index element={<TradieJobsPage />} />
            <Route path="quotes" element={<TradieQuotesPage />} />
            <Route path="invoices" element={<TradieInvoicesPage />} />
            <Route path="customers" element={<TradieCustomersPage />} />
            <Route path="price-book" element={<TradiePriceBookPage />} />
            <Route path="settings" element={<TradieSettingsPage />} />
            <Route path="jobs/:enquiryId" element={<TradieJobPage />} />
          </Route>
          <Route path="/" element={<App />}>
            <Route index element={<Navigate to="/search" replace />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="leads/:leadId" element={<LeadDetailPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="clients/:clientId" element={<ClientDetailPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
