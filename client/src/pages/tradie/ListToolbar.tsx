import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export type ListTab = { id: string; label: string };

/**
 * Search + status tabs for the Jobs and Quotes lists.
 *
 * Both live in the URL. That isn't tidiness for its own sake: a tradie filters to
 * Won, opens a job to check something, and comes back — with the filter in
 * component state that trip resets the list and they have to find their place
 * again. Written with replace so typing doesn't stack up back-button history.
 */
export function useListFilter(defaultTab: string) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || defaultTab;
  const query = params.get("q") || "";
  const searchOpen = params.has("q");

  const patch = (next: URLSearchParams) => setParams(next, { replace: true });

  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === defaultTab) next.delete("tab");
    else next.set("tab", id);
    patch(next);
  };

  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("q", value);
    patch(next);
  };

  const toggleSearch = () => {
    const next = new URLSearchParams(params);
    if (searchOpen) next.delete("q");
    else next.set("q", "");
    patch(next);
  };

  return { tab, setTab, query, setQuery, searchOpen, toggleSearch };
}

export function ListToolbar({
  tabs,
  tab,
  onTab,
  query,
  onQuery,
  searchOpen,
  placeholder,
  counts,
  accentTabs,
}: {
  tabs: readonly ListTab[];
  tab: string;
  onTab: (id: string) => void;
  query: string;
  onQuery: (value: string) => void;
  searchOpen: boolean;
  placeholder: string;
  /** Rows per tab, so the tradie can see where things are without tapping through. */
  counts?: Record<string, number>;
  /** Tabs whose count is worth noticing — money owed, not just a total. */
  accentTabs?: readonly string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Opening search with nowhere to type is a wasted tap.
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  /**
   * Keep the selected tab on screen.
   *
   * With enough tabs to need scrolling, arriving on a deep-linked filter — or
   * coming back from a job — can leave the active tab off the right-hand edge,
   * so the list looks unfiltered for no visible reason.
   */
  useEffect(() => {
    const active = stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);

  return (
    <>
      {searchOpen && (
        <div className="t-search-wrap">
          <input
            ref={inputRef}
            className="t-search-input"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </div>
      )}

      <div className="t-tabs" role="tablist" ref={stripRef}>
        {tabs.map((t) => {
          const on = t.id === tab;
          const count = counts?.[t.id];
          const accent = !!count && accentTabs?.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={`t-tab${on ? " is-active" : ""}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
              {count ? (
                <span className={`t-tab-count${accent ? " is-accent" : ""}`}>{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function IconSearch({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
