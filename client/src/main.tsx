import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  createOfflinePersister,
  isPersistedQueryKey,
  OFFLINE_MAX_AGE_MS,
} from "./lib/offlineCache";
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
import TradieInboxPage from "./pages/tradie/TradieInboxPage";
import TradieArchivedPage from "./pages/tradie/TradieArchivedPage";
import JobPage from "./pages/tradie/job/JobPage";
import ScheduleJobPage from "./pages/tradie/job/ScheduleJobPage";
import ArrivalBriefingPage from "./pages/tradie/job/ArrivalBriefingPage";
import CostFormPage from "./pages/tradie/job/CostFormPage";
import CompleteJobPage from "./pages/tradie/job/CompleteJobPage";
import InvoiceReviewPage from "./pages/tradie/job/InvoiceReviewPage";
import TradieNewJobPage from "./pages/tradie/TradieNewJobPage";
import TradiePriceBookPage from "./pages/tradie/TradiePriceBookPage";
import TradieQuotesPage from "./pages/tradie/TradieQuotesPage";
import QuoteStartPage from "./pages/tradie/quote/QuoteStartPage";
import QuoteTemplatesPage from "./pages/tradie/quote/QuoteTemplatesPage";
import QuoteTemplateDetailPage from "./pages/tradie/quote/QuoteTemplateDetailPage";
import QuoteNotesPage from "./pages/tradie/quote/QuoteNotesPage";
import QuoteVoicePage from "./pages/tradie/quote/QuoteVoicePage";
import QuoteEditPage from "./pages/tradie/quote/QuoteEditPage";
import QuoteTermsPage from "./pages/tradie/quote/QuoteTermsPage";
import QuotePreviewPage from "./pages/tradie/quote/QuotePreviewPage";
import RateNewPage from "./pages/tradie/rate/RateNewPage";
import RateCategoryPage from "./pages/tradie/rate/RateCategoryPage";
import TemplateLibraryPage from "./pages/tradie/template/TemplateLibraryPage";
import TemplateDetailsPage from "./pages/tradie/template/TemplateDetailsPage";
import TemplateAddItemsPage from "./pages/tradie/template/TemplateAddItemsPage";
import QuoteAddItemsPage from "./pages/tradie/quote/QuoteAddItemsPage";
import TemplateEditPage from "./pages/tradie/template/TemplateEditPage";
import TemplateSavedPage from "./pages/tradie/template/TemplateSavedPage";
import TradieInvoicesPage from "./pages/tradie/TradieInvoicesPage";
import TradieCustomersPage from "./pages/tradie/TradieCustomersPage";
import CustomerRecordPage from "./pages/tradie/customer/CustomerRecordPage";
import PropertyDetailPage from "./pages/tradie/customer/PropertyDetailPage";
import AccessSafetyPage from "./pages/tradie/customer/AccessSafetyPage";
import AssetFormPage from "./pages/tradie/customer/AssetFormPage";
import AddCustomerPage from "./pages/tradie/customer/add/AddCustomerPage";
import AddContactPage from "./pages/tradie/customer/add/AddContactPage";
import AddPropertyPage from "./pages/tradie/customer/add/AddPropertyPage";
import RemindersPage from "./pages/tradie/customer/add/RemindersPage";
import ReviewPage from "./pages/tradie/customer/add/ReviewPage";
import EditCustomerPage from "./pages/tradie/customer/edit/EditCustomerPage";
import EditContactsPage from "./pages/tradie/customer/edit/EditContactsPage";
import EditPropertyPage from "./pages/tradie/customer/edit/EditPropertyPage";
import AddNotePage from "./pages/tradie/customer/edit/AddNotePage";
import UploadFilePage from "./pages/tradie/customer/edit/UploadFilePage";
import TradieSettingsPage from "./pages/tradie/TradieSettingsPage";
import TradieDiaryPage from "./pages/tradie/TradieDiaryPage";
import TradieNewBookingPage from "./pages/tradie/TradieNewBookingPage";
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
import { NativeAppBootstrap } from "./components/NativeAppBootstrap";
import "./styles.css";
import "./tradie.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Must be >= the persister's maxAge, or restored queries are binned on load.
      gcTime: OFFLINE_MAX_AGE_MS,
    },
  },
});

/**
 * Keep the tradie's job/customer/rates data on the device so the app still works
 * with no signal. Only successful reads of allowlisted keys are written — never
 * errors, never mutations (nothing is queued for later in this pass), and never
 * onboarding/billing/Twilio state, which is meaningless without a connection.
 */
