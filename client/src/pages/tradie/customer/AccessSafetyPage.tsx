import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "../../../api/customers";
import { saveAccess } from "../../../lib/newCustomer";
import { QueryError } from "../ui";
import { ACCESS_METHODS, Field, MultiChips, PARKING_OPTIONS, SAFETY_FLAGS, Toggle } from "./forms";

/**
 * Access & safety — sheet 2 step 4 and sheet 3 screen 4 are the same screen.
 *
 * Structured fields rather than a notes box, because "dog on site" buried in
 * paragraph three of someone's notes is not a warning. The point of the wireframe
 * note — keeping engineers safe — only works if the data is shaped so the app can
 * surface it on the property card and the job sheet, which prose can't be.
 */
export default function AccessSafetyPage() {
  const { propertyId = "" } = useParams();
  const [params] = useSearchParams();
  const inFlow = params.get("flow") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const property = useQuery({
    queryKey: ["tradie-property", propertyId],
    queryFn: () => customersApi.property(propertyId),
    enabled: !!propertyId,
  });

  const [accessMethod, setAccessMethod] = useState("");
  const [keySafe, setKeySafe] = useState(false);
  const [keySafeLocation, setKeySafeLocation] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [alarm, setAlarm] = useState(false);
  const [parking, setParking] = useState("");
  const [permitRequired, setPermitRequired] = useState(false);
  const [hoursFrom, setHoursFrom] = useState("08:00");
  const [hoursTo, setHoursTo] = useState("17:00");
  const [callBefore, setCallBefore] = useState(false);
  const [dogOnSite, setDogOnSite] = useState(false);
  const [asbestos, setAsbestos] = useState(false);
  const [flags, setFlags] = useState<string[]>([]);
  const [engineerNotes, setEngineerNotes] = useState("");

  useEffect(() => {
    const a = property.data?.access;
    if (!a) return;
    setAccessMethod(a.accessMethod || "");
    setKeySafe(a.keySafe);
    setKeySafeLocation(a.keySafeLocation || "");
    setAlarm(a.alarm);
    setParking(a.parking || "");
    setPermitRequired(a.permitRequired);
    setHoursFrom(a.workingHoursFrom || "08:00");
    setHoursTo(a.workingHoursTo || "17:00");
    setCallBefore(a.callBeforeArrival);
    setDogOnSite(a.dogOnSite);
    setAsbestos(a.asbestosKnown);
    setFlags(a.safetyFlags);
    setEngineerNotes(a.engineerNotes || "");
  }, [property.data]);

  const save = useMutation({
    mutationFn: () =>
      saveAccess(qc, propertyId, {
        accessMethod: accessMethod || null,
        keySafe,
        keySafeLocation: keySafeLocation.trim() || null,
        // Only sent when actually edited. The form never receives the existing
        // code — it's masked — so sending an untouched empty box would wipe it.
        ...(codeTouched ? { accessCode: accessCode.trim() || null } : {}),
        alarm,
        parking: parking || null,
        permitRequired,
        workingHoursFrom: hoursFrom || null,
        workingHoursTo: hoursTo || null,
        callBeforeArrival: callBefore,
        dogOnSite,
        asbestosKnown: asbestos,
        safetyFlags: flags,
        engineerNotes: engineerNotes.trim() || null,
      }),
    onSuccess: () => {
      const customerId = property.data?.customer.id;
      navigate(
        inFlow && customerId
          ? `/t/properties/${propertyId}/assets/new?flow=1`
          : `/t/properties/${propertyId}?tab=access`,
        { replace: true }
      );
    },
  });

  const hasExistingCode = property.data?.access?.hasAccessCode ?? false;

  return (
    <div className="t-customer-form">
      <Field label="Access method">
        <select value={accessMethod} onChange={(e) => setAccessMethod(e.target.value)}>
          <option value="">Select method</option>
          {ACCESS_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Toggle label="Key safe" hint="There's a key safe at this property" checked={keySafe} onChange={setKeySafe} />

      {keySafe && (
        <Field label="Key safe location">
          <input
            value={keySafeLocation}
            onChange={(e) => setKeySafeLocation(e.target.value)}
            placeholder="e.g. On wall by porch"
          />
        </Field>
      )}

      <Field label={hasExistingCode && !codeTouched ? "Access code (set — type to replace)" : "Access code"}>
        <input
          value={accessCode}
          onChange={(e) => {
            setAccessCode(e.target.value);
            setCodeTouched(true);
          }}
          placeholder={hasExistingCode ? "••••" : "e.g. 4829"}
          inputMode="numeric"
          autoComplete="off"
        />
      </Field>
      <p className="t-needs-signal" style={{ marginTop: -8, marginBottom: 14 }}>
        Kept hidden on the property screen until you tap Reveal.
      </p>

      <Toggle label="Alarm" checked={alarm} onChange={setAlarm} />

      <Field label="Parking">
        <select value={parking} onChange={(e) => setParking(e.target.value)}>
          <option value="">Select parking</option>
          {PARKING_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      <Toggle label="Permit required" checked={permitRequired} onChange={setPermitRequired} />

      <p className="t-field-label">Working hours</p>
      <div className="t-two-fields">
        <label>
          From
          <input type="time" value={hoursFrom} onChange={(e) => setHoursFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="time" value={hoursTo} onChange={(e) => setHoursTo(e.target.value)} />
        </label>
      </div>

      <Toggle label="Call before arrival" checked={callBefore} onChange={setCallBefore} />
      <Toggle label="Dog on site" checked={dogOnSite} onChange={setDogOnSite} />
      <Toggle label="Asbestos known" checked={asbestos} onChange={setAsbestos} />

      <MultiChips label="Safety flags" options={SAFETY_FLAGS} values={flags} onChange={setFlags} />

      <Field label="Notes for engineer">
        <textarea
          rows={3}
          value={engineerNotes}
          onChange={(e) => setEngineerNotes(e.target.value)}
          placeholder="e.g. Use side gate. Ask for Bob if tenant not in."
        />
      </Field>
      <p className="t-needs-signal" style={{ marginTop: -8, marginBottom: 18 }}>
        Internal only — never shown to the customer.
      </p>

      <QueryError error={save.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : inFlow ? "Next: Add asset" : "Save access details"}
      </button>

      {inFlow && (
        <button
          type="button"
          className="t-btn t-btn--block"
          style={{ marginTop: 8 }}
          onClick={() => navigate(`/t/properties/${propertyId}`, { replace: true })}
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
