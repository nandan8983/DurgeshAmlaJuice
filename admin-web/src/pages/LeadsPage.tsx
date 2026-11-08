/** Website sign-ups, and converting one into a customer with a rider and a plan. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { dateTime, rupees, todayIso } from '../lib/format';
import { Alert, Badge, Card, ErrorNote, Field, Loading, Modal } from '../components/ui';
import type { Lead } from '../lib/types';

export function LeadsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('new');
  const [converting, setConverting] = useState<Lead | null>(null);

  const leads = useQuery({
    queryKey: ['leads', status],
    queryFn: () => api.leads({ status: status || undefined, limit: 200 }),
  });

  const setLeadStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'new' | 'contacted' | 'rejected' }) =>
      api.updateLead(id, next),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Website leads</h1>
          <p>Sign-ups from the public form on durgeshamlajuice.vercel.app.</p>
        </div>
        <select value={status} onChange={event => setStatus(event.target.value)} style={{ width: 'auto' }}>
          <option value="">All</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="converted">Converted</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {setLeadStatus.isError ? <ErrorNote error={setLeadStatus.error} /> : null}

      <Card>
        {leads.isLoading ? <Loading what="leads" /> : null}
        {leads.isError ? <ErrorNote error={leads.error} /> : null}
        {leads.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Area / city</th>
                  <th>Plan asked</th>
                  <th>Received</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leads.data.leads.map(lead => (
                  <tr key={lead.id}>
                    <td>
                      {lead.fullName}
                      {lead.notes ? <div className="muted">{lead.notes}</div> : null}
                    </td>
                    <td>{lead.mobile}</td>
                    <td>
                      {lead.area ?? <span className="muted">—</span>}
                      <div className="muted">{lead.city ?? ''}</div>
                    </td>
                    <td>
                      {lead.planName ?? <span className="muted">not stated</span>}
                      {lead.planPrice !== null ? (
                        <div className="muted">{rupees(lead.planPrice)}</div>
                      ) : null}
                    </td>
                    <td>{dateTime(lead.createdAt)}</td>
                    <td>
                      <Badge
                        tone={
                          lead.status === 'converted'
                            ? 'green'
                            : lead.status === 'rejected'
                              ? 'red'
                              : lead.status === 'contacted'
                                ? 'amber'
                                : 'grey'
                        }>
                        {lead.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="row">
                        {lead.status === 'converted' && lead.convertedCustomerId ? (
                          <Link to={`/customers/${lead.convertedCustomerId}`}>View customer</Link>
                        ) : (
                          <>
                            <button type="button" className="small" onClick={() => setConverting(lead)}>
                              Convert
                            </button>
                            {lead.status === 'new' ? (
                              <button
                                type="button"
                                className="small secondary"
                                onClick={() => setLeadStatus.mutate({ id: lead.id, next: 'contacted' })}>
                                Contacted
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="small secondary"
                              onClick={() => setLeadStatus.mutate({ id: lead.id, next: 'rejected' })}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leads.data.leads.length === 0 ? <p className="empty">No leads here.</p> : null}
          </div>
        ) : null}
      </Card>

      {converting ? (
        <ConvertLeadModal lead={converting} onClose={() => setConverting(null)} />
      ) : null}
    </>
  );
}

function ConvertLeadModal({ lead, onClose }: { lead: Lead; onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const riders = useQuery({ queryKey: ['users', 'riders'], queryFn: () => api.users({ role: 'rider' }) });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.plans() });

  const [riderId, setRiderId] = useState('');
  const [planId, setPlanId] = useState(lead.planId ?? '');
  const [bottles, setBottles] = useState(1);
  const [startDate, setStartDate] = useState(todayIso());
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');

  const convert = useMutation({
    mutationFn: () =>
      api.convertLead(lead.id, {
        riderId,
        bottlesPerDay: Number(bottles),
        planId: planId || undefined,
        startDate,
        address: address || undefined,
        landmark: landmark || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  const selectedPlan = plans.data?.plans.find(plan => plan.id === planId);

  return (
    <Modal title={`Convert ${lead.fullName}`} onClose={onClose}>
      {convert.isError ? <ErrorNote error={convert.error} /> : null}
      <Alert tone="info">
        A customer is created with this lead's name, mobile and area. The rider captures the GPS pin
        on their first visit.
      </Alert>

      <Field label="Assign to rider">
        <select value={riderId} onChange={event => setRiderId(event.target.value)}>
          <option value="">Choose a rider…</option>
          {(riders.data?.users ?? [])
            .filter(rider => rider.isActive)
            .map(rider => (
              <option key={rider.id} value={rider.id}>
                {rider.name} ({rider.customerCount} customers)
              </option>
            ))}
        </select>
      </Field>

      <Field label="Bottles per day">
        <input
          type="number"
          min={1}
          max={50}
          value={bottles}
          onChange={event => setBottles(Number(event.target.value))}
        />
      </Field>

      <Field
        label="Plan (optional)"
        hint={
          selectedPlan
            ? `Charge: ${rupees(selectedPlan.price * bottles)} for ${selectedPlan.durationDays} days`
            : 'Leave empty to add the customer without starting a plan.'
        }>
        <select value={planId} onChange={event => setPlanId(event.target.value)}>
          <option value="">No plan yet</option>
          {(plans.data?.plans ?? []).map(plan => (
            <option key={plan.id} value={plan.id}>
              {plan.name} — {rupees(plan.price)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Start date">
        <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
      </Field>

      <Field label="Address (optional)">
        <input value={address} onChange={event => setAddress(event.target.value)} />
      </Field>
      <Field label="Landmark (optional)">
        <input value={landmark} onChange={event => setLandmark(event.target.value)} />
      </Field>

      <div className="row end">
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" onClick={() => convert.mutate()} disabled={!riderId || convert.isPending}>
          {convert.isPending ? 'Converting…' : 'Create customer'}
        </button>
      </div>
    </Modal>
  );
}
