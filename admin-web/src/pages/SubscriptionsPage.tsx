/** Subscriptions and payments on one page, since they move together. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, downloadCsv } from '../lib/api';
import { dateTime, rupees, shortDate, startOfMonthIso, todayIso } from '../lib/format';
import {
  Card,
  ErrorNote,
  Loading,
  PaymentBadge,
  ProductBadge,
  SubscriptionBadge,
} from '../components/ui';

export function SubscriptionsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());

  const subscriptions = useQuery({
    queryKey: ['subscriptions', status],
    queryFn: () => api.subscriptions({ status: status || undefined, limit: 200 }),
  });

  const payments = useQuery({
    queryKey: ['payments', { paymentStatus, from, to }],
    queryFn: () =>
      api.payments({
        status: paymentStatus || undefined,
        // Pending rows have no paid_at, so the date filter only applies to paid.
        from: paymentStatus === 'pending' ? undefined : from,
        to: paymentStatus === 'pending' ? undefined : to,
        limit: 300,
      }),
  });

  const settle = useMutation({
    mutationFn: (paymentId: string) => api.updatePayment(paymentId, { status: 'paid' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Subscriptions &amp; payments</h1>
          <p>Prepaid plans and what has been collected against them.</p>
        </div>
      </div>

      <Card
        title="Subscriptions"
        action={
          <select
            value={status}
            onChange={event => setStatus(event.target.value)}
            style={{ width: 'auto' }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        }>
        {subscriptions.isLoading ? <Loading what="subscriptions" /> : null}
        {subscriptions.isError ? <ErrorNote error={subscriptions.error} /> : null}
        {subscriptions.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Window</th>
                  <th className="num">Bottles/day</th>
                  <th className="num">Amount</th>
                  <th className="num">Paused days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.data.subscriptions.map(sub => (
                  <tr key={sub.id}>
                    <td>
                      <Link to={`/customers/${sub.customerId}`}>{sub.customerName}</Link>
                    </td>
                    <td>
                      <ProductBadge product={sub.product} />
                    </td>
                    <td>
                      {shortDate(sub.startDate)} → {shortDate(sub.endDate)}
                      <div className="muted">{sub.durationDays} days</div>
                    </td>
                    <td className="num">{sub.bottlesPerDay}</td>
                    <td className="num">{rupees(sub.amount)}</td>
                    <td className="num">{sub.pausedDays}</td>
                    <td>
                      <SubscriptionBadge status={sub.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {subscriptions.data.subscriptions.length === 0 ? (
              <p className="empty">No subscriptions match.</p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card
        title="Payments"
        action={
          <div className="row">
            <select
              value={paymentStatus}
              onChange={event => setPaymentStatus(event.target.value)}
              style={{ width: 'auto' }}>
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
            <input
              type="date"
              value={from}
              onChange={event => setFrom(event.target.value)}
              style={{ width: 'auto' }}
              disabled={paymentStatus === 'pending'}
            />
            <input
              type="date"
              value={to}
              onChange={event => setTo(event.target.value)}
              style={{ width: 'auto' }}
              disabled={paymentStatus === 'pending'}
            />
            <button
              type="button"
              className="secondary small"
              onClick={() =>
                void downloadCsv(
                  '/admin/reports/payments',
                  { from, to },
                  `collections-${from}-to-${to}.csv`,
                )
              }>
              Export CSV
            </button>
          </div>
        }>
        {payments.isLoading ? <Loading what="payments" /> : null}
        {payments.isError ? <ErrorNote error={payments.error} /> : null}
        {payments.data ? (
          <>
            <p className="muted">
              Paid {rupees(payments.data.totals.paid ?? 0)} · pending{' '}
              {rupees(payments.data.totals.pending ?? 0)} · {payments.data.total} record(s)
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="num">Amount</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Collected by</th>
                    <th>When</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payments.data.payments.map(payment => (
                    <tr key={payment.id}>
                      <td>
                        <Link to={`/customers/${payment.customerId}`}>
                          {payment.customerName ?? payment.customerId}
                        </Link>
                      </td>
                      <td className="num">{rupees(payment.amount)}</td>
                      <td>{payment.mode}</td>
                      <td>
                        <PaymentBadge status={payment.status} />
                      </td>
                      <td>{payment.collectedByName ?? <span className="muted">—</span>}</td>
                      <td>{dateTime(payment.paidAt ?? payment.createdAt)}</td>
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
              {payments.data.payments.length === 0 ? <p className="empty">No payments match.</p> : null}
            </div>
          </>
        ) : null}
      </Card>
    </>
  );
}
