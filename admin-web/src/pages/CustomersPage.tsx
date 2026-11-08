import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { rupees, shortDate } from '../lib/format';
import {
  Alert,
  Badge,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Modal,
  ProductBadge,
  SubscriptionBadge,
} from '../components/ui';
import type { Customer } from '../lib/types';

export function CustomersPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [riderId, setRiderId] = useState('');
  const [renewalDue, setRenewalDue] = useState(false);
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const limit = 50;

  const riders = useQuery({ queryKey: ['users', 'riders'], queryFn: () => api.users({ role: 'rider' }) });

  const customers = useQuery({
    queryKey: ['customers', { search, status, riderId, renewalDue, offset }],
    queryFn: () =>
      api.customers({
        search: search || undefined,
        status: status || undefined,
        riderId: riderId || undefined,
        renewalDue: renewalDue ? 'true' : undefined,
        limit,
        offset,
      }),
  });

  const reassign = useMutation({
    mutationFn: ({ id, rider }: { id: string; rider: string }) => api.assignCustomer(id, rider),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  const pauseResume = useMutation({
    mutationFn: ({ customer }: { customer: Customer }) => {
      const subscription = customer.subscription;
      if (!subscription) throw new Error('This customer has no active plan.');
      return subscription.status === 'paused'
        ? api.resumeSubscription(subscription.id)
        : api.pauseSubscription(subscription.id, 'Paused from the dashboard');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p>{customers.data ? `${customers.data.total} in scope` : 'Loading…'}</p>
        </div>
        <button type="button" onClick={() => setAdding(true)}>
          Add customer
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="filters">
          <div>
            <label htmlFor="search">Search</label>
            <input
              id="search"
              value={search}
              placeholder="Name or mobile"
              onChange={event => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
          </div>
          <div>
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={status}
              onChange={event => {
                setStatus(event.target.value);
                setOffset(0);
              }}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label htmlFor="rider">Rider</label>
            <select
              id="rider"
              value={riderId}
              onChange={event => {
                setRiderId(event.target.value);
                setOffset(0);
              }}>
              <option value="">All riders</option>
              {(riders.data?.users ?? []).map(rider => (
                <option key={rider.id} value={rider.id}>
                  {rider.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="renewal">Renewal</label>
            <select
              id="renewal"
              value={renewalDue ? 'due' : ''}
              onChange={event => {
                setRenewalDue(event.target.value === 'due');
                setOffset(0);
              }}>
              <option value="">Any</option>
              <option value="due">Renewal due</option>
            </select>
          </div>
        </div>
      </div>

      {reassign.isError ? <ErrorNote error={reassign.error} /> : null}
      {pauseResume.isError ? <ErrorNote error={pauseResume.error} /> : null}
      {pauseResume.isSuccess ? <Alert tone="info">Subscription updated.</Alert> : null}

      {customers.isLoading ? <Loading what="customers" /> : null}
      {customers.isError ? <ErrorNote error={customers.error} /> : null}

      {customers.data ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Area</th>
                  <th className="num">Bottles</th>
                  <th>Plan</th>
                  <th>Ends</th>
                  <th>Rider</th>
                  <th>Pin</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.data.customers.map(customer => (
                  <tr key={customer.id}>
                    <td>
                      <Link to={`/customers/${customer.id}`}>{customer.name}</Link>
                      <div className="muted">{customer.mobile}</div>
                    </td>
                    <td>
                      {customer.area ?? <span className="muted">—</span>}
                      <div className="muted">{customer.city}</div>
                    </td>
                    <td className="num">{customer.bottlesPerDay}</td>
                    <td>
                      {customer.subscription ? (
                        <>
                          <div className="row" style={{ gap: '0.3rem' }}>
                            <ProductBadge product={customer.subscription.product} />
                            <SubscriptionBadge status={customer.subscription.status} />
                          </div>
                          <div className="muted">
                            {customer.subscription.planName} · {rupees(customer.subscription.amount)}
                          </div>
                        </>
                      ) : (
                        <Badge tone="grey">no plan</Badge>
                      )}
                      {customer.status === 'inactive' ? <Badge tone="red">inactive</Badge> : null}
                    </td>
                    <td>
                      {shortDate(customer.subscription?.endDate ?? null)}
                      {customer.renewalDue ? (
                        <div>
                          <Badge tone="amber">{customer.subscription?.daysLeft}d left</Badge>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <select
                        value={customer.riderId}
                        onChange={event =>
                          reassign.mutate({ id: customer.id, rider: event.target.value })
                        }
                        style={{ minWidth: 140 }}>
                        {(riders.data?.users ?? []).map(rider => (
                          <option key={rider.id} value={rider.id}>
                            {rider.name}
                          </option>
                        ))}
                        {riders.data?.users.some(r => r.id === customer.riderId) ? null : (
                          <option value={customer.riderId}>{customer.riderName}</option>
                        )}
                      </select>
                    </td>
                    <td>
                      {customer.latitude !== null && customer.longitude !== null ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${customer.latitude},${customer.longitude}`}
                          target="_blank"
                          rel="noreferrer">
                          map
                        </a>
                      ) : (
                        <Badge tone="amber">no pin</Badge>
                      )}
                    </td>
                    <td>
                      {customer.subscription ? (
                        <button
                          type="button"
                          className="small secondary"
                          disabled={pauseResume.isPending}
                          onClick={() => pauseResume.mutate({ customer })}>
                          {customer.subscription.status === 'paused' ? 'Resume' : 'Pause'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customers.data.customers.length === 0 ? <Empty text="No customers match." /> : null}
          </div>

          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="secondary small"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}>
              Previous
            </button>
            <span className="muted">
              {offset + 1}–{Math.min(offset + limit, customers.data.total)} of {customers.data.total}
            </span>
            <button
              type="button"
              className="secondary small"
              disabled={offset + limit >= customers.data.total}
              onClick={() => setOffset(offset + limit)}>
              Next
            </button>
          </div>
        </>
      ) : null}

      {adding ? <AddCustomerModal onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function AddCustomerModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const riders = useQuery({ queryKey: ['users', 'riders'], queryFn: () => api.users({ role: 'rider' }) });
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    bottlesPerDay: 1,
    riderId: '',
    area: '',
    address: '',
    landmark: '',
    city: 'Shirpur',
  });

  const create = useMutation({
    mutationFn: () =>
      api.createCustomer({
        name: form.name,
        mobile: form.mobile,
        bottlesPerDay: Number(form.bottlesPerDay),
        status: 'active',
        riderId: form.riderId,
        area: form.area || undefined,
        address: form.address || undefined,
        landmark: form.landmark || undefined,
        city: form.city || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  return (
    <Modal title="Add customer" onClose={onClose}>
      {create.isError ? <ErrorNote error={create.error} /> : null}
      <Field label="Name">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Mobile">
        <input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
      </Field>
      <Field label="Bottles per day">
        <input
          type="number"
          min={1}
          max={50}
          value={form.bottlesPerDay}
          onChange={e => setForm({ ...form, bottlesPerDay: Number(e.target.value) })}
        />
      </Field>
      <Field label="Rider">
        <select value={form.riderId} onChange={e => setForm({ ...form, riderId: e.target.value })}>
          <option value="">Choose a rider…</option>
          {(riders.data?.users ?? []).map(rider => (
            <option key={rider.id} value={rider.id}>
              {rider.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Area">
        <input value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} />
      </Field>
      <Field label="Address">
        <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
      </Field>
      <Field label="Landmark">
        <input value={form.landmark} onChange={e => setForm({ ...form, landmark: e.target.value })} />
      </Field>
      <Field label="City">
        <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
      </Field>
      <Field
        label="GPS pin"
        hint="The rider captures the pin at the customer's door from the Android app.">
        <input value="Set by the rider on site" disabled />
      </Field>

      <div className="row end">
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={
            create.isPending || form.name.trim().length < 2 || form.mobile.trim().length < 6 || !form.riderId
          }>
          {create.isPending ? 'Saving…' : 'Save customer'}
        </button>
      </div>
    </Modal>
  );
}
