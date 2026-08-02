import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RATE_CATEGORIES, suggestCategory, type RateCategoryId } from "../../../lib/rateCategories";
import { recallRateForm, type RateFormState } from "./RateNewPage";
import { RateCategoryIcon } from "./RateCategoryIcon";

/**
 * Screen 3 — where this rate belongs in the price book.
 *
 * Pre-selects the obvious answer from what they've already filled in (a call-out
 * item is a call-out; an hourly rate is labour), so most of the time this screen
 * is one tap on a button that's already highlighted.
 */
export default function RateCategoryPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const form = (location.state as { form?: RateFormState } | null)?.form ?? recallRateForm();
  const [picked, setPicked] = useState<RateCategoryId>(
    (form.category as RateCategoryId) || suggestCategory(form)
  );

  const chosen = RATE_CATEGORIES.find((c) => c.id === picked);

  return (
    <div className="t-rate-category">
      <p className="t-step-lede">
        Pick where this rate item should appear in your price book.
      </p>

      <ul className="t-choice-list">
        {RATE_CATEGORIES.map((c) => {
          const on = c.id === picked;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`t-choice-row${on ? " is-active" : ""}`}
                aria-pressed={on}
                onClick={() => setPicked(c.id)}
              >
                <span className="t-choice-icon" aria-hidden="true">
                  <RateCategoryIcon category={c.id} />
                </span>
                <span className="t-choice-main">
                  <strong>{c.label}</strong>
                  <span className="muted-text">{c.hint}</span>
                </span>
                <span className="t-choice-radio" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="primary t-btn--block t-choice-cta"
        onClick={() =>
          navigate("/t/rates/new", {
            state: { form: { ...form, category: picked } },
            replace: true,
          })
        }
      >
        Use {chosen?.label ?? "category"}
      </button>
    </div>
  );
}
