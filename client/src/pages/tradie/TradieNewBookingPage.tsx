import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTradieSession, tradieApi } from "../../api/tradie";
import { EmptyState, initialsOf } from "./ui";

type Step = "choice" | "existing" | "form";

type CustomerRow = {
  phone: string;
  phoneKey: string;
  name: string;
  jobCount: number;
};

export default function TradieNewBookingPage() {
  const session = getTradieSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const enquiryId = params.get("enquiryId");

  const [step, setStep] = useState<Step>(() => (enquiryId ? "form" : "choice"));
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [title, setTitle] = useState("Site visit");
  const [startsLocal, setStartsLocal] = useState("");
  const [hours, setHours] = useState(2);
  const [notes, setNotes] = useState("");
  const [allowClash, setAllowClash] = useState(false);
  const [msg, setMsg] = useState("");
  const [linkedEnquiryId, setLinkedEnquiryId] = useState<string | null>(enquiryId);
  const [isNewProspect, setIsNewProspect] = useState(false);

  const customers = useQuery({
    queryKey: ["tradie-customers"],
    queryFn: () => tradieApi.customers(),
    enabled: !!session && !enquiryId,
  });

  const job = useQuery({
    queryKey: ["tradie-job", enquiryId],
    queryFn: () => tradieApi.job(enquiryId!),
    enabled: !!session && !!enquiryId,
  });

  useEffect(() => {
    if (!job.data || !enquiryId) return;
    setName((job.data.name as string) || "");
    setPhone((job.data.phone as string) || "");
    setAddress((job.data.postcode as string) || "");
    setLinkedEnquiryId(enquiryId);
    setIsNewProspect(false);
    setStep("form");
  }, [job.data, enquiryId]);

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

  const create = useMutation({
    mutationFn: async () => {
      if (!startsLocal) throw new Error("Pick a start time");
      if (!name.trim()) throw new Error("Enter a customer name");
      if (!phone.trim()) throw new Error("Enter a phone number");
      if (isNewProspect && !address.trim()) throw new Error("Enter a site address or postcode");

      const startsAt = new Date(startsLocal);
      const endsAt = new Date(startsAt.getTime() + hours * 60 * 60 * 1000);

      let enquiryForAppt = linkedEnquiryId;
      if (isNewProspect && !enquiryForAppt) {
        const jobRow = await tradieApi.createJob({
          name: name.trim(),
          phone: phone.trim(),
          message: notes.trim() || title.trim() || "Site visit",
          postcode: address.trim() || null,
        });
        enquiryForAppt = jobRow.id;
      }

      return tradieApi.createAppointment({
        enquiryId: enquiryForAppt || null,
        title: title.trim() || "Appointment",
        notes: notes.trim() || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        address: address.trim() || null,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        allowClash,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-appointments"] });
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      void qc.invalidateQueries({ queryKey: ["tradie-customers"] });
      navigate("/t/diary", { replace: true });
    },
    onError: (e: Error) => {
      const text = e.message || "Could not book";
      if (/overlap|clash/i.test(text)) {
        setAllowClash(true);
        setMsg(`${text} — tick “Allow overlap” and book again if you're sure.`);
      } else {
        setMsg(text);
      }
    },
  });

  function startNewProspect() {
    setMsg("");
    setIsNewProspect(true);
    setLinkedEnquiryId(null);
    setName("");
    setPhone("");
    setAddress("");
    setNotes("");
    setStep("form");
  }

  function pickExisting(c: CustomerRow) {
    setMsg("");
    setIsNewProspect(false);
    setLinkedEnquiryId(null);
    setName(c.name || "");
    setPhone(c.phone || "");
    setAddress("");
    setNotes("");
    setStep("form");
    void tradieApi
      .customer(c.phoneKey)
      .then((profile) => {
        setAddress(profile.postcode || "");
        if (profile.name) setName(profile.name);
        if (profile.phone) setPhone(profile.phone);
      })
      .catch(() => {
        /* keep list values */
      });
  }

  if (!session) return null;

  return (
    <div>
      {step === "choice" && (
        <div className="t-choice-stack">
          <button type="button" className="t-choice-card" onClick={startNewProspect}>
            <strong>New prospect</strong>
            <span>Name, phone and site address — also creates a job</span>
          </button>
          <button type="button" className="t-choice-card" onClick={() => setStep("existing")}>
            <strong>Existing customer</strong>
            <span>Pick from your customer book</span>
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
            <EmptyState title="No matching customers" hint="Add them as a new prospect instead." />
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

      {step === "form" && (
        <div className="t-card form">
          {!enquiryId && (
            <button
              type="button"
              className="linkish"
              onClick={() => setStep(isNewProspect ? "choice" : "existing")}
            >
              ← Back
            </button>
          )}

          {enquiryId && job.data && (
            <p className="muted-text" style={{ marginTop: 0 }}>
              Linked to {(job.data.name as string) || "customer"} · {(job.data.phone as string) || ""}
            </p>
          )}

          <label>
            Customer name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!enquiryId || (!isNewProspect && !!phone)}
              autoComplete="name"
            />
          </label>
          <label>
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!!enquiryId || (!isNewProspect && !!phone)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="07…"
            />
          </label>
          <label>
            Site address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street and postcode"
              autoComplete="street-address"
            />
          </label>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Starts
            <input type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} />
          </label>
          <label>
            Duration (hours)
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="t-check">
            <input type="checkbox" checked={allowClash} onChange={(e) => setAllowClash(e.target.checked)} />
            Allow overlap if there&apos;s a clash warning
          </label>
          <button
            type="button"
            className="primary t-btn--block"
            disabled={create.isPending}
            onClick={() => {
              setMsg("");
              create.mutate();
            }}
          >
            {create.isPending ? "Booking…" : "Book & confirm by SMS"}
          </button>
          {msg && <p className={/overlap|clash|Could not|Pick|Enter/i.test(msg) ? "error" : "muted-text"}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