const persistOptions = {
  persister: createOfflinePersister(),
  maxAge: OFFLINE_MAX_AGE_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { status: string }; queryKey: readonly unknown[] }) =>
      query.state.status === "success" && isPersistedQueryKey(query.queryKey),
    shouldDehydrateMutation: () => false,
  },
};

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
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NativeAppBootstrap />
        <RouteSeo />
        <Routes>
          <Route path="/signup" element={<TradieSignupPage />} />
          <Route path="/t/auth" element={<TradieAuthPage />} />
          <Route path="/t" element={<TradieShell />}>
            <Route index element={<TradieJobsPage />} />
            <Route path="inbox" element={<TradieInboxPage />} />
            <Route path="archived" element={<TradieArchivedPage />} />
            <Route path="onboarding" element={<TradieOnboardingPage />} />
            <Route path="quotes" element={<TradieQuotesPage />} />
            <Route path="quotes/new" element={<QuoteStartPage />} />
            <Route path="quotes/new/templates" element={<QuoteTemplatesPage />} />
            <Route path="quotes/new/templates/:templateId" element={<QuoteTemplateDetailPage />} />
            <Route path="quotes/new/notes" element={<QuoteNotesPage />} />
            <Route path="quotes/new/voice" element={<QuoteVoicePage />} />
            <Route path="quotes/:quoteId/edit" element={<QuoteEditPage />} />
            <Route path="quotes/:quoteId/items" element={<QuoteAddItemsPage />} />
            <Route path="quotes/:quoteId/terms" element={<QuoteTermsPage />} />
            <Route path="quotes/:quoteId/preview" element={<QuotePreviewPage />} />
            <Route path="invoices" element={<TradieInvoicesPage />} />
            <Route path="customers" element={<TradieCustomersPage />} />
            <Route path="customers/new" element={<AddCustomerPage />} />
            {/* :customerId also resolves a legacy phoneKey, so old links still work. */}
            <Route path="customers/:customerId" element={<CustomerRecordPage />} />
            <Route path="customers/:customerId/edit" element={<EditCustomerPage />} />
            <Route path="customers/:customerId/contacts" element={<EditContactsPage />} />
            <Route path="customers/:customerId/contacts/new" element={<AddContactPage />} />
            <Route path="customers/:customerId/properties/new" element={<AddPropertyPage />} />
            <Route path="customers/:customerId/reminders" element={<RemindersPage />} />
            <Route path="customers/:customerId/review" element={<ReviewPage />} />
            <Route path="customers/:customerId/notes/new" element={<AddNotePage />} />
            <Route path="customers/:customerId/files/new" element={<UploadFilePage />} />
            <Route path="properties/:propertyId" element={<PropertyDetailPage />} />
            <Route path="properties/:propertyId/edit" element={<EditPropertyPage />} />
            <Route path="properties/:propertyId/access" element={<AccessSafetyPage />} />
            <Route path="properties/:propertyId/assets/new" element={<AssetFormPage mode="create" />} />
            <Route path="properties/:propertyId/assets/:assetId/edit" element={<AssetFormPage mode="edit" />} />
            <Route path="price-book" element={<TradiePriceBookPage />} />
            <Route path="rates/new" element={<RateNewPage />} />
            <Route path="rates/new/category" element={<RateCategoryPage />} />
            <Route path="rates/templates" element={<TemplateLibraryPage />} />
            <Route path="rates/templates/new" element={<TemplateDetailsPage />} />
            <Route path="rates/templates/:templateId/items" element={<TemplateAddItemsPage />} />
            <Route path="rates/templates/:templateId/edit" element={<TemplateEditPage />} />
            <Route path="rates/templates/:templateId/saved" element={<TemplateSavedPage />} />
            <Route path="diary" element={<TradieDiaryPage />} />
            <Route path="diary/new" element={<TradieNewBookingPage />} />
            <Route path="certificates" element={<TradieCertificatesPage />} />
            <Route path="settings" element={<TradieSettingsPage />} />
            <Route path="jobs/new" element={<TradieNewJobPage />} />
            <Route path="jobs/:enquiryId" element={<JobPage />} />
            <Route path="jobs/:enquiryId/schedule" element={<ScheduleJobPage />} />
            <Route path="jobs/:enquiryId/briefing" element={<ArrivalBriefingPage />} />
            <Route path="jobs/:enquiryId/costs/new" element={<CostFormPage />} />
            <Route path="jobs/:enquiryId/costs/:costId" element={<CostFormPage />} />
            <Route path="jobs/:enquiryId/complete" element={<CompleteJobPage />} />
            <Route path="jobs/:enquiryId/invoice" element={<InvoiceReviewPage />} />
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
    </PersistQueryClientProvider>
  </React.StrictMode>
);
