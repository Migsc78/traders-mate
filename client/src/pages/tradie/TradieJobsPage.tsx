import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, tradieApi } from "../../api/tradie";
import { EmptyState, IconChevron, StatusPill } from "./ui";

type JobRow = {
  id: string;
  name: string;
  phone: string;
  message: string | null;
  postcode: string | null;
  distanceMiles: number | null;
  photoUrls: string[];
  createdAt: string;
  latestQuote: { id: string; status: string; totalPence: number } | null;
};

const ARCHIVE_THRESHOLD = 72;
const DELETE_THRESHOLD = -72;
const MAX_SLIDE = 96;

function SwipeJobRow({
  job,
  onArchive,
  onDelete,
  busy,
}: {
  job: JobRow;
  onArchive: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const locked = useRef<"h" | "v" | null>(null);
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);

  const reset = (next = 0) => {
    setAnimating(true);
    setDx(next);
    window.setTimeout(() => setAnimating(false), 180);
  };

  const onTouchStart = (e: TouchEvent) => {
    if (busy) return;
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    dragging.current = true;
    locked.current = null;
    setAnimating(false);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!dragging.current || busy) return;
    const t = e.touches[0];
    const rawX = t.clientX - startX.current;
    const rawY = t.clientY - startY.current;
    if (!locked.current) {
      if (Math.abs(rawX) < 8 && Math.abs(rawY) < 8) return;
      locked.current = Math.abs(rawX) > Math.abs(rawY) ? "h" : "v";
      if (locked.current === "v") {
        dragging.current = false;
        return;
      }
    }
    if (locked.current !== "h") return;
    setDx(Math.max(-MAX_SLIDE, Math.min(MAX_SLIDE, rawX)));
  };

  const onTouchEnd = () => {
    if (!dragging.current) {
      reset(0);
      return;
    }
    dragging.current = false;
    if (dx >= ARCHIVE_THRESHOLD) {
      reset(MAX_SLIDE);
      onArchive();
      window.setTimeout(() => reset(0), 220);
      return;
    }
    if (dx <= DELETE_THRESHOLD) {
      reset(-MAX_SLIDE);
      onDelete();
      window.setTimeout(() => reset(0), 220);
      return;
    }
    reset(0);
  };

  return (
    <li className="t-swipe">
      <div className="t-swipe-under" aria-hidden="true">
        <span className={`t-swipe-action t-swipe-action--archive ${dx > 24 ? "show" : ""}`}>Archive</span>
        <span className={`t-swipe-action t-swipe-action--delete ${dx < -24 ? "show" : ""}`}>Delete</span>
      </div>
      <div
        className={`t-swipe-front${animating ? " t-swipe-front--anim" : ""}`}
        style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          dragging.current = false;
          reset(0);
        }}
      >
        <Link
          className="t-row"
          to={`/t/jobs/${job.id}`}
          onClick={(e) => {
            if (Math.abs(dx) > 12) e.preventDefault();
          }}
          draggable={false}
        >
          <div className="t-row-main">
            <div className="t-row-top">
              <strong>{job.name}</strong>
              {job.latestQuote ? (
                <StatusPill status={job.latestQuote.status} />
              ) : (
                <span className="t-pill t-pill--orange">New</span>
              )}
            </div>
            <span className="t-row-sub">
              {job.postcode || job.phone}
              {job.distanceMiles != null ? ` · ~${job.distanceMiles} mi` : ""}
            </span>
            {job.message && <span className="t-row-snip">{job.message}</span>}
          </div>
          <div className="t-row-side">
            {job.latestQuote && <span className="t-money">{formatGbp(job.latestQuote.totalPence)}</span>}
            <IconChevron />
          </div>
        </Link>
      </div>
    </li>
  );
}

export default function TradieJobsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const jobs = useQuery({
    queryKey: ["tradie-jobs"],
    queryFn: () => tradieApi.jobs(),
  });

  const archive = useMutation({
    mutationFn: (id: string) => tradieApi.archiveJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => tradieApi.deleteJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
    },
  });

  const busy = archive.isPending || remove.isPending;

  const confirmDelete = (job: JobRow) => {
    if (!window.confirm(`Delete job for ${job.name}? This can’t be undone.`)) return;
    remove.mutate(job.id);
  };

  let list: ReactNode = null;
  if (!jobs.isLoading && !jobs.isError) {
    list = (
      <ul className="t-list">
        {(jobs.data || []).map((j: JobRow) => (
          <SwipeJobRow
            key={j.id}
            job={j}
            busy={busy}
            onArchive={() => archive.mutate(j.id)}
            onDelete={() => confirmDelete(j)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Jobs</h2>
          <p>Swipe right to archive · left to delete</p>
        </div>
        <Link className="t-add-btn" to="/t/jobs/new" aria-label="Add job">
          +
        </Link>
      </header>

      {me.data && !me.data.caps.claude && (
        <p className="error">Claude API key not set on the server — ask your admin to add it in Settings.</p>
      )}

      {jobs.isLoading && <p className="muted-text">Loading…</p>}
      {jobs.isError && <p className="error">{(jobs.error as Error).message}</p>}

      {list}

      {jobs.data?.length === 0 && (
        <EmptyState
          title="No jobs yet"
          hint="Promote something from Inbox, or tap + to add a walk-up job."
        />
      )}

      {jobs.data?.length === 0 && (
        <div className="tradie-actions" style={{ marginTop: 12, flexDirection: "column", gap: 8 }}>
          <Link className="primary t-btn--block" to="/t/jobs/new">
            Add a job
          </Link>
          <Link className="t-btn t-btn--block" to="/t/inbox">
            Open Inbox
          </Link>
        </div>
      )}
    </div>
  );
}
