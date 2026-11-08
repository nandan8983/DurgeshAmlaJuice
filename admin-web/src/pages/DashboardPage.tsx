import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { rupees, shortDate, todayIso } from '../lib/format';
import { Alert, Card, DeliveryBadge, ErrorNote, Loading, ProductBadge, Stat } from '../components/ui';

export function DashboardPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());

  const summary = useQuery({
    queryKey: ['summary', date],
    queryFn: () => api.summary(date),
    refetchInterval: 60_000,
  });

  const deliveries = useQuery({
    queryKey: ['deliveries', date],
    queryFn: () => api.deliveries({ date, limit: 500 }),
  });

  const generate = useMutation({
    mutationFn: () => api.generateRoute(date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Deliveries, collections and renewals for {shortDate(date)}.</p>
        </div>
        <div className="row">
          <input
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            style={{ width: 'auto' }}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}>
            {generate.isPending ? 'Generating…' : 'Generate route'}
          </button>
        </div>
      </div>

      {generate.isError ? <ErrorNote error={generate.error} /> : null}
      {generate.isSuccess ? (
        <Alert tone="info">
          Route generated: {String(generate.data.result.created)} new stop(s),{' '}
          {String(generate.data.result.alreadyPresent)} already there,{' '}
          {String(generate.data.result.skippedPaused)} paused.
        </Alert>
      ) : null}

      {summary.isLoading ? <Loading what="dashboard" /> : null}
      {summary.isError ? <ErrorNote error={summary.error} /> : null}

      {summary.data ? (
        <>
          <div className="grid cols-4" style={{ marginBottom: '1rem' }}>
            <Stat
              label="Delivered today"
              value={`${summary.data.deliveries.delivered} / ${summary.data.deliveries.total}`}
              sub={`${summary.data.deliveries.bottlesDelivered} of ${summary.data.deliveries.bottlesTotal} bottles`}
            />
            <Stat
              label="Collected today"
              value={rupees(summary.data.collections.today)}
              sub={`${summary.data.collections.todayCount} payment(s) · month ${rupees(
                summary.data.collections.month,
              )}`}
            />
            <Stat
              label="Pending payments"
              value={rupees(summary.data.collections.pending)}
              sub={`${summary.data.collections.pendingCount} customer payment(s)`}
            />
            <Stat
              label="Renewals due"
              value={summary.data.renewalsDue.count}
              sub={`within ${summary.data.renewalsDue.thresholdDays} day(s)`}
            />
          </div>

          <div className="grid cols-4" style={{ marginBottom: '1rem' }}>
            <Stat label="Active customers" value={summary.data.activeCustomers} />
            <Stat label="Active riders" value={summary.data.activeRiders} />
            <Stat label="Paused subscriptions" value={summary.data.pausedSubscriptions} />
            <Stat
              label="Not delivered"
              value={
                summary.data.deliveries.pending +
                summary.data.deliveries.skipped +
                summary.data.deliveries.notHome
              }
              sub={`${summary.data.deliveries.pending} pending · ${summary.data.deliveries.skipped} skipped · ${summary.data.deliveries.notHome} not home`}
            />
          </div>

          <div className="grid cols-2">
            <Card title="Renewals due">
              {summary.data.renewalsDue.items.length === 0 ? (
                <p className="muted">Nothing expiring in the alert window.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Rider</th>
                        <th>Product</th>
                        <th>Ends</th>
                        <th className="num">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.data.renewalsDue.items.map(item => (
                        <tr key={item.subscriptionId}>
                          <td>
                            <Link to={`/customers/${item.customerId}`}>{item.customerName}</Link>
                          </td>
                          <td>{item.riderName}</td>
                          <td>
                            <ProductBadge product={item.product} />
                          </td>
                          <td>{shortDate(item.endDate)}</td>
                          <td className="num">{item.daysLeft}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title={`Deliveries on ${shortDate(date)}`}>
              {deliveries.isLoading ? <Loading what="deliveries" /> : null}
              {deliveries.data?.deliveries.length === 0 ? (
                <p className="muted">
                  Nothing generated for this date yet. Use <strong>Generate route</strong> above.
                </p>
              ) : null}
              {deliveries.data && deliveries.data.deliveries.length > 0 ? (
                <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Rider</th>
                        <th>Juice</th>
                        <th className="num">Qty</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.data.deliveries.map(row => (
                        <tr key={row.id}>
                          <td>
                            <Link to={`/customers/${row.customerId}`}>{row.customerName}</Link>
                            {row.area ? <div className="muted">{row.area}</div> : null}
                          </td>
                          <td>{row.riderName}</td>
                          <td>
                            <ProductBadge product={row.product} />
                          </td>
                          <td className="num">{row.qty}</td>
                          <td>
                            <DeliveryBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
