import { useEffect, useId, useMemo, useState } from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTradieSession, setTradieSession, tradieApi, TradieApiError } from "../../api/tradie";
import { supportMailto } from "../../lib/supportMail";
import { SyncStatus } from "../../components/SyncStatus";
import { useOfflinePrefetch } from "../../lib/useOfflinePrefetch";
import { useOutboxSync } from "../../lib/useOutbox";
import {
  IconArchive,
  IconCustomers,
  IconInvoices,
  IconInbox,
  IconJobs,
  IconQuotes,
  IconRates,
  IconSettings,
  StatusPill,
  initialsOf,
} from "./ui";

const PRIMARY_TABS = [
  { to: "/t/diary", label: "Diary", Icon: IconDiary },
  { to: "/t/inbox", label: "Inbox", Icon: IconInbox },
  { to: "/t", label: "Jobs", end: true, Icon: IconJobs },
  { to: "/t/quotes", label: "Quotes", Icon: IconQuotes },
  { to: "/t/customers", label: "Customers", Icon: IconCustomers },
] as const;

const MORE_TABS = [
  { to: "/t/archived", label: "Archived", Icon: IconArchive },
  { to: "/t/invoices", label: "Invoices", Icon: IconInvoices },
  { to: "/t/certificates", label: "Certs", Icon: IconCerts },
  { to: "/t/price-book", label: "Rates", Icon: IconRates },
  { to: "/t/settings", label: "Settings", Icon: IconSettings },
] as const;

type DetailChrome = {
  backTo: string;
  backLabel: string;
  title: string;
  subtitle: string;
};

