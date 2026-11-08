/** Reports, each with a CSV export of exactly what is on screen. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, downloadCsv } from '../lib/api';
import { rupees, shortDate, startOfMonthIso, todayIso } from '../lib/format';
import { Badge, Card, ErrorNote, Loading, Stat } from '../components/ui';

export function ReportsPage(): React.JSX.Element {
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [expiringDays, setExpiringDays] = useState(7);

  const collections = useQuery({
    queryKey: ['report', 'payments', from, to],
    queryFn: () => api.reportPayments({ from, to }),
  });

  const deliveries = useQuery({
    queryKey: ['report', 'deliveries', from, to],
    queryFn: () => api.reportDeliveries({ from, to }),
  });

  const expiring = useQuery({
    queryKey: ['report', 'expiring', expiringDays],
    queryFn: () => api.reportExpiring(expiringDays),
  });

  const pending = useQuery({
    queryKey: ['report', 'pending-payments'],
    queryFn: () => api.reportPendingPayments(),
  });

  const pauses = useQuery({
    queryKey: ['report', 'pauses', from, to],
    queryFn: () => api.reportPauses({ from, to }),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Everything here respects your role: a supervisor sees only their own riders.</p>
        </div>
        <div className="row">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto' }} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto' }} />
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: '1rem' }}>
        <Stat
          label="Collected in range"
          value={rupees(collections.data?.total ?? 0)}
          sub={`${collections.data?.count ?? 0} payment(s)`}
        />
        <Stat
          label="Pending overall"
          value={rupees(pending.data?.total ?? 0)}
          sub={`${pending.data?.count ?? 0} payment(s)`}
        />
        <Stat label="Plans expiring" value={expiring.data?.count ?? 0} sub={`next ${expiringDays} days`} />
        <Stat label="Pauses in range" value={pauses.data?.count ?? 0} />
      </div>

      <Card
        title="Collections per collector"
        action={
          <button
            type="button"
            className="secondary small"
            onClick={() =>
              void downloadCsv('/admin/reports/payments', { from, to }, `collections-${from}-to-${to}.csv`)
            }>
            Export CSV
          </button>
        }>
        {collections.isLoading ? <Loading what="collections" /> : null}
        {collections.isError ? <ErrorNote error={collections.error} /> : null}
        {collections.data ? (
          <>
            <div className="row" style={{ marginBottom: '0.75rem' }}>
              {collections.data.byMode.map(mode => (
                <Badge key={mode.mode} tone="green">
                  {mode.mode}: {rupees(mode.amount)} ({mode.count})
                </Badge>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Collected by</th>
                    <th className="num">Amount</th>
                    <th className="num">Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.data.byCollector.map(row => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td className="num">{rupees(row.amount)}</td>
                      <td className="num">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {collections.data.byCollector.length === 0 ? (
                <p className="empty">Nothing collected in this range.</p>
              ) : null}
            </div>
          </>
        ) : null}
      </Card>

      <Card
        title="Deliveries per rider"
        action={
          <button
            type="button"
            className="secondary small"
            onClick={() =>
              void downloadCsv('/admin/reports/deliveries', { from, to }, `deliveries-${from}-to-${to}.csv`)
            }>
            Export CSV
          </button>
        }>
        {deliveries.isLoading ? <Loading what="deliveries" /> : null}
        {deliveries.isError ? <ErrorNote error={deliveries.error} /> : null}
        {deliveries.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Supervisor</th>
                  <th className="num">Delivered</th>
                  <th className="num">Bottles</th>
                  <th className="num">Skipped</th>
                  <th className="num">Not home</th>
                  <th className="num">Pending</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data.perRider.map(row => (
                  <tr key={row.riderId}>
                    <td>{row.rider}</td>
                    <td>{row.supervisor || <span className="muted">—</span>}</td>
                    <td className="num">{row.delivered}</td>
                    <td className="num">{row.bottlesDelivered}</td>
                    <td className="num">{row.skipped}</td>
                    <td className="num">{row.notHome}</td>
                    <td className="num">{row.pending}</td>
                    <td className="num">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {deliveries.data.perRider.length === 0 ? (
              <p className="empty">No deliveries in this range.</p>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card
        title="Expiring plans"
        action={
          <div className="row">
            <select
              value={expiringDays}
              onChange={e => setExpiringDays(Number(e.target.value))}
              style={{ width: 'auto' }}>
              {[2, 3, 7, 15, 30].map(days => (
                <option key={days} value={days}>
                  next {days} days
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary small"
              onClick={() =>
                void downloadCsv(
                  '/admin/reports/expiring',
                  { days: expiringDays },
                  `expiring-${expiringDays}d.csv`,
                )
              }>
              Export CSV
            </button>
          </div>
        }>
        {expiring.isLoading ? <Loading what="expiring plans" /> : null}
        {expiring.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Area</th>
                  <th>Rider</th>
                  <th>Plan</th>
                  <th>Ends</th>
                  <th className="num">Days</th>
                  <th className="num">Renewal</th>
                </tr>
              </thead>
              <tbody>
                {expiring.data.items.map(row => (
                  <tr key={row.subscriptionId}>
                    <td>
                      <Link to={`/customers/${row.customerId}`}>{row.customerName}</Link>
                    </td>
                    <td>{row.mobile}</td>
                    <td>{row.area || <span className="muted">—</span>}</td>
                    <td>{row.rider}</td>
                    <td>{row.plan}</td>
                    <td>{shortDate(row.endDate)}</td>
                    <td className="num">
                      {row.daysLeft <= 2 ? <Badge tone="amber">{row.daysLeft}</Badge> : row.daysLeft}
                    </td>
                    <td className="num">{rupees(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {expiring.data.items.length === 0 ? <p className="empty">Nothing expiring.</p> : null}
          </div>
        ) : null}
      </Card>

      <Card
        title="Pending payments by customer"
        action={
          <button
            type="button"
            className="secondary small"
            onClick={() =>
              void downloadCsv('/admin/reports/pending-payments', {}, 'pending-payments.csv')
            }>
            Export CSV
          </button>
        }>
        {pending.isLoading ? <Loading what="pending payments" /> : null}
        {pending.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Area</th>
                  <th>Rider</th>
                  <th>Since</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pending.data.items.map(row => (
                  <tr key={row.paymentId}>
                    <td>
                      <Link to={`/customers/${row.customerId}`}>{row.customerName}</Link>
                    </td>
                    <td>{row.mobile}</td>
                    <td>{row.area || <span className="muted">—</span>}</td>
                    <td>{row.rider}</td>
                    <td>{shortDate(row.since)}</td>
                    <td className="num">{rupees(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pending.data.items.length === 0 ? <p className="empty">Nothing pending. 🎉</p> : null}
          </div>
        ) : null}
      </Card>

      <Card
        title="Pauses"
        action={
          <button
            type="button"
            className="secondary small"
            onClick={() =>
              void downloadCsv('/admin/reports/pauses', { from, to }, `pauses-${from}-to-${to}.csv`)
            }>
            Export CSV
          </button>
        }>
        {pauses.isLoading ? <Loading what="pauses" /> : null}
        {pauses.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Rider</th>
                  <th>Paused from</th>
                  <th>Resumed</th>
                  <th className="num">Days</th>
                  <th>New end date</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {pauses.data.items.map((row, index) => (
                  <tr key={`${row.customerName}-${row.pausedFrom}-${index}`}>
                    <td>{row.customerName}</td>
                    <td>{row.rider}</td>
                    <td>{shortDate(row.pausedFrom)}</td>
                    <td>
                      {row.resumedOn ? shortDate(row.resumedOn) : <Badge tone="amber">still paused</Badge>}
                    </td>
                    <td className="num">{row.pausedDays || '—'}</td>
                    <td>{shortDate(row.newEndDate)}</td>
                    <td>{row.reason || <span className="muted">—</span>}</td>
                    <td>{row.pausedBy || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pauses.data.items.length === 0 ? <p className="empty">No pauses in this range.</p> : null}
          </div>
        ) : null}
      </Card>
    </>
  );
}
