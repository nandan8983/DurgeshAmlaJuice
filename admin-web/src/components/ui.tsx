/** Shared presentational pieces. */
import type { ReactNode } from 'react';
import type { DeliveryStatus, PaymentStatus, SubscriptionStatus } from '../lib/types';

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="card">
      {title || action ? (
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          {title ? <h2 style={{ margin: 0 }}>{title}</h2> : null}
          <span className="spacer" />
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}): React.JSX.Element {
  return (
    <div className="card stat">
      <h3>{label}</h3>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

type BadgeTone = 'green' | 'magenta' | 'amber' | 'red' | 'grey';

export function Badge({
  children,
  tone = 'grey',
  solid = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  solid?: boolean;
}): React.JSX.Element {
  return <span className={`badge ${tone}${solid ? ' solid' : ''}`}>{children}</span>;
}

const subscriptionTone: Record<SubscriptionStatus, BadgeTone> = {
  active: 'green',
  paused: 'amber',
  expired: 'grey',
  cancelled: 'red',
};

export function SubscriptionBadge({ status }: { status: SubscriptionStatus }): React.JSX.Element {
  return <Badge tone={subscriptionTone[status]}>{status}</Badge>;
}

const deliveryTone: Record<DeliveryStatus, BadgeTone> = {
  delivered: 'green',
  pending: 'grey',
  skipped: 'amber',
  not_home: 'amber',
};

export function DeliveryBadge({ status }: { status: DeliveryStatus }): React.JSX.Element {
  return <Badge tone={deliveryTone[status]}>{status.replace('_', ' ')}</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }): React.JSX.Element {
  return <Badge tone={status === 'paid' ? 'green' : 'amber'}>{status}</Badge>;
}

export function ProductBadge({ product }: { product: string }): React.JSX.Element {
  if (product === 'combo') {
    return (
      <span className="row" style={{ gap: '0.25rem' }}>
        <Badge tone="green" solid>
          A
        </Badge>
        <Badge tone="magenta" solid>
          B
        </Badge>
      </span>
    );
  }
  return (
    <Badge tone={product === 'beetroot' ? 'magenta' : 'green'} solid>
      {product === 'beetroot' ? 'Beetroot' : 'Amla'}
    </Badge>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="muted">{hint}</div> : null}
    </div>
  );
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'warn';
  children: ReactNode;
}): React.JSX.Element {
  return <div className={`alert ${tone}`}>{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row">
          <h2>{title}</h2>
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading({ what = 'data' }: { what?: string }): React.JSX.Element {
  return <div className="empty">Loading {what}…</div>;
}

export function ErrorNote({ error }: { error: unknown }): React.JSX.Element {
  return <Alert tone="error">{(error as Error)?.message ?? 'Something went wrong'}</Alert>;
}

export function Empty({ text }: { text: string }): React.JSX.Element {
  return <div className="empty">{text}</div>;
}