function resolveDetailChrome(pathname: string, state: unknown, search = ""): DetailChrome | null {
  if (pathname === "/t/jobs/new") {
    return {
      backTo: "/t",
      backLabel: "Jobs",
      title: "Add job",
      subtitle: "New or existing customer",
    };
  }
  if (pathname.startsWith("/t/jobs/")) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const fromInboxQuery = params.get("from") === "inbox";
    const fromState =
      state &&
      typeof state === "object" &&
      "from" in state &&
      typeof (state as { from?: unknown }).from === "string" &&
      String((state as { from: string }).from).startsWith("/t")
        ? {
            backTo: (state as { from: string }).from,
            backLabel:
              typeof (state as { fromLabel?: unknown }).fromLabel === "string"
                ? String((state as { fromLabel?: unknown }).fromLabel)
                : "Back",
          }
        : fromInboxQuery
          ? { backTo: "/t/inbox", backLabel: "Inbox" }
          : { backTo: "/t", backLabel: "Jobs" };
    const fromQuotes = fromState.backTo === "/t/quotes";
    const fromInbox = fromState.backTo === "/t/inbox";
    return {
      ...fromState,
      title: fromQuotes ? "Quote" : fromInbox ? "Inbox item" : "Job",
      subtitle: fromInbox ? "Call back, quote, or make a job" : "Quote & message customer",
    };
  }
  // Adding a rate, reached from the + on Rates.
  if (pathname === "/t/rates/new") {
    return {
      backTo: "/t/price-book",
      backLabel: "Rates",
      title: "New rate item",
      subtitle: "Keep it fast and simple",
    };
  }
  if (pathname === "/t/rates/new/category") {
    return {
      backTo: "/t/rates/new",
      backLabel: "New rate",
      title: "Choose category",
      subtitle: "Where it sits in your price book",
    };
  }
  // Template authoring, reached from Rates.
  if (pathname.startsWith("/t/rates/templates")) {
    const id = pathname.match(/^\/t\/rates\/templates\/([^/]+)/)?.[1];
    if (pathname === "/t/rates/templates") {
      return {
        backTo: "/t/price-book",
        backLabel: "Rates",
        title: "Templates",
        subtitle: "Reusable quote templates",
      };
    }
    if (pathname.endsWith("/new")) {
      return {
        backTo: "/t/rates/templates",
        backLabel: "Templates",
        title: "New template",
        subtitle: "Name it and set the basics",
      };
    }
    if (pathname.endsWith("/items")) {
      return {
        backTo: `/t/rates/templates/${id}/edit`,
        backLabel: "Template",
        title: "Add items",
        subtitle: "Search and select from your price book",
      };
    }
    if (pathname.endsWith("/saved")) {
      return {
        backTo: "/t/rates/templates",
        backLabel: "Templates",
        title: "Template saved",
        subtitle: "Ready to use in a quote",
      };
    }
    return {
      backTo: "/t/rates/templates",
      backLabel: "Templates",
      title: "Edit template",
      subtitle: "Items, pricing and notes",
    };
  }

  // Quote builder — each step names itself and steps back one, so the tradie can
  // always retreat to the previous decision rather than losing the whole draft.
  if (pathname.startsWith("/t/quotes/new") || /^\/t\/quotes\/[^/]+\/(edit|items|terms|preview)$/.test(pathname)) {
    const quoteId = pathname.match(/^\/t\/quotes\/([^/]+)\/(?:edit|items|terms|preview)$/)?.[1];
    const steps: Record<string, DetailChrome> = {
      "/t/quotes/new": {
        backTo: "/t/quotes",
        backLabel: "Quotes",
        title: "New quote",
        subtitle: "Template, notes, voice or blank",
      },
      "/t/quotes/new/templates": {
        backTo: "/t/quotes/new",
        backLabel: "New quote",
        title: "Templates",
        subtitle: "Find the right job template",
      },
      "/t/quotes/new/notes": {
        backTo: "/t/quotes/new",
        backLabel: "New quote",
        title: "Notes to quote",
        subtitle: "Paste your notes, we'll price it",
      },
      "/t/quotes/new/voice": {
        backTo: "/t/quotes/new",
        backLabel: "New quote",
        title: "Voice to quote",
        subtitle: "Speak the job, get a draft",
      },
    };
    if (steps[pathname]) return steps[pathname];
    if (pathname.startsWith("/t/quotes/new/templates/")) {
      return {
        backTo: "/t/quotes/new/templates",
        backLabel: "Templates",
        title: "Template",
        subtitle: "What's included and add-ons",
      };
    }
    if (pathname.endsWith("/edit")) {
      const navState =
        state && typeof state === "object"
          ? (state as { from?: unknown; fromLabel?: unknown })
          : null;
      const from = typeof navState?.from === "string" ? navState.from : null;
      const fromQuotesList = from === "/t/quotes" || from === "/t/archived";
      return {
        backTo: fromQuotesList && from ? from : "/t/quotes/new",
        backLabel: fromQuotesList
          ? typeof navState?.fromLabel === "string"
            ? navState.fromLabel
            : "Back"
          : "New quote",
        title: "Edit quote",
        subtitle: "Items, quantities, pricing",
      };
    }
    if (pathname.endsWith("/items")) {
      return {
        backTo: `/t/quotes/${quoteId}/edit`,
        backLabel: "Edit quote",
        title: "Add items",
        subtitle: "Search your rates",
      };
    }
    if (pathname.endsWith("/terms")) {
      return {
        backTo: `/t/quotes/${quoteId}/edit`,
        backLabel: "Edit",
        title: "Deposit & terms",
        subtitle: "Set expectations clearly",
      };
    }
    return {
      backTo: `/t/quotes/${quoteId}/terms`,
      backLabel: "Back",
      title: "Preview",
      subtitle: "Share with customer",
    };
  }

  if (pathname === "/t/customers/new") {
    return {
      backTo: "/t/customers",
      backLabel: "Customers",
      title: "Add customer",
      subtitle: "Save a contact",
    };
  }
  if (pathname === "/t/diary/new") {
    return {
      backTo: "/t/diary",
      backLabel: "Diary",
      title: "New booking",
      subtitle: "Who, where, and when",
    };
  }
  if (pathname.startsWith("/t/customers/")) {
    return {
      backTo: "/t/customers",
      backLabel: "Customers",
      title: "Customer",
      subtitle: "Jobs, notes & plant",
    };
  }
  return null;
}

