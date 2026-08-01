import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QueryError } from "../ui";
import { startTemplate } from "../../../lib/newTemplate";

const CATEGORIES = ["Plumbing", "Heating", "Bathrooms", "Electrical", "General"];
const TAGS = ["Common job", "Emergency", "Service", "Install"];

/** Screen 3 — the details that organise a template and power suggestions. */
export default function TemplateDetailsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState("01:00");
  const [useForAi, setUseForAi] = useState(true);

  const create = useMutation({
    mutationFn: () =>
      startTemplate(qc, {
        name: name.trim(),
        category: category || null,
        description: description.trim() || null,
        tags: [...tags],
        defaultDurationMins: parseDuration(duration),
        useForAiDrafting: useForAi,
      }),
    onSuccess: (id) => navigate(`/t/rates/templates/${id}/items`, { replace: true }),
  });

  const toggleTag = (tag: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });

  return (
    <div className="t-template-form">
      <label className="t-field">
        Template name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Annual boiler service"
        />
      </label>

      <label className="t-field">
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Select category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="t-field">
        Description (optional)
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of when to use this template"
        />
      </label>

      <p className="t-field-label">Template tags</p>
      <div className="t-chip-row t-chip-row--wrap">
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={tags.has(tag)}
            className={`t-chip${tags.has(tag) ? " is-active" : ""}`}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      <label className="t-field">
        Default duration
        <div className="t-duration-row">
          <input
            type="time"
            step={900}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            aria-label="Default duration"
          />
          <span>hrs</span>
        </div>
      </label>

      <label className="t-toggle-row">
        <span>
          <strong>Use for AI notes / voice drafting</strong>
          <span className="muted-text">Allow this template to be suggested when drafting quotes.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={useForAi}
          onChange={(e) => setUseForAi(e.target.checked)}
        />
      </label>

      <QueryError error={create.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={create.isPending || name.trim().length < 2}
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Creating…" : "Next: Add items"}
      </button>
    </div>
  );
}

/** "01:30" → 90. Stored as minutes so half-hours survive the round trip. */
function parseDuration(value: string): number | null {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const mins = h * 60 + m;
  return mins > 0 ? mins : null;
}
