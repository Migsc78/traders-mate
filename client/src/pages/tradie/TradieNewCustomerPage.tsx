import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendOrQueue } from "../../api/tradie";

export default function TradieNewCustomerPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () =>
      sendOrQueue<{ phoneKey: string }>({
        label: `New customer · ${name.trim()}`,
        path: "/customers",
        method: "POST",
        body: { name: name.trim(), phone: phone.trim(), notes: notes.trim() || null },
        invalidates: ["tradie-customers"],
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["tradie-customers"] });
      if (r.queued) {
        // No phoneKey to navigate to until the server has seen it — the customer
        // list is the honest place to land, with the queued item shown as pending.
        navigate("/t/customers", { replace: true });
        return;
      }
      navigate(`/t/customers/${encodeURIComponent(r.result.phoneKey)}`, { replace: true });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not save customer");
    },
  });

  function submit() {
    setError("");
    if (!name.trim()) {
      setError("Enter a name");
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
      <div className="t-card form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
        </label>
        <label>
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="07…"
          />
        </label>
        <label>
          Notes
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — access codes, how you know them…"
          />
        </label>
        <button type="button" className="primary t-btn--block" disabled={create.isPending} onClick={submit}>
          {create.isPending ? "Saving…" : "Save customer"}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
