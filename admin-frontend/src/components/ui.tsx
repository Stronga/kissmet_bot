import type { ReactNode } from "react";
import { labelize } from "../utils/format";

export function StatusChip({ value }: { value?: string | null }) {
  const tone: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-800",
    available: "bg-emerald-50 text-emerald-800",
    approved: "bg-emerald-50 text-emerald-800",
    confirmed: "bg-emerald-50 text-emerald-800",
    verified: "bg-emerald-50 text-emerald-800",
    issued: "bg-emerald-50 text-emerald-800",
    published: "bg-emerald-50 text-emerald-800",
    pending: "bg-amber-50 text-amber-800",
    submitted: "bg-amber-50 text-amber-800",
    under_review: "bg-amber-50 text-amber-800",
    draft: "bg-slate-100 text-slate-700",
    open: "bg-amber-50 text-amber-800",
    rejected: "bg-rose-50 text-rose-800",
    cancelled: "bg-slate-100 text-slate-700",
    refunded: "bg-rose-50 text-rose-800",
    voided: "bg-rose-50 text-rose-800",
    maintenance: "bg-orange-50 text-orange-800",
    high_alert: "bg-rose-50 text-rose-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone[value ?? ""] ?? "bg-slate-100 text-slate-700"}`}>
      {labelize(value)}
    </span>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title ? <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2> : null}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Button({ children, onClick, type = "button", disabled, variant = "primary" }: {
  children: ReactNode; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean; variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-primary text-white hover:bg-primary-dark",
    secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles[variant]}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary ${props.className ?? ""}`} />;
}

export function Empty({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-slate-500">{body}</p></div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{message}</div>;
}

export function Loading() {
  return <div className="py-16 text-center text-sm text-slate-500">Loading…</div>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="mt-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
