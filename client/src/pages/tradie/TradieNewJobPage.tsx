import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tradieApi } from "../../api/tradie";
import { EmptyState, initialsOf } from "./ui";

type Step = "choice" | "new" | "existing" | "existing-form";

type CustomerRow = {
  phone: string;
  phoneKey: string;
  name: string;
  jobCount: number;
};

type CreatedJob = { id: string };

export default function TradieNewJobPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const prefillKey = params.get("phoneKey") || "";

  const customers = useQuery({
    queryKey: ["tradie-customers"],
    queryFn: () => tradieApi.customers(),
  });

  const prefilled = useMemo(
    () => (customers.data || []).find((c: CustomerRow) => c.phoneKey === prefillKey),
    [customers.data, prefillKey]
  );

  const [step, setStep] = useState<Step>(() => (prefillKey ? "existing-form" : "choice"));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [postcode, setPostcode] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!prefillKey) return;
    setStep("existing-form");
    if (prefilled) {
      setName(prefilled.name || "");
      setPhone(prefilled.phone || "");
    } else if (customers.isSuccess) {
      // Contact may exist but list not yet including it — still allow typing via profile fetch
      void tradieApi
        .customer(prefillKey)
        .then((c) => {
          setName(c.name || "");
          setPhone(c.phone || "");
        })
        .catch(() => {
          /* leave blank; user can still fill */
        });
    }
  }, [prefillKey, prefilled, customers.isSuccess]);

  const create = useMutation({
    mutationFn: () =>
      tradieApi.createJob({
        name: name.trim(),
        phone: phone.trim(),
        message: message.trim() || null,
        postcode: postcode.trim() || null,
      }),
    onSuccess: (job: CreatedJob) => {
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      void qc.invalidateQueries({ queryKey: ["tradie-customers"] });
      if (prefillKey) void qc.invalidateQueries({ queryKey: ["tradie-customer", prefillKey] });
      navigate(`/t/jobs/${job.id}`, { replace: true });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not create job");
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = customers.data || [];
    if (!q) return list;
    return list.filter(
      (c: CustomerRow) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
        c.phoneKey.includes(q.replace(/\D/g, ""))
    );
  }, [customers.data, search]);

  function startNew() {
    setError("");
    setName("");
    setPhone("");
    setMessage("");
    setPostcode("");
    setStep("new");
  }

  function pickExisting(c: { name: string; phone: string }) {
    setError("");
    setName(c.name || "");
    setPhone(c.phone || "");
    setMessage("");
    setPostcode("");
    setStep("existing-form");
  }

  function submitJob() {
    setError("");
    if (!name.trim()) {
      setError("Enter a customer name");
      return;
    }
    if (!phone.trim()) {
      setError("Enter a phone number");
      return;
    }
    create.mutate();
  }

  return (
    <div>
      {step === "choice" && (
        <div className="t-choice-stack">
          <button type="button" className="t-choice-card" onClick={startNew}>
            <strong>New customer</strong>
            <span>Prospective job — enter name and phone</span>
          </button>
          <button type="button" className="t-choice-card" onClick={() => setStep("existing")}>
            <strong>Existing customer</strong>
            <span>Another job for someone already in your book</span>
          </button>
        </div>
      )}

      {step === "existing" && (
        <div>
          <button type="button" className="linkish" onClick={() => setStep("choice")}>
            ← Back
          </button>
          <label className="t-card form" style={{ display: "block", marginTop: 12 }}>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or phone"
              autoFocus
            />
          </label>
          {customers.isLoading && <p className="muted-text">Loading customers…</p>}
          {customers.isError && <p className="error">{(customers.error as Error).message}</p>}
          {!customers.isLoading && filtered.length === 0 && (
            <EmptyState
              title="No matching customers"
              hint="Add them as a new customer job instead, or add a customer from the Customers tab."
            />
          )}
          <ul className="t-list" style={{ marginTop: 12 }}>
            {filtered.map((c: CustomerRow) => (
              <li key={c.phoneKey}>
                <button type="button" className="t-row t-row--btn" onClick={() => pickExisting(c)}>
                  <span className="t-avatar">{initialsOf(c.name)}</span>
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{c.name}</strong>
                    </div>
                    <span className="t-row-sub">
                      {c.phone} · {c.jobCount} job{c.jobCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(step === "new" || step === "existing-form") && (
        <div className="t-card form">
          {step === "new" ? (
            <button type="button" className="linkish" onClick={() => setStep("choice")}>
              ← Back
            </button>
          ) : prefillKey ? null : (
            <button type="button" className="linkish" onClick={() => setStep("existing")}>
              ← Customers
            </button>
          )}

          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={step === "existing-form" && !!phone}
              autoComplete="name"
            />
          </label>
          <label>
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={step === "existing-form" && !!phone}
              inputMode="tel"
              autoComplete="tel"
              placeholder="07…"
            />
          </label>
          <label>
            What do they need?
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Boiler service, leak under sink…"
            />
          </label>
          <label>
            Postcode
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              autoCapitalize="characters"
              placeholder="Optional"
            />
          </label>

          <button
            type="button"
            className="primary t-btn--block"
            disabled={create.isPending}
            onClick={submitJob}
          >
            {create.isPending ? "Saving…" : "Create job"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
