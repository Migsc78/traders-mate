import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "../../api/base";
import { sendOrQueue } from "../../api/tradie";
import { newOutboxId } from "../../lib/outbox";
import { NeedsSignal, QueryError } from "./ui";
import { useOffline } from "../../lib/connectivity";

const URGENCY = [
  { id: "ASAP", label: "ASAP (today)" },
  { id: "THIS_WEEK", label: "This week" },
  { id: "FLEXIBLE", label: "Flexible" },
];

const MAX_PHOTOS = 4;

/**
 * A lead typed in by hand — someone who rang the mobile directly, or a name
 * taken at the merchants.
 *
 * It goes to the Inbox, not to Jobs. A prospect who might be ringing four other
 * plumbers isn't work yet, and putting them straight into the pipeline would
 * inflate every count on the Jobs screen with leads that never happen. Promoting
 * from the Inbox is where that call gets made, and it already works.
 *
 * Everything here is typed rather than picked, because by definition these are
 * people not yet in the book. A customer record gets created when they become a
 * job — not before, or the book fills up with strangers who never rang back.
 */
export default function NewEnquiryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [postcode, setPostcode] = useState("");
  const [message, setMessage] = useState("");
  const [urgency, setUrgency] = useState("ASAP");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [uploading, setUploading] = useState(false);

  /**
   * Photos upload immediately rather than riding along with the enquiry.
   *
   * Base64 images in the offline queue is how the outbox fills up and takes the
   * tradie's quotes and job notes down with it — the same reason customer file
   * upload needs signal. The rest of the form still queues.
   */
  const addPhoto = async (file: File | null) => {
    if (!file) return;
    setPhotoError("");
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Couldn't read that photo"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(apiUrl("/api/upload"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type || "image/jpeg", dataBase64 }),
      });
      if (!res.ok) throw new Error("That photo wouldn't upload");
      const stored = (await res.json()) as { url: string };
      setPhotoUrls((prev) => [...prev, stored.url].slice(0, MAX_PHOTOS));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "That photo wouldn't upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = useMutation({
    mutationFn: () =>
      sendOrQueue({
        label: `New enquiry · ${name.trim()}`,
        path: "/inbox",
        method: "POST",
        body: {
          // Minted here so a queued create replayed later updates the same lead
          // rather than leaving two in the Inbox.
          id: newOutboxId(),
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          addressLine: addressLine.trim() || null,
          postcode: postcode.trim() || null,
          message: message.trim() || null,
          urgency,
          photoUrls,
        },
        invalidates: ["tradie-inbox"],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-inbox"] });
      navigate("/t/inbox", { replace: true });
    },
  });

  // Name and a number: without one you can't tell them apart, without the other
  // you can't ring them back, and a lead you can't ring back isn't a lead.
  const ready = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 10;

  return (
    <div className="t-customer-form">
      <p className="t-section-label" style={{ marginTop: 0 }}>
        Customer &amp; property
      </p>

      <label className="t-field">
        Customer name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Dan Seed"
          autoFocus
          autoCapitalize="words"
        />
      </label>

      <label className="t-field">
        Address
        <input
          value={addressLine}
          onChange={(e) => setAddressLine(e.target.value)}
          placeholder="12 Riverside Gardens"
          autoCapitalize="words"
        />
      </label>

      <label className="t-field">
        Postcode
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          placeholder="GU22 8CC"
          autoCapitalize="characters"
          autoCorrect="off"
        />
      </label>

      <label className="t-field">
        Mobile number
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="07700 900123"
          autoComplete="tel"
        />
      </label>

      <label className="t-field">
        Email (optional)
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dan@example.com"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </label>

      <label className="t-field">
        What is the work about?
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Leak under sink and needs it fixed quickly."
        />
      </label>

      <label className="t-field">
        Urgency
        <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          {URGENCY.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </label>

      <p className="t-field-label">Add photos</p>
      <div className="t-photo-row">
        {photoUrls.map((url) => (
          <div key={url} className="t-photo-slot is-filled">
            <img src={url} alt="" />
            <button
              type="button"
              className="t-photo-remove"
              aria-label="Remove photo"
              onClick={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
            >
              ×
            </button>
          </div>
        ))}
        {photoUrls.length < MAX_PHOTOS && (
          <button
            type="button"
            className="t-photo-slot"
            disabled={uploading || offline}
            onClick={() => fileRef.current?.click()}
            aria-label="Add a photo"
          >
            {uploading ? "…" : "📷"}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void addPhoto(e.target.files?.[0] ?? null)}
      />
      {photoError && <p className="error">{photoError}</p>}
      {offline && photoUrls.length === 0 && (
        <p className="t-field-hint">Photos need signal. The rest of this saves without one.</p>
      )}

      <QueryError error={save.error} />
      {offline && (
        <NeedsSignal>Saved on your phone and added to your inbox when you&apos;re back in range.</NeedsSignal>
      )}

      <button
        type="button"
        className="primary t-btn--block"
        disabled={!ready || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Create enquiry"}
      </button>
      <p className="t-cta-hint">
        Goes to your inbox. Make it a job when they confirm.
      </p>
    </div>
  );
}