export default function TradieShell() {
  const session = getTradieSession();
  const location = useLocation();
  const qc = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const me = useQuery({
    queryKey: ["tradie-me"],
    queryFn: () => tradieApi.me(),
    enabled: !!session,
    retry: false,
  });

  const detail = useMemo(
    () => resolveDetailChrome(location.pathname, location.state, location.search),
    [location.pathname, location.state, location.search]
  );
  const onDetail = !!detail;
  const onOnboarding = location.pathname.startsWith("/t/onboarding");

  const inbox = useQuery({
    queryKey: ["tradie-inbox"],
    queryFn: () => tradieApi.inbox(),
    enabled: !!session,
    retry: false,
  });
  const inboxBadge = inbox.data?.needsYouCount ?? 0;

  useOfflinePrefetch(!!session && me.isSuccess && !!me.data?.accountActive);
  useOutboxSync(!!session);

  const confirmDivert = useMutation({
    mutationFn: () => tradieApi.onboardingConfirmDivert(),
    onSuccess: () => {
      qc.setQueryData(["tradie-me"], (prev: Record<string, unknown> | undefined) =>
        prev ? { ...prev, onboardingDivertConfirmedAt: new Date().toISOString() } : prev
      );
      void qc.invalidateQueries({ queryKey: ["tradie-me"] });
      void qc.invalidateQueries({ queryKey: ["tradie-onboarding"] });
    },
  });

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  // Only drop the session on a real auth failure — not network / 5xx blips.
  useEffect(() => {
    if (!me.isError) return;
    if (me.error instanceof TradieApiError && me.error.status === 401) {
      setTradieSession(null);
    }
  }, [me.isError, me.error]);

  if (!session) return <Navigate to="/t/auth" replace />;

  const unauthorized =
    me.isError && me.error instanceof TradieApiError && me.error.status === 401;
  if (unauthorized) return <Navigate to="/t/auth" replace />;

  // Only hard-stop when there's nothing cached to show. With saved data we carry on
  // and let <SyncStatus /> explain why things look stale.
  if (me.isError && !me.data) {
    return (
      <div className="tradie-shell tradie-shell--app t-gate">
        <div className="t-gate-brand">
          <div className="t-brand-mark">TM</div>
          <h1>Couldn&apos;t load your account</h1>
          <p>Check your connection and try again. You&apos;re still signed in.</p>
        </div>
        <div className="t-gate-card">
          <p className="error">{me.error instanceof Error ? me.error.message : "Something went wrong"}</p>
          <button type="button" className="primary t-btn--block" onClick={() => void me.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (me.isLoading || !me.data) {
    return (
      <div className="tradie-shell tradie-shell--app t-gate">
        <div className="t-gate-brand">
          <div className="t-brand-mark">TM</div>
          <h1>Loading…</h1>
        </div>
      </div>
    );
  }

  const businessName = me.data.businessName || "TradiesMate";
  const subtitle = [me.data.tradeTitle, me.data.town].filter(Boolean).join(" · ") || "Quoting & jobs";
  const moreActive = MORE_TABS.some((t) => location.pathname.startsWith(t.to));

  // Paid but setup incomplete → send to wizard (except settings / rates / billing return)
  if (
    me.data.onboardingRequired &&
    me.data.accountActive &&
    !onOnboarding &&
    !location.pathname.startsWith("/t/settings") &&
    !location.pathname.startsWith("/t/price-book")
  ) {
    return <Navigate to="/t/onboarding" replace />;
  }

  return (
    <div className={`tradie-shell tradie-shell--app${onDetail ? " tradie-shell--detail" : ""}`}>
      <header className={`t-appbar${onDetail ? " t-appbar--detail" : ""}`}>
        {detail ? (
          <NavLink
            to={detail.backTo}
            className="t-appbar-back"
            aria-label={`Back to ${detail.backLabel}`}
          >
            <IconBackChevron />
            <span>{detail.backLabel}</span>
          </NavLink>
        ) : (
          <div className="t-brand-mark">{initialsOf(businessName)}</div>
        )}
        <div className="t-appbar-text">
          <h1>
            {detail
              ? detail.title
              : businessName.replace(/\[SEED\]\s*/i, "")}
          </h1>
          <p className="t-appbar-sub">
            {detail ? detail.subtitle : subtitle}
            {!detail && me.data?.status === "TRIAL" && <StatusPill status="TRIAL" />}
          </p>
        </div>
      </header>

      <SyncStatus syncedAt={me.dataUpdatedAt} />

      {me.data?.billingRequired && (
        <p className="t-banner t-banner--danger">
          Pay £{((me.data.trialPricePence ?? 1400) / 100).toFixed(0)} to unlock your{" "}
          {me.data.trialDays ?? 14}-day trial — then £{((me.data.planPricePence ?? 4900) / 100).toFixed(0)} every 30
          days.{" "}
          <NavLink to="/t/settings">Open billing</NavLink>
        </p>
      )}

      {me.data?.accountActive &&
        !me.data.onboardingDivertConfirmedAt &&
        !me.data.billingRequired &&
        !onOnboarding && (
        <p className="t-banner">
          Finish call divert so missed calls are rescued.{" "}
          <NavLink to={me.data.onboardingRequired ? "/t/onboarding" : "/t/settings#divert"}>
            {me.data.onboardingRequired ? "Continue setup" : "Set up divert"}
          </NavLink>
          {" · "}
          <button
            type="button"
            className="t-banner-action"
            disabled={confirmDivert.isPending}
            onClick={() => confirmDivert.mutate()}
          >
            {confirmDivert.isPending ? "Saving…" : "I've done this"}
          </button>
        </p>
      )}

      {me.data?.status === "TRIAL" && me.data.trialEndsAt && me.data.accountActive && (
        <p className="muted-text t-trial-note">
          Trial ends {new Date(me.data.trialEndsAt).toLocaleDateString("en-GB")} — then £
          {((me.data.planPricePence ?? 4900) / 100).toFixed(0)}/30 days unless you cancel in Settings.
        </p>
      )}

      {me.data && !me.data.accountActive && !me.data.billingRequired && (
        <p className="t-banner t-banner--danger">
          Account inactive — manage billing in Settings to send quotes and invoices.
        </p>
      )}

      <div className="tradie-outlet">
        <Outlet context={{ me: me.data }} />
      </div>

      {!onDetail && !onOnboarding && (
        <nav className="tradie-bottom-nav" aria-label="Tradie navigation">
          {PRIMARY_TABS.map(({ to, label, Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest ? (rest as { end: boolean }).end : false}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              <span className="t-nav-icon" aria-hidden="true">
                <Icon size={22} />
                {to === "/t/inbox" && inboxBadge > 0 && (
                  <span className="t-nav-badge">{inboxBadge > 9 ? "9+" : inboxBadge}</span>
                )}
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={moreActive || moreOpen ? "active" : undefined}
            aria-label="More"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <span className="t-nav-icon" aria-hidden="true">
              <IconMore size={22} />
            </span>
            <span>More</span>
          </button>
        </nav>
      )}

      {moreOpen && (
        <div className="t-more-root" role="presentation" onClick={() => setMoreOpen(false)}>
          <div
            id={moreId}
            className="t-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-more-handle" aria-hidden="true" />
            <p className="t-more-title">More</p>
            <div className="t-more-links">
              {MORE_TABS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => (isActive ? "active" : undefined)}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
              {me.data?.accountActive && (
                <a
                  href={supportMailto({
                    businessName: me.data.businessName,
                    routeKey: me.data.routeKey,
                  })}
                  onClick={() => setMoreOpen(false)}
                >
                  <IconSupport />
                  <span>Email support</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBackChevron({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconMore({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function IconSupport({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16v10H8l-4 3V6z" />
      <path d="M8 11h8M8 14h5" />
    </svg>
  );
}

function IconDiary({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}

function IconCerts({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  );
}
