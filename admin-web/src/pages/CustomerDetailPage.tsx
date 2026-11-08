import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { dateTime, rupees, shortDate, todayIso } from '../lib/format';
import {
  Alert,
  Badge,
  Card,
  DeliveryBadge,
  ErrorNote,
  Field,
  Loading,
  PaymentBadge,
  ProductBadge,
  SubscriptionBadge,
} from '../components/ui';

export function CustomerDetailPage(): React.JSX.Element {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();

  const detail = useQuery({ queryKey: ['customer', id], queryFn: () => api.customer(id) });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.plans() });
  const deliveries = useQuery({
    queryKey: ['deliveries', 'customer', id],
    queryFn: () => api.deliveries({ customerId: id, limit: 30 }),
  });

  const [edit, setEdit] = useState({
    name: '',
    mobile: '',
    bottlesPerDay: 1,
    area: '',
    address: '',
    landmark: '',
    city: '',
    notes: '',
    latitude: '',
    longitude: '',
    status: 'active' as 'active' | 'inactive',
  });

  useEffect(() => {
    const customer = detail.data?.customer;
    if (!customer) return;
    setEdit({
      name: customer.name,
      mobile: customer.mobile,
      bottlesPerDay: customer.bottlesPerDay,
      area: customer.area ?? '',
      address: customer.address ?? '',
      landmark: customer.landmark ?? '',
      city: customer.city,
      notes: customer.notes ?? '',
      latitude: customer.latitude !== null ? String(customer.latitude) : '',
      longitude: customer.longitude !== null ? String(customer.longitude) : '',
      status: customer.status,
    });
  }, [detail.data?.customer]);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['customer', id] });
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['summary'] });
  };

  const save = useMutation({
    mutationFn: () =>
      api.updateCustomer(id, {
        name: edit.name,
        mobile: edit.mobile,
        bottlesPerDay: Number(edit.bottlesPerDay),
        area: edit.area || null,
        address: edit.address || null,
        landmark: edit.landmark || null,
        city: edit.city,
        notes: edit.notes || null,
        latitude: edit.latitude === '' ? null : Number(edit.latitude),
        longitude: edit.longitude === '' ? null : Number(edit.longitude),
        status: edit.status,
      } as never),
    onSuccess: invalidate,
  });

  const pause = useMutation({
    mutationFn: (subscriptionId: string) =>
      api.pauseSubscription(subscriptionId, 'Paused from the dashboard'),
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: (subscriptionId: string) => api.resumeSubscription(subscriptionId),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: (subscriptionId: string) => api.cancelSubscription(subscriptionId),
    onSuccess: invalidate,
  });

  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [renew, setRenew] = useState(false);

  const startPlan = useMutation({
    mutationFn: () =>
      api.createSubscription({
        customerId: id,
        planId,
        startDate: renew ? undefined : startDate,
        renew,
      }),
    onSuccess: invalidate,
  });

  const settle = useMutation({
    mutationFn: (paymentId: string) => api.updatePayment(paymentId, { status: 'paid' }),
    onSuccess: invalidate,
  });

  if (detail.isLoading) return <Loading what="customer" />;
  if (detail.isError || !detail.data) return <ErrorNote error={detail.error} />;

  const { customer, subscriptions, payments, pendingAmount } = detail.data;
  const active = customer.subscription;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{customer.name}</h1>
          <p>
            {customer.mobile} · {customer.area ?? 'no area'} · {customer.city} · rider{' '}
            {customer.riderName}
          </p>
        </div>
        <Link to="/customers">← All customers</Link>
      </div>

      {pendingAmount > 0 ? (
        <Alert tone="warn">{rupees(pendingAmount)} pending from this customer.</Alert>
      ) : null}
      {customer.renewalDue ? <Alert tone="warn">Renewal due — plan ends soon.</Alert> : null}

      <div className="grid cols-2">
        <Card title="Current plan">
          {active ? (
            <>
              <div className="row">
                <ProductBadge product={active.product} />
                <SubscriptionBadge status={active.status} />
                <span className="spacer" />
                <strong>{rupees(active.amount)}</strong>
              </div>
              <p className="muted">
                {active.planName} · {active.bottlesPerDay} bottle(s)/day ·{' '}
                {shortDate(active.startDate)} → {shortDate(active.endDate)}
                {active.daysLeft !== null ? ` · ${active.daysLeft} day(s) left` : ''}
              </p>
              <div className="row">
                {active.status === 'paused' ? (
                  <button type="button" onClick={() => resume.mutate(active.id)} disabled={resume.isPending}>
                    Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => pause.mutate(active.id)}
                    disabled={pause.isPending}>
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  className="danger small"
                  onClick={() => {
                    if (window.confirm('Cancel this subscription? Pending stops are removed.')) {
                      cancel.mutate(active.id);
                    }
                  }}>
                  Cancel plan
                </button>
              </div>
              {resume.isSuccess ? (
                <Alert tone="info">
                  Resumed. {resume.data.pausedDays} paused day(s) added — now ends{' '}
                  {shortDate(resume.data.newEndDate)}.
                </Alert>
              ) : null}
            </>
          ) : (
            <p className="muted">No active plan.</p>
          )}

          <h3 style={{ marginTop: '1rem' }}>Start a plan</h3>
          {startPlan.isError ? <ErrorNote error={startPlan.error} /> : null}
          <Field label="Plan">
            <select value={planId} onChange={event => setPlanId(event.target.value)}>
              <option value="">Choose a plan…</option>
              {(plans.data?.plans ?? []).map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {rupees(plan.price * customer.bottlesPerDay)}
                </option>
              ))}
            </select>
          </Field>
          <div className="row">
            <label style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={renew}
                onChange={event => setRenew(event.target.checked)}
                style={{ width: 'auto', minHeight: 0, marginRight: '0.4rem' }}
              />
              Queue after the current plan ends
            </label>
          </div>
          {!renew ? (
            <Field label="Start date">
              <input
                type="date"
                value={startDate}
                onChange={event => setStartDate(event.target.value)}
              />
            </Field>
          ) : null}
          <button type="button" onClick={() => startPlan.mutate()} disabled={!planId || startPlan.isPending}>
            {startPlan.isPending ? 'Starting…' : 'Start plan'}
          </button>
        </Card>

        <Card title="Details">
          {save.isError ? <ErrorNote error={save.error} /> : null}
          {save.isSuccess ? <Alert tone="info">Saved.</Alert> : null}
          <Field label="Name">
            <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
          </Field>
          <Field label="Mobile">
            <input value={edit.mobile} onChange={e => setEdit({ ...edit, mobile: e.target.value })} />
          </Field>
          <div className="filters">
            <Field label="Bottles / day">
              <input
                type="number"
                min={1}
                max={50}
                value={edit.bottlesPerDay}
                onChange={e => setEdit({ ...edit, bottlesPerDay: Number(e.target.value) })}
              />
            </Field>
            <Field label="Status">
              <select
                value={edit.status}
                onChange={e => setEdit({ ...edit, status: e.target.value as 'active' | 'inactive' })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>
          <Field label="Area">
            <input value={edit.area} onChange={e => setEdit({ ...edit, area: e.target.value })} />
          </Field>
          <Field label="Address">
            <input value={edit.address} onChange={e => setEdit({ ...edit, address: e.target.value })} />
          </Field>
          <Field label="Landmark">
            <input value={edit.landmark} onChange={e => setEdit({ ...edit, landmark: e.target.value })} />
          </Field>
          <Field label="City">
            <input value={edit.city} onChange={e => setEdit({ ...edit, city: e.target.value })} />
          </Field>
          <div className="filters">
            <Field label="Latitude">
              <input
                value={edit.latitude}
                onChange={e => setEdit({ ...edit, latitude: e.target.value })}
                placeholder="21.3486"
              />
            </Field>
            <Field label="Longitude">
              <input
                value={edit.longitude}
                onChange={e => setEdit({ ...edit, longitude: e.target.value })}
                placeholder="74.8805"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              rows={3}
              value={edit.notes}
              onChange={e => setEdit({ ...edit, notes: e.target.value })}
            />
          </Field>
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </Card>
      </div>

      <div className="grid cols-2" style={{ marginTop: '1rem' }}>
        <Card title="Payments">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th className="num">Amount</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id}>
                    <td>{dateTime(payment.paidAt ?? payment.createdAt)}</td>
                    <td className="num">{rupees(payment.amount)}</td>
                    <td>{payment.mode}</td>
                    <td>
                      <PaymentBadge status={payment.status} />
                    </td>
                    <td>
                      {payment.status === 'pending' ? (
                        <button
                          type="button"
                          className="small secondary"
                          onClick={() => settle.mutate(payment.id)}
                          disabled={settle.isPending}>
                          Mark paid
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 ? <p className="empty">No payments yet.</p> : null}
          </div>
        </Card>

        <Card title="Subscription history">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Window</th>
                  <th className="num">Paused</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(sub => (
                  <tr key={sub.id}>
                    <td>
                      {sub.planName}
                      <div className="muted">{rupees(sub.amount)}</div>
                    </td>
                    <td>
                      {shortDate(sub.startDate)} → {shortDate(sub.endDate)}
                    </td>
                    <td className="num">{(sub as { pausedDays?: number }).pausedDays ?? 0}</td>
                    <td>
                      <SubscriptionBadge status={sub.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {subscriptions.length === 0 ? <p className="empty">No subscriptions yet.</p> : null}
          </div>
        </Card>
      </div>

      <Card title="Recent deliveries">
        {deliveries.isLoading ? <Loading what="deliveries" /> : null}
        {deliveries.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Juice</th>
                  <th className="num">Qty</th>
                  <th>Status</th>
                  <th>Marked at</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data.deliveries.map(row => (
                  <tr key={row.id}>
                    <td>{shortDate(row.deliveryDate)}</td>
                    <td>
                      <ProductBadge product={row.product} />
                    </td>
                    <td className="num">{row.qty}</td>
                    <td>
                      <DeliveryBadge status={row.status} />
                    </td>
                    <td>{dateTime(row.deliveredAt)}</td>
                    <td>{row.remarks ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {deliveries.data.deliveries.length === 0 ? (
              <p className="empty">No deliveries recorded yet.</p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {customer.latitude !== null && customer.longitude !== null ? (
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Pin:{' '}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${customer.latitude},${customer.longitude}`}
            target="_blank"
            rel="noreferrer">
            {customer.latitude}, {customer.longitude}
          </a>
        </p>
      ) : (
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          <Badge tone="amber">No GPS pin</Badge> Ask the rider to capture it at the door, or paste
          coordinates above.
        </p>
      )}
    </>
  );
}
